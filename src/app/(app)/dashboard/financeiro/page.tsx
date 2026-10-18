import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { lerFinanceiro } from "@/lib/finance/queries";
import {
  comparativoMesAMes,
  evolucaoMensal,
  gastosPorCategoria,
  gastosPorForma,
  gerarAlertas,
  mesDe,
  perdoadoDoMes,
  proximas6Faturas,
  projecaoProximosMeses,
  proximasContasPagar,
  reguaDoGastoAlto,
  resumoMes,
  totalAReceber,
} from "@/lib/finance/dashboard";
import {
  ESCOPO_RELATORIO,
  janelaDoRelatorio,
  saldoDasContas,
} from "@/lib/finance/pipeline";
import { baseDaUrl } from "@/lib/finance/base";
import { estadoDoCaixa } from "@/lib/finance/caixa-leitura";
import { comparativoAteODia, comparativoDoGraficoAteODia } from "@/lib/finance/caixa";
import { hojeISO } from "@/lib/format";
import { DashboardClient } from "./financial-dashboard-client";

export const metadata: Metadata = { title: "Dashboard financeiro" };
export const dynamic = "force-dynamic";

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
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

  // Base dos números (?base=caixa); sem o parâmetro, competência.
  const base = baseDaUrl(sp.base);

  // Janela de leitura: 6 meses para trás (evolução) até 6 meses à frente (projeção).
  const janela = janelaDoRelatorio({ mesSel, mesAtual });
  const { evoMeses, projMeses } = janela;

  // Uma rodada de leituras (sem N+1), já normalizada para os tipos do módulo puro — a MESMA
  // chamada do relatório (REDESIGN-03-B). RLS garante o escopo por usuário.
  const { entradas, contas: accounts } = await lerFinanceiro({
    janela,
    escopo: ESCOPO_RELATORIO,
  });
  const { txs, sts, recs, inst, cards: dashCards, recorrencias, bills: dashBills } = entradas;

  // Agregações (no servidor — módulo puro, determinístico).
  const resumo = resumoMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const perdoado = perdoadoDoMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const comparativo = comparativoMesAMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const evolucao = evolucaoMensal({ meses: evoMeses, transactions: txs, statements: sts, receivables: recs });
  const categorias = gastosPorCategoria({ mes: mesSel, transactions: txs, statements: sts, installmentItems: inst, receivables: recs });
  const formas = gastosPorForma({ mes: mesSel, transactions: txs, statements: sts, installmentItems: inst, receivables: recs });
  const faturas = proximas6Faturas({ hoje, cards: dashCards, statements: sts, receivables: recs });
  const projecao = projecaoProximosMeses({ hoje, meses: projMeses, statements: sts, receivables: recs, recorrencias, bills: dashBills });
  const contas = proximasContasPagar({ hoje, bills: dashBills });
  const aReceber = totalAReceber(recs, mesSel);
  const saldo = saldoDasContas(accounts);

  // A leitura da base caixa só acontece quando ela está selecionada.
  const caixa =
    base === "caixa"
      ? await estadoDoCaixa(
          mesSel,
          hoje,
          { statements: sts, receivables: recs, transactions: txs, installmentItems: inst },
          evoMeses,
        )
      : null;

  // Corte "até o dia D" do mês em andamento (K3/K3b) — calculado no servidor, viaja por prop.
  const corteCompetencia = comparativoAteODia({
    base: "competencia",
    mes: mesSel,
    hoje,
    transactions: txs,
    receivables: recs,
  });
  const graficoAteODia = comparativoDoGraficoAteODia({
    mes: mesSel,
    hoje,
    transactions: txs,
    receivables: recs,
  });

  // A régua do alerta de gasto alto — a MESMA que o sino usa desde a 03-B2 (B2, decisão do dono):
  // até 5 meses anteriores ao selecionado, mês sem saída ignorado. O número desta tela não mudou.
  const regua = reguaDoGastoAlto({
    mes: mesSel,
    transactions: txs,
    statements: sts,
    receivables: recs,
  });
  const alertas = gerarAlertas({
    hoje,
    resumoAtual: resumo,
    mediaSaidas: regua.mediaSaidas,
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
        base={base}
        caixa={caixa}
        saldo={saldo}
        resumo={resumo}
        perdoado={perdoado}
        comparativo={comparativo}
        corteCompetencia={corteCompetencia}
        graficoAteODia={graficoAteODia}
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
