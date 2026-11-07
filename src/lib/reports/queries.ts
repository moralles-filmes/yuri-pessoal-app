/**
 * Fase 14 — Montagem dos relatórios consolidados (server-only). REUSO, NÃO REESCRITA:
 * o financeiro/cartão reaproveita os módulos puros da Fase 07 (dashboard.ts) e as
 * leituras da Fase 02–06; hábitos/estudos reaproveitam getHabitsDashboard/getStudyDashboard
 * (Fases 10–11); tarefas usa o agregador puro reports/tasks.ts (sobre status.ts da Fase 09).
 * A RLS garante o escopo por usuário. Tudo roda em paralelo (Promise.all), sem N+1.
 */
import { createClient } from "@/lib/supabase/server";
import { hojeISO, reaisParaCentavos } from "@/lib/format";
import { getCategories, getPeopleForSelect, lerFinanceiro, lerSaldoAte } from "@/lib/finance/queries";
import { lerEstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import type { ParametrosDoDetalhe } from "@/lib/finance/detalhe";
import type { BaseFinanceira } from "@/lib/finance/base";
import {
  faturasPorMes,
  type FaturaDoMes,
  mesDe,
  nextDayISO,
  proximas6Faturas,
  totalAReceber,
  type FaturaProvisao,
} from "@/lib/finance/dashboard";
import {
  ESCOPO_PAINEL,
  janelaDoRelatorio,
  type CompletudeFinanceira,
} from "@/lib/finance/pipeline";
import { recorteDaUrl } from "@/lib/finance/recorte";
import type { Responsabilidade } from "@/lib/finance/responsabilidade";
import {
  gavetaDoRelatorio,
  montarRelatorioFinanceiro,
  type GavetaDoRelatorio,
  type RelatorioFinanceiro,
} from "@/lib/reports/financeiro";
import { pedidoDaUrl } from "@/lib/painel/detalhe-url";
import { getHabitsDashboard } from "@/lib/habits/queries";
import { getStudyDashboard } from "@/lib/studies/queries";
import { tasksReport, type ReportTask, type TasksReport } from "@/lib/reports/tasks";
import type { StudyCategory, StudyStatus } from "@/lib/studies/constants";
import type { TaskStoredStatus } from "@/lib/tasks/constants";
import type {
  HabitRankItem,
  HabitWeekPoint,
  StudyWeekPoint,
} from "@/types/database";

/* ───────────────────────────── Tipos de saída ───────────────────────────── */

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
  /** 04-A2: o modelo de vista da aba Financeiro — `relatorios-client.tsx` só o desenha. */
  financeiro: RelatorioFinanceiro;
  card: CardReport;
  habits: HabitsReport;
  studies: StudiesReport;
  tasks: TasksReport;
};

/* ───────────────────────────── Financeiro + Cartão ───────────────────────────── */

/** Os parâmetros da URL que o relatório lê além do mês e da base (04-A2). */
export type FiltrosDoRelatorioNaUrl = {
  resp: Responsabilidade;
  sp: Record<string, string | string[] | undefined>;
};

async function getFinanceAndCardReport(
  mesSel: string,
  hoje: string,
  base: BaseFinanceira,
  filtros: FiltrosDoRelatorioNaUrl,
): Promise<{
  financeiro: RelatorioFinanceiro;
  /** 04-B: fora do `ReportsData` — o JSON exportado não leva a vista da gaveta nem as URLs. */
  gaveta: GavetaDoRelatorio;
  card: CardReport;
}> {
  const mesAtual = mesDe(hoje);
  // REDESIGN-03-B — a MESMA chamada da página do dashboard financeiro, não a mesma cópia.
  const janela = janelaDoRelatorio({ mesSel, mesAtual });
  const { evoMeses, projMeses } = janela;

  // As recorrências voltam também CRUAS: "assinaturas" lê `description` e `category.name`, que
  // não são entrada do motor. 04-A2 (D-A2-23): com `ESCOPO_PAINEL`, os recebíveis crus (com a
  // pessoa e o cartão) saem da MESMA leitura; pessoas e categorias dos `<select>` vêm de leituras
  // que já existiam (nenhuma tabela nova é lida).
  const [leitura, pessoas, categoriasLidas] = await Promise.all([
    lerFinanceiro({ janela, escopo: ESCOPO_PAINEL }),
    getPeopleForSelect(),
    getCategories(),
  ]);
  const {
    entradas,
    contas: accounts,
    recorrencias: recurrences,
    recebiveis: recebiveisCrus,
    completude,
  } = leitura;
  const { txs, sts, recs, inst, cards: dashCards } = entradas;

  const aReceber = totalAReceber(recs, mesSel);

  // 04-B: `lerEstadoDoCaixa` devolve, além do estado que o modelo já usa, a leitura crua e o motor
  // que a gaveta lista — relê-los numa segunda consulta abriria uma janela em que lista e número
  // discordam.
  const doCaixa =
    base === "caixa"
      ? await lerEstadoDoCaixa(
          mesSel,
          hoje,
          { statements: sts, receivables: recs, transactions: txs, installmentItems: inst },
          evoMeses,
        )
      : null;
  const caixa = doCaixa ? doCaixa.estado : null;

  // 04-A2: as opções dos filtros, o recorte da URL (id desconhecido é ignorado) e o saldo —
  // `lerSaldoAte` depende do recorte (o da conta), por isso vem DEPOIS, uma RPC a mais e sequencial.
  const opcoes = {
    contas: accounts.map((c) => ({ id: c.id, nome: c.name })),
    cartoes: dashCards.map((c) => ({ id: c.id, nome: c.nome })),
    pessoas,
    categorias: categoriasLidas.map((c) => ({ id: c.id, nome: c.name })),
  };
  const recorte = recorteDaUrl(filtros.sp, {
    contas: opcoes.contas.map((o) => o.id),
    cartoes: opcoes.cartoes.map((o) => o.id),
    pessoas: opcoes.pessoas.map((o) => o.id),
    categorias: opcoes.categorias.map((o) => o.id),
  });
  const saldoAte = await lerSaldoAte(nextDayISO(hoje), recorte.conta);

  const parametros = {
    mes: mesSel,
    hoje,
    base,
    resp: filtros.resp,
    recorte,
    entradas,
    recebiveisCrus,
    contas: accounts,
    recorrenciasCruas: recurrences,
    saldoAte,
    caixa,
    completude,
    janela: { evoMeses, projMeses },
    opcoes,
  };
  const financeiro = montarRelatorioFinanceiro(parametros);

  // ── 04-B: a gaveta de registros. O pedido vem da URL (`?detalhe=`). ──
  const pedido = pedidoDaUrl(filtros.sp);

  // D-B-12: o saldo abre "saldo por conta" — uma chamada da MESMA RPC por conta, só com a gaveta
  // aberta nele. Com o recorte de conta, só a conta dele (é o número que o indicador mostra).
  // Falha de uma conta vira `saldoCent: null` (a gaveta diz qual); nunca zero.
  let saldos: ParametrosDoDetalhe["saldos"] = null;
  if (pedido?.chave === "saldo") {
    const corte = nextDayISO(hoje);
    const contasDoSaldo = recorte.conta === null ? accounts : accounts.filter((c) => c.id === recorte.conta);
    const porConta = await Promise.all(
      contasDoSaldo.map(async (conta) => {
        const valor = await lerSaldoAte(corte, conta.id).catch(() => null);
        return { id: conta.id, nome: conta.name, saldoCent: valor === null ? null : reaisParaCentavos(valor) };
      }),
    );
    saldos = { totalCent: saldoAte === null ? null : reaisParaCentavos(saldoAte), porConta };
  }

  const gaveta = gavetaDoRelatorio({
    ...parametros,
    relatorio: financeiro,
    pedido,
    sp: filtros.sp,
    caixaParaDetalhe:
      base === "caixa" ? (doCaixa?.leitura && doCaixa.motorDoCaixa ? { leitura: doCaixa.leitura, motor: doCaixa.motorDoCaixa } : "erro") : null,
    saldos,
  });

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
    financeiro,
    gaveta,
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
  base: BaseFinanceira,
  filtros: FiltrosDoRelatorioNaUrl,
): Promise<{ data: ReportsData; gaveta: GavetaDoRelatorio }> {
  const hoje = hojeISO();
  const [financeAndCard, habits, studies, tasks] = await Promise.all([
    getFinanceAndCardReport(mesSel, hoje, base, filtros),
    getHabitsReport(hoje),
    getStudiesReport(hoje),
    getTasksReportData(hoje),
  ]);

  return {
    data: {
      mes: mesSel,
      hoje,
      financeiro: financeAndCard.financeiro,
      card: financeAndCard.card,
      habits,
      studies,
      tasks,
    },
    gaveta: financeAndCard.gaveta,
  };
}
