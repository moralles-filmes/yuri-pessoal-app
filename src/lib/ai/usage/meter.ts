/**
 * Fase 18-A — IA · Medição: uso bruto + tarifa → custo.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AUSÊNCIA NUNCA É CUSTO ZERO.                                                          ║
 * ║                                                                                       ║
 * ║ Provedor não informou tokens  → custo `null`, `usage_availability` marca o que faltou ║
 * ║ Provedor informou só parte    → grava o que veio, o resto `null`, custo `null`        ║
 * ║                                  (não se estima metade de uma conta)                  ║
 * ║                                                                                       ║
 * ║ Em nenhum caminho `null` vira `0`. É a regra 1 da Dieta (`value_state`) aplicada a    ║
 * ║ dinheiro: "medido zero" e "não medido" são coisas diferentes, e confundi-las faz o    ║
 * ║ orçamento mentir para baixo — justamente onde mentir é mais caro.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. Nenhum I/O, `hoje` injetado por quem chama (para resolver a tarifa vigente).
 */

import type { AiUsage } from "@/lib/ai/core/contracts";
import {
  effectiveRatePair,
  type AiRate,
} from "@/lib/ai/core/pricing";

export type CostBreakdown = {
  /** `null` = indisponível. NUNCA 0 por ausência. */
  readonly totalUsd: number | null;
  readonly inputUsd: number | null;
  readonly outputUsd: number | null;
  readonly cachedInputUsd: number | null;
  readonly tier: "padrao" | "longo" | null;
  /** Por que o custo é `null`, quando for. Vai para a tela, em pt-BR. */
  readonly indisponivelPorque: string | null;
};

/** `numeric(12,6)` no banco: seis casas é a precisão do módulo inteiro. */
export const CASAS_DECIMAIS = 6;

/**
 * Arredonda para 6 casas de forma determinística. `toFixed` opera sobre a representação
 * decimal, o que evita o artefato de ponto flutuante que `Math.round(x * 1e6) / 1e6`
 * produz em alguns valores.
 */
export function round6(valor: number): number {
  return Number(valor.toFixed(CASAS_DECIMAIS));
}

/**
 * Arredonda PARA CIMA em 6 casas — usado só pela reserva, que tem de sobrar, nunca faltar.
 *
 * ⚠️ `toPrecision(12)` e não `toFixed(3)`: o `toFixed` absorve o ruído de ponto flutuante
 * (0,1449 × 1e6 dá 144900,00000000003), mas ZERA valores minúsculos — uma tarifa muito
 * baixa produziria reserva 0, e reserva 0 não protege nada. Precisão relativa resolve os
 * dois casos.
 */
export function ceil6(valor: number): number {
  const fator = 10 ** CASAS_DECIMAIS;
  const escalado = valor * fator;
  if (escalado === 0) return 0;
  return Math.ceil(Number(escalado.toPrecision(12))) / fator;
}

export function custoDeTokens(tokens: number, tarifaPorMilhao: number): number {
  return round6((tokens / 1_000_000) * tarifaPorMilhao);
}

/**
 * O custo de UMA tentativa.
 *
 * Repare no que NÃO acontece aqui: nenhuma estimativa quando falta métrica, nenhuma média,
 * nenhum "assume que a saída foi o teto". Faltou dado → o custo é `null` e a tela escreve
 * que aquela execução ficou sem custo informado.
 */
export function computeAttemptCost(usage: AiUsage, rate: AiRate): CostBreakdown {
  const faltando: string[] = [];
  if (usage.availability.inputTokens !== "available" || usage.inputTokens === null) {
    faltando.push("tokens de entrada");
  }
  if (usage.availability.outputTokens !== "available" || usage.outputTokens === null) {
    faltando.push("tokens de saída");
  }

  if (faltando.length > 0) {
    return {
      totalUsd: null,
      inputUsd: null,
      outputUsd: null,
      cachedInputUsd: null,
      tier: null,
      indisponivelPorque: `O provedor não informou ${faltando.join(" e ")}.`,
    };
  }

  const entrada = usage.inputTokens as number;
  const saida = usage.outputTokens as number;
  const par = effectiveRatePair(rate, entrada);

  // Cache é opcional dos dois lados: o provedor pode não informar, e a tarifa pode não
  // existir. Quando falta qualquer um dos dois, o cache simplesmente não entra na conta —
  // e isso NÃO invalida o total, porque tokens em cache já estão contados na entrada.
  const temCache =
    usage.availability.cachedInputTokens === "available" &&
    usage.cachedInputTokens !== null &&
    rate.cachedInputPerMillion !== null;

  const cachedUsd = temCache
    ? custoDeTokens(usage.cachedInputTokens as number, Number(rate.cachedInputPerMillion))
    : null;

  const inputUsd = custoDeTokens(entrada, par.input);
  const outputUsd = custoDeTokens(saida, par.output);

  return {
    totalUsd: round6(inputUsd + outputUsd),
    inputUsd,
    outputUsd,
    cachedInputUsd: cachedUsd,
    tier: par.tier,
    indisponivelPorque: null,
  };
}

export type RunCostTotal = {
  /** Soma das tentativas COM custo. */
  readonly totalUsd: number;
  /** Quantas tentativas ficaram sem custo informado. */
  readonly semCusto: number;
  /** `true` quando ao menos uma tentativa ficou sem custo. */
  readonly parcial: boolean;
  /** Texto pt-BR para a tela. `null` quando o total é completo. */
  readonly avisoParcial: string | null;
};

/**
 * O total de um run é a SOMA DAS TENTATIVAS — retry e fallback incluídos, cada um com a
 * tarifa que valia na hora dele.
 *
 * Se ALGUMA tentativa ficou sem custo, o total é exibido como parcial. Mostrar
 * "US$ 0,008600" quando uma das duas tentativas não reportou nada seria afirmar uma
 * completude que não existe.
 */
export function sumRunCost(custos: readonly (number | null)[]): RunCostTotal {
  let total = 0;
  let semCusto = 0;

  for (const c of custos) {
    if (c === null) semCusto += 1;
    else total += c;
  }

  return {
    totalUsd: round6(total),
    semCusto,
    parcial: semCusto > 0,
    avisoParcial:
      semCusto > 0
        ? `Parcial — ${semCusto} ${semCusto === 1 ? "execução ficou" : "execuções ficaram"} sem custo informado pelo provedor.`
        : null,
  };
}

/** O jsonb de `usage_availability`. Guarda O QUE FALTOU, não um booleano vago. */
export function availabilityRecord(usage: AiUsage): Record<string, string | null> {
  return {
    input_tokens: usage.availability.inputTokens,
    output_tokens: usage.availability.outputTokens,
    cached_input_tokens: usage.availability.cachedInputTokens,
    note: usage.availability.note ?? null,
  };
}
