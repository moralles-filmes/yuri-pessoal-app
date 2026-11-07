import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { foraDaJanelaLida, MESES_DA_PROJECAO, ultimoMesLido } from "./janela-lida";
import { janelaDoRelatorio } from "./pipeline";

describe("ultimoMesLido", () => {
  it("é o mês atual + 5 (a projeção de 6 meses)", () => {
    expect(MESES_DA_PROJECAO).toBe(6);
    expect(ultimoMesLido("2026-11")).toBe("2027-04");
    expect(ultimoMesLido("2026-08")).toBe("2027-01");
    expect(ultimoMesLido("2026-01")).toBe("2026-06");
  });

  it("bate com o último mês que janelaDoRelatorio lê (a mesma janela, nas duas pontas)", () => {
    for (const m of ["2026-01", "2026-07", "2026-08", "2026-11", "2026-12"]) {
      expect(ultimoMesLido(m)).toBe(janelaDoRelatorio({ mesSel: m, mesAtual: m }).projMeses.at(-1));
    }
  });
});

describe("foraDaJanelaLida", () => {
  it("o último mês lido ainda tem número: null", () => {
    expect(foraDaJanelaLida("2027-04", "2026-11")).toBeNull();
  });

  it("um mês além da janela devolve o último mês lido", () => {
    expect(foraDaJanelaLida("2027-05", "2026-11")).toBe("2027-04");
  });

  it("um mês dentro da janela (inclusive o atual) não está fora", () => {
    expect(foraDaJanelaLida("2026-11", "2026-11")).toBeNull();
    expect(foraDaJanelaLida("2025-01", "2026-11")).toBeNull();
  });
});

describe("janela-lida.ts", () => {
  it("não tem import: vai para o bundle do cliente", () => {
    const fonte = readFileSync(path.resolve(__dirname, "janela-lida.ts"), "utf8");
    expect(fonte).not.toMatch(/^import\s/m);
  });
});
