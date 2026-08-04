/**
 * Fase 12 — Leituras agregadas do Dashboard Geral. Server-only (cada função é
 * consumida por um card com seu próprio Suspense). A RLS garante o escopo por usuário.
 *
 * REUSO, NÃO REESCRITA: as agregações financeiras reaproveitam os módulos puros da
 * Fase 07 (resumoMes/proximas6Faturas/…); estudos/hábitos/tarefas reaproveitam a
 * lógica testada das Fases 09–11. Nada de regra de negócio nova — só leitura + agregação.
 */
import { addDays, format, startOfMonth, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  dateInSaoPaulo,
  saoPauloWallClockToInstant,
  toDateInputValue,
} from "@/lib/format";
import {
  getAccounts,
  getBills,
  getCreditCards,
  getReceivables,
  getStatements,
  getTransactionsRange,
} from "@/lib/finance/queries";
import {
  proximas6Faturas,
  proximasContasPagar,
  resumoMes,
  totalAReceber,
  type DashBill,
  type DashCard,
  type DashReceivable,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";
import { getCalendarEvents, getUpcomingCalendarEvents } from "@/lib/calendar/queries";
import { getHabitsDashboard } from "@/lib/habits/queries";
import { getRoutinesWithToday } from "@/lib/tasks/queries";
import { computeConsistency } from "@/lib/habits/streak";
import {
  compareTasks,
  effectiveTaskStatus,
  isDueToday,
  isOverdue,
} from "@/lib/tasks/status";
import { HABIT_UNIT_STEP } from "@/lib/habits/constants";
import {
  courseOverdueReason,
  minutesInRange,
  sessionDateSet,
} from "@/lib/studies/progress";
import { studyStreak } from "@/lib/studies/streak";
import { getNutritionDay } from "@/lib/nutrition/diary-queries";
import { getShoppingLists } from "@/lib/nutrition/shopping-queries";
import { getNutrientDefinitions, indexNutrients } from "@/lib/nutrition/queries";
import { buildDailyReports, displayAmount } from "@/lib/nutrition/reports";
import { effectiveMealStatus, summarizeDay, upcomingMeals } from "@/lib/nutrition/diary";
import { shortTime } from "@/lib/nutrition/calendar";
import { SHOPPING_OPEN_STATUSES } from "@/lib/nutrition/constants";
import { getMeasurements } from "@/lib/body/queries";
import { summarizeType } from "@/lib/body/measurements";
import type { DashWindow } from "@/lib/dashboard/period";
import type { TaskPriority, TaskStoredStatus } from "@/lib/tasks/constants";
import type { StudyCategory, StudyStatus } from "@/lib/studies/constants";
import type {
  AgendaCardData,
  DashCourseItem,
  DashHabitItem,
  DashNutrientValue,
  FinanceCardData,
  HabitsCardData,
  InvoicesCardData,
  NotificationsCardData,
  NutritionCardData,
  StudiesCardData,
  TasksCardData,
} from "@/lib/dashboard/types";

const ISO = "yyyy-MM-dd";

const UM_DIA_MS = 86_400_000;

/** Instante da meia-noite de um dia ('yyyy-MM-dd') em Brasília. */
function inicioDoDiaSP(dia: string): Date {
  return saoPauloWallClockToInstant(dia, "00:00");
}

/** Último instante do dia em Brasília (00:00 do dia seguinte − 1ms). */
function fimDoDiaSP(dia: string): Date {
  return new Date(inicioDoDiaSP(dia).getTime() + UM_DIA_MS - 1);
}

/** Último dia do mês 'yyyy-MM' como 'yyyy-MM-dd'. */
function fimDoMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return toDateInputValue(new Date(y, m, 0));
}

/* ───────────────────────────── Financeiro ───────────────────────────── */

export async function getFinanceCardData(
  mes: string,
  todayIso: string,
): Promise<FinanceCardData> {
  const [accounts, statements, receivables, bills, transactions] =
    await Promise.all([
      getAccounts(),
      getStatements(),
      getReceivables(),
      getBills(),
      getTransactionsRange({ from: `${mes}-01`, to: fimDoMes(mes) }),
    ]);

  const txs: DashTx[] = transactions.map((t) => ({
    amount: t.amount,
    valor_pessoal: t.valor_pessoal,
    type: t.type,
    payment_method: t.payment_method,
    status: t.status,
    competence_date: t.competence_date,
    card_id: t.card_id,
    statement_id: t.statement_id,
    parcelado: t.parcelado,
    category_id: t.category_id,
    category: t.category
      ? { id: t.category.id, name: t.category.name, color: t.category.color }
      : null,
  }));
  const sts: DashStatement[] = statements.map((s) => ({
    id: s.id,
    card_id: s.card_id,
    competencia: s.competencia,
    data_fechamento: s.data_fechamento,
    data_vencimento: s.data_vencimento,
    pago_em: s.pago_em,
    total_atual: s.total_atual,
  }));
  const recs: DashReceivable[] = receivables.map((r) => ({
    statement_id: r.statement_id,
    installment_id: r.installment_id,
    valor: r.valor,
    status: r.status,
    ref_month:
      r.statement?.competencia?.slice(0, 7) ??
      r.transaction?.purchase_date?.slice(0, 7) ??
      null,
  }));
  const dashBills: DashBill[] = bills.map((b) => ({
    name: b.name,
    amount: b.amount,
    due_day: b.due_day,
    is_active: b.is_active,
  }));

  const resumo = resumoMes({ mes, transactions: txs, statements: sts, receivables: recs });
  const contas = proximasContasPagar({ hoje: todayIso, bills: dashBills });
  const saldo = accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);

  return {
    saldo,
    entradas: resumo.entradas,
    saidas: resumo.saidas,
    meu: resumo.meu,
    terceiros: resumo.terceiros,
    cartao: resumo.cartao,
    aVista: resumo.aVista,
    aReceber: totalAReceber(recs, mes),
    contasTotal: contas.total,
    contasCount: contas.count,
    proximaConta: contas.proxima,
    mes,
  };
}

/* ───────────────────────────── Cartões & Faturas ───────────────────────────── */

export async function getInvoicesCardData(
  todayIso: string,
): Promise<InvoicesCardData> {
  const [cards, statements, receivables] = await Promise.all([
    getCreditCards(),
    getStatements(),
    getReceivables(),
  ]);

  const dashCards: DashCard[] = cards.map((c) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    limite_total: c.limite_total,
    dia_fechamento: c.dia_fechamento,
    dia_vencimento: c.dia_vencimento,
  }));
  const sts: DashStatement[] = statements.map((s) => ({
    id: s.id,
    card_id: s.card_id,
    competencia: s.competencia,
    data_fechamento: s.data_fechamento,
    data_vencimento: s.data_vencimento,
    pago_em: s.pago_em,
    total_atual: s.total_atual,
  }));
  const recs: DashReceivable[] = receivables.map((r) => ({
    statement_id: r.statement_id,
    installment_id: r.installment_id,
    valor: r.valor,
    status: r.status,
  }));

  const faturas = proximas6Faturas({
    hoje: todayIso,
    cards: dashCards,
    statements: sts,
    receivables: recs,
  });
  const reais = faturas.filter((f) => !f.virtual);

  return {
    abertas: reais.filter((f) => f.status === "aberta").length,
    fechadas: reais.filter((f) => f.status === "fechada" || f.status === "atrasada").length,
    pagas: reais.filter((f) => f.status === "paga").length,
    aReceber: totalAReceber(recs),
    totalProximas: reais
      .filter((f) => f.status !== "paga")
      .reduce((s, f) => s + f.total, 0),
    proximas: faturas.slice(0, 4).map((f) => ({
      cardNome: f.cardNome,
      cardCor: f.cardCor,
      competencia: f.competencia,
      dataVencimento: f.dataVencimento,
      total: f.total,
      meu: f.meu,
      terceiros: f.terceiros,
      status: f.status,
      virtual: f.virtual,
    })),
    hasCards: cards.length > 0,
  };
}

/* ───────────────────────────── Agenda ───────────────────────────── */

export async function getAgendaCardData(
  window: DashWindow,
  now: Date,
): Promise<AgendaCardData> {
  // Janelas ancoradas em Brasília, não no fuso do processo. Antes: `new Date('…T00:00:00')`
  // montava o dia em UTC (= 21h-20h59 BRT, deslocado 3h TODO dia) e `format(now, ISO)` já
  // devolvia o dia seguinte a partir das 21h — o card "Eventos hoje" contava o dia errado.
  const fromW = inicioDoDiaSP(window.from);
  const toW = fimDoDiaSP(window.to);
  const todayIso = dateInSaoPaulo(now);
  const todayStart = inicioDoDiaSP(todayIso);
  const todayEnd = fimDoDiaSP(todayIso);

  const [windowOccurrences, todayOccurrences, upcoming] = await Promise.all([
    getCalendarEvents(fromW, toW),
    getCalendarEvents(todayStart, todayEnd),
    getUpcomingCalendarEvents(now, 5, 45),
  ]);

  return {
    upcoming,
    countWindow: windowOccurrences.length,
    countToday: todayOccurrences.length,
  };
}

/* ───────────────────────────── Tarefas & Rotinas ───────────────────────────── */

export async function getTasksCardData(
  todayIso: string,
): Promise<TasksCardData> {
  const supabase = await createClient();
  const [{ data: taskRows }, routines] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, due_date, priority")
      .in("status", ["pendente", "em_andamento"])
      .limit(1000),
    getRoutinesWithToday(todayIso),
  ]);

  const tasks = (taskRows ?? []) as {
    id: string;
    title: string;
    status: TaskStoredStatus;
    due_date: string | null;
    priority: TaskPriority;
  }[];

  const list = [...tasks]
    .sort((a, b) => compareTasks(a, b, todayIso))
    .slice(0, 5)
    .map((t) => ({ ...t, effective: effectiveTaskStatus(t, todayIso) }));

  return {
    openTotal: tasks.length,
    dueToday: tasks.filter((t) => isDueToday(t, todayIso)).length,
    overdue: tasks.filter((t) => isOverdue(t, todayIso)).length,
    inProgress: tasks.filter((t) => t.status === "em_andamento").length,
    list,
    routines: routines
      .filter((r) => r.scheduledToday)
      .map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        color: r.color,
        done: Boolean(r.todayLog?.is_done),
        streak: r.streak,
      })),
  };
}

/* ───────────────────────────── Hábitos ───────────────────────────── */

export async function getHabitsCardData(
  todayIso: string,
  window: DashWindow,
): Promise<HabitsCardData> {
  const dash = await getHabitsDashboard(todayIso);
  const active = dash.habits.filter((h) => h.is_active);
  const todays = active.filter((h) => h.scheduledToday);

  let done = 0;
  let scheduled = 0;
  for (const h of active) {
    const c = computeConsistency(
      { frequency: h.frequency, weekdays: h.weekdays, is_active: true },
      new Set(h.doneDates),
      window.from,
      window.to,
    );
    done += c.done;
    scheduled += c.scheduled;
  }

  const toItem = (h: (typeof active)[number]): DashHabitItem => ({
    id: h.id,
    name: h.name,
    icon: h.icon,
    color: h.color,
    category: h.category,
    unit: h.unit,
    target: Number(h.target_value),
    value: h.todayValue,
    done: h.todayDone,
    step: HABIT_UNIT_STEP[h.unit],
  });

  const water = active.find((h) => h.category === "agua") ?? null;

  return {
    doneToday: todays.filter((h) => h.todayDone).length,
    scheduledToday: todays.length,
    topStreak: active.reduce((m, h) => Math.max(m, h.streak), 0),
    periodRate: scheduled ? done / scheduled : 0,
    items: todays.slice(0, 6).map(toItem),
    water: water ? toItem(water) : null,
    hasHabits: active.length > 0,
  };
}

/* ───────────────────────────── Estudos ───────────────────────────── */

export async function getStudiesCardData(
  todayIso: string,
  window: DashWindow,
): Promise<StudiesCardData> {
  const supabase = await createClient();
  const today = new Date(`${todayIso}T00:00:00`);
  const windowStart = format(addDays(today, -364), ISO);
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), ISO);
  const monthStart = format(startOfMonth(today), ISO);

  const [{ data: coursesData }, { data: sessionsData }] = await Promise.all([
    supabase
      .from("study_courses")
      .select("id, title, status, target_date, cover_color, category, icon")
      .order("position", { ascending: true }),
    supabase
      .from("study_sessions")
      .select("course_id, session_date, duration_minutes")
      .gte("session_date", windowStart)
      .lte("session_date", todayIso),
  ]);

  const courses = (coursesData ?? []) as {
    id: string;
    title: string;
    status: StudyStatus;
    target_date: string | null;
    cover_color: string | null;
    category: StudyCategory;
    icon: string | null;
  }[];
  const sessions = (sessionsData ?? []) as {
    course_id: string;
    session_date: string;
    duration_minutes: number;
  }[];

  const lastByCourse = new Map<string, string>();
  for (const s of sessions) {
    const cur = lastByCourse.get(s.course_id);
    if (!cur || s.session_date > cur) lastByCourse.set(s.course_id, s.session_date);
  }

  const inProgress = courses.filter((c) => c.status === "em_andamento");
  const overdueCourses = inProgress.filter((c) =>
    courseOverdueReason(c, lastByCourse.get(c.id) ?? null, todayIso),
  );

  const cards: DashCourseItem[] = inProgress.slice(0, 4).map((c) => ({
    id: c.id,
    title: c.title,
    coverColor: c.cover_color,
    category: c.category,
    icon: c.icon,
    overdue: Boolean(courseOverdueReason(c, lastByCourse.get(c.id) ?? null, todayIso)),
  }));

  const dates = sessionDateSet(sessions);

  return {
    inProgress: inProgress.length,
    overdue: overdueCourses.length,
    streak: studyStreak(dates, todayIso),
    minutesWeek: minutesInRange(sessions, weekStart, todayIso),
    minutesMonth: minutesInRange(sessions, monthStart, todayIso),
    minutesPeriod: minutesInRange(sessions, window.from, window.to),
    courses: cards,
    totalCourses: courses.length,
  };
}

/* ───────────────────────────── Notificações (Fase 13) ───────────────────────────── */

/**
 * Lê as não lidas reais da tabela `notifications` (Fase 13). Resiliente: se a leitura
 * falhar (ex.: Supabase não configurado), degrada para available=false sem quebrar o card.
 */
export async function getNotificationsCardData(): Promise<NotificationsCardData> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("is_read", false)
    .eq("is_resolved", false);
  if (error) return { available: false, unread: 0 };
  return { available: true, unread: count ?? 0 };
}

/* ───────────────────────────── Dieta e Alimentação (Fase 16-F) ───────────────────────────── */

/**
 * Card de Dieta no Dashboard Geral.
 *
 * ⛔ CONSOME, NÃO RECALCULA. Todo número aqui já existe e já é testado:
 *  • os totais e a meta do dia saem de `buildDailyReports` (16-E), que entra por `dayTotals`
 *    (soma do SNAPSHOT) e resolve a meta VIGENTE NAQUELE DIA com `goalPeriodForDate`;
 *  • o status das refeições sai de `summarizeDay`/`upcomingMeals` (16-B, status derivado);
 *  • a evolução do peso sai de `summarizeType` (16-E);
 *  • a água sai do módulo HÁBITOS — a Dieta lê e linka, nunca duplica a fonte de verdade.
 *
 * Reimplementar qualquer um deles faria o dashboard e o módulo mostrarem números diferentes
 * para o mesmo dia.
 */
export async function getNutritionCardData(
  todayIso: string,
  minutosAgora: number,
): Promise<NutritionCardData> {
  const [day, lists, measurements, definitions] = await Promise.all([
    getNutritionDay(todayIso),
    getShoppingLists(),
    getMeasurements({ typeIds: undefined }),
    getNutrientDefinitions(),
  ]);

  // Um dia só: `buildDailyReports` devolve exatamente um relatório, já com meta da época.
  const [report] = buildDailyReports(day.meals, day.periods, todayIso, todayIso);
  const byCode = indexNutrients(definitions);

  const nutrient = (code: string): DashNutrientValue | null => {
    const definition = byCode[code];
    if (!definition) return null;
    const total = report.totals[code];
    const target = report.targets[code]?.amount ?? null;
    // ⛔ Sem registro, `amount` é NULL. Um 0 aqui afirmaria "não comeu nada".
    const amount = report.hasRecord ? (total?.amount ?? null) : null;
    return {
      code,
      label: definition.shortName ?? definition.name,
      unit: definition.unit,
      amount: amount === null ? null : displayAmount(amount, definition),
      target: target === null ? null : displayAmount(target, definition),
      percent:
        amount !== null && target !== null && target > 0 ? (amount / target) * 100 : null,
      quality: amount === null ? null : (total?.quality ?? null),
    };
  };

  const now = { hoje: todayIso, minutosAgora };
  const summary = summarizeDay(day.meals, now);
  const [proxima] = upcomingMeals(day.meals, now, 1);
  const nextState = proxima ? effectiveMealStatus(proxima, now) : null;

  const activeLists = lists.filter((l) => !l.isArchived && l.status === "ativa");
  const shoppingPending = activeLists.reduce(
    (sum, list) =>
      sum + list.items.filter((item) => SHOPPING_OPEN_STATUSES.includes(item.status)).length,
    0,
  );

  const weightMeasurements = measurements.filter((m) => m.typeSlug === "peso");
  const weightSummary = summarizeType(weightMeasurements);
  const weightUnit = weightMeasurements[0]?.unit ?? "kg";
  const weightDecimals = weightMeasurements[0]?.typeDecimals ?? 1;

  return {
    hasRecord: report.hasRecord,
    hasModule:
      day.meals.length > 0 ||
      day.planned.length > 0 ||
      day.periods.length > 0 ||
      activeLists.length > 0 ||
      weightMeasurements.length > 0,
    energy: nutrient("energia"),
    protein: nutrient("proteina"),
    adherence: report.hasRecord ? report.adherence.percent : null,
    mealsTotal: summary.total,
    mealsDone: summary.consumidas,
    mealsPending: summary.pendentes,
    mealsLate: summary.atrasadas,
    nextMeal: proxima
      ? {
          name: proxima.mealTypeName,
          time: shortTime(proxima.plannedTime) || null,
          late: Boolean(nextState?.isLate),
        }
      : null,
    shoppingPending,
    shoppingLists: activeLists.length,
    weight:
      weightSummary.current !== null && weightSummary.currentDate
        ? {
            value: weightSummary.current,
            unit: weightUnit,
            decimals: weightDecimals,
            measuredOn: weightSummary.currentDate,
            sincePrevious: weightSummary.sincePrevious?.absolute ?? null,
          }
        : null,
    // A ÁGUA É DO MÓDULO HÁBITOS. Aqui é leitura + link; nada é gravado por este card.
    water: day.water
      ? { value: day.water.value, target: day.water.target, unit: day.water.unit }
      : null,
  };
}
