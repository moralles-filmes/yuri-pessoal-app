/**
 * Fase 14 — Montagem dos relatórios consolidados (server-only). REUSO, NÃO REESCRITA:
 * o financeiro/cartão reaproveita os módulos puros da Fase 07 (dashboard.ts) e as
 * leituras da Fase 02–06; hábitos/estudos reaproveitam getHabitsDashboard/getStudyDashboard
 * (Fases 10–11); tarefas usa o agregador puro reports/tasks.ts (sobre status.ts da Fase 09).
 * A RLS garante o escopo por usuário. Tudo roda em paralelo (Promise.all), sem N+1.
 */
import { createClient } from "@/lib/supabase/server";
import { toDateInputValue } from "@/lib/format";
import {
  getAccounts,
  getBills,
  getCreditCards,
  getRecurrences,
  getReceivables,
  getStatementInstallmentItems,
  getStatements,
  getTransactionsRange,
} from "@/lib/finance/queries";
import {
  comparativoMesAMes,
  evolucaoMensal,
  gastosPorCategoria,
  gastosPorForma,
  mesDe,
  projecaoProximosMeses,
  proximas6Faturas,
  proximasContasPagar,
  proximosMeses,
  resumoMes,
  totalAReceber,
  ultimosMeses,
  type CategoriaSlice,
  type Comparativo,
  type DashBill,
  type DashCard,
  type DashInstallmentItem,
  type DashReceivable,
  type DashRecurrence,
  type DashStatement,
  type DashTx,
  type EvolucaoPonto,
  type FaturaProvisao,
  type FormaSlice,
  type ProjecaoPonto,
  type ProximasContas,
  type ResumoMes,
} from "@/lib/finance/dashboard";
import { getHabitsDashboard } from "@/lib/habits/queries";
import { getStudyDashboard } from "@/lib/studies/queries";
import { tasksReport, type ReportTask, type TasksReport } from "@/lib/reports/tasks";
import type { Frequency } from "@/lib/finance/constants";
import type { StudyCategory, StudyStatus } from "@/lib/studies/constants";
import type { TaskStoredStatus } from "@/lib/tasks/constants";
import type {
  HabitRankItem,
  HabitWeekPoint,
  StudyWeekPoint,
} from "@/types/database";

/** Último dia do mês 'yyyy-MM' como 'yyyy-MM-dd'. */
function fimDoMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return toDateInputValue(new Date(y, m, 0));
}

/* ───────────────────────────── Tipos de saída ───────────────────────────── */

export type FinanceReport = {
  mes: string;
  saldo: number;
  resumo: ResumoMes;
  comparativo: Comparativo;
  evolucao: EvolucaoPonto[];
  categorias: CategoriaSlice[];
  formas: FormaSlice[];
  projecao: ProjecaoPonto[];
  contas: ProximasContas;
  aReceber: number;
  assinaturas: { nome: string; valor: number; frequency: Frequency }[];
};

export type FaturaMes = {
  mes: string;
  total: number;
  meu: number;
  terceiros: number;
};

export type CardReport = {
  faturas: FaturaProvisao[];
  faturasPorMes: FaturaMes[];
  parcelasComprometidas: number;
  parcelasAtivas: number;
  aReceber: number;
  hasCards: boolean;
};

export type HabitsReport = {
  completionRate30: number;
  weekly: HabitWeekPoint[];
  ranking: HabitRankItem[];
  hasHabits: boolean;
};

export type StudyCourseProgress = {
  id: string;
  title: string;
  status: StudyStatus;
  category: StudyCategory;
  coverColor: string | null;
  progressPct: number;
  studiedMinutes: number;
};

export type StudiesReport = {
  minutesWeek: number;
  minutesMonth: number;
  weekly: StudyWeekPoint[];
  courses: StudyCourseProgress[];
  inProgress: number;
  overdue: number;
  hasCourses: boolean;
};

export type ReportsData = {
  mes: string;
  hoje: string;
  finance: FinanceReport;
  card: CardReport;
  habits: HabitsReport;
  studies: StudiesReport;
  tasks: TasksReport;
};

/* ───────────────────────────── Financeiro + Cartão ───────────────────────────── */

async function getFinanceAndCardReport(
  mesSel: string,
  hoje: string,
): Promise<{ finance: FinanceReport; card: CardReport }> {
  const mesAtual = mesDe(hoje);
  const evoMeses = ultimosMeses(mesSel, 6);
  const projMeses = proximosMeses(mesAtual, 6);
  const from = `${evoMeses[0]}-01`;
  const to = fimDoMes(projMeses[projMeses.length - 1]);

  const [accounts, cards, statements, receivables, bills, recurrences, transactions] =
    await Promise.all([
      getAccounts(),
      getCreditCards(),
      getStatements(),
      getReceivables(),
      getBills(),
      getRecurrences(),
      getTransactionsRange({ from, to }),
    ]);

  const statementIds = statements.map((s) => s.id).filter(Boolean) as string[];
  const installmentItems = await getStatementInstallmentItems(statementIds);

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
  const inst: DashInstallmentItem[] = installmentItems.map((it) => ({
    id: it.id,
    statement_id: it.statement_id,
    valor: it.valor,
    status: it.status,
    parent: it.parent?.category
      ? {
          category: {
            id: it.parent.category.id,
            name: it.parent.category.name,
            color: it.parent.category.color,
          },
        }
      : { category: null },
  }));
  const dashCards: DashCard[] = cards.map((c) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    limite_total: c.limite_total,
    dia_fechamento: c.dia_fechamento,
    dia_vencimento: c.dia_vencimento,
  }));
  const recorrencias: DashRecurrence[] = recurrences.map((r) => ({
    amount: r.amount,
    type: r.type,
    frequency: r.frequency,
    interval_count: r.interval_count,
    anchor_date: r.anchor_date,
    next_due_date: r.next_due_date,
    end_date: r.end_date,
    is_active: r.is_active,
  }));
  const dashBills: DashBill[] = bills.map((b) => ({
    name: b.name,
    amount: b.amount,
    due_day: b.due_day,
    is_active: b.is_active,
  }));

  const resumo = resumoMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const comparativo = comparativoMesAMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const evolucao = evolucaoMensal({ meses: evoMeses, transactions: txs, statements: sts, receivables: recs });
  const categorias = gastosPorCategoria({ mes: mesSel, transactions: txs, statements: sts, installmentItems: inst, receivables: recs });
  const formas = gastosPorForma({ mes: mesSel, transactions: txs, statements: sts, installmentItems: inst, receivables: recs });
  const projecao = projecaoProximosMeses({ hoje, meses: projMeses, statements: sts, recorrencias, bills: dashBills });
  const contas = proximasContasPagar({ hoje, bills: dashBills });
  const aReceber = totalAReceber(recs, mesSel);
  const saldo = accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);

  const assinaturas = recurrences
    .filter((r) => r.is_active && r.type === "despesa")
    .map((r) => ({
      nome: r.description ?? r.category?.name ?? "Recorrência",
      valor: r.amount,
      frequency: r.frequency,
    }))
    .sort((a, b) => b.valor - a.valor);

  // ── Cartão ──
  const faturas = proximas6Faturas({ hoje, cards: dashCards, statements: sts, receivables: recs });

  // Terceiros por fatura (somatório de recebíveis por statement_id).
  const recByStatement = new Map<string, number>();
  for (const r of recs) {
    if (!r.statement_id) continue;
    recByStatement.set(r.statement_id, (recByStatement.get(r.statement_id) ?? 0) + r.valor);
  }
  // Faturas reais agrupadas por mês de competência.
  const porMes = new Map<string, FaturaMes>();
  for (const s of sts) {
    if (!s.card_id) continue;
    const mes = mesDe(s.competencia);
    const total = s.total_atual ?? 0;
    const terceiros = recByStatement.get(s.id) ?? 0;
    const cur = porMes.get(mes) ?? { mes, total: 0, meu: 0, terceiros: 0 };
    cur.total += total;
    cur.terceiros += terceiros;
    cur.meu += total - terceiros;
    porMes.set(mes, cur);
  }
  const faturasPorMes = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));

  // Parcelas comprometidas (em faturas ainda não pagas).
  const paidStatements = new Set(sts.filter((s) => s.pago_em).map((s) => s.id));
  let parcelasComprometidas = 0;
  let parcelasAtivas = 0;
  for (const it of installmentItems) {
    if (it.status === "cancelada") continue;
    if (it.statement_id && paidStatements.has(it.statement_id)) continue;
    parcelasComprometidas += it.valor;
    parcelasAtivas++;
  }

  return {
    finance: {
      mes: mesSel,
      saldo,
      resumo,
      comparativo,
      evolucao,
      categorias,
      formas,
      projecao,
      contas,
      aReceber,
      assinaturas,
    },
    card: {
      faturas,
      faturasPorMes,
      parcelasComprometidas,
      parcelasAtivas,
      aReceber,
      hasCards: cards.length > 0,
    },
  };
}

/* ───────────────────────────── Hábitos ───────────────────────────── */

async function getHabitsReport(todayIso: string): Promise<HabitsReport> {
  const dash = await getHabitsDashboard(todayIso);
  const active = dash.habits.filter((h) => h.is_active);
  return {
    completionRate30: dash.consistency.completionRate30,
    weekly: dash.consistency.weekly,
    ranking: dash.consistency.ranking,
    hasHabits: active.length > 0,
  };
}

/* ───────────────────────────── Estudos ───────────────────────────── */

async function getStudiesReport(todayIso: string): Promise<StudiesReport> {
  const dash = await getStudyDashboard(todayIso);
  return {
    minutesWeek: dash.minutesWeek,
    minutesMonth: dash.minutesMonth,
    weekly: dash.weekly,
    courses: dash.courses.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      category: c.category,
      coverColor: c.cover_color,
      progressPct: c.progressPct,
      studiedMinutes: c.studiedMinutes,
    })),
    inProgress: dash.inProgress,
    overdue: dash.overdue.length,
    hasCourses: dash.totalCourses > 0,
  };
}

/* ───────────────────────────── Tarefas ───────────────────────────── */

async function getTasksReportData(todayIso: string): Promise<TasksReport> {
  const supabase = await createClient();
  const [{ data: taskRows }, { count: projectsCount }] = await Promise.all([
    supabase.from("tasks").select("status, due_date, completed_at").limit(5000),
    supabase
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("is_archived", false),
  ]);

  const tasks: ReportTask[] = ((taskRows ?? []) as {
    status: TaskStoredStatus;
    due_date: string | null;
    completed_at: string | null;
  }[]).map((t) => ({
    status: t.status,
    due_date: t.due_date,
    completed_at: t.completed_at,
  }));

  return tasksReport({
    tasks,
    todayIso,
    activeProjects: projectsCount ?? 0,
  });
}

/* ───────────────────────────── Orquestrador ───────────────────────────── */

export async function getReportsData(mesSel: string): Promise<ReportsData> {
  const hoje = toDateInputValue(new Date());
  const [financeAndCard, habits, studies, tasks] = await Promise.all([
    getFinanceAndCardReport(mesSel, hoje),
    getHabitsReport(hoje),
    getStudiesReport(hoje),
    getTasksReportData(hoje),
  ]);

  return {
    mes: mesSel,
    hoje,
    finance: financeAndCard.finance,
    card: financeAndCard.card,
    habits,
    studies,
    tasks,
  };
}
