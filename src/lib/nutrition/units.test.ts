import { describe, expect, it } from "vitest";
import {
  convertToBase,
  defaultMeasure,
  describeMeasure,
  formatAmount,
  toBaseUnitValue,
  type ConvertibleFood,
  type ConvertibleMeasure,
} from "./units";

const arroz: ConvertibleFood = { baseQuantity: 100, baseUnit: "g" };
const leite: ConvertibleFood = { baseQuantity: 100, baseUnit: "ml" };
const whey: ConvertibleFood = { baseQuantity: 30, baseUnit: "g" };

const colherArroz: ConvertibleMeasure = { label: "Colher de sopa", grams: 25, milliliters: null };
const copo: ConvertibleMeasure = { label: "Copo", grams: null, milliliters: 200 };
const semConversao = { label: "Punhado", grams: null, milliliters: null } as ConvertibleMeasure;

describe("convertToBase — sem medida caseira", () => {
  it("trata a quantidade como já estando na unidade-base", () => {
    const result = convertToBase(150, null, arroz);
    expect(result).toEqual({ ok: true, amount: 150, unit: "g", factor: 1.5 });
  });

  it("usa a base do alimento, não 100 fixo", () => {
    // Whey com base de 30 g: 60 g consumidos = 2 porções-base.
    const result = convertToBase(60, null, whey);
    expect(result.ok && result.factor).toBe(2);
  });

  it("respeita base em mililitros", () => {
    const result = convertToBase(250, null, leite);
    expect(result.ok && result.unit).toBe("ml");
    expect(result.ok && result.factor).toBe(2.5);
  });
});

describe("convertToBase — com medida caseira", () => {
  it("multiplica pela conversão em gramas", () => {
    const result = convertToBase(3, colherArroz, arroz);
    expect(result.ok && result.amount).toBe(75);
    expect(result.ok && result.factor).toBe(0.75);
  });

  it("multiplica pela conversão em mililitros", () => {
    const result = convertToBase(2, copo, leite);
    expect(result.ok && result.amount).toBe(400);
    expect(result.ok && result.factor).toBe(4);
  });

  it("aceita quantidade fracionada", () => {
    const result = convertToBase(1.5, colherArroz, arroz);
    expect(result.ok && result.amount).toBe(37.5);
  });

  it("escolhe a conversão que casa com a base quando a medida tem as duas", () => {
    const azeite: ConvertibleMeasure = { label: "Colher", grams: 9, milliliters: 10 };
    expect(convertToBase(1, azeite, { baseQuantity: 100, baseUnit: "g" }).ok).toBe(true);
    expect(convertToBase(1, azeite, arroz)).toMatchObject({ amount: 9 });
    expect(convertToBase(1, azeite, leite)).toMatchObject({ amount: 10 });
  });
});

describe("convertToBase — falhas explícitas (nunca estimativa)", () => {
  it("recusa medida sem nenhuma conversão", () => {
    expect(convertToBase(1, semConversao, arroz)).toEqual({
      ok: false,
      reason: "medida_sem_conversao",
    });
  });

  it("NÃO converte gramas em mililitros por conta própria (faltaria densidade)", () => {
    // Medida só em gramas, alimento medido em ml: sem densidade não há conversão honesta.
    expect(convertToBase(1, colherArroz, leite)).toEqual({
      ok: false,
      reason: "unidade_incompativel",
    });
  });

  it("NÃO converte mililitros em gramas por conta própria", () => {
    expect(convertToBase(1, copo, arroz)).toEqual({ ok: false, reason: "unidade_incompativel" });
  });

  it("recusa quantidade zero, negativa ou inválida", () => {
    for (const q of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(convertToBase(q, null, arroz)).toEqual({ ok: false, reason: "quantidade_invalida" });
    }
  });

  it("recusa alimento com base inválida", () => {
    expect(convertToBase(10, null, { baseQuantity: 0, baseUnit: "g" })).toEqual({
      ok: false,
      reason: "base_invalida",
    });
  });
});

describe("describeMeasure", () => {
  it("mostra a conversão na unidade do alimento", () => {
    expect(describeMeasure(colherArroz, "g")).toBe("Colher de sopa (25 g)");
    expect(describeMeasure(copo, "ml")).toBe("Copo (200 ml)");
  });

  it("avisa quando não há conversão, em vez de inventar número", () => {
    expect(describeMeasure(semConversao, "g")).toBe("Punhado (sem conversão)");
    expect(describeMeasure(colherArroz, "ml")).toBe("Colher de sopa (sem conversão)");
  });
});

describe("defaultMeasure", () => {
  const medidas = [
    { isDefault: false, position: 2, label: "b" },
    { isDefault: false, position: 1, label: "a" },
    { isDefault: true, position: 3, label: "c" },
  ];

  it("prefere a marcada como padrão", () => {
    expect(defaultMeasure(medidas)?.label).toBe("c");
  });

  it("cai para a de menor posição quando nenhuma é padrão", () => {
    expect(defaultMeasure(medidas.filter((m) => !m.isDefault))?.label).toBe("a");
  });

  it("devolve nulo quando não há medidas", () => {
    expect(defaultMeasure([])).toBeNull();
  });
});

describe("toBaseUnitValue — conversões exatas por definição", () => {
  it("converte massa para gramas", () => {
    expect(toBaseUnitValue(1, "kg")).toEqual({ amount: 1000, base: "g" });
    expect(toBaseUnitValue(500, "mg")).toEqual({ amount: 0.5, base: "g" });
    expect(toBaseUnitValue(2, "g")).toEqual({ amount: 2, base: "g" });
  });

  it("converte volume para mililitros", () => {
    expect(toBaseUnitValue(1.5, "L")).toEqual({ amount: 1500, base: "ml" });
  });

  it("recusa unidade desconhecida em vez de chutar", () => {
    expect(toBaseUnitValue(1, "unidade")).toBeNull();
    expect(toBaseUnitValue(1, "xicara")).toBeNull();
  });
});

describe("formatAmount", () => {
  it("não deixa casas decimais inúteis", () => {
    expect(formatAmount(25)).toBe("25");
    expect(formatAmount(25.5)).toBe("25,5");
    expect(formatAmount(25.004)).toBe("25");
  });
});
