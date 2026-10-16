import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AVISO_DE_GASTO, CUSTO_DA_IA } from "./gasto";

/**
 * REDESIGN-07-D · D2 — a frase de gasto é UMA (spec §6.2). Panoramas, compositor, "Gerar
 * análise" e o comprovante dizem a mesma coisa, com as mesmas palavras, antes do clique.
 */
describe("a frase de gasto", () => {
  it("diz para onde vai o custo", () => {
    expect(CUSTO_DA_IA).toBe("o custo estimado entra no seu orçamento e aparece em Consumo");
  });

  it("o aviso é a frase de custo, não uma segunda redação", () => {
    expect(AVISO_DE_GASTO).toBe(`Usa o provedor de IA que você configurou: ${CUSTO_DA_IA}.`);
  });

  it("os módulos são puros — gasto.ts só importa a frase de custo, que não importa nada", () => {
    const gasto = fs.readFileSync(path.join(__dirname, "gasto.ts"), "utf8");
    const imports = [...gasto.matchAll(/^\s*import\b[^;]*from "([^"]+)"/gm)].map((m) => m[1]);
    expect(imports).toEqual(["./custo-da-ia"]);
    const custo = fs.readFileSync(path.join(__dirname, "custo-da-ia.ts"), "utf8");
    expect(custo).not.toMatch(/^\s*import\b/m);
  });
});
