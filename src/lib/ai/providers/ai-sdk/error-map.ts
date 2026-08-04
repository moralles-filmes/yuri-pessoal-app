/**
 * Fase 18-A — IA · Erro do SDK/HTTP → uma das 10 classes de `core/errors.ts`, JÁ SANITIZADO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O TEXTO DO PROVEDOR É LIDO AQUI DENTRO, MAS NUNCA SAI DAQUI.                          ║
 * ║                                                                                       ║
 * ║ Ler o corpo da resposta é necessário para distinguir "contexto excedido" de "conteúdo ║
 * ║ recusado" — os dois chegam como HTTP 400. O que não pode acontecer é esse corpo virar ║
 * ║ a mensagem do usuário: ele carrega eco de prompt, às vezes eco de chave, e sempre     ║
 * ║ termos que não ajudam ninguém em português. Então: inspeciona, classifica, DESCARTA.  ║
 * ║ A mensagem devolvida é sempre uma das nossas.                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A detecção é por DUCK TYPING, não por `instanceof`. Os quatro adapters e o próprio SDK
 * evoluem em ritmos diferentes; amarrar a classificação a classes concretas faria um upgrade
 * de patch transformar todo erro em `ERRO_PERMANENTE` sem nenhum aviso.
 */

import { aiError, type AiError } from "@/lib/ai/core/errors";

type ErroComForma = {
  name?: unknown;
  message?: unknown;
  statusCode?: unknown;
  status?: unknown;
  responseBody?: unknown;
  cause?: unknown;
};

function asShape(erro: unknown): ErroComForma {
  return typeof erro === "object" && erro !== null ? (erro as ErroComForma) : {};
}

function statusDe(erro: ErroComForma): number | null {
  if (typeof erro.statusCode === "number") return erro.statusCode;
  if (typeof erro.status === "number") return erro.status;
  const cause = asShape(erro.cause);
  if (typeof cause.statusCode === "number") return cause.statusCode;
  if (typeof cause.status === "number") return cause.status;
  return null;
}

/** Texto para INSPEÇÃO INTERNA. Nunca é devolvido. */
function textoInterno(erro: ErroComForma): string {
  const partes = [
    typeof erro.name === "string" ? erro.name : "",
    typeof erro.message === "string" ? erro.message : "",
    typeof erro.responseBody === "string" ? erro.responseBody : "",
  ];
  return partes.join(" ").toLowerCase();
}

const MARCAS_DE_CONTEXTO = [
  "context length",
  "context_length",
  "maximum context",
  "too many tokens",
  "prompt is too long",
  "input is too long",
  "exceeds the maximum",
  "token limit",
];

const MARCAS_DE_CONTEUDO = [
  "content policy",
  "content_policy",
  "safety",
  "blocked",
  "moderation",
  "refus",
  "prohibited",
];

const MARCAS_DE_MODELO = [
  "model not found",
  "no such model",
  "does not exist",
  "unsupported model",
  "model_not_found",
];

function contemAlguma(texto: string, marcas: readonly string[]): boolean {
  return marcas.some((m) => texto.includes(m));
}

/** Cancelamento é caso à parte: não é falha, e nunca admite retry nem fallback. */
export function isAbort(erro: unknown): boolean {
  const forma = asShape(erro);
  const nome = typeof forma.name === "string" ? forma.name : "";
  return (
    nome === "AbortError" ||
    nome === "TimeoutError" ||
    (typeof forma.message === "string" &&
      /aborted|cancel/i.test(forma.message) &&
      nome !== "APICallError")
  );
}

export function mapProviderError(erro: unknown): AiError {
  const forma = asShape(erro);

  if (isAbort(erro)) {
    const nome = typeof forma.name === "string" ? forma.name : "";
    if (nome === "TimeoutError") {
      return aiError("TIMEOUT", "PROVIDER_TIMEOUT");
    }
    return aiError("CANCELADO_PELO_USUARIO", "CLIENT_ABORTED");
  }

  const status = statusDe(forma);
  const texto = textoInterno(forma);

  // ── Classificação por conteúdo, ANTES do status: um 400 pode ser três coisas ─────────
  if (contemAlguma(texto, MARCAS_DE_CONTEXTO)) {
    return aiError("CONTEXTO_EXCEDIDO", "CONTEXT_EXCEEDED");
  }
  if (contemAlguma(texto, MARCAS_DE_CONTEUDO)) {
    return aiError("CONTEUDO_REJEITADO", "CONTENT_REJECTED");
  }
  if (contemAlguma(texto, MARCAS_DE_MODELO)) {
    return aiError("MODELO_INDISPONIVEL", "MODEL_NOT_FOUND");
  }

  if (status !== null) {
    if (status === 401 || status === 403) {
      return aiError("AUTENTICACAO_INVALIDA", `HTTP_${status}`);
    }
    if (status === 404) {
      return aiError("MODELO_INDISPONIVEL", "HTTP_404");
    }
    if (status === 408 || status === 504) {
      return aiError("TIMEOUT", `HTTP_${status}`);
    }
    if (status === 429) {
      return aiError("RATE_LIMIT", "HTTP_429");
    }
    if (status >= 500) {
      return aiError("ERRO_TEMPORARIO", `HTTP_${status}`);
    }
    if (status >= 400) {
      return aiError("ERRO_PERMANENTE", `HTTP_${status}`);
    }
  }

  if (texto.includes("validation") || texto.includes("schema") || texto.includes("json")) {
    return aiError("ERRO_DE_SCHEMA", "SCHEMA_ERROR");
  }
  if (
    texto.includes("fetch failed") ||
    texto.includes("network") ||
    texto.includes("econnreset") ||
    texto.includes("enotfound")
  ) {
    return aiError("ERRO_TEMPORARIO", "NETWORK");
  }

  // Desconhecido vira PERMANENTE de propósito: `retryable: false`. Repetir uma falha que
  // ninguém entendeu gasta dinheiro do usuário para descobrir a mesma coisa duas vezes.
  return aiError("ERRO_PERMANENTE", "UNKNOWN");
}

/** Códigos que o teste de conexão devolve à interface. Fechado, sem detalhe do provedor. */
export type ConnectionTestCode =
  | "INVALID_KEY"
  | "NETWORK"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "NOT_CONFIGURED";

export function connectionTestCode(error: AiError): ConnectionTestCode {
  switch (error.class) {
    case "AUTENTICACAO_INVALIDA":
      return "INVALID_KEY";
    case "TIMEOUT":
      return "TIMEOUT";
    case "RATE_LIMIT":
      return "RATE_LIMITED";
    case "ERRO_TEMPORARIO":
      return error.code === "NETWORK" ? "NETWORK" : "PROVIDER_ERROR";
    default:
      return "PROVIDER_ERROR";
  }
}

export const CONNECTION_TEST_MESSAGE: Record<ConnectionTestCode, string> = {
  INVALID_KEY: "A chave não foi aceita pelo provedor.",
  NETWORK: "Não foi possível alcançar o provedor.",
  TIMEOUT: "O provedor não respondeu dentro do tempo limite.",
  RATE_LIMITED: "O provedor recusou por excesso de requisições. Tente daqui a pouco.",
  PROVIDER_ERROR: "O provedor recusou a verificação.",
  NOT_CONFIGURED: "Este provedor ainda não está configurado.",
};
