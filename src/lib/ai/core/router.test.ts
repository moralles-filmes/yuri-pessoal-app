/**
 * Fase 18-A — IA · Roteamento.
 *
 * A propriedade que estes testes protegem é uma só: **o que o cliente manda é preferência,
 * nunca ordem**. Modelo fora do catálogo, provedor sem credencial, modelo sem tarifa —
 * todos recusados ANTES de qualquer chamada, com erro tipado.
 */

import { describe, expect, it } from "vitest";
import { AI_MODEL_CATALOG } from "./models";
import { configuredModelIds, eligibleModel, routeRequest, type ProviderConfigView } from "./router";

const HOJE = "2026-08-04";

const OPENAI_PADRAO = "gpt-5.6-terra";
const ANTHROPIC_PADRAO = "claude-sonnet-5";

function config(over: Partial<ProviderConfigView> = {}): ProviderConfigView {
  return {
    provider: "openai",
    enabled: true,
    defaultModel: OPENAI_PADRAO,
    economyModel: null,
    advancedModel: null,
    visionModel: null,
    fallbackAllowed: false,
    fallbackOrder: [],
    maxRetries: 1,
    timeoutMs: 60_000,
    hasUsableCredential: true,
    ...over,
  };
}

const BASE = {
  defaultProvider: null,
  defaultModel: null,
  requiredCapabilities: ["texto", "streaming"] as const,
  hoje: HOJE,
};

describe("elegibilidade de modelo", () => {
  it("10. modelo fora do catálogo é recusado", () => {
    const r = eligibleModel("openai", "modelo-inventado", ["texto"], HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MODEL_NOT_IN_CATALOG");
  });

  it("modelo de OUTRO provedor não vale para este", () => {
    const r = eligibleModel("openai", ANTHROPIC_PADRAO, ["texto"], HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MODEL_NOT_IN_CATALOG");
  });

  it("9. capacidade exigida e não oferecida recusa antes da chamada", () => {
    // Nenhum modelo do catálogo declara `visao` na 18-A (a documentação consultada não
    // afirmava, e marcar por suposição faria a chamada falhar depois de já ter sido cobrada).
    const r = eligibleModel("openai", OPENAI_PADRAO, ["visao"], HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("CAPABILITY_MISSING");
  });

  it("modelo SEM tarifa vigente não é selecionável", () => {
    // Antes de qualquer `effectiveFrom` do catálogo não há tarifa — e sem preço não há
    // reserva, logo o modelo não pode ser usado.
    const r = eligibleModel("openai", OPENAI_PADRAO, ["texto"], "2020-01-01");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("MODEL_WITHOUT_RATE");
  });

  it("modelo válido passa", () => {
    const r = eligibleModel("openai", OPENAI_PADRAO, ["texto", "streaming"], HOJE);
    expect(r.ok).toBe(true);
  });
});

describe("routeRequest", () => {
  it("11/12. sem provedor utilizável, recusa com erro tipado", () => {
    const semNada = routeRequest({ ...BASE, configs: [] });
    expect(semNada.ok).toBe(false);
    if (!semNada.ok) expect(semNada.error.code).toBe("NO_USABLE_PROVIDER");

    const semCredencial = routeRequest({
      ...BASE,
      configs: [config({ hasUsableCredential: false })],
    });
    expect(semCredencial.ok).toBe(false);

    const desativado = routeRequest({ ...BASE, configs: [config({ enabled: false })] });
    expect(desativado.ok).toBe(false);
  });

  it("a preferência do CLIENTE é honrada quando o provedor é utilizável", () => {
    const r = routeRequest({
      ...BASE,
      configs: [
        config(),
        config({ provider: "anthropic", defaultModel: ANTHROPIC_PADRAO }),
      ],
      providerPreference: "anthropic",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.provider).toBe("anthropic");
  });

  it("a preferência do cliente é IGNORADA quando o provedor não está utilizável", () => {
    const r = routeRequest({
      ...BASE,
      configs: [config()],
      providerPreference: "xai", // nem configurado
    });
    expect(r.ok).toBe(true);
    // Cai no utilizável, em vez de falhar — a preferência é sugestão.
    if (r.ok) expect(r.value.provider).toBe("openai");
  });

  it("preferência de MODELO só vale se o usuário a configurou naquele provedor", () => {
    const r = routeRequest({
      ...BASE,
      configs: [config({ economyModel: "gpt-5.6-luna" })],
      modelPreference: "gpt-5.6-sol", // existe no catálogo, mas NÃO foi configurado
    });
    expect(r.ok).toBe(true);
    // Aceitar um id arbitrário deixaria o cliente escolher um modelo caro fora do que ele
    // mesmo autorizou.
    if (r.ok) expect(r.value.model.id).toBe(OPENAI_PADRAO);
  });

  it("preferência de modelo configurada é respeitada", () => {
    const r = routeRequest({
      ...BASE,
      configs: [config({ economyModel: "gpt-5.6-luna" })],
      modelPreference: "gpt-5.6-luna",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.model.id).toBe("gpt-5.6-luna");
  });

  it("provedor sem NENHUM modelo configurado é recusado com motivo próprio", () => {
    const r = routeRequest({ ...BASE, configs: [config({ defaultModel: null })] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PROVIDER_WITHOUT_MODEL");
  });

  it("a cadeia de fallback é resolvida JÁ NA ADMISSÃO (a reserva depende dela)", () => {
    const r = routeRequest({
      ...BASE,
      configs: [
        config({ fallbackAllowed: true, fallbackOrder: ["anthropic", "gemini"] }),
        config({ provider: "anthropic", defaultModel: ANTHROPIC_PADRAO }),
        config({ provider: "gemini", defaultModel: "gemini-3.6-flash" }),
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.fallbackChain.map((d) => d.provider)).toEqual(["anthropic", "gemini"]);
  });

  it("fallback DESLIGADO devolve cadeia vazia", () => {
    const r = routeRequest({
      ...BASE,
      configs: [
        config({ fallbackAllowed: false, fallbackOrder: ["anthropic"] }),
        config({ provider: "anthropic", defaultModel: ANTHROPIC_PADRAO }),
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.fallbackChain).toEqual([]);
  });

  it("destino de fallback não utilizável some da cadeia", () => {
    const r = routeRequest({
      ...BASE,
      configs: [
        config({ fallbackAllowed: true, fallbackOrder: ["anthropic", "xai"] }),
        config({
          provider: "anthropic",
          defaultModel: ANTHROPIC_PADRAO,
          hasUsableCredential: false,
        }),
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.fallbackChain).toEqual([]);
  });
});

describe("configuredModelIds", () => {
  it("mantém a ordem de precedência e não repete", () => {
    const ids = configuredModelIds(
      config({
        defaultModel: "a",
        economyModel: "b",
        advancedModel: "a",
        visionModel: null,
      }),
    );
    expect(ids).toEqual(["a", "b"]);
  });
});

describe("catálogo", () => {
  it("todo modelo ativo tem teto de saída explícito", () => {
    for (const m of AI_MODEL_CATALOG) {
      expect(m.outputCapTokens).toBeGreaterThan(0);
    }
  });

  it("13. toda entrada declara quando e onde foi verificada", () => {
    for (const m of AI_MODEL_CATALOG) {
      expect(m.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.verificationSource).toMatch(/^https:\/\//);
    }
  });
});
