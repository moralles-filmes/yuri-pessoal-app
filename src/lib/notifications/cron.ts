/**
 * Fase 13 — Geração agendada de notificações (SERVER-ONLY, chamada pelo Vercel Cron).
 *
 * Sem sessão de usuário: usa a service role e filtra/escreve `user_id` EXPLICITAMENTE
 * em cada query (a RLS é ignorada pela service role). A montagem do alerta é delegada
 * ao módulo PURO `generate.ts`; aqui só fazemos I/O e o "insert apenas dos que faltam"
 * por `dedupe_key` (idempotente). Não logamos valores financeiros.
 */
import { addDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { dateInSaoPaulo } from "@/lib/format";
import { expandRowsToOccurrences } from "@/lib/calendar/expand";
import { proximosCompromissos } from "@/lib/calendar/upcoming";
import { habitOccursOn } from "@/lib/habits/streak";
import {
  addMes,
  resumoMes,
  type DashReceivable,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";
import type { CalendarEventRow } from "@/types/database";
import {
  filterByPrefs,
  generateNotifications,
  selectNewCandidates,
  type GenerateInput,
  type GenTask,
} from "@/lib/notifications/generate";
import { buildNutritionGenInput } from "@/lib/notifications/nutrition-cron";
import { buildTrainingGenInput } from "@/lib/notifications/training-cron";
import { buildAiGenInput } from "@/lib/notifications/ai-cron";
import { normalizeNotificationPrefs } from "@/lib/settings/constants";
import { timeInSaoPaulo } from "@/lib/format";

type Service = SupabaseClient<Database>;

/** Data local pt-BR ('yyyy-MM-dd') de um instante, independente do fuso do servidor. */
const spDateIso = dateInSaoPaulo;

export type UserGenResult = { userId: string; candidates: number; inserted: number };

/** Gera (e persiste) as notificações que faltam para um usuário. Idempotente. */
export async function generateForUser(
  service: Service,
  userId: string,
  now: Date,
): Promise<UserGenResult> {
  const todayIso = spDateIso(now);
  const nowMs = now.getTime();
  const mesAtual = todayIso.slice(0, 7);
  // Minutos desde a meia-noite EM BRASÍLIA. `now.getHours()` devolveria a hora do processo —
  // e o "faltam 30 min para o almoço" sairia com 3 horas de erro quando o TZ não estivesse
  // configurado (a Vercel roda em UTC por padrão).
  const [horaSp, minutoSp] = timeInSaoPaulo(now).split(":").map(Number);
  const minutosAgora = (horaSp || 0) * 60 + (minutoSp || 0);

  // Leituras em paralelo (todas filtradas por user_id).
  const [
    cardsRes,
    statementsRes,
    billsRes,
    receivablesRes,
    tasksRes,
    eventRowsRes,
    habitsRes,
    habitLogsRes,
    coursesRes,
    sessionsRes,
    txRes,
    todoTasksRes,
    todoRemindersRes,
  ] = await Promise.all([
    service.from("credit_cards").select("id, nome, limite_total").eq("user_id", userId),
    service
      .from("card_statements_with_total")
      .select("id, card_id, competencia, data_fechamento, data_vencimento, pago_em, total_atual")
      .eq("user_id", userId),
    service.from("bills").select("id, name, amount, due_day, is_active").eq("user_id", userId),
    service
      .from("receivables")
      .select(
        "id, valor, status, installment_id, statement_id, data_prevista, person:people(nome), statement:card_statements(data_vencimento)",
      )
      .eq("user_id", userId),
    service
      .from("tasks")
      .select("id, title, status, due_date, priority")
      .eq("user_id", userId)
      .in("status", ["pendente", "em_andamento"]),
    service
      .from("calendar_events")
      .select("*")
      .eq("user_id", userId)
      .or(
        `and(recurrence_freq.is.null,start_at.lte.${addDays(now, 3).toISOString()},end_at.gte.${now.toISOString()}),and(recurrence_freq.not.is.null,start_at.lte.${addDays(now, 3).toISOString()})`,
      )
      .limit(1000),
    service
      .from("habits")
      .select("id, name, category, frequency, weekdays, target_value, unit, is_active")
      .eq("user_id", userId)
      .eq("is_active", true),
    service
      .from("habit_logs")
      .select("habit_id, value, is_done")
      .eq("user_id", userId)
      .eq("log_date", todayIso),
    service
      .from("study_courses")
      .select("id, title, status, target_date")
      .eq("user_id", userId),
    service
      .from("study_sessions")
      .select("course_id, session_date")
      .eq("user_id", userId)
      .gte("session_date", spDateIso(addDays(now, -120))),
    service
      .from("transactions")
      .select(
        "amount, valor_pessoal, type, payment_method, status, competence_date, card_id, statement_id, parcelado",
      )
      .eq("user_id", userId)
      .gte("competence_date", `${addMes(mesAtual, -3)}-01`)
      .lte("competence_date", todayIso),
    // Fase 15 — TO-DO: só as tarefas ABERTAS interessam para alerta.
    service
      .from("todo_tasks")
      .select("id, title, status, scheduled_date, deadline_at, priority, project_id")
      .eq("user_id", userId)
      .in("status", ["pendente", "em_andamento"]),
    // Lembretes ainda não disparados cujo horário já chegou.
    service
      .from("todo_reminders")
      .select("id, task_id, remind_at, task:todo_tasks(title, project_id)")
      .eq("user_id", userId)
      .eq("status", "pendente")
      .lte("remind_at", now.toISOString()),
  ]);

  /* ── Faturas / cartões ── */
  const statements = (statementsRes.data ?? []) as Array<{
    id: string;
    card_id: string | null;
    competencia: string;
    data_fechamento: string;
    data_vencimento: string;
    pago_em: string | null;
    total_atual: number | null;
  }>;
  const cards = (cardsRes.data ?? []) as Array<{
    id: string;
    nome: string;
    limite_total: number;
  }>;
  const cardNome = new Map(cards.map((c) => [c.id, c.nome]));

  const genStatements = statements
    .filter((s) => s.card_id)
    .map((s) => ({
      id: s.id,
      cardId: s.card_id as string,
      cardNome: cardNome.get(s.card_id as string) ?? "cartão",
      competencia: s.competencia,
      data_fechamento: s.data_fechamento,
      data_vencimento: s.data_vencimento,
      pago_em: s.pago_em,
      total: Number(s.total_atual ?? 0),
    }));
  const genCards = cards.map((c) => ({
    id: c.id,
    nome: c.nome,
    limite_total: Number(c.limite_total ?? 0),
  }));

  /* ── Recebíveis ── */
  const receivables = (receivablesRes.data ?? []) as Array<{
    id: string;
    valor: number;
    status: string;
    installment_id: string | null;
    statement_id: string | null;
    data_prevista: string | null;
    person: { nome: string } | { nome: string }[] | null;
    statement: { data_vencimento: string } | { data_vencimento: string }[] | null;
  }>;
  const one = <T>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;
  const genReceivables = receivables.map((r) => ({
    id: r.id,
    personNome: one(r.person)?.nome ?? null,
    valor: Number(r.valor),
    status: r.status,
    dataVencimento: one(r.statement)?.data_vencimento ?? r.data_prevista ?? null,
  }));

  /* ── Tarefas ── */
  const genTasks = ((tasksRes.data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    due_date: string | null;
    priority: string;
  }>).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status as GenTask["status"],
    due_date: t.due_date,
    priority: t.priority as GenTask["priority"],
  }));

  /* ── Eventos (expansão de recorrências na janela [now, +3d]) ── */
  const eventRows = (eventRowsRes.data ?? []) as unknown as CalendarEventRow[];
  const occurrences = proximosCompromissos(
    expandRowsToOccurrences(eventRows, now, addDays(now, 3)),
    now,
    50,
  );
  const genEvents = occurrences.map((e) => ({
    id: e.recurrenceParentId ?? e.id,
    title: e.title,
    startMs: e.start.getTime(),
    startIso: spDateIso(e.start),
    tipo: e.tipo,
  }));

  /* ── Hábitos (pendentes hoje) ── */
  const habits = (habitsRes.data ?? []) as Array<{
    id: string;
    name: string;
    category: string;
    frequency: string;
    weekdays: number[] | null;
    target_value: number;
    unit: string;
    is_active: boolean;
  }>;
  const logs = (habitLogsRes.data ?? []) as Array<{
    habit_id: string;
    value: number;
    is_done: boolean;
  }>;
  const logByHabit = new Map(logs.map((l) => [l.habit_id, l]));
  const genHabits = habits.map((h) => {
    const log = logByHabit.get(h.id);
    return {
      id: h.id,
      name: h.name,
      category: h.category,
      scheduledToday: habitOccursOn(
        { frequency: h.frequency as never, weekdays: h.weekdays, is_active: h.is_active },
        todayIso,
      ),
      done: Boolean(log?.is_done),
      value: Number(log?.value ?? 0),
      target: Number(h.target_value),
      unit: h.unit,
    };
  });

  /* ── Estudos (última sessão por curso) ── */
  const courses = (coursesRes.data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    target_date: string | null;
  }>;
  const sessions = (sessionsRes.data ?? []) as Array<{
    course_id: string;
    session_date: string;
  }>;
  const lastByCourse = new Map<string, string>();
  for (const s of sessions) {
    const cur = lastByCourse.get(s.course_id);
    if (!cur || s.session_date > cur) lastByCourse.set(s.course_id, s.session_date);
  }
  const genCourses = courses.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    target_date: c.target_date,
    lastSessionIso: lastByCourse.get(c.id) ?? null,
  }));

  /* ── Gasto alto (resumo do mês × média dos 3 anteriores) ── */
  const dashStatements: DashStatement[] = statements.map((s) => ({
    id: s.id,
    card_id: s.card_id,
    competencia: s.competencia,
    data_fechamento: s.data_fechamento,
    data_vencimento: s.data_vencimento,
    pago_em: s.pago_em,
    total_atual: s.total_atual,
  }));
  const dashReceivables: DashReceivable[] = receivables.map((r) => ({
    statement_id: r.statement_id,
    installment_id: r.installment_id,
    valor: Number(r.valor),
    status: r.status,
  }));
  const dashTx = ((txRes.data ?? []) as Array<Record<string, unknown>>).map(
    (t): DashTx => ({
      amount: Number(t.amount),
      valor_pessoal: t.valor_pessoal === null ? null : Number(t.valor_pessoal),
      type: t.type as DashTx["type"],
      payment_method: (t.payment_method as DashTx["payment_method"]) ?? null,
      status: t.status as DashTx["status"],
      competence_date: t.competence_date as string,
      card_id: (t.card_id as string | null) ?? null,
      statement_id: (t.statement_id as string | null) ?? null,
      parcelado: Boolean(t.parcelado),
      category_id: null,
    }),
  );
  const resumoAtual = resumoMes({
    mes: mesAtual,
    transactions: dashTx,
    statements: dashStatements,
    receivables: dashReceivables,
  });
  const priorMonths = [1, 2, 3].map((k) => addMes(mesAtual, -k));
  const priorSaidas = priorMonths.map(
    (mes) =>
      resumoMes({ mes, transactions: dashTx, statements: dashStatements, receivables: dashReceivables })
        .saidas,
  );
  const mediaSaidas = priorSaidas.reduce((a, b) => a + b, 0) / priorMonths.length;

  /* ── TO-DO (Fase 15) ── */
  const genTodoTasks = ((todoTasksRes.data ?? []) as Array<{
    id: string;
    title: string;
    status: string;
    scheduled_date: string | null;
    deadline_at: string | null;
    priority: number;
    project_id: string | null;
  }>).map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    scheduled_date: t.scheduled_date,
    deadline_at: t.deadline_at,
    priority: Number(t.priority),
    projectId: t.project_id,
  }));

  const genTodoReminders = ((todoRemindersRes.data ?? []) as Array<{
    id: string;
    task_id: string;
    remind_at: string;
    task: { title: string; project_id: string | null } | { title: string; project_id: string | null }[] | null;
  }>).map((r) => {
    const task = Array.isArray(r.task) ? r.task[0] : r.task;
    const at = new Date(r.remind_at);
    return {
      id: r.id,
      taskId: r.task_id,
      taskTitle: task?.title ?? "Tarefa",
      remindAtMs: at.getTime(),
      remindAtIso: spDateIso(at),
      projectId: task?.project_id ?? null,
    };
  });

  /* ── Geração pura ── */
  const input: GenerateInput = {
    todayIso,
    nowMs,
    statements: genStatements,
    cards: genCards,
    bills: (billsRes.data ?? []) as GenerateInput["bills"],
    receivables: genReceivables,
    tasks: genTasks,
    events: genEvents,
    habits: genHabits,
    courses: genCourses,
    spending: { mes: mesAtual, saidas: resumoAtual.saidas, mediaSaidas },
    todoTasks: genTodoTasks,
    todoReminders: genTodoReminders,
    // Fase 16-F — Dieta. Isolada num try: uma falha de leitura do módulo não pode impedir
    // o alerta de fatura atrasada de existir.
    nutrition: await buildNutritionGenInput(service, userId, todayIso, minutosAgora).catch(
      () => null,
    ),
    // Fase 17-F — Treinos. Mesmo isolamento da Dieta: uma falha de leitura do módulo não pode
    // impedir o alerta de fatura atrasada de existir.
    training: await buildTrainingGenInput(
      service,
      userId,
      todayIso,
      minutosAgora,
      nowMs,
    ).catch(() => null),
    // Fase 18-F — IA. Mesmo isolamento de Dieta e Treinos: uma falha de leitura do módulo
    // não pode impedir o alerta de fatura atrasada de existir.
    ai: await buildAiGenInput(service, userId, todayIso, now).catch(() => null),
  };

  const generated = generateNotifications(input);

  // Fase 16-F — TODA notificação é desativável. As preferências são lidas aqui (e não dentro
  // do gerador) para que o módulo puro continue respondendo "isto é verdade sobre os dados"
  // e a decisão de entregar fique num lugar só.
  const { data: settingsRow } = await service
    .from("settings")
    .select("notification_prefs")
    .eq("user_id", userId)
    .maybeSingle();
  const prefs = normalizeNotificationPrefs(settingsRow?.notification_prefs);

  const candidates = filterByPrefs(generated, prefs);
  if (candidates.length === 0) {
    return { userId, candidates: 0, inserted: 0 };
  }

  // Idempotência: não recria as que já existem (mesma dedupe_key).
  const keys = candidates.map((c) => c.dedupe_key);
  const { data: existingRows } = await service
    .from("notifications")
    .select("dedupe_key")
    .eq("user_id", userId)
    .in("dedupe_key", keys);
  const existing = new Set(
    ((existingRows ?? []) as Array<{ dedupe_key: string | null }>)
      .map((r) => r.dedupe_key)
      .filter((k): k is string => !!k),
  );

  const fresh = selectNewCandidates(candidates, existing);
  if (fresh.length === 0) {
    return { userId, candidates: candidates.length, inserted: 0 };
  }

  const nowIso = now.toISOString();
  const rows = fresh.map((c) => ({
    user_id: userId,
    title: c.title,
    description: c.description,
    type: c.type,
    priority: c.priority,
    link: c.link,
    entity_type: c.entity_type,
    entity_id: c.entity_id,
    dedupe_key: c.dedupe_key,
    notify_at: nowIso,
  }));
  const { error } = await service.from("notifications").insert(rows);
  if (error) {
    // Não falha o Cron inteiro por um usuário; reporta 0 inseridos.
    return { userId, candidates: candidates.length, inserted: 0 };
  }

  // Fase 15 — fecha os lembretes de TO-DO que viraram notificação. A dupla proteção
  // (dedupe_key + status 'enviado') garante que o lembrete não dispare de novo, mesmo
  // que a notificação seja apagada depois.
  const sentReminderIds = fresh
    .filter((c) => c.type === "todo_reminder")
    .map((c) => c.dedupe_key.replace("todo_reminder:", ""));
  if (sentReminderIds.length > 0) {
    await service
      .from("todo_reminders")
      .update({ status: "enviado", sent_at: nowIso })
      .eq("user_id", userId)
      .in("id", sentReminderIds);
  }

  return { userId, candidates: candidates.length, inserted: fresh.length };
}

/** Roda a geração para TODOS os usuários (single-user na prática). */
export async function runNotificationGeneration(
  service: Service,
  now: Date,
): Promise<{ users: number; inserted: number; results: UserGenResult[] }> {
  const { data, error } = await service.auth.admin.listUsers();
  if (error) throw new Error("Falha ao listar usuários.");
  const users = data?.users ?? [];
  const results: UserGenResult[] = [];
  for (const u of users) {
    try {
      results.push(await generateForUser(service, u.id, now));
    } catch {
      results.push({ userId: u.id, candidates: 0, inserted: 0 });
    }
  }
  return {
    users: users.length,
    inserted: results.reduce((s, r) => s + r.inserted, 0),
    results,
  };
}
