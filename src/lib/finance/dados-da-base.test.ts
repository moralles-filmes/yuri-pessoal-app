import { describe, expect, it } from "vitest";
import { dadosDaBase } from "@/lib/finance/dados-da-base";

describe("dadosDaBase — de qual base sai o número do gráfico (desenho 2026-10-18)", () => {
  it("competência: sempre o de competência", () => {
    expect(dadosDaBase({ base: "competencia", caixa: null, competencia: [1] })).toEqual([1]);
  });

  it("caixa lido: o de caixa", () => {
    expect(dadosDaBase({ base: "caixa", caixa: [2], competencia: [1] })).toEqual([2]);
  });

  it("caixa com erro de leitura: NADA — nunca cai para competência com rótulo de caixa", () => {
    expect(dadosDaBase({ base: "caixa", caixa: null, competencia: [1] })).toBeNull();
  });
});
