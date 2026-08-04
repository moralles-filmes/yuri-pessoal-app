/**
 * Fase 18-A — IA · Contratos internos. ZERO import de fornecedor.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE ARQUIVO É A FRONTEIRA. Trocar o AI SDK amanhã não pode exigir mexer em           ║
 * ║ `agents/`, `tools/`, `context/`, `approval/`, `usage/` ou `security/` — todos falam    ║
 * ║ com o mundo por estes tipos, e só `providers/` sabe que um SDK existe.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `AbortSignal` e `AsyncIterable` aparecem aqui de propósito: são padrão da plataforma
 * (WHATWG/ECMAScript), não API de fornecedor. Cancelamento tem de ser parte do contrato,
 * senão cada adapter inventaria o seu.
 */

import type { AiError } from "./errors";

export const AI_PROVIDERS = ["openai", "gemini", "anthropic", "xai"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return (
    typeof value === "string" && (AI_PROVIDERS as readonly string[]).includes(value)
  );
}

/** Rótulo em pt-BR de cada provedor, para a UI. */
export const AI_PROVIDER_LABEL: Record<AiProviderId, string> = {
  openai: "OpenAI (ChatGPT)",
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
  xai: "xAI Grok",
};

// ───────────────────────────── Entrada ─────────────────────────────

export type AiRole = "system" | "user" | "assistant";

export type AiMessage = {
  readonly role: AiRole;
  readonly content: string;
};

/**
 * Definição de ferramenta. O TIPO existe desde a 18-A porque ele faz parte do contrato —
 * mas o registry NASCE VAZIO e `AiRequest.tools` é sempre `[]` nesta subfase. Ter o tipo
 * pronto e a lista vazia é diferente de não ter o conceito: é o que permite a 18-C acrescentar
 * execução sem reescrever a fronteira.
 */
export type AiToolDefinition = {
  readonly name: string;
  readonly description: string;
  /** JSON Schema. `unknown` de propósito: `core/` não conhece Zod nem o SDK. */
  readonly inputSchema: unknown;
};

export type AiRequest = {
  readonly model: string;
  /** Prompt de sistema. ÚNICA fonte de instrução — dado recuperado nunca entra aqui. */
  readonly system: string;
  readonly messages: readonly AiMessage[];
  /**
   * Teto EXPLÍCITO de saída. Não é opcional por decisão: sem teto não há reserva possível,
   * e sem reserva o orçamento não protege nada (critério 61).
   */
  readonly maxOutputTokens: number;
  readonly temperature?: number;
  readonly timeoutMs: number;
  readonly abortSignal?: AbortSignal;
  /** 18-A: SEMPRE vazio. Nenhuma definição é enviada ao provedor. */
  readonly tools: readonly AiToolDefinition[];
};

// ───────────────────────────── Uso e custo ─────────────────────────────

/**
 * "Não informado" é um estado, não um zero. Um provedor que não devolve `outputTokens`
 * produz `outputTokens: null` + `availability.outputTokens: 'unavailable'` — nunca 0.
 * É a regra 1 da Dieta (`value_state`) aplicada a tokens.
 */
export type AiMetricAvailability = "available" | "unavailable";

export type AiUsageAvailability = {
  readonly inputTokens: AiMetricAvailability;
  readonly outputTokens: AiMetricAvailability;
  readonly cachedInputTokens: AiMetricAvailability;
  /** Motivo curto, quando houver. Nunca corpo de resposta do provedor. */
  readonly note?: string;
};

export type AiUsage = {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly availability: AiUsageAvailability;
};

export const USAGE_UNAVAILABLE: AiUsage = {
  inputTokens: null,
  outputTokens: null,
  cachedInputTokens: null,
  availability: {
    inputTokens: "unavailable",
    outputTokens: "unavailable",
    cachedInputTokens: "unavailable",
    note: "O provedor não informou consumo.",
  },
};

// ───────────────────────────── Streaming ─────────────────────────────

export type AiFinishReason =
  | "stop"
  | "length"
  | "tool-call"
  | "content-filter"
  | "cancelled"
  | "error"
  | "unknown";

export type AiStreamEvent =
  /** Pedaço de texto. É o único evento que a 18-A repassa ao navegador. */
  | { readonly type: "delta"; readonly text: string }
  /**
   * O provedor decidiu chamar uma ferramenta. Na 18-A isso NÃO PODE ACONTECER (nenhuma
   * definição é enviada). Se acontecer, o chat-runner encerra o run como `failed` com
   * `UNEXPECTED_TOOL_CALL` — não executa, não interpreta e não deixa seguir.
   */
  | { readonly type: "tool-call"; readonly toolName: string; readonly callId: string }
  | {
      readonly type: "finish";
      readonly finishReason: AiFinishReason;
      readonly usage: AiUsage;
      readonly providerRequestId: string | null;
    }
  | { readonly type: "error"; readonly error: AiError };

// ───────────────────────────── O cliente ─────────────────────────────

/**
 * O que `providers/` entrega e o resto do módulo consome. Repare no que NÃO está aqui:
 * nenhuma referência a modelo do SDK, a cliente HTTP, a `base_url` ou a chave — a
 * credencial já foi resolvida antes, em memória, para UMA chamada.
 */
export interface AiProviderClient {
  readonly provider: AiProviderId;
  /** Streaming normalizado. Nunca lança: erro vira evento `error`. */
  streamText(request: AiRequest): AsyncIterable<AiStreamEvent>;
  /**
   * Listagem de modelos — usada SÓ pelo teste de conexão, porque custa ZERO tokens.
   * Valida a chave sem consumir nada e sem criar run nem evento de uso.
   */
  listModels(signal?: AbortSignal): Promise<
    { ok: true; value: readonly string[] } | { ok: false; error: AiError }
  >;
}
