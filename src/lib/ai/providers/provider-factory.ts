/**
 * Fase 18-A — IA · (provedor, credencial) → cliente que implementa `core/contracts`.
 *
 * A credencial JÁ CHEGA DECIFRADA aqui, em memória, para UMA chamada. Este arquivo não sabe
 * decifrar nada — `credential-crypto` é `server-only` e está fora do alcance dele. Também
 * não há cache de cliente por chave: guardar o objeto construído manteria a chave viva numa
 * variável de módulo, que é exatamente o que a regra proíbe.
 *
 * O switch é exaustivo por tipo: acrescentar um quinto provedor no `AiProviderId` faz o
 * TypeScript apontar este arquivo, em vez de deixar um `default` silencioso engolir o caso.
 */

import type { AiProviderClient, AiProviderId } from "@/lib/ai/core/contracts";
import { createAnthropicClient } from "./ai-sdk/anthropic";
import { createGeminiClient } from "./ai-sdk/gemini";
import { createOpenAiClient } from "./ai-sdk/openai";
import { createXaiClient } from "./ai-sdk/xai";

export function createProviderClient(
  provider: AiProviderId,
  apiKey: string,
): AiProviderClient {
  switch (provider) {
    case "openai":
      return createOpenAiClient(apiKey);
    case "gemini":
      return createGeminiClient(apiKey);
    case "anthropic":
      return createAnthropicClient(apiKey);
    case "xai":
      return createXaiClient(apiKey);
  }
}
