/**
 * Fase 17-D — Testes de `one-rm.ts`.
 *
 * Valores conferidos com as fórmulas publicadas. O que estes testes garantem: o número é
 * ESTIMATIVA, vem com a fórmula, avisa fora da faixa de validade e **não sai** quando a entrada
 * não permite estimar.
 */
import { describe, expect, it } from "vitest";
import {
  bestOneRm,
  estimateAllFormulas,
  estimateOneRm,
  ONE_RM_MAX_VALID_REPS,
  percentOfOneRm,
} from "./one-rm";

describe("as quatro fórmulas com valores conhecidos", () => {
  it("Epley: 100 kg × 10 = 133,333 kg", () => {
    const result = estimateOneRm({ weightKg: 100, reps: 10, formula: "epley" });
    expect(result.ok && result.value).toBe(133.333);
  });

  it("Brzycki: 100 kg × 10 = 133,333 kg", () => {
    const result = estimateOneRm({ weightKg: 100, reps: 10, formula: "brzycki" });
    expect(result.ok && result.value).toBe(133.333);
  });

  it("Lombardi: 100 kg × 10 = 125,893 kg", () => {
    const result = estimateOneRm({ weightKg: 100, reps: 10, formula: "lombardi" });
    expect(result.ok && result.value).toBe(125.893);
  });

  it("Lander: 100 kg × 10 = 134,07 kg (100 ÷ 74,5877)", () => {
    const result = estimateOneRm({ weightKg: 100, reps: 10, formula: "lander" });
    expect(result.ok && result.value).toBe(134.07);
  });

  it("Brzycki e Epley divergem em repetições altas — por isso a fórmula é escolhível", () => {
    const epley = estimateOneRm({ weightKg: 80, reps: 15, formula: "epley" });
    const brzycki = estimateOneRm({ weightKg: 80, reps: 15, formula: "brzycki" });
    expect(epley.ok && brzycki.ok && epley.value).not.toBe(brzycki.ok && brzycki.value);
  });

  it("a fórmula usada viaja junto do número", () => {
    const result = estimateOneRm({ weightKg: 60, reps: 6, formula: "brzycki" });
    expect(result.ok && result.formulaLabel).toBe("Brzycki");
    expect(result.ok && result.expression).toContain("36");
  });
});

describe("1 repetição devolve o próprio peso", () => {
  it.each(["epley", "brzycki", "lombardi", "lander"] as const)("%s", (formula) => {
    const result = estimateOneRm({ weightKg: 137.5, reps: 1, formula });
    expect(result.ok && result.value).toBe(137.5);
    // Não é estimativa: é medida. A tela precisa poder dizer isso.
    expect(result.ok && result.measured).toBe(true);
  });
});

describe("faixa de validade", () => {
  it("até 12 repetições o resultado é considerado válido", () => {
    const result = estimateOneRm({ weightKg: 100, reps: ONE_RM_MAX_VALID_REPS, formula: "epley" });
    expect(result.ok && result.withinValidRange).toBe(true);
    expect(result.ok && result.warning).toBeNull();
  });

  it("acima de 12 o número vem COM aviso, não escondido", () => {
    const result = estimateOneRm({ weightKg: 100, reps: 20, formula: "epley" });
    expect(result.ok).toBe(true);
    expect(result.ok && result.withinValidRange).toBe(false);
    expect(result.ok && result.warning).toContain("perde precisão");
    // E o aviso não vira sugestão de tentar carga máxima.
    expect(result.ok && result.warning).not.toMatch(/tente|experimente|suba/i);
  });

  it("Brzycki sem resultado possível (37 repetições) devolve motivo, não número", () => {
    const result = estimateOneRm({ weightKg: 100, reps: 37, formula: "brzycki" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toBe("fora_do_dominio");
  });
});

describe("entrada inválida não devolve número", () => {
  it.each([
    { weightKg: null, reps: 10 },
    { weightKg: 100, reps: null },
    { weightKg: 0, reps: 10 },
    { weightKg: -50, reps: 10 },
    { weightKg: 100, reps: 0 },
    { weightKg: 100, reps: 8.5 },
    { weightKg: Number.NaN, reps: 10 },
  ])("%o", (input) => {
    const result = estimateOneRm({ ...input, formula: "epley" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("indisponível");
  });
});

describe("comparação e conversão", () => {
  it("as quatro fórmulas lado a lado", () => {
    const all = estimateAllFormulas({ weightKg: 100, reps: 5 });
    expect(Object.keys(all).sort()).toEqual(["brzycki", "epley", "lander", "lombardi"]);
    expect(all.epley.ok).toBe(true);
  });

  it("a melhor série do conjunto, contando quantas ficaram de fora", () => {
    const { best, ignored } = bestOneRm(
      [
        { weightKg: 100, reps: 5 },
        { weightKg: 110, reps: 3 },
        { weightKg: null, reps: 10 },
      ],
      "epley",
    );
    expect(best?.set.weightKg).toBe(110);
    expect(ignored).toBe(1);
  });

  it("conjunto sem nenhuma série estimável devolve null", () => {
    const { best, ignored } = bestOneRm([{ weightKg: null, reps: null }], "epley");
    expect(best).toBeNull();
    expect(ignored).toBe(1);
  });

  it("percentual do 1RM recusa entrada fora do intervalo", () => {
    expect(percentOfOneRm(100, 75)).toBe(75);
    expect(percentOfOneRm(100, 0)).toBeNull();
    expect(percentOfOneRm(100, 120)).toBeNull();
    expect(percentOfOneRm(0, 75)).toBeNull();
  });
});
