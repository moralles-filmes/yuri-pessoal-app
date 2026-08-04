/**
 * Fase 18-A — IA · Normalização de erro dos quatro provedores.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O CORPO DA RESPOSTA É LIDO AQUI DENTRO E NUNCA SAI DAQUI.                             ║
 * ║                                                                                       ║
 * ║ Ler o corpo é necessário para distinguir "contexto excedido" de "conteúdo recusado" — ║
 * ║ os dois chegam como HTTP 400. O que não pode acontecer é esse corpo virar a mensagem  ║
 * ║ do usuário. Os testes abaixo cobrem as duas coisas.                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { describe, expect, it } from "vitest";
import { AI_ERROR_CLASSES } from "@/lib/ai/core/errors";
import { safeUserMessage } from "@/lib/ai/security/redact";
import {
  CONNECTION_TEST_MESSAGE,
  connectionTestCode,
  isAbort,
  mapProviderError,
} from "./error-map";

describe("8. os quatro provedores caem nas 10 classes normalizadas", () => {
  it("401 e 403 → AUTENTICACAO_INVALIDA", () => {
    expect(mapProviderError({ statusCode: 401 }).class).toBe("AUTENTICACAO_INVALIDA");
    expect(mapProviderError({ status: 403 }).class).toBe("AUTENTICACAO_INVALIDA");
  });

  it("404 → MODELO_INDISPONIVEL", () => {
    expect(mapProviderError({ statusCode: 404 }).class).toBe("MODELO_INDISPONIVEL");
  });

  it("429 → RATE_LIMIT (e é retryable)", () => {
    const e = mapProviderError({ statusCode: 429 });
    expect(e.class).toBe("RATE_LIMIT");
    expect(e.retryable).toBe(true);
  });

  it("408 e 504 → TIMEOUT", () => {
    expect(mapProviderError({ statusCode: 408 }).class).toBe("TIMEOUT");
    expect(mapProviderError({ statusCode: 504 }).class).toBe("TIMEOUT");
  });

  it("5xx → ERRO_TEMPORARIO", () => {
    expect(mapProviderError({ statusCode: 500 }).class).toBe("ERRO_TEMPORARIO");
    expect(mapProviderError({ statusCode: 503 }).class).toBe("ERRO_TEMPORARIO");
  });

  it("400 com marca de contexto → CONTEXTO_EXCEDIDO (não ERRO_PERMANENTE)", () => {
    const e = mapProviderError({
      statusCode: 400,
      responseBody: '{"error":{"message":"This model maximum context length is 8192"}}',
    });
    expect(e.class).toBe("CONTEXTO_EXCEDIDO");
  });

  it("400 com marca de política → CONTEUDO_REJEITADO", () => {
    const e = mapProviderError({
      statusCode: 400,
      responseBody: '{"error":{"message":"blocked by content policy"}}',
    });
    expect(e.class).toBe("CONTEUDO_REJEITADO");
  });

  it("modelo inexistente pelo texto → MODELO_INDISPONIVEL", () => {
    expect(
      mapProviderError({ statusCode: 400, responseBody: "model not found: xyz" }).class,
    ).toBe("MODELO_INDISPONIVEL");
  });

  it("erro de rede → ERRO_TEMPORARIO com código NETWORK", () => {
    const e = mapProviderError(new TypeError("fetch failed"));
    expect(e.class).toBe("ERRO_TEMPORARIO");
    expect(e.code).toBe("NETWORK");
  });

  it("abort do cliente → CANCELADO_PELO_USUARIO", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(isAbort(abort)).toBe(true);
    expect(mapProviderError(abort).class).toBe("CANCELADO_PELO_USUARIO");
  });

  it("TimeoutError é timeout, não cancelamento", () => {
    const t = Object.assign(new Error("timed out"), { name: "TimeoutError" });
    expect(mapProviderError(t).class).toBe("TIMEOUT");
  });

  it("desconhecido → ERRO_PERMANENTE, e NÃO retryable", () => {
    // Repetir uma falha que ninguém entendeu gasta dinheiro do usuário para descobrir a
    // mesma coisa duas vezes.
    const e = mapProviderError({ foo: "bar" });
    expect(e.class).toBe("ERRO_PERMANENTE");
    expect(e.retryable).toBe(false);
  });

  it("toda classe produzida está entre as 10", () => {
    const amostras: unknown[] = [
      { statusCode: 401 },
      { statusCode: 404 },
      { statusCode: 429 },
      { statusCode: 500 },
      { statusCode: 400, responseBody: "context length" },
      { statusCode: 400, responseBody: "content policy" },
      { statusCode: 400, responseBody: "invalid json schema" },
      { statusCode: 402 },
      new DOMException("x", "AbortError"),
      new TypeError("fetch failed"),
    ];
    for (const a of amostras) {
      expect(AI_ERROR_CLASSES).toContain(mapProviderError(a).class);
    }
  });
});

describe("o erro normalizado JÁ SAI SANITIZADO", () => {
  it("o corpo do provedor não vaza na mensagem do usuário", () => {
    const corpo =
      '{"error":{"message":"invalid api key sk-proj-AbCdEfGhIjKlMnOpQrSt","type":"auth"}}';
    const e = mapProviderError({ statusCode: 401, responseBody: corpo });

    expect(e.message).not.toContain("sk-proj-");
    expect(e.message).not.toContain("invalid api key");
    expect(safeUserMessage(e)).not.toContain("sk-proj-");
  });

  it("o código é curto e estável, sem segredo", () => {
    const e = mapProviderError({ statusCode: 429 });
    expect(e.code).toBe("HTTP_429");
    expect(e.code).not.toMatch(/[A-Za-z0-9]{24,}/);
  });
});

describe("códigos do teste de conexão", () => {
  it("mapeia as classes para o conjunto FECHADO da interface", () => {
    expect(connectionTestCode(mapProviderError({ statusCode: 401 }))).toBe("INVALID_KEY");
    expect(connectionTestCode(mapProviderError({ statusCode: 429 }))).toBe("RATE_LIMITED");
    expect(connectionTestCode(mapProviderError({ statusCode: 408 }))).toBe("TIMEOUT");
    expect(connectionTestCode(mapProviderError(new TypeError("fetch failed")))).toBe(
      "NETWORK",
    );
    expect(connectionTestCode(mapProviderError({ statusCode: 402 }))).toBe(
      "PROVIDER_ERROR",
    );
  });

  it("toda mensagem do teste é em pt-BR e sem detalhe do provedor", () => {
    for (const mensagem of Object.values(CONNECTION_TEST_MESSAGE)) {
      expect(mensagem.length).toBeGreaterThan(10);
      expect(mensagem).not.toMatch(/http|status|body|header/i);
    }
  });
});
