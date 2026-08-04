/**
 * Fase 18-A — IA · Medição por tentativa.
 *
 * O teste central é o mais chato de escrever e o mais importante: **ausência nunca é custo
 * zero**. Um provedor que não informa tokens produz `null`, não `0` — porque `0` some no
 * somatório e faz o orçamento mentir para baixo, justamente onde mentir é mais caro.
 */

import { describe, expect, it } from "vitest";
import type { AiUsage } from "@/lib/ai/core/contracts";
import { USAGE_UNAVAILABLE } from "@/lib/ai/core/contracts";
import { rateFor, type AiRate } from "@/lib/ai/core/pricing";
import { availabilityRecord, ceil6, computeAttemptCost, round6, sumRunCost } from "./meter";

const HOJE = "2026-08-04";

function usoCompleto(entrada: number, saida: number, cache?: number): AiUsage {
  return {
    inputTokens: entrada,
    outputTokens: saida,
    cachedInputTokens: cache ?? null,
    availability: {
      inputTokens: "available",
      outputTokens: "available",
      cachedInputTokens: cache === undefined ? "unavailable" : "available",
    },
  };
}

const TARIFA_A: AiRate = {
  provider: "openai",
  modelId: "teste-a",
  inputPerMillion: "1.00",
  outputPerMillion: "5.00",
  cachedInputPerMillion: "0.10",
  longContextThresholdTokens: null,
  longInputPerMillion: null,
  longOutputPerMillion: null,
  currency: "USD",
  effectiveFrom: "2026-01-01",
  effectiveUntil: null,
  verifiedAt: "2026-08-04",
  source: "teste",
};

describe("custo de uma tentativa", () => {
  it("calcula entrada + saída com a tarifa informada", () => {
    const c = computeAttemptCost(usoCompleto(4_100, 900), TARIFA_A);
    expect(c.inputUsd).toBe(0.0041);
    expect(c.outputUsd).toBe(0.0045);
    expect(c.totalUsd).toBe(0.0086);
    expect(c.tier).toBe("padrao");
  });

  it("54. métrica NÃO devolvida pelo provedor é indisponível — nunca 0", () => {
    const c = computeAttemptCost(USAGE_UNAVAILABLE, TARIFA_A);
    expect(c.totalUsd).toBeNull();
    expect(c.inputUsd).toBeNull();
    expect(c.outputUsd).toBeNull();
    expect(c.indisponivelPorque).toContain("não informou");
  });

  it("uso PARCIAL não vira estimativa pela metade", () => {
    const parcial: AiUsage = {
      inputTokens: 4_100,
      outputTokens: null,
      cachedInputTokens: null,
      availability: {
        inputTokens: "available",
        outputTokens: "unavailable",
        cachedInputTokens: "unavailable",
      },
    };
    const c = computeAttemptCost(parcial, TARIFA_A);
    // Sabemos a entrada, mas o total continua indisponível: metade de uma conta não é conta.
    expect(c.totalUsd).toBeNull();
    expect(c.indisponivelPorque).toContain("saída");
  });

  it("cache só entra quando o provedor informa E a tarifa existe", () => {
    const comCache = computeAttemptCost(usoCompleto(4_100, 900, 2_000), TARIFA_A);
    expect(comCache.cachedInputUsd).toBe(0.0002);

    const semTarifaDeCache = computeAttemptCost(usoCompleto(4_100, 900, 2_000), {
      ...TARIFA_A,
      cachedInputPerMillion: null,
    });
    // Sem tarifa de cache o total continua válido: tokens em cache já estão na entrada.
    expect(semTarifaDeCache.cachedInputUsd).toBeNull();
    expect(semTarifaDeCache.totalUsd).toBe(0.0086);
  });

  it("aplica a faixa CARA quando a entrada passa do limiar (tarifa por faixa da xAI)", () => {
    const grok = rateFor("xai", "grok-4.3", HOJE);
    expect(grok).not.toBeNull();
    if (!grok) return;

    const abaixo = computeAttemptCost(usoCompleto(100_000, 1_000), grok);
    expect(abaixo.tier).toBe("padrao");
    expect(abaixo.inputUsd).toBe(round6((100_000 / 1e6) * 1.25));

    const acima = computeAttemptCost(usoCompleto(250_000, 1_000), grok);
    expect(acima.tier).toBe("longo");
    expect(acima.inputUsd).toBe(round6((250_000 / 1e6) * 2.5));
  });
});

describe("total do run — soma das TENTATIVAS", () => {
  it("53. soma corretamente retry e fallback, com tarifas diferentes", () => {
    // Exemplo 2 do anexo D: 0,005600 (falhou) + 0,008850 (ok).
    const total = sumRunCost([0.0056, 0.00885]);
    expect(total.totalUsd).toBe(0.01445);
    expect(total.parcial).toBe(false);
    expect(total.avisoParcial).toBeNull();
  });

  it("uma tentativa sem custo torna o total PARCIAL — e a tela diz isso", () => {
    const total = sumRunCost([0.0056, null]);
    expect(total.totalUsd).toBe(0.0056);
    expect(total.parcial).toBe(true);
    expect(total.semCusto).toBe(1);
    expect(total.avisoParcial).toContain("1 execução ficou");
  });

  it("plural correto quando mais de uma fica sem custo", () => {
    expect(sumRunCost([null, null]).avisoParcial).toContain("2 execuções ficaram");
  });

  it("nenhuma tentativa = total zero, mas sem aviso de parcial", () => {
    const total = sumRunCost([]);
    expect(total.totalUsd).toBe(0);
    expect(total.parcial).toBe(false);
  });
});

describe("arredondamento", () => {
  it("round6 é determinístico em 6 casas", () => {
    expect(round6(0.1 + 0.2)).toBe(0.3);
    expect(round6(1 / 3)).toBe(0.333333);
  });

  it("ceil6 arredonda PARA CIMA — a reserva tem de sobrar, nunca faltar", () => {
    expect(ceil6(0.0000001)).toBe(0.000001);
    expect(ceil6(0.1449)).toBe(0.1449);
  });
});

describe("registro de disponibilidade", () => {
  it("guarda O QUE FALTOU, não um booleano vago", () => {
    const registro = availabilityRecord(USAGE_UNAVAILABLE);
    expect(registro.input_tokens).toBe("unavailable");
    expect(registro.output_tokens).toBe("unavailable");
    expect(registro.note).toContain("não informou");
  });
});
