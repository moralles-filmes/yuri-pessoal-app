/**
 * Fase 17-C — Treinos · Testes da calculadora de anilhas.
 *
 * A regra que os testes protegem: a calculadora **nunca passa do alvo** e **nunca usa anilha
 * que não existe no local**. Montar 85 kg quando o usuário pediu 82,5 seria trocar a carga
 * dele em silêncio.
 */
import { describe, expect, it } from "vitest";
import {
  achievableLoads,
  closestAchievable,
  formatPlateWeight,
  plateLabel,
  plateSolution,
  type PlateStock,
} from "./plates";

/** Estoque típico de academia: quantidade em UNIDADES (a conta usa pares). */
const academia: PlateStock[] = [
  { weightKg: 20, quantity: 8 },
  { weightKg: 10, quantity: 6 },
  { weightKg: 5, quantity: 6 },
  { weightKg: 2.5, quantity: 4 },
  { weightKg: 1.25, quantity: 4 },
];

describe("plateSolution", () => {
  it("monta um alvo exato", () => {
    const result = plateSolution({ targetKg: 100, barWeightKg: 20, plates: academia });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.achievedKg).toBe(100);
    expect(result.isExact).toBe(true);
    expect(result.perSideKg).toBe(40);
    expect(result.perSide).toEqual([{ weightKg: 20, pairs: 2 }]);
  });

  it("usa a anilha mais pesada primeiro e completa com as menores", () => {
    const result = plateSolution({ targetKg: 82.5, barWeightKg: 20, plates: academia });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.achievedKg).toBe(82.5);
    expect(result.perSide).toEqual([
      { weightKg: 20, pairs: 1 },
      { weightKg: 10, pairs: 1 },
      { weightKg: 1.25, pairs: 1 },
    ]);
  });

  it("NUNCA passa do alvo — devolve o que dá e a diferença", () => {
    const result = plateSolution({
      targetKg: 83,
      barWeightKg: 20,
      plates: [{ weightKg: 20, quantity: 8 }, { weightKg: 5, quantity: 4 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.achievedKg).toBeLessThan(83);
    expect(result.achievedKg).toBe(80);
    expect(result.differenceKg).toBe(-3);
    expect(result.isExact).toBe(false);
  });

  it("respeita o estoque: não usa mais pares do que existem", () => {
    const result = plateSolution({
      targetKg: 200,
      barWeightKg: 20,
      plates: [{ weightKg: 20, quantity: 4 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 2 unidades de 20 = 1 par por lado → 20 + 40 = 60.
    expect(result.perSide).toEqual([{ weightKg: 20, pairs: 2 }]);
    expect(result.achievedKg).toBe(100);
  });

  it("anilha ímpar não vira meio par (barra é simétrica)", () => {
    const result = plateSolution({
      targetKg: 40,
      barWeightKg: 20,
      plates: [{ weightKg: 10, quantity: 3 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 3 unidades → 1 par utilizável.
    expect(result.perSide).toEqual([{ weightKg: 10, pairs: 1 }]);
    expect(result.achievedKg).toBe(40);
  });

  it("alvo igual à barra é válido e não usa anilha", () => {
    const result = plateSolution({ targetKg: 20, barWeightKg: 20, plates: academia });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.perSide).toEqual([]);
    expect(result.isExact).toBe(true);
  });

  it("recusa alvo menor que a barra, dizendo qual é o mínimo", () => {
    const result = plateSolution({ targetKg: 15, barWeightKg: 20, plates: academia });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("alvo_menor_que_barra");
    expect(result.closestKg).toBe(20);
  });

  it("recusa quando o local não tem anilha cadastrada", () => {
    const result = plateSolution({ targetKg: 60, barWeightKg: 20, plates: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("sem_anilhas");
  });

  it("recusa alvo inválido", () => {
    expect(plateSolution({ targetKg: 0, barWeightKg: 20, plates: academia }).ok).toBe(false);
    expect(plateSolution({ targetKg: -5, barWeightKg: 20, plates: academia }).ok).toBe(false);
    expect(plateSolution({ targetKg: Number.NaN, barWeightKg: 20, plates: academia }).ok).toBe(false);
  });

  it("funciona sem barra (halteres, máquina de placas)", () => {
    const result = plateSolution({
      targetKg: 30,
      barWeightKg: 0,
      plates: [{ weightKg: 5, quantity: 10 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.achievedKg).toBe(30);
  });

  it("não acumula erro de ponto flutuante com anilhas de 1,25", () => {
    const result = plateSolution({
      targetKg: 25,
      barWeightKg: 20,
      plates: [{ weightKg: 1.25, quantity: 8 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.achievedKg).toBe(25);
    expect(result.perSideKg).toBe(2.5);
  });
});

describe("achievableLoads / closestAchievable", () => {
  const simples: PlateStock[] = [
    { weightKg: 10, quantity: 4 },
    { weightKg: 5, quantity: 4 },
  ];

  it("enumera as cargas possíveis, da menor para a maior", () => {
    const loads = achievableLoads(simples, 20);
    expect(loads[0]).toBe(20);
    expect(loads).toContain(30); // 1 par de 5
    expect(loads).toContain(40); // 1 par de 10
    expect(loads).toContain(70); // 2 pares de 10 + 1 par de 5
    expect([...loads].sort((a, b) => a - b)).toEqual(loads);
  });

  it("sem anilha, a única carga é a barra", () => {
    expect(achievableLoads([], 20)).toEqual([20]);
  });

  it("a carga mais próxima de um alvo impossível é declarada", () => {
    expect(closestAchievable(simples, 20, 33)).toBe(30);
    expect(closestAchievable(simples, 20, 37)).toBe(40);
  });

  it("sem estoque nem barra devolve a única opção (zero)", () => {
    expect(closestAchievable([], 0, 50)).toBe(0);
  });
});

describe("rótulos", () => {
  it("descreve as anilhas por lado", () => {
    expect(plateLabel([{ weightKg: 20, pairs: 2 }, { weightKg: 5, pairs: 1 }])).toBe(
      "2 × 20 kg + 1 × 5 kg",
    );
  });

  it("sem anilha diz 'só a barra'", () => {
    expect(plateLabel([])).toBe("Só a barra");
  });

  it("formata com vírgula decimal e sem zero à toa", () => {
    expect(formatPlateWeight(20)).toBe("20 kg");
    expect(formatPlateWeight(1.25)).toBe("1,25 kg");
    expect(formatPlateWeight(2.5)).toBe("2,5 kg");
  });
});
