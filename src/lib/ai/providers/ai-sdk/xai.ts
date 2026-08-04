/**
 * Fase 18-A — IA · Adapter xAI Grok.
 *
 * Sem `baseURL` configurável, pelo mesmo motivo dos outros três.
 * A chave vive em memória, para uma chamada.
 */

import { createXai } from "@ai-sdk/xai";
import type { AiProviderClient } from "@/lib/ai/core/contracts";
import { createAdapter } from "./adapter";

export function createXaiClient(apiKey: string): AiProviderClient {
  const xai = createXai({ apiKey });
  return createAdapter({
    provider: "xai",
    buildModel: (modelId) => xai(modelId),
    apiKey,
  });
}
