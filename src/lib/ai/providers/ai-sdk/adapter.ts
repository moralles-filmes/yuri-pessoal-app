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

import { streamText, type LanguageModel, type ToolSet } from "ai";
import type {
  AiProviderClient,
  AiProviderId,
  AiRequest,
  AiStreamEvent,
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
        // ⚠️ `tools` vem do contrato e na 18-A é SEMPRE vazio. Quando vazio, o campo nem é
        // enviado: mandar `tools: {}` faria alguns provedores incluírem o system prompt de
        // tool use, que custa tokens por nada.
        const temFerramentas = request.tools.length > 0;
        const toolSet: ToolSet = {};

        const resultado = streamText({
          model: config.buildModel(request.model),
          system: request.system,
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          // Teto EXPLÍCITO em toda chamada. Sem ele não há reserva possível.
          maxOutputTokens: request.maxOutputTokens,
          temperature: request.temperature,
          abortSignal: request.abortSignal,
          // O retry é NOSSO (`core/fallback.ts` decide, e cada tentativa vira uma linha em
          // `ai_usage_events`). Deixar o SDK repetir por conta própria produziria chamadas
          // pagas que o nosso medidor nunca veria.
          maxRetries: 0,
          ...(temFerramentas ? { tools: toolSet } : {}),
        });

        for await (const parte of resultado.fullStream) {
          switch (parte.type) {
            case "text-delta":
              if (parte.text) yield { type: "delta", text: parte.text };
              break;

            case "tool-call":
              // Não pode acontecer na 18-A: nenhuma definição foi enviada. Repassamos o
              // evento e quem decide o que fazer é o chat-runner — que encerra o run como
              // `failed` com UNEXPECTED_TOOL_CALL, sem executar nada.
              yield {
                type: "tool-call",
                toolName: String(parte.toolName ?? "desconhecida"),
                callId: String(parte.toolCallId ?? ""),
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
