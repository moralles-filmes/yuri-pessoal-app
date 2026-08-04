/**
 * Fase 18-A — IA · Registry dos quatro provedores. Metadados ESTÁTICOS.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ENDPOINT OFICIAL FICA AQUI, EM CONSTANTE. NÃO EXISTE `base_url` CONFIGURÁVEL.         ║
 * ║                                                                                       ║
 * ║ Permitir URL arbitrária abriria, de uma vez: SSRF, envio da chave do usuário para um  ║
 * ║ domínio malicioso, vazamento do prompt e de dado pessoal, e redirect inesperado.      ║
 * ║ Se algum dia for necessário endpoint alternativo, ele exigirá allowlist estática,     ║
 * ║ HTTPS obrigatório, host exato, bloqueio de IP privado, bloqueio de redirect entre     ║
 * ║ domínios e testes de SSRF — e não entra nesta fase.                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Os endpoints abaixo são de LISTAGEM DE MODELOS, usados só pelo teste de conexão — que
 * custa ZERO tokens. Validar a chave sem consumir nada é exatamente o motivo da escolha.
 * A geração em si vai pelo AI SDK, que já conhece o endpoint oficial de cada provedor.
 *
 * Repare em `authHeaders`: a chave vai sempre em CABEÇALHO, nunca em query string. URL com
 * credencial vaza em log de proxy, em histórico e em qualquer relatório de erro — e
 * `security/redact.ts` proíbe explicitamente que uma dessas saia do módulo.
 */

import type { AiProviderId } from "@/lib/ai/core/contracts";

export type ProviderMetadata = {
  readonly id: AiProviderId;
  readonly label: string;
  /** Endpoint oficial de LISTAGEM de modelos. Constante, nunca configurável. */
  readonly listModelsUrl: string;
  readonly authHeaders: (apiKey: string) => Record<string, string>;
  /** Caminho até o array de modelos na resposta JSON. */
  readonly modelsPath: readonly string[];
  /** Campo que carrega o id do modelo dentro de cada item. */
  readonly modelIdField: string;
  /** Como a chave costuma começar — só para a UI orientar, nunca para validar. */
  readonly keyHint: string;
  readonly consoleUrl: string;
};

export const PROVIDER_REGISTRY: Record<AiProviderId, ProviderMetadata> = {
  openai: {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    listModelsUrl: "https://api.openai.com/v1/models",
    authHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    modelsPath: ["data"],
    modelIdField: "id",
    keyHint: "sk-…",
    consoleUrl: "https://platform.openai.com/api-keys",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    listModelsUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    // Cabeçalho, e não `?key=` — a variante em query string é a que o Google também aceita,
    // e é justamente a que colocaria a chave dentro de uma URL.
    authHeaders: (apiKey) => ({ "x-goog-api-key": apiKey }),
    modelsPath: ["models"],
    modelIdField: "name",
    keyHint: "AIza…",
    consoleUrl: "https://aistudio.google.com/apikey",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    listModelsUrl: "https://api.anthropic.com/v1/models",
    authHeaders: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    }),
    modelsPath: ["data"],
    modelIdField: "id",
    keyHint: "sk-ant-…",
    consoleUrl: "https://console.anthropic.com/settings/keys",
  },
  xai: {
    id: "xai",
    label: "xAI Grok",
    listModelsUrl: "https://api.x.ai/v1/models",
    authHeaders: (apiKey) => ({ Authorization: `Bearer ${apiKey}` }),
    modelsPath: ["data"],
    modelIdField: "id",
    keyHint: "xai-…",
    consoleUrl: "https://console.x.ai/",
  },
};

export function providerMetadata(id: AiProviderId): ProviderMetadata {
  return PROVIDER_REGISTRY[id];
}

/** Extrai a lista de ids de modelo da resposta, sem confiar no formato. */
export function extractModelIds(
  meta: ProviderMetadata,
  payload: unknown,
): string[] {
  let node: unknown = payload;
  for (const chave of meta.modelsPath) {
    if (typeof node !== "object" || node === null) return [];
    node = (node as Record<string, unknown>)[chave];
  }
  if (!Array.isArray(node)) return [];

  return node
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;
      const valor = (item as Record<string, unknown>)[meta.modelIdField];
      if (typeof valor !== "string") return null;
      // O Gemini devolve "models/gemini-3.6-flash"; o id de uso é o que vem depois da barra.
      return valor.startsWith("models/") ? valor.slice("models/".length) : valor;
    })
    .filter((v): v is string => v !== null);
}
