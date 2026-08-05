/**
 * Fase 18-A — IA · Tradução bidirecional contrato interno ↔ AI SDK.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE É O ÚNICO ARQUIVO DE STREAMING QUE CONHECE O AI SDK.                             ║
 * ║ Os quatro adapters (openai/gemini/anthropic/xai) só constroem o `LanguageModel` e     ║
 * ║ entregam para cá. Trocar de SDK amanhã é reescrever este arquivo — e mais nenhum.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O que a normalização garante para quem consome:
 *
 *  • `streamText` NUNCA lança. Erro vira evento `{type:'error'}`, porque um `throw` no meio
 *    de um `for await` deixaria o run sem fechamento e a reserva presa.
 *  • SEMPRE termina com `finish` ou `error` — nunca acaba em silêncio. O chat-runner conta
 *    com isso para fechar o estado.
 *  • Métrica que o provedor não informou vira `null` + `availability: 'unavailable'`,
 *    NUNCA zero.
 */

import {
  streamText,
  jsonSchema,
  type LanguageModel,
  type ModelMessage,
  type TextPart,
  type ToolCallPart,
  type ToolResultPart,
  type ToolSet,
} from "ai";
import type {
  AiContentPart,
  AiMessage,
  AiProviderClient,
  AiProviderId,
  AiRequest,
  AiStreamEvent,
  AiToolDefinition,
  AiUsage,
  AiFinishReason,
} from "@/lib/ai/core/contracts";
import { aiError, type AiError } from "@/lib/ai/core/errors";
import {
  extractModelIds,
  providerMetadata,
  type ProviderMetadata,
} from "../registry";
import { mapProviderError } from "./error-map";

/** Uso do SDK → uso do contrato. `undefined` do SDK é AUSÊNCIA, não zero. */
function normalizeUsage(usage: unknown): AiUsage {
  const u =
    typeof usage === "object" && usage !== null
      ? (usage as {
          inputTokens?: unknown;
          outputTokens?: unknown;
          inputTokenDetails?: { cacheReadTokens?: unknown };
        })
      : {};

  const input = typeof u.inputTokens === "number" ? u.inputTokens : null;
  const output = typeof u.outputTokens === "number" ? u.outputTokens : null;
  const cached =
    typeof u.inputTokenDetails?.cacheReadTokens === "number"
      ? u.inputTokenDetails.cacheReadTokens
      : null;

  const faltando: string[] = [];
  if (input === null) faltando.push("entrada");
  if (output === null) faltando.push("saída");

  return {
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cached,
    availability: {
      inputTokens: input === null ? "unavailable" : "available",
      outputTokens: output === null ? "unavailable" : "available",
      cachedInputTokens: cached === null ? "unavailable" : "available",
      note:
        faltando.length > 0
          ? `O provedor não informou tokens de ${faltando.join(" e ")}.`
          : undefined,
    },
  };
}

function normalizeFinishReason(reason: unknown): AiFinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool-calls":
    case "tool-call":
      return "tool-call";
    case "content-filter":
      return "content-filter";
    case "error":
      return "error";
    default:
      return "unknown";
  }
}

// ───────────────────── Contrato interno → prompt do SDK (18-B) ─────────────────────

/**
 * Os tipos do SDK derivados do PRÓPRIO SDK, em vez de reescritos aqui. `ToolResultOutput` e
 * `JSONValue` não são reexportados por `ai`, e copiá-los à mão criaria uma segunda verdade que
 * silenciosamente diverge na próxima atualização.
 */
type SaidaDeFerramenta = ToolResultPart["output"];
type ValorJson = Extract<SaidaDeFerramenta, { type: "json" }>["value"];

/**
 * Resultado de ferramenta → `output` do SDK.
 *
 * ⚠️ A regra que não pode afrouxar: rejeição e falha chegam ao modelo COMO ERRO
 * (`error-json`). Se um erro entrasse como resultado normal, o modelo trataria a recusa como
 * dado e responderia com base em nada — que é exatamente o defeito que esta fase existe para
 * impedir.
 */
function saidaDeFerramenta(output: unknown, isError: boolean): SaidaDeFerramenta {
  // Único estreitamento do arquivo: `core/` guarda a saída como `unknown` de propósito (não
  // conhece o SDK), e o SDK exige `JSONValue`. O valor já veio serializável do Tool Executor.
  const valor = output as ValorJson;
  return isError ? { type: "error-json", value: valor } : { type: "json", value: valor };
}

function partesDeTexto(p: AiContentPart): TextPart[] {
  return p.type === "text" ? [{ type: "text", text: p.text }] : [];
}

/** O assistente pode carregar texto E pedidos de ferramenta na mesma mensagem. */
function partesDoAssistente(p: AiContentPart): Array<TextPart | ToolCallPart> {
  if (p.type === "text") return [{ type: "text", text: p.text }];
  if (p.type === "tool-call") {
    return [
      { type: "tool-call", toolCallId: p.callId, toolName: p.toolName, input: p.input },
    ];
  }
  return [];
}

function partesDeResultado(p: AiContentPart): ToolResultPart[] {
  if (p.type !== "tool-result") return [];
  return [
    {
      type: "tool-result",
      toolCallId: p.callId,
      toolName: p.toolName,
      output: saidaDeFerramenta(p.output, p.isError),
    },
  ];
}

function textoDe(content: string | readonly AiContentPart[]): string {
  if (typeof content === "string") return content;
  return content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
}

/**
 * Contrato interno → `ModelMessage` do SDK.
 *
 * `content` como `string` continua valendo de propósito: o histórico gravado em `ai_messages`
 * é texto puro, e migrá-lo para partes não traria nada. As partes existem para o que o texto
 * não representa — o pedido de ferramenta do assistente e o resultado que volta.
 *
 * Cada papel é montado no SEU formato porque o SDK não os trata igual: `system` só aceita
 * string, `user` não aceita `tool-call`, e o papel `tool` é uma lista de resultados, nunca
 * texto solto. Um `as ModelMessage` genérico esconderia esses três contratos diferentes.
 */
function toModelMessages(messages: readonly AiMessage[]): ModelMessage[] {
  return messages.map((m): ModelMessage => {
    if (m.role === "tool") {
      return {
        role: "tool",
        content: typeof m.content === "string" ? [] : m.content.flatMap(partesDeResultado),
      };
    }

    // Na prática o prompt de sistema viaja em `AiRequest.system`, separado — este ramo existe
    // só para o papel continuar representável sem virar um caso especial em quem chama.
    if (m.role === "system") {
      return { role: "system", content: textoDe(m.content) };
    }

    if (m.role === "user") {
      return {
        role: "user",
        content: typeof m.content === "string" ? m.content : m.content.flatMap(partesDeTexto),
      };
    }

    return {
      role: "assistant",
      content:
        typeof m.content === "string" ? m.content : m.content.flatMap(partesDoAssistente),
    };
  });
}

/**
 * Definições → `ToolSet`, SEM `execute`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NENHUMA FERRAMENTA GANHA `execute`. Sem ele, o SDK descreve a ferramenta ao provedor, ║
 * ║ emite o evento `tool-call` e PARA. Quem valida e executa é o nosso Tool Executor.     ║
 * ║ Passar `execute` faria a execução acontecer dentro do fornecedor, no meio do stream — ║
 * ║ e `providers/` deixaria de ser só tradução. Pelo mesmo motivo `stopWhen` não é usado: ║
 * ║ o laço de ferramentas é NOSSO.                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
function toToolSet(tools: readonly AiToolDefinition[]): ToolSet {
  const set: ToolSet = {};
  for (const t of tools) {
    set[t.name] = {
      description: t.description,
      // `core/` guarda o schema como `unknown` porque não pode conhecer o SDK; aqui ele
      // reencontra o tipo. `jsonSchema` não valida a entrada — quem valida é o Tool Executor.
      inputSchema: jsonSchema(t.inputSchema as Parameters<typeof jsonSchema>[0]),
    };
  }
  return set;
}

export type AdapterConfig = {
  readonly provider: AiProviderId;
  /** O modelo já construído pelo adapter específico do provedor. */
  readonly buildModel: (modelId: string) => LanguageModel;
  /** A chave, só para o teste de conexão (que não passa pelo SDK). */
  readonly apiKey: string;
};

export function createAdapter(config: AdapterConfig): AiProviderClient {
  const meta: ProviderMetadata = providerMetadata(config.provider);

  return {
    provider: config.provider,

    async *streamText(request: AiRequest): AsyncGenerator<AiStreamEvent> {
      let usage: AiUsage | null = null;
      let providerRequestId: string | null = null;
      let terminou = false;

      try {
        // ⚠️ `tools` vem do contrato já resolvido pela allowlist do agente. Quando vazio, o
        // campo nem é enviado: mandar `tools: {}` faria alguns provedores incluírem o system
        // prompt de tool use, que custa tokens por nada.
        const temFerramentas = request.tools.length > 0;

        const resultado = streamText({
          model: config.buildModel(request.model),
          system: request.system,
          messages: toModelMessages(request.messages),
          // Teto EXPLÍCITO em toda chamada. Sem ele não há reserva possível.
          maxOutputTokens: request.maxOutputTokens,
          temperature: request.temperature,
          abortSignal: request.abortSignal,
          // O retry é NOSSO (`core/fallback.ts` decide, e cada tentativa vira uma linha em
          // `ai_usage_events`). Deixar o SDK repetir por conta própria produziria chamadas
          // pagas que o nosso medidor nunca veria.
          maxRetries: 0,
          // `stopWhen` NÃO é usado: o laço de ferramentas é nosso, e cada volta precisa
          // passar pelo Tool Executor e virar uma linha de medição.
          ...(temFerramentas ? { tools: toToolSet(request.tools) } : {}),
        });

        for await (const parte of resultado.fullStream) {
          switch (parte.type) {
            case "text-delta":
              if (parte.text) yield { type: "delta", text: parte.text };
              break;

            case "tool-call":
              // O SDK PARA aqui, porque a ferramenta não tem `execute`. O adapter só repassa
              // o pedido com os argumentos crus — nunca executa e nunca interpreta. Quem
              // decide é o chat-runner: ferramenta que não foi oferecida encerra o run como
              // `failed` com UNEXPECTED_TOOL_CALL; oferecida, o laço a executa pelo Tool
              // Executor, que valida a entrada antes de qualquer coisa.
              yield {
                type: "tool-call",
                toolName: String(parte.toolName ?? "desconhecida"),
                callId: String(parte.toolCallId ?? ""),
                input: parte.input ?? {},
              };
              break;

            case "finish-step":
              // É aqui que o id da requisição do provedor aparece.
              if (
                typeof parte.response === "object" &&
                parte.response !== null &&
                "id" in parte.response &&
                typeof parte.response.id === "string"
              ) {
                providerRequestId = parte.response.id;
              }
              break;

            case "finish":
              usage = normalizeUsage(parte.totalUsage);
              terminou = true;
              yield {
                type: "finish",
                finishReason: normalizeFinishReason(parte.finishReason),
                usage,
                providerRequestId,
              };
              break;

            case "abort":
              terminou = true;
              yield {
                type: "error",
                error: aiError("CANCELADO_PELO_USUARIO", "STREAM_ABORTED"),
              };
              break;

            case "error":
              terminou = true;
              yield { type: "error", error: mapProviderError(parte.error) };
              break;

            default:
              break;
          }
        }
      } catch (erro) {
        terminou = true;
        yield { type: "error", error: mapProviderError(erro) };
        return;
      }

      // Rede de segurança: um stream que acaba sem `finish` nem `error` deixaria o run
      // aberto e a reserva presa até a reconciliação. Melhor fechar como erro explícito.
      if (!terminou) {
        yield {
          type: "error",
          error: aiError(
            "ERRO_TEMPORARIO",
            "STREAM_ENDED_WITHOUT_FINISH",
            "A resposta terminou sem sinal de conclusão do provedor.",
          ),
        };
      }
    },

    async listModels(signal?: AbortSignal) {
      try {
        const resposta = await fetch(meta.listModelsUrl, {
          method: "GET",
          headers: {
            ...meta.authHeaders(config.apiKey),
            Accept: "application/json",
          },
          signal,
          // Nunca seguir redirect: um 3xx para outro host levaria a chave junto.
          redirect: "error",
          cache: "no-store",
        });

        if (!resposta.ok) {
          // O corpo é lido só para classificar e é DESCARTADO em seguida.
          const corpo = await resposta.text().catch(() => "");
          return {
            ok: false as const,
            error: mapProviderError({
              statusCode: resposta.status,
              responseBody: corpo.slice(0, 2000),
              name: "APICallError",
            }),
          };
        }

        const payload: unknown = await resposta.json();
        return { ok: true as const, value: extractModelIds(meta, payload) };
      } catch (erro) {
        return { ok: false as const, error: mapProviderError(erro) as AiError };
      }
    },
  };
}
