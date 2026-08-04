/**
 * Fase 18-A — IA · Adapter Google Gemini.
 *
 * Sem `baseURL` configurável, pelo mesmo motivo dos outros três.
 * A chave vive em memória, para uma chamada.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { AiProviderClient } from "@/lib/ai/core/contracts";
import { createAdapter } from "./adapter";

export function createGeminiClient(apiKey: string): AiProviderClient {
  const google = createGoogleGenerativeAI({ apiKey });
  return createAdapter({
    provider: "gemini",
    buildModel: (modelId) => google(modelId),
    apiKey,
  });
}
