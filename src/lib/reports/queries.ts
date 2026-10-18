/**
 * Fase 14 — Montagem dos relatórios consolidados (server-only). REUSO, NÃO REESCRITA:
 * o financeiro/cartão reaproveita os módulos puros da Fase 07 (dashboard.ts) e as
 * leituras da Fase 02–06; hábitos/estudos reaproveitam getHabitsDashboard/getStudyDashboard
 * (Fases 10–11); tarefas usa o agregador puro reports/tasks.ts (sobre status.ts da Fase 09).
 * A RLS garante o escopo por usuário. Tudo roda em paralelo (Promise.all), sem N+1.
 */
import { createClient } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/format";
import { comparativoDoGraficoAteODia } from "@/lib/finance/caixa";
import { lerFinanceiro } from "@/lib/finance/queries";
import { estadoDoCaixa, type EstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import type { BaseFinanceira } from "@/lib/finance/base";
import {
  comparativoMesAMes,
  evolucaoMensal,
  faturasPorMes,
  type FaturaDoMes,
  gastosPorCategoria,
  gastosPorForma,
  mesDe,
  perdoadoDoMes,
  projecaoProximosMeses,
  proximas6Faturas,
  proximasContasPagar,
  resumoMes,
  totalAReceber,
  type CategoriaSlice,
  type Comparativo,
  type EvolucaoPonto,
  type FaturaProvisao,
  type FormaSlice,
  type ProjecaoPonto,
  type ProximasContas,
  type ResumoMes,
} from "@/lib/finance/dashboard";
import {
  ESCOPO_RELATORIO,
  janelaDoRelatorio,
  saldoDasContas,
  type CompletudeFinanceira,
} from "@/lib/finance/pipeline";
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

/* ───────────────────────────── Tipos de saída ───────────────────────────── */

export type FinanceReport = {
  completude: CompletudeFinanceira;
  mes: string;
  saldo: number;
  resumo: ResumoMes;
  /** 03-D D11: entra em meu por decisão de não cobrar; resumo.meu − perdoado = parte acordada. */
  perdoado: number;
  comparativo: Comparativo;
  /** K3b: o corte "até o dia D" do mês em andamento para o gráfico "Mês a mês"; null no fechado. */
  graficoAteODia: { ateODia: number; comparativo: Comparativo } | null;
  evolucao: EvolucaoPonto[];
  categorias: CategoriaSlice[];
  formas: FormaSlice[];
  projecao: ProjecaoPonto[];
  contas: ProximasContas;
  aReceber: number;
  assinaturas: { nome: string; valor: number; frequency: Frequency }[];
};

export type FaturaMes = FaturaDoMes;

export type CardReport = {
  completude: CompletudeFinanceira;
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
  /** Só com a base caixa selecionada; `null` em competência. */
  caixa: EstadoDoCaixa | null;
  card: CardReport;
  habits: HabitsReport;
  studies: StudiesReport;
  tasks: TasksReport;
};

/* ───────────────────────────── Financeiro + Cartão ───────────────────────────── */

async function getFinanceAndCardReport(
  mesSel: string,
  hoje: string,
  base: BaseFinanceira,
): Promise<{ finance: FinanceReport; caixa: EstadoDoCaixa | null; card: CardReport }> {
  const mesAtual = mesDe(hoje);
  // REDESIGN-03-B — a MESMA chamada da página do dashboard financeiro, não a mesma cópia.
  const janela = janelaDoRelatorio({ mesSel, mesAtual });
  const { evoMeses, projMeses } = janela;

  // As recorrências voltam também CRUAS: "assinaturas" lê `description` e `category.name`, que
  // não são entrada do motor.
  const { entradas, contas: accounts, recorrencias: recurrences, completude } = await lerFinanceiro({
    janela,
    escopo: ESCOPO_RELATORIO,
  });
  const { txs, sts, recs, inst, cards: dashCards, recorrencias, bills: dashBills } = entradas;

  const resumo = resumoMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const comparativo = comparativoMesAMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const graficoAteODia = comparativoDoGraficoAteODia({ mes: mesSel, hoje, transactions: txs, receivables: recs });
  const evolucao = evolucaoMensal({ meses: evoMeses, transactions: txs, statements: sts, receivables: recs });
  const categorias = gastosPorCategoria({ mes: mesSel, transactions: txs, statements: sts, installmentItems: inst, receivables: recs });
  const formas = gastosPorForma({ mes: mesSel, transactions: txs, statements: sts, installmentItems: inst, receivables: recs });
  const projecao = projecaoProximosMeses({ hoje, meses: projMeses, statements: sts, receivables: recs, recorrencias, bills: dashBills });
  const contas = proximasContasPagar({ hoje, bills: dashBills });
  const aReceber = totalAReceber(recs, mesSel);
  const saldo = saldoDasContas(accounts);

  const assinaturas = recurrences
    .filter((r) => r.is_active && r.type === "despesa")
    .map((r) => ({
      nome: r.description ?? r.category?.name ?? "Recorrência",
      valor: r.amount,
      frequency: r.frequency,
    }))
    .sort((a, b) => b.valor - a.valor);

  const caixa =
    base === "caixa"
      ? await estadoDoCaixa(
          mesSel,
          hoje,
          { statements: sts, receivables: recs, transactions: txs, installmentItems: inst },
          evoMeses,
        )
      : null;

  // ── Cartão ──
  const faturas = proximas6Faturas({ hoje, cards: dashCards, statements: sts, receivables: recs });

  // Faturas reais agrupadas por mês de competência (histórico) — a regra única de meu × terceiros.
  const faturasDoHistorico = faturasPorMes({ statements: sts, receivables: recs, agrupar: "competencia" });

  // Parcelas comprometidas (em faturas ainda não pagas).
  const paidStatements = new Set(sts.filter((s) => s.pago_em).map((s) => s.id));
  let parcelasComprometidas = 0;
  let parcelasAtivas = 0;
  for (const it of inst) {
    if (it.status === "cancelada") continue;
    if (it.statement_id && paidStatements.has(it.statement_id)) continue;
    parcelasComprometidas += it.valor;
    parcelasAtivas++;
  }

  return {
    finance: {
      completude,
      mes: mesSel,
      saldo,
      resumo,
      perdoado: perdoadoDoMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs }),
      comparativo,
      graficoAteODia,
      evolucao,
      categorias,
      formas,
      projecao,
      contas,
      aReceber,
      assinaturas,
    },
    caixa,
    card: {
      completude,
      faturas,
      faturasPorMes: faturasDoHistorico,
      parcelasComprometidas,
      parcelasAtivas,
      aReceber,
      hasCards: dashCards.length > 0,
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

export async function getReportsData(
  mesSel: string,
  base: BaseFinanceira = "competencia",
): Promise<ReportsData> {
  const hoje = hojeISO();
  const [financeAndCard, habits, studies, tasks] = await Promise.all([
    getFinanceAndCardReport(mesSel, hoje, base),
    getHabitsReport(hoje),
    getStudiesReport(hoje),
    getTasksReportData(hoje),
  ]);

  return {
    mes: mesSel,
    hoje,
    finance: financeAndCard.finance,
    caixa: financeAndCard.caixa,
    card: financeAndCard.card,
    habits,
    studies,
    tasks,
  };
}
