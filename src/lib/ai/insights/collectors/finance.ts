import "server-only";

/**
 * Fase 18-E — IA · COLETOR DO FINANCEIRO. Casca fina, como os adapters.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTA PASTA É A TERCEIRA PORTA, E ELA É MAIS LARGA QUE AS DUAS PRIMEIRAS.              ║
 * ║                                                                                       ║
 * ║ Um coletor lê dado do dono FORA do Tool Registry: sem `guard.ts`, sem o teto do        ║
 * ║ descriptor e sem linha em `ai_tool_calls`. Os três controles voltam por outro caminho, ║
 * ║ e a implementação amarra os três:                                                      ║
 * ║                                                                                       ║
 * ║   `allow_finance`  → conferido na Server Action E dentro de `ai_begin_insight_run`     ║
 * ║   teto             → aqui, declarado (`MAX_MESES`), com o motivo                       ║
 * ║   auditoria        → `ai_insight_sources`, uma linha por indicador                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ **NENHUMA CONTA AQUI.** Os números saem de `getFinanceCardData` — a MESMA leitura do card
 * do dashboard, que entra por `resumoMes`. As médias e comparações saem de `temporal.ts`, que
 * agrega sobre o que ela devolve. Somar `transactions` por competência aqui contaria a compra
 * parcelada inteira no mês da compra E as parcelas depois — o bug real de 2026-08-06.
 *
 * `user_id` não aparece: as queries rodam sob RLS, com a sessão do dono.
 */

import { getFinanceCardData } from "@/lib/dashboard/queries";
import type { LeituraDoDono } from "@/lib/supabase/owner";

import type { Indicador, PeriodoDoIndicador, SerieTemporal } from "../contracts";
import { comparar, janelaDeMeses, media } from "../temporal";

/**
 * ⚠️ TETO DECLARADO. Cada mês é uma leitura completa do card (contas, faturas, recebíveis,
 * transações), então a janela é curta de propósito — e o número está aqui, nomeado, em vez de
 * escondido num literal. Doze meses cobrem a comparação anual e param antes de a geração
 * virar uma varredura do histórico inteiro.
 */
export const MAX_MESES = 12;

/** A janela padrão: o mês corrente e os três anteriores. */
export const MESES_PADRAO = 4;

const ROTA = "/financeiro";
const ROTA_FATURAS = "/faturas";

export type ColetaDoFinanceiro = {
  readonly indicadores: readonly Indicador[];
  readonly periodo: PeriodoDoIndicador;
};

/**
 * Um indicador MEDIDO em reais. `getFinanceCardData` devolve número sempre — não há "não
 * medido" no Financeiro, porque mês sem lançamento é mês de zero movimentado, e isso é fato.
 *
 * ⚠️ `n` é a CONTAGEM DE MESES que entraram, não de transações: o card devolve o resumo, não
 * a lista, e afirmar um número de transações que não veio seria inventá-lo.
 */
function emReais(
  id: string,
  rotulo: string,
  valor: number,
  periodo: PeriodoDoIndicador,
  rota = ROTA,
): Indicador {
  return {
    id,
    modulo: "financeiro",
    rotulo,
    valor,
    unidade: "R$",
    qualidade: "exato",
    periodo,
    n: 1,
    rota,
  };
}

/**
 * Os indicadores do Financeiro para a janela pedida.
 *
 * @param hoje    `yyyy-MM-dd` em Brasília, injetado
 * @param meses   quantos meses de calendário entram (o último é o corrente, EM CURSO)
 */
export async function coletarFinanceiro(
  hoje: string,
  meses: number = MESES_PADRAO,
  owner?: LeituraDoDono,
): Promise<ColetaDoFinanceiro> {
  const quantos = Math.min(Math.max(Math.trunc(meses) || MESES_PADRAO, 2), MAX_MESES);
  const janela = janelaDeMeses(hoje, quantos);

  // Sequencial de propósito: `getFinanceCardData` faz cinco consultas por mês, e disparar
  // doze delas em paralelo é um pico de conexões para ganhar segundos numa tela que já
  // avisa que está gerando.
  const dados: { periodo: PeriodoDoIndicador; card: Awaited<ReturnType<typeof getFinanceCardData>> }[] =
    [];
  for (const periodo of janela) {
    dados.push({
      periodo,
      card: await getFinanceCardData(periodo.de.slice(0, 7), hoje, owner),
    });
  }

  const atual = dados[dados.length - 1];
  const anterior = dados.length >= 2 ? dados[dados.length - 2] : null;

  /**
   * ⚠️ O MÊS CORRENTE ESTÁ INCOMPLETO, e comparar 9 dias com 31 seria comparar coisas
   * diferentes. Por isso a comparação é entre os DOIS ÚLTIMOS MESES FECHADOS quando o
   * corrente ainda não acabou — o mesmo cuidado que fez a 17-E devolver `null` com motivo em
   * vez de um número que parece fato.
   */
  const correnteFechado = janela[janela.length - 1].ate < hoje;
  const paraComparar = correnteFechado ? dados.slice(-2) : dados.slice(-3, -1);

  const serieSaidas: SerieTemporal = {
    id: "financeiro.saidas",
    modulo: "financeiro",
    rotulo: "Saídas do mês",
    unidade: "R$",
    rota: ROTA,
    pontos: dados.map((d) => ({
      periodo: d.periodo,
      valor: d.card.saidas,
      qualidade: "exato" as const,
    })),
  };

  const serieMeu: SerieTemporal = {
    ...serieSaidas,
    id: "financeiro.gasto_meu",
    rotulo: "Gasto que é seu (sem a parte de terceiros)",
    pontos: dados.map((d) => ({
      periodo: d.periodo,
      valor: d.card.meu,
      qualidade: "exato" as const,
    })),
  };

  const indicadores: Indicador[] = [
    emReais("financeiro.saidas_mes", "Saídas do mês", atual.card.saidas, atual.periodo),
    emReais("financeiro.entradas_mes", "Entradas do mês", atual.card.entradas, atual.periodo),
    /**
     * ⚠️ `meu` e `terceiros` PARTICIONAM `saidas`, não se somam a ela. Os rótulos dizem isso
     * porque o texto que o modelo escreve é lido sem o contexto do código — a mesma razão
     * pela qual o adapter carrega a chave `composicao`.
     */
    emReais(
      "financeiro.gasto_meu_mes",
      "Gasto do mês que é seu (parte de terceiros já descontada)",
      atual.card.meu,
      atual.periodo,
    ),
    emReais(
      "financeiro.no_cartao_mes",
      "Parte das saídas do mês que caiu no cartão",
      atual.card.cartao,
      atual.periodo,
      ROTA_FATURAS,
    ),
    emReais(
      "financeiro.a_receber",
      "A receber de terceiros",
      atual.card.aReceber,
      atual.periodo,
    ),
  ];

  if (paraComparar.length === 2) {
    const [antes, depois] = paraComparar;
    const comparacao = comparar(
      emReais("financeiro.saidas", "Saídas do mês", depois.card.saidas, depois.periodo),
      emReais("financeiro.saidas", "Saídas do mês", antes.card.saidas, antes.periodo),
    );
    indicadores.push(comparacao.diferenca, comparacao.variacao);
  } else if (anterior === null) {
    // Sem base anterior, `comparar` já devolveria os dois indicadores indisponíveis com o
    // motivo. Não há o que acrescentar aqui — a ausência fala por si na tela.
  }

  // A média só sai com a janela cheia (Dieta 21). Com o mês corrente em curso, a média
  // incluiria um mês pela metade — então ela é calculada sobre os meses FECHADOS.
  const fechados: SerieTemporal = correnteFechado
    ? serieSaidas
    : { ...serieSaidas, pontos: serieSaidas.pontos.slice(0, -1) };
  if (fechados.pontos.length >= 2) {
    indicadores.push(media(fechados, fechados.pontos.length));
  }

  const fechadosMeu: SerieTemporal = correnteFechado
    ? serieMeu
    : { ...serieMeu, pontos: serieMeu.pontos.slice(0, -1) };
  if (fechadosMeu.pontos.length >= 2) {
    indicadores.push(media(fechadosMeu, fechadosMeu.pontos.length));
  }

  return {
    indicadores,
    periodo: { de: janela[0].de, ate: janela[janela.length - 1].ate },
  };
}
