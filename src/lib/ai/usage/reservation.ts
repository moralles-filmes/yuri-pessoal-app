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
import { ceil6 } from "./meter";

/** Margem padrão. Documentada, ajustável em `ai_user_preferences.reservation_margin`. */
export const MARGEM_PADRAO = 1.15;

/**
 * Heurística de tokens de entrada, sobre o PROMPT JÁ MONTADO (system + histórico + a
 * mensagem), nunca sobre o texto cru do usuário.
 *
 * ~3 caracteres por token é deliberadamente pessimista: a média em português fica perto de
 * 4, e os tokenizadores mais novos produzem mais tokens para o mesmo texto. Subestimar aqui
 * fura a reserva; superestimar só a torna um pouco mais folgada.
 */
export const CARACTERES_POR_TOKEN = 3;

export function estimarTokensDeEntrada(promptMontado: string): number {
  return Math.ceil(promptMontado.length / CARACTERES_POR_TOKEN);
}

export type ReservationInput = {
  /** Tarifas do modelo selecionado E de toda a cadeia de fallback autorizada. */
  readonly rates: readonly AiRate[];
  readonly tokensEntradaEstimados: number;
  /** O teto EXPLÍCITO de saída enviado ao provedor. Sempre existe. */
  readonly tetoDeSaida: number;
  readonly maxRetries: number;
  readonly maxFallbacks: number;
  readonly margem: number;
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

  const base =
    (input.tokensEntradaEstimados / 1_000_000) * piorEntrada +
    (input.tetoDeSaida / 1_000_000) * piorSaida;

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
      `(US$ ${piorEntrada}/M entrada e US$ ${piorSaida}/M saída), × ${multiplicador} tentativas × margem ${margem}.`,
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
