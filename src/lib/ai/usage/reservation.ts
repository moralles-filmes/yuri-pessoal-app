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
import { MAX_ESPECIALISTAS } from "@/lib/ai/agents/especialistas";
import {
  MAX_TOOL_STEPS,
  MAX_TOOLS_POR_PASSO,
  TOKENS_POR_RESULTADO_DE_FERRAMENTA,
} from "@/lib/ai/tools/limits";
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
  /**
   * Fase 18-D — tokens de ENTRADA vindos de arquivo (imagem, PDF), de
   * `usage/vision-tokens.ts`. Ausente ou 0 reproduz exatamente a fórmula anterior — é o que
   * mantém os testes e o comportamento da 18-A/18-B intactos.
   *
   * ⚠️ Entra em TODO passo, não só no primeiro: o arquivo não sai do contexto entre os
   * passos do laço. Somá-lo uma vez só subestimaria justamente o caso caro.
   */
  readonly tokensDeArquivos?: number;
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

  // Cada passo do laço é uma chamada paga, e o contexto CRESCE: o resultado de CADA
  // ferramenta do passo anterior entra na entrada do próximo. Um passo pode disparar até
  // `MAX_TOOLS_POR_PASSO` ferramentas em paralelo (`tools/limits.ts`), e cada uma vira o SEU
  // PRÓPRIO bloco `wrapUntrusted` no contexto — não um só. Contar um bloco por passo em vez de
  // até `MAX_TOOLS_POR_PASSO` é exatamente o jeito de a reserva subestimar o pior caso real.
  // Somar passo a passo, multiplicando pelo teto de ferramentas por passo, é o único jeito de
  // não furar — e importar os números de `tools/limits.ts` mantém a aritmética de custo num
  // lugar só, como manda a regra de `calc.ts` na Dieta.
  const passos = Math.max(0, input.maxToolSteps ?? 0);
  const arquivos = Math.max(0, input.tokensDeArquivos ?? 0);
  let base = 0;
  for (let i = 0; i <= passos; i += 1) {
    const entradaDoPasso =
      input.tokensEntradaEstimados +
      arquivos +
      i * MAX_TOOLS_POR_PASSO * TOKENS_POR_RESULTADO_DE_FERRAMENTA;
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
      (arquivos > 0 ? `, mais ${arquivos} tokens de arquivo em cada passo` : "") +
      (passos > 0 ? `, cobrindo ${passos} passos de ferramenta.` : "."),
  };
}

/**
 * Chat livre com coordenador · Task 8 — a reserva do COORDENADOR pelo pior caso.
 *
 * O coordenador do chat livre decide, consulta até
 * `MAX_ESPECIALISTAS` especialistas em PARALELO e sintetiza — ou, no modo direto, faz tudo com
 * um agente só. Não há como saber de antemão qual caminho o modelo escolhe, então a reserva
 * cobre o MAIOR dos dois, mais a decisão, que roda sempre:
 *
 *   total = decisão + max( especialistas × MAX_ESPECIALISTAS + síntese , direto )
 *
 * Cada parte é um `computeReservation` com `margem: 1`, e a margem é aplicada UMA vez no fim.
 * O especialista não repete (`maxRetries: 0`, `maxFallbacks: 0`): em paralelo a repetição
 * não tem o que fazer — o que falha, falha naquele especialista e o coordenador segue.
 *
 * O número de especialistas vem da CONSTANTE, não de parâmetro: quem pode mudar a quantidade
 * é `MAX_ESPECIALISTAS`, e a reserva acompanha sem um segundo lugar para editar.
 */

/** Teto de saída da DECISÃO do coordenador: o plano (quem consultar, com o quê). */
export const TETO_SAIDA_DECISAO = 2_500;

/** Teto de saída de CADA especialista: o texto curto que ele devolve ao coordenador. */
export const TETO_SAIDA_ESPECIALISTA = 1_500;

export type ReservationDoCoordenadorInput = {
  /** Tarifas do coordenador, do especialista e da cadeia de fallback autorizada. */
  readonly rates: readonly AiRate[];
  readonly maxRetries: number;
  readonly maxFallbacks: number;
  readonly margem: number;
  /** System + histórico + texto do coordenador, já montados. */
  readonly tokensEntradaDoCoordenador: number;
  /** O MAIOR system de especialista + `MAX_TAREFA_CHARS`. */
  readonly tokensEntradaDoEspecialista: number;
  /** `model.outputCapTokens` — o teto de saída da síntese (e do modo direto). */
  readonly tetoSaidaDaSintese: number;
};

export function computeReservationDoCoordenador(
  input: ReservationDoCoordenadorInput,
): Reservation {
  const comTentativas = {
    rates: input.rates,
    maxRetries: input.maxRetries,
    maxFallbacks: input.maxFallbacks,
    margem: 1,
  };

  // Decisão: o coordenador lê o contexto e escolhe, sem ferramenta própria.
  const decisao = computeReservation({
    ...comTentativas,
    tokensEntradaEstimados: input.tokensEntradaDoCoordenador,
    tetoDeSaida: TETO_SAIDA_DECISAO,
    maxToolSteps: 0,
  });

  // Síntese: lê o contexto MAIS a resposta de cada especialista. Cada resposta entra com 10%
  // de folga. A conta é em inteiro: `Math.ceil(1500 * 1.1)` dá 1.651 em ponto flutuante (o 1,1
  // binário), e este número precisa ser 1.650 para a conta do pior caso bater com o brief.
  const tokensPorResposta = Math.ceil((TETO_SAIDA_ESPECIALISTA * 11) / 10);
  const sintese = computeReservation({
    ...comTentativas,
    tokensEntradaEstimados:
      input.tokensEntradaDoCoordenador + MAX_ESPECIALISTAS * tokensPorResposta,
    tetoDeSaida: input.tetoSaidaDaSintese,
    maxToolSteps: 0,
  });

  // Especialista: UMA chamada por especialista, sem repetição, com até MAX_TOOL_STEPS passos.
  const especialista = computeReservation({
    rates: input.rates,
    maxRetries: 0,
    maxFallbacks: 0,
    margem: 1,
    tokensEntradaEstimados: input.tokensEntradaDoEspecialista,
    tetoDeSaida: TETO_SAIDA_ESPECIALISTA,
    maxToolSteps: MAX_TOOL_STEPS,
  });

  // Direto: um agente só, com as ferramentas e a síntese, com tentativas.
  const direto = computeReservation({
    ...comTentativas,
    tokensEntradaEstimados: input.tokensEntradaDoEspecialista,
    tetoDeSaida: input.tetoSaidaDaSintese,
    maxToolSteps: MAX_TOOL_STEPS,
  });

  const paralelo = MAX_ESPECIALISTAS * especialista.valorUsd + sintese.valorUsd;
  const caminhoMaior = paralelo >= direto.valorUsd ? "paralelo" : "direto";
  const somaDosCaminhos = decisao.valorUsd + Math.max(paralelo, direto.valorUsd);

  const margem = input.margem > 0 ? input.margem : MARGEM_PADRAO;
  const valorUsd = ceil6(somaDosCaminhos * margem);

  return {
    valorUsd,
    multiplicadorDeTentativas: decisao.multiplicadorDeTentativas,
    margem,
    tarifaEntradaUsada: decisao.tarifaEntradaUsada,
    tarifaSaidaUsada: decisao.tarifaSaidaUsada,
    explicacao:
      `Reserva de US$ ${valorUsd.toFixed(6)} no pior caso do coordenador, × margem ${margem}. ` +
      `A decisão custa até US$ ${decisao.valorUsd.toFixed(6)} (${input.tokensEntradaDoCoordenador} tokens de entrada, ` +
      `saída até ${TETO_SAIDA_DECISAO}, × ${decisao.multiplicadorDeTentativas} tentativas). ` +
      `Depois dela, o caminho mais caro (${caminhoMaior}): em paralelo, ${MAX_ESPECIALISTAS} especialistas ` +
      `sem repetição a US$ ${especialista.valorUsd.toFixed(6)} cada (até ${MAX_TOOL_STEPS} passos de ferramenta) ` +
      `mais a síntese a US$ ${sintese.valorUsd.toFixed(6)}, somando US$ ${paralelo.toFixed(6)}; ` +
      `no modo direto, um especialista só, US$ ${direto.valorUsd.toFixed(6)}.`,
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
