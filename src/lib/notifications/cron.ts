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
import { reguaDoGastoAlto } from "@/lib/finance/dashboard";
import { janelaDoGastoAlto, montarEntradas } from "@/lib/finance/pipeline";
import { anexarRecebimentos, emAberto, resumirRecebivel, saldoCentavos } from "@/lib/finance/recebimentos";
import { lerRecebimentos } from "@/lib/finance/recebimentos-leitura";
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
import {
  ErroDeLeitura,
  ehErroDeLeitura,
  exigirCompleta,
  listaCompleta,
  registrarFalhaDeLeitura,
  type RespostaDoBanco,
} from "@/lib/supabase/leitura";
import {
  familiasNaoLidas,
  horaDaVerificacao,
  janelaDaVerificacao,
  type Familia,
  type Leitura,
} from "@/lib/notifications/familias";

type Service = SupabaseClient<Database>;

/** Data local pt-BR ('yyyy-MM-dd') de um instante, independente do fuso do servidor. */
const spDateIso = dateInSaoPaulo;

export type UserGenResult = {
  userId: string;
  candidates: number;
  inserted: number;
  /** 03-G (K1b) — as famílias que ficaram FORA do gerador porque a leitura delas falhou. */
  familiasNaoLidas: Familia[];
  /**
   * 03-G — nada foi entregue: sem as preferências não se sabe o que o dono quer receber, e sem
   * o dedupe inserir duplicaria. Erra para "pode faltar aviso", nunca para "aviso em dobro".
   */
  naoEntregue?: "preferencias" | "dedupe";
};

type Tentativa<T> = { ok: true; data: T[] } | { ok: false };

/**
 * 03-G (K1b) — uma leitura do Cron. Erro ⇒ `{ ok: false }`: a família que depende dela sai do
 * gerador e as outras seguem. `completa` (K2) é para a lista que alimenta número — sem a
 * contagem, ou saturada, ela também conta como não lida. Só `ErroDeLeitura` é capturado.
 */
async function tentar<T>(
  leitura: Leitura,
  pedido: PromiseLike<RespostaDoBanco<T[] | null>>,
  completa = false,
): Promise<Tentativa<T>> {
  try {
    const res = await pedido;
    if (completa) return { ok: true, data: listaCompleta(res, leitura) };
    if (res.error) {
      throw new ErroDeLeitura(leitura, { codigo: res.error.code ?? null, cause: res.error });
    }
    return { ok: true, data: res.data ?? [] };
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    registrarFalhaDeLeitura(e);
    return { ok: false };
  }
}

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
  // REDESIGN-03-B2 (B2, decisão do dono) — a janela das transações é a da régua única do gasto
  // alto: os 5 meses anteriores e o mês corrente CHEIO. Era "3 meses para trás até hoje".
  const janelaTx = janelaDoGastoAlto(mesAtual);

  // Leituras em paralelo (todas filtradas por user_id). 03-G (K1b) — cada uma passa por
  // `tentar`: a que falhar tira do gerador SÓ as famílias que dependem dela (`familias.ts`).
  // Faturas, recebíveis, agenda e lançamentos alimentam número: pedem `count` e saturar conta
  // como falha (K2).
  const [
    cardsT,
    statementsT,
    billsT,
    receivablesT,
    recebimentosT,
    tasksT,
    eventRowsT,
    habitsT,
    habitLogsT,
    coursesT,
    sessionsT,
    txT,
    todoTasksT,
    todoRemindersT,
  ] = await Promise.all([
    tentar(
      "cartoes",
      service.from("credit_cards").select("id, nome, limite_total").eq("user_id", userId),
    ),
    tentar(
      "faturas",
      service
        .from("card_statements_with_total")
        .select("id, card_id, competencia, data_fechamento, data_vencimento, pago_em, total_atual", {
          count: "exact",
        })
        .eq("user_id", userId)
        // 03-B2 (B1, decisão do dono): fatura sem item não é fatura real — o sino deixa de
        // avisar "Fatura atrasada" de R$ 0,00. É o mesmo filtro de `getStatements`.
        .gt("itens", 0),
      true,
    ),
    tentar(
      "contasFixas",
      service.from("bills").select("id, name, amount, due_day, is_active").eq("user_id", userId),
    ),
    tentar(
      "recebiveis",
      service
        .from("receivables")
        .select(
          "id, valor, status, installment_id, statement_id, transaction_id, pago_em, data_prevista, person:people(nome), statement:card_statements(data_vencimento, competencia), transaction:transactions!receivables_transaction_id_fkey(purchase_date)",
          { count: "exact" },
        )
        .eq("user_id", userId),
      true,
    ),
    tentar(
      "recebimentos",
      lerRecebimentos({ client: service, userId }).then((l) => ({
        data: exigirCompleta(l, "recebimentos"),
        error: null,
      })),
    ),
    tentar(
      "tarefas",
      service
        .from("tasks")
        .select("id, title, status, due_date, priority")
        .eq("user_id", userId)
        .in("status", ["pendente", "em_andamento"]),
    ),
    tentar(
      "agenda",
      service
        .from("calendar_events")
        .select("*", { count: "exact" })
        .eq("user_id", userId)
        .or(
          `and(recurrence_freq.is.null,start_at.lte.${addDays(now, 3).toISOString()},end_at.gte.${now.toISOString()}),and(recurrence_freq.not.is.null,start_at.lte.${addDays(now, 3).toISOString()})`,
        )
        .limit(1000),
      true,
    ),
    tentar(
      "habitos",
      service
        .from("habits")
        .select("id, name, category, frequency, weekdays, target_value, unit, is_active")
        .eq("user_id", userId)
        .eq("is_active", true),
    ),
    tentar(
      "registrosDeHabito",
      service
        .from("habit_logs")
        .select("habit_id, value, is_done")
        .eq("user_id", userId)
        .eq("log_date", todayIso),
    ),
    tentar(
      "cursos",
      service
        .from("study_courses")
        .select("id, title, status, target_date")
        .eq("user_id", userId),
    ),
    tentar(
      "sessoesDeEstudo",
      service
        .from("study_sessions")
        .select("course_id, session_date")
        .eq("user_id", userId)
        .gte("session_date", spDateIso(addDays(now, -120))),
    ),
    // A leitura de transações do Cron não tem .limit e continua sem: pôr teto agora
    // truncaria os dados e mudaria o número. O max_rows do PostgREST (padrão 1000,
    // configurado fora do alcance do SQL) também vale para o Cron — e desde a 03-G o corte
    // é DETECTADO pelo `count` e o gasto alto sai do gerador em vez de sair com a soma parcial.
    tentar(
      "lancamentos",
      service
        .from("transactions")
        .select(
          "id, amount, valor_pessoal, type, payment_method, status, competence_date, card_id, statement_id, parcelado, category_id, category:categories(id,name,color)",
          { count: "exact" },
        )
        .eq("user_id", userId)
        .gte("competence_date", janelaTx.from)
        .lte("competence_date", janelaTx.to),
      true,
    ),
    // Fase 15 — TO-DO: só as tarefas ABERTAS interessam para alerta.
    tentar(
      "todo",
      service
        .from("todo_tasks")
        .select("id, title, status, scheduled_date, deadline_at, priority, project_id")
        .eq("user_id", userId)
        .in("status", ["pendente", "em_andamento"]),
    ),
    // Lembretes ainda não disparados cujo horário já chegou.
    tentar(
      "lembretes",
      service
        .from("todo_reminders")
        .select("id, task_id, remind_at, task:todo_tasks(title, project_id)")
        .eq("user_id", userId)
        .eq("status", "pendente")
        .lte("remind_at", now.toISOString()),
    ),
  ]);

  // 03-G — a leitura que falhou chega como lista VAZIA só para o mapeamento abaixo não precisar
  // de dois caminhos; quem garante que "vazio" não vira "não há aviso" é a família sair do
  // `GenerateInput` (lá embaixo, por `fora`).
  const falhas = new Set<Leitura>();
  const dados = <T,>(t: Tentativa<T>, leitura: Leitura): T[] => {
    if (t.ok) return t.data;
    falhas.add(leitura);
    return [];
  };
  const cardsRes = { data: dados(cardsT, "cartoes") };
  const statementsRes = { data: dados(statementsT, "faturas") };
  const billsRes = { data: dados(billsT, "contasFixas") };
  const receivablesRes = { data: dados(receivablesT, "recebiveis") };
  const recebimentosDoDono = { linhas: dados(recebimentosT, "recebimentos") };
  const tasksRes = { data: dados(tasksT, "tarefas") };
  const eventRowsRes = { data: dados(eventRowsT, "agenda") };
  const habitsRes = { data: dados(habitsT, "habitos") };
  const habitLogsRes = { data: dados(habitLogsT, "registrosDeHabito") };
  const coursesRes = { data: dados(coursesT, "cursos") };
  const sessionsRes = { data: dados(sessionsT, "sessoesDeEstudo") };
  const txRes = { data: dados(txT, "lancamentos") };
  const todoTasksRes = { data: dados(todoTasksT, "todo") };
  const todoRemindersRes = { data: dados(todoRemindersT, "lembretes") };

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
    transaction_id: string | null;
    pago_em: string | null;
    data_prevista: string | null;
    person: { nome: string } | { nome: string }[] | null;
    statement: { data_vencimento: string } | { data_vencimento: string }[] | null;
  }>;
  // B4 (03-D): o sino recebe só os EM ABERTO pelo estado derivado, com valor = SALDO.
  const recebiveisJuntos = anexarRecebimentos(receivables, recebimentosDoDono.linhas);
  const one = <T>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;
  const genReceivables = recebiveisJuntos.flatMap((r) => {
    const resumo = resumirRecebivel(r);
    if (!emAberto(resumo)) return [];
    return [{
      id: r.id,
      personNome: one(r.person)?.nome ?? null,
      valor: saldoCentavos(resumo) / 100,
      // generate.ts só aceita pendente/cobrado; em aberto com a coluna `pago` (soma aberta) entra
      // como pendente — senão "só os em aberto" deixaria de valer para ele.
      status: r.status === "cobrado" ? "cobrado" : "pendente",
      dataVencimento: one(r.statement)?.data_vencimento ?? r.data_prevista ?? null,
    }];
  });

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

  /* ── Gasto alto (o mês × a média dos anteriores — a régua da tela) ── */
  // REDESIGN-03-B — a tradução para o motor é a MESMA das telas (`montarEntradas`).
  // 03-B2 (A2) — e SEM cast de linha: transações e recebíveis entram como o client os inferiu,
  // e o `select` traz o que as linhas estritas pedem (`category_id`, `category`, `competencia`,
  // `purchase_date`). Duas coisas declaradas:
  //  • lançamento com tipo, status ou forma de pagamento fora do domínio conhecido fica FORA da
  //    soma (`montarEntradas` estreita pelos arrays de `finance/constants.ts`, que batem com os
  //    CHECKs). As telas e a IA dizem "parcial" quando isso acontece; o sino não tem onde dizer.
  //  • as FATURAS continuam passando por `statements`, com o cast local lá de cima: a view
  //    `card_statements_with_total` tem TODA coluna anulável no tipo gerado, e decidir o que é
  //    uma fatura sem `id` está fora da 03-B2 (é o mesmo estreitamento de `getStatements`).
  const { txs, sts, recs } = montarEntradas({
    transacoes: txRes.data ?? [],
    faturas: statements,
    recebiveis: anexarRecebimentos(receivablesRes.data ?? [], recebimentosDoDono.linhas),
  });
  // 03-B2 (B2, decisão do dono) — o sino ADOTOU a régua da tela: a MESMA função que a página do
  // dashboard financeiro chama. Até 5 meses anteriores, mês sem saída ignorado, e o mês corrente
  // cheio (pendente incluído). Antes: 3 meses exatos, mês zerado dividindo, e o mês corrente
  // cortado em hoje — o alerta de gasto alto pode disparar em outro dia do que disparava.
  const regua = reguaDoGastoAlto({
    mes: mesAtual,
    transactions: txs,
    statements: sts,
    receivables: recs,
  });

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

  // Fase 16-F/17-F/18-F — Dieta, Treinos e IA continuam isolados: uma falha de leitura do módulo
  // não pode impedir o alerta de fatura atrasada de existir. 03-G (K1b) — e agora o isolamento
  // é DECLARADO: o módulo que falhou vira família não lida, em vez de sumir calado. As leituras
  // internas de cada builder ficam fora (K1b).
  const nutrition = await buildNutritionGenInput(service, userId, todayIso, minutosAgora).catch(
    () => {
      falhas.add("dieta");
      return null;
    },
  );
  const training = await buildTrainingGenInput(
    service,
    userId,
    todayIso,
    minutosAgora,
    nowMs,
  ).catch(() => {
    falhas.add("treinos");
    return null;
  });
  const ai = await buildAiGenInput(service, userId, todayIso, now).catch(() => {
    falhas.add("ia");
    return null;
  });

  const naoLidas = familiasNaoLidas(falhas);
  const fora = new Set(naoLidas);
  /** A família não lida fica AUSENTE (`undefined`), nunca vazia — vazio diria "nada a avisar". */
  const se = <T,>(familia: Familia, valor: T): T | undefined =>
    fora.has(familia) ? undefined : valor;

  /* ── Geração pura ── */
  const input: GenerateInput = {
    todayIso,
    nowMs,
    statements: se("faturas", genStatements),
    cards: se("limiteDoCartao", genCards),
    bills: se("contasFixas", (billsRes.data ?? []) as GenerateInput["bills"]),
    receivables: se("recebiveis", genReceivables),
    tasks: se("tarefas", genTasks),
    events: se("agenda", genEvents),
    habits: se("habitos", genHabits),
    courses: se("estudos", genCourses),
    spending: se("gastoAlto", {
      mes: mesAtual,
      saidas: regua.saidas,
      mediaSaidas: regua.mediaSaidas,
    }),
    todoTasks: se("todo", genTodoTasks),
    todoReminders: se("lembretes", genTodoReminders),
    nutrition: se("dieta", nutrition),
    training: se("treinos", training),
    ai: se("ia", ai),
    // 03-G (K1b, D-G30) — o aviso de verificação incompleta: janela no dedupe, hora real no texto.
    naoLidas:
      naoLidas.length > 0
        ? { familias: naoLidas, janela: janelaDaVerificacao(now), hora: horaDaVerificacao(now) }
        : undefined,
  };

  const generated = generateNotifications(input);

  // Fase 16-F — TODA notificação é desativável. As preferências são lidas aqui (e não dentro
  // do gerador) para que o módulo puro continue respondendo "isto é verdade sobre os dados"
  // e a decisão de entregar fique num lugar só.
  // 03-G (K1b) — preferências com erro ⇒ NADA é entregue, nem o aviso de verificação
  // incompleta (ele também passa pela preferência). Lidas como ausentes, elas ligariam todo tipo
  // que o dono desligou.
  const settingsRes = await service
    .from("settings")
    .select("notification_prefs")
    .eq("user_id", userId)
    .maybeSingle();
  if (settingsRes.error) {
    return {
      userId,
      candidates: 0,
      inserted: 0,
      familiasNaoLidas: naoLidas,
      naoEntregue: "preferencias",
    };
  }
  const prefs = normalizeNotificationPrefs(settingsRes.data?.notification_prefs);

  const candidates = filterByPrefs(generated, prefs);
  if (candidates.length === 0) {
    return { userId, candidates: 0, inserted: 0, familiasNaoLidas: naoLidas };
  }

  // Idempotência: não recria as que já existem (mesma dedupe_key).
  // 03-G — dedupe com erro ⇒ não insere nada: inserir sem saber o que existe duplicaria.
  const keys = candidates.map((c) => c.dedupe_key);
  const existingRes = await service
    .from("notifications")
    .select("dedupe_key")
    .eq("user_id", userId)
    .in("dedupe_key", keys);
  if (existingRes.error) {
    return {
      userId,
      candidates: candidates.length,
      inserted: 0,
      familiasNaoLidas: naoLidas,
      naoEntregue: "dedupe",
    };
  }
  const existingRows = existingRes.data;
  const existing = new Set(
    ((existingRows ?? []) as Array<{ dedupe_key: string | null }>)
      .map((r) => r.dedupe_key)
      .filter((k): k is string => !!k),
  );

  const fresh = selectNewCandidates(candidates, existing);
  if (fresh.length === 0) {
    return { userId, candidates: candidates.length, inserted: 0, familiasNaoLidas: naoLidas };
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
    return { userId, candidates: candidates.length, inserted: 0, familiasNaoLidas: naoLidas };
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

  return {
    userId,
    candidates: candidates.length,
    inserted: fresh.length,
    familiasNaoLidas: naoLidas,
  };
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
      results.push({ userId: u.id, candidates: 0, inserted: 0, familiasNaoLidas: [] });
    }
  }
  return {
    users: users.length,
    inserted: results.reduce((s, r) => s + r.inserted, 0),
    results,
  };
}
