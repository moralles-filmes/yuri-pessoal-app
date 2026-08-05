/**
 * Fase 18-A — IA · A RESERVA: estimativa conservadora ANTES da chamada.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE RESERVAR, EM VEZ DE SÓ SOMAR O QUE JÁ FOI GASTO                               ║
 * ║                                                                                       ║
 * ║ Duas mensagens quase simultâneas leem o mesmo consumo confirmado (nenhuma das duas    ║
 * ║ gerou evento de uso ainda) e as duas passam no limite. O run, portanto, é também uma  ║
 * ║ RESERVA FINANCEIRA: enquanto ele vive, o orçamento conta a reserva; quando ele        ║
 * ║ termina, passa a contar o custo real. Nunca os dois ao mesmo tempo.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ POR QUE A TARIFA DO PIOR MODELO ═══════════════════════
 *
 * O fallback NÃO recebe segunda reserva. Reservando pela tarifa mais cara da cadeia
 * autorizada, qualquer fallback permitido já nasce coberto. Como segunda barreira, o
 * executor ainda recusa um fallback cujo custo projetado ultrapasse a reserva restante
 * (`core/fallback.ts`) — os dois mecanismos convivem de propósito.
 *
 *   reserved_cost = teto(
 *         ( entrada_estimada × tarifa_entrada_do_pior
 *         + teto_de_saida    × tarifa_saida_do_pior  )
 *       × (1 + max_retries + max_fallbacks)
 *       × margem
 *   )
 *
 * Puro. Nenhum I/O.
 */

import { worstCaseRatePair, type AiRate } from "@/lib/ai/core/pricing";
import { TOKENS_POR_RESULTADO_DE_FERRAMENTA } from "@/lib/ai/tools/limits";
import { ceil6 } from "./meter";
// `CARACTERES_POR_TOKEN` e `estimarTokensDeEntrada` moraram aqui na 18-A. A 18-B precisou de
// `tools/limits.ts` importando a constante de caracteres-por-token, e este arquivo precisou de
// `tools/limits.ts` para os passos do laço — as duas dependências juntas seriam um CICLO. A
// saída foi mover as duas definições para `usage/tokens.ts` (uma folha sem dependência de
// volta) e reexportar aqui, para que `chat-runner.ts` e qualquer outro importador existente
// continuem funcionando sem mudar uma linha.
export { CARACTERES_POR_TOKEN, estimarTokensDeEntrada } from "./tokens";

/** Margem padrão. Documentada, ajustável em `ai_user_preferences.reservation_margin`. */
export const MARGEM_PADRAO = 1.15;

export type ReservationInput = {
  /** Tarifas do modelo selecionado E de toda a cadeia de fallback autorizada. */
  readonly rates: readonly AiRate[];
  readonly tokensEntradaEstimados: number;
  /** O teto EXPLÍCITO de saída enviado ao provedor. Sempre existe. */
  readonly tetoDeSaida: number;
  readonly maxRetries: number;
  readonly maxFallbacks: number;
  readonly margem: number;
  /**
   * Passos de FERRAMENTA previstos (18-B). Ausente ou 0 reproduz exatamente a fórmula da
   * 18-A — é o que mantém os testes e o comportamento anteriores intactos.
   */
  readonly maxToolSteps?: number;
};

export type Reservation = {
  readonly valorUsd: number;
  readonly multiplicadorDeTentativas: number;
  readonly margem: number;
  readonly tarifaEntradaUsada: number;
  readonly tarifaSaidaUsada: number;
  /** Explicação em pt-BR — a tela mostra como o número saiu, não só o número. */
  readonly explicacao: string;
};

export function computeReservation(input: ReservationInput): Reservation {
  // A tarifa mais cara de CADA lado pode vir de modelos diferentes da cadeia. Pegar o
  // máximo lado a lado é o único jeito de a reserva cobrir qualquer combinação possível.
  let piorEntrada = 0;
  let piorSaida = 0;
  for (const rate of input.rates) {
    const par = worstCaseRatePair(rate);
    if (par.input > piorEntrada) piorEntrada = par.input;
    if (par.output > piorSaida) piorSaida = par.output;
  }

  // Cada passo do laço é uma chamada paga, e o contexto CRESCE: o resultado da ferramenta
  // do passo anterior entra na entrada do próximo. Somar passo a passo é o único jeito de a
  // reserva não subestimar — e importar o número de tokens de `tools/limits.ts` mantém a
  // aritmética de custo num lugar só, como manda a regra de `calc.ts` na Dieta.
  const passos = Math.max(0, input.maxToolSteps ?? 0);
  let base = 0;
  for (let i = 0; i <= passos; i += 1) {
    const entradaDoPasso =
      input.tokensEntradaEstimados + i * TOKENS_POR_RESULTADO_DE_FERRAMENTA;
    base +=
      (entradaDoPasso / 1_000_000) * piorEntrada +
      (input.tetoDeSaida / 1_000_000) * piorSaida;
  }

  const multiplicador = 1 + Math.max(0, input.maxRetries) + Math.max(0, input.maxFallbacks);
  const margem = input.margem > 0 ? input.margem : MARGEM_PADRAO;
  const valorUsd = ceil6(base * multiplicador * margem);

  return {
    valorUsd,
    multiplicadorDeTentativas: multiplicador,
    margem,
    tarifaEntradaUsada: piorEntrada,
    tarifaSaidaUsada: piorSaida,
    explicacao:
      `Reserva de US$ ${valorUsd.toFixed(6)}: ${input.tokensEntradaEstimados} tokens de entrada estimados ` +
      `e teto de ${input.tetoDeSaida} de saída, pela tarifa do modelo mais caro autorizado ` +
      `(US$ ${piorEntrada}/M entrada e US$ ${piorSaida}/M saída), × ${multiplicador} tentativas × margem ${margem}` +
      (passos > 0 ? `, cobrindo ${passos} passos de ferramenta.` : "."),
  };
}

/** TTL padrão da reserva, em segundos. Alinhado à lease de 5 min do run. */
export const RESERVA_TTL_SEGUNDOS = 300;

/**
 * Projeção do custo de um DESTINO DE FALLBACK, para o executor decidir se ele cabe no que
 * restou da reserva.
 *
 * Mora aqui, e não no chat-runner, pelo mesmo motivo que todo total da Dieta sai de `calc.ts`:
 * aritmética de custo repetida em dois arquivos vira dois números que discordam no primeiro
 * ajuste. É conservadora — usa a tarifa cheia e o teto de saída inteiro.
 */
export function projetarCustoDoDestino(
  rate: AiRate,
  tokensEntradaEstimados: number,
  tetoDeSaida: number,
): number {
  const par = worstCaseRatePair(rate);
  return (
    (tokensEntradaEstimados / 1_000_000) * par.input +
    (tetoDeSaida / 1_000_000) * par.output
  );
}
