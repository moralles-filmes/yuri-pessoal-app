/**
 * REDESIGN-06 — a leitura do Resumo financeiro do dashboard geral (I/O).
 *
 * Duas leituras, e não uma: o mês com o escopo do card e o histórico dos 5 meses anteriores
 * com o escopo só de lançamentos. Uma leitura única na janela de 6 meses cairia no teto de
 * 2000 linhas em ordem crescente e cortaria o mês em andamento — justamente o que o número
 * do mês precisa ter inteiro. As janelas são disjuntas, e `montarResumoDoDashboard` recusa
 * lançamento repetido entre elas.
 *
 * `cache` com argumentos primitivos (`mes`, `hoje`): dentro de uma renderização, o card e as
 * barras chamam com a mesma chave e leem o banco uma vez. Objeto na assinatura quebraria a
 * igualdade por referência do `cache`.
 */
import "server-only";
import { cache } from "react";

import { nextDayISO } from "@/lib/finance/dashboard";
import {
  ESCOPO_CARD_FINANCEIRO,
  ESCOPO_HISTORICO_DO_DASHBOARD,
  janelaDoHistoricoDoDashboard,
  janelaDoMes,
} from "@/lib/finance/pipeline";
import { lerFinanceiro, lerSaldoAte } from "@/lib/finance/queries";
import {
  montarResumoDoDashboard,
  type ResumoDoDashboard,
} from "@/lib/dashboard/resumo-financeiro-puro";

export const lerResumoDoDashboard = cache(async (mes: string, hoje: string): Promise<ResumoDoDashboard> => {
  const [doMes, historico, saldoAte] = await Promise.all([
    lerFinanceiro({ janela: janelaDoMes(mes), escopo: ESCOPO_CARD_FINANCEIRO }),
    lerFinanceiro({
      janela: janelaDoHistoricoDoDashboard(mes),
      escopo: ESCOPO_HISTORICO_DO_DASHBOARD,
    }),
    lerSaldoAte(nextDayISO(hoje)),
  ]);

  return montarResumoDoDashboard({
    mes,
    hoje,
    doMes: doMes.entradas,
    contas: doMes.contas,
    historicoTxs: historico.entradas.txs,
    saldoAte,
    completudeDoMes: doMes.completude,
    completudeDoHistorico: historico.completude,
  });
});
