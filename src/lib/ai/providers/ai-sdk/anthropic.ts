/**
 * Fase 18-A — IA · Adapter Anthropic Claude.
 *
 * Sem `baseURL` configurável, pelo mesmo motivo dos outros três.
 * A chave vive em memória, para uma chamada.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import type { AiProviderClient } from "@/lib/ai/core/contracts";
import { createAdapter } from "./adapter";

export function createAnthropicClient(apiKey: string): AiProviderClient {
  const anthropic = createAnthropic({ apiKey });
  return createAdapter({
    provider: "anthropic",
    buildModel: (modelId) => anthropic(modelId),
    apiKey,
  });
}
