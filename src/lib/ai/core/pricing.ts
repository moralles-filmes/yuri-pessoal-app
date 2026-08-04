/**
 * Fase 18-A — IA · Tarifas versionadas. FONTE ÚNICA de preço.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ PREÇO NÃO APARECE EM NENHUM OUTRO LUGAR DO CÓDIGO (critério 14). Um segundo número    ║
 * ║ escrito em outra tela é a forma mais rápida de o relatório discordar da fatura.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ POR QUE `effectiveFrom` / `effectiveUntil` ═══════════════════════
 *
 * Isto não é abstração especulativa: o Claude Sonnet 5 tem preço promocional até 2026-08-31 e
 * outro a partir de 2026-09-01 — documentado pelo próprio provedor. Sem janela de vigência, a
 * virada do mês faria o sistema calcular errado sem ninguém perceber.
 *
 * ═══════════════════════ MODELO SEM TARIFA NÃO É SELECIONÁVEL ═══════════════════════
 *
 * Não existe caminho para usar um modelo sem preço cadastrado — nem como principal, nem como
 * destino de fallback. Custo desconhecido tornaria a reserva impossível, e reserva impossível
 * significa orçamento que não protege nada.
 *
 * ═══════════════════════ TARIFA POR FAIXA (xAI) ═══════════════════════
 *
 * A xAI cobra mais acima de 200k tokens de entrada. Achatar isso numa tarifa só erraria para
 * um dos lados sempre. Por isso os campos `long*`: a MEDIÇÃO usa a faixa efetiva do consumo, e
 * a RESERVA usa sempre a faixa cara — a reserva é a priori e tem de cobrir o pior caso.
 *
 * Puro. Nenhum I/O. `agora` sempre injetado.
 */

import type { AiProviderId } from "./contracts";

/** Versão do conjunto de tarifas. Vai congelada em cada `ai_usage_events.pricing_version`. */
export const PRICING_VERSION = "2026-08-04.1";

export type AiRate = {
  readonly provider: AiProviderId;
  readonly modelId: string;
  /** USD por 1.000.000 de tokens. Decimal em string para o arquivo não mentir por float. */
  readonly inputPerMillion: string;
  readonly outputPerMillion: string;
  /** Leitura de cache. `null` quando o provedor não publica. */
  readonly cachedInputPerMillion: string | null;
  /** Faixa cara, quando o provedor cobra por tamanho de entrada. */
  readonly longContextThresholdTokens: number | null;
  readonly longInputPerMillion: string | null;
  readonly longOutputPerMillion: string | null;
  readonly currency: "USD";
  /** Datas puras 'yyyy-MM-dd'. `effectiveUntil` null = vigente sem fim conhecido. */
  readonly effectiveFrom: string;
  readonly effectiveUntil: string | null;
  readonly verifiedAt: string;
  readonly source: string;
};

const OPENAI_SRC = "https://developers.openai.com/api/docs/pricing";
const GEMINI_SRC = "https://ai.google.dev/gemini-api/docs/pricing";
const ANTHROPIC_SRC = "https://platform.claude.com/docs/en/docs/about-claude/pricing";
const XAI_SRC = "https://docs.x.ai/docs/models";

export const AI_RATE_TABLE: readonly AiRate[] = [
  // ── OpenAI ───────────────────────────────────────────────────────────────────────────
  {
    provider: "openai",
    modelId: "gpt-5.6-terra",
    inputPerMillion: "2.00",
    outputPerMillion: "12.00",
    cachedInputPerMillion: "0.20",
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: OPENAI_SRC,
  },
  {
    provider: "openai",
    modelId: "gpt-5.6-luna",
    inputPerMillion: "0.20",
    outputPerMillion: "1.20",
    cachedInputPerMillion: "0.02",
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: OPENAI_SRC,
  },
  {
    provider: "openai",
    modelId: "gpt-5.6-sol",
    inputPerMillion: "5.00",
    outputPerMillion: "30.00",
    cachedInputPerMillion: "0.50",
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: OPENAI_SRC,
  },

  // ── Google Gemini ────────────────────────────────────────────────────────────────────
  {
    provider: "gemini",
    modelId: "gemini-3.6-flash",
    inputPerMillion: "1.50",
    outputPerMillion: "7.50",
    cachedInputPerMillion: "0.15",
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: GEMINI_SRC,
  },
  {
    provider: "gemini",
    modelId: "gemini-3.5-flash-lite",
    inputPerMillion: "0.30",
    outputPerMillion: "2.50",
    cachedInputPerMillion: "0.03",
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: GEMINI_SRC,
  },
  {
    provider: "gemini",
    modelId: "gemini-2.5-flash",
    inputPerMillion: "0.30",
    outputPerMillion: "2.50",
    cachedInputPerMillion: "0.03",
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: GEMINI_SRC,
  },

  // ── Anthropic ────────────────────────────────────────────────────────────────────────
  //
  // As DUAS linhas do Sonnet 5 são o motivo de este arquivo ter janela de vigência. O
  // promocional termina em 31/08/2026 e o padrão começa em 01/09/2026 — publicado pelo
  // provedor, não suposto.
  {
    provider: "anthropic",
    modelId: "claude-sonnet-5",
    inputPerMillion: "2.00",
    outputPerMillion: "10.00",
    cachedInputPerMillion: "0.20",
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: "2026-08-31",
    verifiedAt: "2026-08-04",
    source: ANTHROPIC_SRC,
  },
  {
    provider: "anthropic",
    modelId: "claude-sonnet-5",
    inputPerMillion: "3.00",
    outputPerMillion: "15.00",
    cachedInputPerMillion: "0.30",
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-09-01",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: ANTHROPIC_SRC,
  },
  {
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    inputPerMillion: "1.00",
    outputPerMillion: "5.00",
    cachedInputPerMillion: "0.10",
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: ANTHROPIC_SRC,
  },
  {
    provider: "anthropic",
    modelId: "claude-opus-5",
    inputPerMillion: "5.00",
    outputPerMillion: "25.00",
    cachedInputPerMillion: "0.50",
    longContextThresholdTokens: null,
    longInputPerMillion: null,
    longOutputPerMillion: null,
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: ANTHROPIC_SRC,
  },

  // ── xAI (tarifa por faixa de entrada) ────────────────────────────────────────────────
  {
    provider: "xai",
    modelId: "grok-4.3",
    inputPerMillion: "1.25",
    outputPerMillion: "2.50",
    cachedInputPerMillion: null,
    longContextThresholdTokens: 200_000,
    longInputPerMillion: "2.50",
    longOutputPerMillion: "5.00",
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: XAI_SRC,
  },
  {
    provider: "xai",
    modelId: "grok-4.5",
    inputPerMillion: "2.00",
    outputPerMillion: "6.00",
    cachedInputPerMillion: null,
    longContextThresholdTokens: 200_000,
    longInputPerMillion: "4.00",
    longOutputPerMillion: "12.00",
    currency: "USD",
    effectiveFrom: "2026-08-04",
    effectiveUntil: null,
    verifiedAt: "2026-08-04",
    source: XAI_SRC,
  },
];

/**
 * Tarifa vigente em `emData` (data pura 'yyyy-MM-dd', INJETADA). `null` quando não há —
 * e "não há" nunca vira "de graça": quem chama recusa o modelo.
 */
export function rateFor(
  provider: AiProviderId,
  modelId: string,
  emData: string,
): AiRate | null {
  return (
    AI_RATE_TABLE.find(
      (r) =>
        r.provider === provider &&
        r.modelId === modelId &&
        r.effectiveFrom <= emData &&
        (r.effectiveUntil === null || emData <= r.effectiveUntil),
    ) ?? null
  );
}

export function hasRate(
  provider: AiProviderId,
  modelId: string,
  emData: string,
): boolean {
  return rateFor(provider, modelId, emData) !== null;
}

/**
 * O par de tarifas efetivo para uma quantidade de tokens de entrada. Acima do limiar (quando
 * o provedor tem faixa), valem as tarifas caras.
 */
export function effectiveRatePair(
  rate: AiRate,
  inputTokens: number,
): { input: number; output: number; tier: "padrao" | "longo" } {
  const usaFaixaLonga =
    rate.longContextThresholdTokens !== null &&
    rate.longInputPerMillion !== null &&
    rate.longOutputPerMillion !== null &&
    inputTokens >= rate.longContextThresholdTokens;

  if (usaFaixaLonga) {
    return {
      input: Number(rate.longInputPerMillion),
      output: Number(rate.longOutputPerMillion),
      tier: "longo",
    };
  }
  return {
    input: Number(rate.inputPerMillion),
    output: Number(rate.outputPerMillion),
    tier: "padrao",
  };
}

/** A tarifa mais cara que este modelo pode cobrar — é a que a RESERVA usa. */
export function worstCaseRatePair(rate: AiRate): { input: number; output: number } {
  return {
    input: Math.max(
      Number(rate.inputPerMillion),
      rate.longInputPerMillion === null ? 0 : Number(rate.longInputPerMillion),
    ),
    output: Math.max(
      Number(rate.outputPerMillion),
      rate.longOutputPerMillion === null ? 0 : Number(rate.longOutputPerMillion),
    ),
  };
}

/**
 * O que vai congelado em `ai_usage_events.rate_snapshot`. Guardar o objeto inteiro (e não só
 * os dois números) é o que permite auditar meses depois de qual publicação aquele custo saiu.
 */
export function rateSnapshot(
  rate: AiRate,
): Record<string, string | number | null> {
  return {
    provider: rate.provider,
    model_id: rate.modelId,
    input_per_million: rate.inputPerMillion,
    output_per_million: rate.outputPerMillion,
    cached_input_per_million: rate.cachedInputPerMillion,
    long_context_threshold_tokens: rate.longContextThresholdTokens,
    long_input_per_million: rate.longInputPerMillion,
    long_output_per_million: rate.longOutputPerMillion,
    currency: rate.currency,
    effective_from: rate.effectiveFrom,
    effective_until: rate.effectiveUntil,
    verified_at: rate.verifiedAt,
    source: rate.source,
    pricing_version: PRICING_VERSION,
  };
}
