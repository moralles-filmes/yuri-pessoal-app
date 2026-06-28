import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import {
  getAccounts,
  getBills,
  getCreditCards,
  getRecurrences,
  getStatementInstallmentItems,
  getStatements,
  getReceivables,
  getTransactionsRange,
} from "@/lib/finance/queries";
import {
  comparativoMesAMes,
  evolucaoMensal,
  gastosPorCategoria,
  gastosPorForma,
  gerarAlertas,
  mesDe,
  proximas6Faturas,
  projecaoProximosMeses,
  proximasContasPagar,
  proximosMeses,
  resumoMes,
  totalAReceber,
  ultimosMeses,
  type DashBill,
  type DashCard,
  type DashInstallmentItem,
  type DashReceivable,
  type DashRecurrence,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";
import { hojeISO, toDateInputValue } from "@/lib/format";
import { DashboardClient } from "./financial-dashboard-client";

export const metadata: Metadata = { title: "Dashboard financeiro" };
export const dynamic = "force-dynamic";

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

/** Último dia do mês 'yyyy-MM' como 'yyyy-MM-dd'. */
function fimDoMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return toDateInputValue(new Date(y, m, 0));
}

export default async function DashboardFinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const hoje = hojeISO();
  const mesAtual = mesDe(hoje);
  const mesSel = (() => {
    const v = str(sp.mes);
    return v && /^\d{4}-\d{2}$/.test(v) ? v : mesAtual;
  })();

  // Janela de leitura: 6 meses para trás (evolução) até 6 meses à frente (projeção).
  const evoMeses = ultimosMeses(mesSel, 6);
  const projMeses = proximosMeses(mesAtual, 6);
  const from = `${evoMeses[0]}-01`;
  const to = fimDoMes(projMeses[projMeses.length - 1]);

  // Uma rodada de leituras (sem N+1). RLS garante o escopo por usuário.
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

  // Normaliza para os tipos estruturais do módulo puro.
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
      ? { category: { id: it.parent.category.id, name: it.parent.category.name, color: it.parent.category.color } }
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

  // Agregações (no servidor — módulo puro, determinístico).
  const resumo = resumoMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const comparativo = comparativoMesAMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const evolucao = evolucaoMensal({ meses: evoMeses, transactions: txs, statements: sts, receivables: recs });
  const categorias = gastosPorCategoria({ mes: mesSel, transactions: txs, statements: sts, installmentItems: inst, receivables: recs });
  const formas = gastosPorForma({ mes: mesSel, transactions: txs, statements: sts, installmentItems: inst, receivables: recs });
  const faturas = proximas6Faturas({ hoje, cards: dashCards, statements: sts, receivables: recs });
  const projecao = projecaoProximosMeses({ hoje, meses: projMeses, statements: sts, recorrencias, bills: dashBills });
  const contas = proximasContasPagar({ hoje, bills: dashBills });
  const aReceber = totalAReceber(recs, mesSel);
  const saldo = accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0);

  // Média de saídas dos meses anteriores ao selecionado (para o alerta de gasto alto).
  const anteriores = evolucao.filter((p) => p.mes < mesSel && p.saidas > 0);
  const mediaSaidas =
    anteriores.length > 0
      ? anteriores.reduce((s, p) => s + p.saidas, 0) / anteriores.length
      : 0;
  const alertas = gerarAlertas({
    hoje,
    resumoAtual: resumo,
    mediaSaidas,
    cards: dashCards,
    statements: sts,
    receivables: recs,
  });

  // Faturas abertas/fechadas (efetivas) para o card de contagem.
  const faturasAbertas = faturas.filter((f) => !f.virtual && f.status === "aberta").length;
  const faturasFechadas = faturas.filter(
    (f) => !f.virtual && (f.status === "fechada" || f.status === "atrasada"),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard financeiro"
        description="Quanto você realmente gastou e quanto vai receber de volta."
      />
      <DashboardClient
        mesSel={mesSel}
        saldo={saldo}
        resumo={resumo}
        comparativo={comparativo}
        evolucao={evolucao}
        categorias={categorias}
        formas={formas}
        faturas={faturas}
        projecao={projecao}
        alertas={alertas}
        contas={contas}
        aReceber={aReceber}
        faturasAbertas={faturasAbertas}
        faturasFechadas={faturasFechadas}
      />
    </div>
  );
}
