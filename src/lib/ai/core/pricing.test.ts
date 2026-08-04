/**
 * Fase 18-A — IA · Tarifas versionadas.
 *
 * O caso do Claude Sonnet 5 (promocional até 31/08/2026, padrão a partir de 01/09/2026) é a
 * razão de o arquivo ter janela de vigência — e por isso ele é o teste central: sem
 * `effectiveFrom`/`effectiveUntil`, a virada do mês faria o sistema calcular errado sem
 * ninguém perceber.
 */

import { describe, expect, it } from "vitest";
import { AI_MODEL_CATALOG, findModel } from "./models";
import {
  AI_RATE_TABLE,
  effectiveRatePair,
  hasRate,
  PRICING_VERSION,
  rateFor,
  rateSnapshot,
  worstCaseRatePair,
} from "./pricing";

describe("vigência das tarifas", () => {
  it("o Sonnet 5 tem DUAS tarifas, e cada data resolve a sua", () => {
    const promocional = rateFor("anthropic", "claude-sonnet-5", "2026-08-15");
    expect(promocional?.inputPerMillion).toBe("2.00");
    expect(promocional?.outputPerMillion).toBe("10.00");

    const padrao = rateFor("anthropic", "claude-sonnet-5", "2026-09-01");
    expect(padrao?.inputPerMillion).toBe("3.00");
    expect(padrao?.outputPerMillion).toBe("15.00");
  });

  it("o último dia do promocional ainda é promocional", () => {
    expect(rateFor("anthropic", "claude-sonnet-5", "2026-08-31")?.inputPerMillion).toBe(
      "2.00",
    );
  });

  it("antes da vigência não existe tarifa — e isso não vira 'de graça'", () => {
    expect(rateFor("anthropic", "claude-sonnet-5", "2020-01-01")).toBeNull();
    expect(hasRate("anthropic", "claude-sonnet-5", "2020-01-01")).toBe(false);
  });

  it("modelo inexistente devolve null, nunca um palpite", () => {
    expect(rateFor("openai", "modelo-que-nao-existe", "2026-08-04")).toBeNull();
  });
});

describe("15. a tarifa é congelada no snapshot", () => {
  it("o snapshot carrega o objeto inteiro, não só os dois números", () => {
    const rate = rateFor("openai", "gpt-5.6-terra", "2026-08-04");
    expect(rate).not.toBeNull();
    if (!rate) return;

    const snap = rateSnapshot(rate);
    expect(snap.input_per_million).toBe("2.00");
    expect(snap.output_per_million).toBe("12.00");
    expect(snap.pricing_version).toBe(PRICING_VERSION);
    expect(snap.source).toContain("https://");
    expect(snap.verified_at).toBe("2026-08-04");
    // Auditar meses depois exige saber de qual publicação o custo saiu.
    expect(snap.effective_from).toBe("2026-08-04");
  });
});

describe("tarifa por faixa (xAI)", () => {
  it("aplica a faixa cara acima do limiar", () => {
    const grok = rateFor("xai", "grok-4.5", "2026-08-04");
    expect(grok).not.toBeNull();
    if (!grok) return;

    expect(effectiveRatePair(grok, 100_000)).toEqual({
      input: 2,
      output: 6,
      tier: "padrao",
    });
    expect(effectiveRatePair(grok, 200_000)).toEqual({
      input: 4,
      output: 12,
      tier: "longo",
    });
  });

  it("a RESERVA usa sempre a faixa cara — ela é a priori e tem de cobrir o pior caso", () => {
    const grok = rateFor("xai", "grok-4.5", "2026-08-04");
    if (!grok) return;
    expect(worstCaseRatePair(grok)).toEqual({ input: 4, output: 12 });
  });

  it("modelo sem faixa devolve a tarifa única nos dois casos", () => {
    const gpt = rateFor("openai", "gpt-5.6-terra", "2026-08-04");
    if (!gpt) return;
    expect(effectiveRatePair(gpt, 5_000_000).tier).toBe("padrao");
    expect(worstCaseRatePair(gpt)).toEqual({ input: 2, output: 12 });
  });
});

describe("14. preço mora SÓ aqui", () => {
  it("todo modelo ATIVO do catálogo tem tarifa vigente hoje", () => {
    const hoje = "2026-08-04";
    const semTarifa = AI_MODEL_CATALOG.filter(
      (m) => m.status === "ativo" && !hasRate(m.provider, m.id, hoje),
    ).map((m) => `${m.provider}/${m.id}`);

    // Modelo sem tarifa não é selecionável — então um modelo ativo sem tarifa seria um
    // item morto no catálogo, oferecido na tela e recusado no envio.
    expect(semTarifa).toEqual([]);
  });

  it("toda tarifa aponta para um modelo que existe no catálogo", () => {
    const orfas = AI_RATE_TABLE.filter(
      (r) => findModel(r.provider, r.modelId) === null,
    ).map((r) => `${r.provider}/${r.modelId}`);
    expect(orfas).toEqual([]);
  });

  it("16. toda tarifa é em USD e declara a data de verificação", () => {
    for (const r of AI_RATE_TABLE) {
      expect(r.currency).toBe("USD");
      expect(r.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.source).toMatch(/^https:\/\//);
      // Decimal em STRING: o arquivo não pode mentir por float.
      expect(typeof r.inputPerMillion).toBe("string");
      expect(typeof r.outputPerMillion).toBe("string");
    }
  });
});
