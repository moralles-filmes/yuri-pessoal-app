/**
 * REDESIGN-06 — a conta PURA do Resumo financeiro do dashboard geral.
 *
 * Sem `server-only`, sem banco, sem relógio: `hoje` e as linhas chegam de fora. Nenhuma soma é
 * escrita aqui — cada número sai de uma função que já existia (`resumoMes`, `evolucaoMensal`,
 * `comparativoDoGraficoAteODia`, `comparacaoDosIndicadores`…), as mesmas da 04-A. Os números do mês
 * usam SÓ `doMes` (iguais aos de `getFinanceCardData`); o histórico de lançamentos só entra nas
 * barras e na comparação com o mês anterior. As janelas são disjuntas: lançamento repetido entre
 * as duas é defeito de quem chamou, e a função recusa em vez de somar em dobro.
 */
import type { FinanceCardData } from "@/lib/dashboard/types";
import {
  comparativoMesAMes,
  evolucaoMensal,
  mesDe,
  paresDoMesAMes,
  perdoadoDoMes,
  proximasContasPagar,
  resumoMes,
  totalAReceber,
  ultimosMeses,
  type DashTx,
  type EvolucaoPonto,
} from "@/lib/finance/dashboard";
import { comparativoDoGraficoAteODia } from "@/lib/finance/caixa";
import {
  comparacaoDosIndicadores,
  dadosDasBarras,
  indicadorMinhasEntradas,
  saldoComData,
  type ComparacaoDoIndicador,
} from "@/lib/finance/painel";
import {
  saldoDasContas,
  type CompletudeFinanceira,
  type ESCOPO_CARD_FINANCEIRO,
  type EntradasDoEscopo,
} from "@/lib/finance/pipeline";
import type { AccountWithBalance } from "@/types/database";

export type ResumoDoDashboard = {
  mes: string;
  completudeDoMes: CompletudeFinanceira;
  completudeDoHistorico: CompletudeFinanceira;
  /** Os mesmos números de `getFinanceCardData` para o mês (equivalência testada). */
  numeros: Omit<FinanceCardData, "completude" | "mes">;
  saldoCom: { rotulo: string; valor: number | null; diferenca: string | null };
  entradasInd: { valor: number; linhaDeTerceiros: string | null };
  comparacao: { entradas: ComparacaoDoIndicador; saidas: ComparacaoDoIndicador };
  barras: (EvolucaoPonto & { parcial: boolean })[];
};

export function montarResumoDoDashboard(p: {
  mes: string;
  hoje: string;
  doMes: EntradasDoEscopo<typeof ESCOPO_CARD_FINANCEIRO>;
  contas: AccountWithBalance[];
  historicoTxs: DashTx[];
  saldoAte: number | null;
  completudeDoMes: CompletudeFinanceira;
  completudeDoHistorico: CompletudeFinanceira;
}): ResumoDoDashboard {
  const { mes, hoje, doMes, contas, historicoTxs } = p;
  const { txs, sts, recs, bills } = doMes;

  const idsDoMes = new Set(txs.flatMap((t) => (t.id === undefined ? [] : [t.id])));
  if (historicoTxs.some((t) => t.id !== undefined && idsDoMes.has(t.id))) {
    throw new Error("lançamento repetido entre o mês e o histórico");
  }

  // Os números do mês: só `doMes`, na mesma ordem e com as mesmas funções do card antigo.
  const resumo = resumoMes({ mes, transactions: txs, statements: sts, receivables: recs });
  const proximas = proximasContasPagar({ hoje, bills });
  const numeros: ResumoDoDashboard["numeros"] = {
    saldo: saldoDasContas(contas),
    entradas: resumo.entradas,
    entradasMeu: resumo.entradasMeu,
    entradasTerceiros: resumo.entradasTerceiros,
    saidas: resumo.saidas,
    meu: resumo.meu,
    perdoado: perdoadoDoMes({ mes, transactions: txs, statements: sts, receivables: recs }),
    terceiros: resumo.terceiros,
    cartao: resumo.cartao,
    aVista: resumo.aVista,
    aReceber: totalAReceber(recs, mes),
    contasTotal: proximas.total,
    contasCount: proximas.count,
    proximaConta: proximas.proxima,
  };

  // Barras e comparação: lançamentos do mês + histórico; faturas e recebíveis só do mês.
  const transactions = [...txs, ...historicoTxs];
  const evolucao = evolucaoMensal({
    meses: ultimosMeses(mes, 6),
    transactions,
    statements: sts,
    receivables: recs,
  });

  // O caminho da 04-A: mês em andamento compara até o dia D; senão, o mês inteiro.
  const grafico = comparativoDoGraficoAteODia({ mes, hoje, transactions, receivables: recs });
  const comparativo =
    grafico !== null
      ? grafico.comparativo
      : comparativoMesAMes({ mes, transactions, statements: sts, receivables: recs });

  return {
    mes,
    completudeDoMes: p.completudeDoMes,
    completudeDoHistorico: p.completudeDoHistorico,
    numeros,
    saldoCom: saldoComData({ saldoAte: p.saldoAte, saldoDaView: numeros.saldo, hoje }),
    entradasInd: indicadorMinhasEntradas(resumo),
    comparacao: comparacaoDosIndicadores({
      dados: paresDoMesAMes(comparativo),
      ateODia: grafico?.ateODia ?? null,
      base: "competencia",
      futuro: mes > mesDe(hoje),
    }),
    barras: dadosDasBarras(evolucao, mesDe(hoje)),
  };
}
