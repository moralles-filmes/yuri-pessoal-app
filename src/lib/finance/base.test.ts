/**
 * REDESIGN-03-E · T4a — `baseDaUrl`: só a igualdade exata liga a base caixa.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { baseDaUrl, ROTULO_DA_BASE } from "@/lib/finance/base";

describe("baseDaUrl", () => {
  it("'caixa' exato liga a base caixa", () => {
    expect(baseDaUrl("caixa")).toBe("caixa");
  });

  it.each([
    ["Caixa", "Caixa"],
    ["'caixa ' (espaço depois)", "caixa "],
    ["' caixa' (espaço antes)", " caixa"],
    ["CAIXA", "CAIXA"],
    ["vazio", ""],
    ["'competencia'", "competencia"],
    ["lista ['caixa']", ["caixa"]],
    ["undefined", undefined],
    ["null", null],
    ["número 1", 1],
  ])("%s cai em competência", (_nome, valor) => {
    expect(baseDaUrl(valor)).toBe("competencia");
  });
});

describe("ROTULO_DA_BASE", () => {
  it("escreve os dois textos da tela", () => {
    expect(ROTULO_DA_BASE).toEqual({ competencia: "Competência", caixa: "Caixa realizado" });
  });
});

describe("base.ts é lido pela tela", () => {
  it("não tem import de runtime (só `import type`)", () => {
    const fonte = readFileSync(path.resolve(__dirname, "base.ts"), "utf8");
    const imports = fonte.split("\n").filter((l) => /^\s*import\s/.test(l));
    const deRuntime = imports.filter((l) => !/^\s*import\s+type\s/.test(l));
    expect(deRuntime).toEqual([]);
  });
});
