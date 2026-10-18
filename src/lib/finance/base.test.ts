/**
 * REDESIGN-03-E · T4a — `baseDaUrl`: só a igualdade exata liga a base caixa.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { baseDaUrl, marcaDaLiquidacao, ROTULO_DA_BASE } from "@/lib/finance/base";

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

describe("03-E · A4 — marcaDaLiquidacao (K1)", () => {
  it("data de pagamento diferente da competência vira 'pago em DD/MM', do texto e sem Date", () => {
    expect(
      marcaDaLiquidacao({ liquidado_em: "2026-10-05", competence_date: "2026-10-03", status: "pago" }),
    ).toBe("pago em 05/10");
  });

  it("numa receita recebida, 'recebido em'", () => {
    expect(
      marcaDaLiquidacao({ liquidado_em: "2026-11-01", competence_date: "2026-10-30", status: "recebido" }),
    ).toBe("recebido em 01/11");
  });

  it("sem data, ou igual à competência, não há marca", () => {
    expect(marcaDaLiquidacao({ liquidado_em: null, competence_date: "2026-10-03", status: "pago" })).toBeNull();
    expect(marcaDaLiquidacao({ liquidado_em: "", competence_date: "2026-10-03", status: "pago" })).toBeNull();
    expect(
      marcaDaLiquidacao({ liquidado_em: "2026-10-03", competence_date: "2026-10-03", status: "pago" }),
    ).toBeNull();
  });
});
