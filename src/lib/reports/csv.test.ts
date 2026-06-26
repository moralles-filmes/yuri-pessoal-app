import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/reports/csv";

describe("toCsv", () => {
  it("gera cabeçalho + linhas com separador ';'", () => {
    const csv = toCsv([
      { mes: "2026-06", total: 1200.5 },
      { mes: "2026-07", total: 980 },
    ]);
    expect(csv).toBe("mes;total\r\n2026-06;1200.5\r\n2026-07;980");
  });

  it("escapa aspas, ';' e quebras de linha", () => {
    const csv = toCsv([{ nome: 'Cartão "Ouro"; Nubank', obs: "linha1\nlinha2" }]);
    expect(csv).toContain('"Cartão ""Ouro""; Nubank"');
    expect(csv).toContain('"linha1\nlinha2"');
  });

  it("respeita a ordem de colunas explícita e valores ausentes viram vazio", () => {
    const csv = toCsv([{ a: 1, b: 2 }], ["b", "a", "c"]);
    expect(csv).toBe("b;a;c\r\n2;1;");
  });

  it("sem linhas retorna só o cabeçalho", () => {
    expect(toCsv([], ["x", "y"])).toBe("x;y");
    expect(toCsv([])).toBe("");
  });
});
