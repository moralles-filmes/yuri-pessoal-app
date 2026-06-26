import { describe, expect, it } from "vitest";
import {
  formatAmount,
  formatHabitValue,
  glassesToUnit,
  WATER_GLASS_ML,
} from "@/lib/habits/constants";

describe("conversão de água", () => {
  it("1 copo = 250 ml documentado", () => {
    expect(WATER_GLASS_ML).toBe(250);
  });
  it("copos → ml", () => {
    expect(glassesToUnit(8, "ml")).toBe(2000);
  });
  it("copos → litros", () => {
    expect(glassesToUnit(8, "litros")).toBe(2);
    expect(glassesToUnit(2, "litros")).toBe(0.5);
  });
  it("unidade 'vezes': 1 copo = 1 vez", () => {
    expect(glassesToUnit(3, "vezes")).toBe(3);
  });
});

describe("formatação de valores pt-BR", () => {
  it("remove casas decimais desnecessárias", () => {
    expect(formatAmount(8)).toBe("8");
    expect(formatAmount(1.5)).toBe("1,5");
    expect(formatAmount(0.25)).toBe("0,25");
  });
  it("formata valor + unidade com plural correto", () => {
    expect(formatHabitValue(1, "paginas")).toBe("1 página");
    expect(formatHabitValue(10, "paginas")).toBe("10 páginas");
    expect(formatHabitValue(30, "minutos")).toBe("30 min");
  });
});
