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

/**
 * `system` permanece no tipo mesmo sem uso direto: o prompt de sistema viaja em
 * `AiRequest.system`, separado do histórico, justamente para que dado recuperado nunca
 * possa ser confundido com instrução.
 */
export type AiRole = "system" | "user" | "assistant" | "tool";

/**
 * Fase 18-B — partes tipadas. `string` continua aceito de propósito: o histórico gravado em
 * `ai_messages` é texto, e `getHistoryForPrompt` continua funcionando sem alteração.
 */
export type AiContentPart =
  | { readonly type: "text"; readonly text: string }
  /**
   * Fase 18-D — o CONTEÚDO de um arquivo do dono, a caminho de um modelo de visão.
   *
   * ╔══════════════════════════════════════════════════════════════════════════════════════╗
   * ║ ⛔ NÃO EXISTE `url` E NÃO EXISTE `storagePath` AQUI. A AUSÊNCIA É A GARANTIA.         ║
   * ║                                                                                       ║
   * ║ "`storage_path` não sai do servidor" (invariante 21/22 da Dieta) deixa de ser uma      ║
   * ║ promessa de comentário e passa a ser uma propriedade do SISTEMA DE TIPOS: o caminho   ║
   * ║ do bucket simplesmente NÃO É REPRESENTÁVEL no que viaja até o provedor. Não há o que  ║
   * ║ um refactor distraído possa preencher errado.                                         ║
   * ║                                                                                       ║
   * ║ Pelo mesmo motivo não há `url` assinada: mandar a URL faria o PROVEDOR buscar o        ║
   * ║ arquivo no nosso bucket, transformando uma credencial de 5 minutos em algo que sai do ║
   * ║ nosso controle. Quem lê os bytes é o servidor, uma vez, em memória.                    ║
   * ╚══════════════════════════════════════════════════════════════════════════════════════╝
   *
   * `image` e `file` são separados de propósito, e não é cerimônia: a estimativa de custo
   * difere (megapixel × página, `usage/vision-tokens.ts`), e a capacidade exigida do modelo
   * difere (`visao` × `arquivo`, `core/capabilities.ts`). Um tipo só faria as duas decisões
   * dependerem de adivinhar pelo `mediaType`.
   */
  | {
      readonly type: "image";
      readonly bytes: Uint8Array;
      /** O MIME REAL, decidido por `sniffMime` sobre os bytes — nunca o `File.type`. */
      readonly mediaType: string;
    }
  | {
      readonly type: "file";
      readonly bytes: Uint8Array;
      readonly mediaType: string;
    }
  | {
      readonly type: "tool-call";
      readonly callId: string;
      readonly toolName: string;
      readonly input: unknown;
    }
  | {
      readonly type: "tool-result";
      readonly callId: string;
      readonly toolName: string;
      readonly output: unknown;
      /** Rejeição e falha voltam ao modelo como erro EXPLÍCITO, nunca como resultado vazio. */
      readonly isError: boolean;
    };

export type AiMessage = {
  readonly role: AiRole;
  readonly content: string | readonly AiContentPart[];
};

/**
 * Definição de ferramenta. O TIPO existe desde a 18-A; a partir da 18-B a lista pode vir
 * preenchida — mas o que segue ao provedor é só a DESCRIÇÃO (nome, texto e JSON Schema).
 * Não existe campo para uma função de execução aqui, e isso é proposital: quem executa é o
 * Tool Executor, em código nosso, depois de validar. O fornecedor nunca roda nada.
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
  /**
   * Allowlist do agente, resolvida ANTES da chamada. Vazia = o campo `tools` nem é enviado
   * ao provedor (mandar `{}` faria alguns incluírem o system prompt de tool use, que custa
   * tokens por nada).
   */
  readonly tools: readonly AiToolDefinition[];
};

// ───────────────────── Saída estruturada (18-D) ─────────────────────

/**
 * Fase 18-D — uma chamada que devolve um OBJETO, não um texto que chega aos pedaços.
 *
 * ═══════════════ POR QUE NÃO DÁ PARA REUSAR `streamText` ═══════════════
 *
 * Extração não tem texto chegando para mostrar: tem um objeto para validar. Fatiar um JSON
 * em deltas só para remontá-lo do outro lado acrescentaria um parser incremental — e um
 * ponto a mais onde uma resposta truncada vira objeto meio válido.
 *
 * ⛔ **`schema` é conveniência do provedor, NUNCA a validação.** O que volta em `value` é
 * `unknown` de propósito: quem decide se aquilo é uma extração é o Zod `.strict()` do nosso
 * lado. Tratar a saída "estruturada" do fornecedor como já validada seria confiar no que o
 * modelo escreveu — exatamente o que a regra 5 do projeto proíbe.
 *
 * Não há `tools` aqui, e a ausência é deliberada: uma extração não chama ferramenta. Sem o
 * campo, não existe caminho para o laço de ferramentas nascer dentro do Processo 2.
 */
export type AiObjectRequest = {
  readonly model: string;
  readonly system: string;
  readonly messages: readonly AiMessage[];
  readonly maxOutputTokens: number;
  readonly temperature?: number;
  readonly timeoutMs: number;
  readonly abortSignal?: AbortSignal;
  /** JSON Schema da saída. `unknown` porque `core/` não conhece Zod nem o SDK. */
  readonly schema: unknown;
  readonly schemaName: string;
  readonly schemaDescription: string;
};

/**
 * O uso volta nos DOIS desfechos. Uma tentativa que falhou depois de o provedor já ter
 * processado a entrada consumiu tokens de verdade, e perdê-los faria o orçamento mentir para
 * baixo — o único lado para o qual ele não pode errar.
 */
export type AiObjectResult =
  | {
      readonly ok: true;
      /** `unknown` de propósito. Ver o bloco acima. */
      readonly value: unknown;
      readonly usage: AiUsage;
      readonly providerRequestId: string | null;
    }
  | {
      readonly ok: false;
      readonly error: AiError;
      readonly usage: AiUsage;
      readonly providerRequestId: string | null;
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
   * O provedor decidiu chamar uma ferramenta. O adapter apenas REPASSA o pedido, com os
   * argumentos crus do modelo — nunca executa. Quem decide é o chat-runner: ferramenta que
   * não foi oferecida encerra o run como `failed` com `UNEXPECTED_TOOL_CALL`; ferramenta
   * oferecida é validada e executada pelo Tool Executor, em código nosso.
   *
   * `input` é `unknown` de propósito: é texto do modelo até que o Zod da ferramenta diga o
   * contrário. Tratá-lo como já validado seria confiar no que o modelo escreveu.
   */
  | {
      readonly type: "tool-call";
      readonly toolName: string;
      readonly callId: string;
      readonly input: unknown;
    }
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
   * Fase 18-D — uma chamada, um objeto. **Nunca lança**, pela mesma razão de `streamText`:
   * uma exceção solta deixaria o run de extração sem fechamento e a reserva presa.
   */
  generateObject(request: AiObjectRequest): Promise<AiObjectResult>;
  /**
   * Listagem de modelos — usada SÓ pelo teste de conexão, porque custa ZERO tokens.
   * Valida a chave sem consumir nada e sem criar run nem evento de uso.
   */
  listModels(signal?: AbortSignal): Promise<
    { ok: true; value: readonly string[] } | { ok: false; error: AiError }
  >;
}
