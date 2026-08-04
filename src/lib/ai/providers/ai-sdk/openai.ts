/**
 * Fase 18-A — IA · Adapter OpenAI.
 *
 * Repare no que NÃO tem aqui: `baseURL`. O endpoint é o oficial do SDK, e não existe caminho
 * para o usuário apontar a chave dele para outro host (ver `providers/registry.ts`).
 *
 * A chave chega decifrada, em memória, para UMA chamada — nunca é guardada em variável de
 * módulo, cache, log ou telemetria.
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { AiProviderClient } from "@/lib/ai/core/contracts";
import { createAdapter } from "./adapter";

export function createOpenAiClient(apiKey: string): AiProviderClient {
  const openai = createOpenAI({ apiKey });
  return createAdapter({
    provider: "openai",
    buildModel: (modelId) => openai(modelId),
    apiKey,
  });
}
