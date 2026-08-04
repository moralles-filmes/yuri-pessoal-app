/**
 * Fase 18-A — IA · Fallback classificado.
 *
 * O teste mais importante do arquivo é o primeiro: **três classes nunca caem em fallback**,
 * e isso não é configurável. Se alguém um dia "flexibilizar" isso, o sistema passa a
 * contornar política de conteúdo tentando provedores em sequência — e essa é uma decisão de
 * produto, não um detalhe de implementação.
 */

import { describe, expect, it } from "vitest";
import { AI_ERROR_CLASSES, type AiErrorClass } from "./errors";
import { decideFallback, NUNCA_FAZ_FALLBACK, type FallbackContext } from "./fallback";

function ctx(over: Partial<FallbackContext> & { errorClass: AiErrorClass }): FallbackContext {
  return {
    fallbackAllowed: true,
    fallbackTargetsLeft: 2,
    retriesUsed: 0,
    maxRetries: 1,
    reservaRestante: 1,
    custoProjetadoDoDestino: 0.01,
    ...over,
  };
}

describe("as três classes que NUNCA fazem fallback", () => {
  it("mesmo com tudo ligado e destinos sobrando, elas param", () => {
    for (const classe of NUNCA_FAZ_FALLBACK) {
      const v = decideFallback(ctx({ errorClass: classe }));
      expect(v.kind, `${classe} não pode admitir fallback`).toBe("parar");
      expect(v.motivo.length).toBeGreaterThan(0);
    }
  });

  it("chave inválida: trocar de modelo não resolveria — a credencial é a mesma", () => {
    const v = decideFallback(ctx({ errorClass: "AUTENTICACAO_INVALIDA" }));
    expect(v.kind).toBe("parar");
    expect(v.motivo).toContain("credencial é a mesma");
  });

  it("cancelamento do usuário: chamar outro provedor gastaria contra a vontade dele", () => {
    const v = decideFallback(ctx({ errorClass: "CANCELADO_PELO_USUARIO" }));
    expect(v.kind).toBe("parar");
  });

  it("conteúdo recusado: não se contorna política tentando provedores em sequência", () => {
    const v = decideFallback(ctx({ errorClass: "CONTEUDO_REJEITADO" }));
    expect(v.kind).toBe("parar");
    expect(v.motivo).toContain("não tenta outros");
  });
});

describe("classes transitórias", () => {
  it("esgotam o RETRY antes de trocar de provedor — é mais barato e mais provável", () => {
    for (const classe of ["RATE_LIMIT", "TIMEOUT", "ERRO_TEMPORARIO"] as const) {
      expect(decideFallback(ctx({ errorClass: classe, retriesUsed: 0 })).kind).toBe("retry");
      expect(
        decideFallback(ctx({ errorClass: classe, retriesUsed: 1, maxRetries: 1 })).kind,
      ).toBe("fallback");
    }
  });

  it("sem retries e sem fallback ligado, param", () => {
    const v = decideFallback(
      ctx({ errorClass: "TIMEOUT", retriesUsed: 1, fallbackAllowed: false }),
    );
    expect(v.kind).toBe("parar");
    expect(v.motivo).toContain("desligado");
  });

  it("sem destino sobrando, param", () => {
    const v = decideFallback(
      ctx({ errorClass: "TIMEOUT", retriesUsed: 1, fallbackTargetsLeft: 0 }),
    );
    expect(v.kind).toBe("parar");
  });
});

describe("60. fallback NÃO ganha orçamento novo", () => {
  it("destino que não cabe na reserva restante é recusado, mesmo com fallback ligado", () => {
    const v = decideFallback(
      ctx({
        errorClass: "TIMEOUT",
        retriesUsed: 1,
        reservaRestante: 0.01,
        custoProjetadoDoDestino: 0.5,
      }),
    );
    expect(v.kind).toBe("parar");
    expect(v.motivo).toContain("orçamento reservado");
  });
});

describe("classes que exigem destino compatível", () => {
  it("modelo indisponível e contexto excedido vão direto para o fallback (sem retry)", () => {
    for (const classe of ["MODELO_INDISPONIVEL", "CONTEXTO_EXCEDIDO"] as const) {
      expect(decideFallback(ctx({ errorClass: classe })).kind).toBe("fallback");
    }
  });
});

describe("classes sem recuperação", () => {
  it("erro de schema e erro permanente encerram", () => {
    expect(decideFallback(ctx({ errorClass: "ERRO_DE_SCHEMA" })).kind).toBe("parar");
    expect(decideFallback(ctx({ errorClass: "ERRO_PERMANENTE" })).kind).toBe("parar");
  });
});

describe("cobertura", () => {
  it("as 10 classes têm veredito definido — nenhuma cai num caso não previsto", () => {
    for (const classe of AI_ERROR_CLASSES) {
      const v = decideFallback(ctx({ errorClass: classe }));
      expect(["retry", "fallback", "parar"]).toContain(v.kind);
      expect(v.motivo.trim().length).toBeGreaterThan(0);
    }
  });
});
