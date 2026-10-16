import { describe, expect, it } from "vitest";
import { rotuloDoCampo, textoDoCampo } from "./texto-do-campo";

describe("textoDoCampo — o campo tocado com forma de gente", () => {
  it("instante vira dia e hora em Brasília, não ISO em UTC", () => {
    // 01:30 UTC do dia 13 ainda é 22:30 do dia 12 em Brasília.
    expect(textoDoCampo("2026-10-13T01:30:00.000Z")).toBe("12/10/2026 às 22:30");
  });

  it("data pura vira dd/mm/aaaa sem passar por fuso", () => {
    expect(textoDoCampo("2026-10-12")).toBe("12/10/2026");
  });

  it("uuid vira 'registro interno'", () => {
    expect(textoDoCampo("3f2b8c1e-9a4d-4c2b-8e7f-1a2b3c4d5e6f")).toBe("registro interno");
  });

  it("booleano, número, nulo e texto", () => {
    expect(textoDoCampo(true)).toBe("sim");
    expect(textoDoCampo(false)).toBe("não");
    expect(textoDoCampo(47.9)).toBe("47.9");
    expect(textoDoCampo(null)).toBe("sem valor");
    expect(textoDoCampo("Comprar pão")).toBe("Comprar pão");
  });

  it("os rótulos novos e a chave desconhecida", () => {
    expect(rotuloDoCampo("modulo")).toBe("Módulo");
    expect(rotuloDoCampo("expires_at")).toBe("Válida até");
    expect(rotuloDoCampo("campo_novo")).toBe("campo_novo");
    // `Object.hasOwn`: uma chave do protótipo não vira rótulo.
    expect(rotuloDoCampo("toString")).toBe("toString");
  });
});
