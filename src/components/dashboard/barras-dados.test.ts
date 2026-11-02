import { describe, expect, it } from "vitest";
import { temDadosNasBarras } from "./barras-dados";

describe("temDadosNasBarras", () => {
  it("lista vazia não tem dado", () => {
    expect(temDadosNasBarras([])).toBe(false);
  });

  it("só zeros não tem dado", () => {
    expect(temDadosNasBarras([{ entradas: 0, saidas: 0 }, { entradas: 0, saidas: 0 }])).toBe(false);
  });

  it("um positivo em entradas basta", () => {
    expect(temDadosNasBarras([{ entradas: 0, saidas: 0 }, { entradas: 10, saidas: 0 }])).toBe(true);
  });

  it("um positivo em saídas basta", () => {
    expect(temDadosNasBarras([{ entradas: 0, saidas: 0.01 }])).toBe(true);
  });
});
