import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apresentarEntradas } from "@/lib/finance/entradas-do-card";

/**
 * Congela o hoje antes do conserto da B1; o diff do commit seguinte mostra
 * o detalhe que passa a existir.
 */
describe("apresentarEntradas", () => {
  const comTerceiros = { entradas: 1000, entradasMeu: 400, entradasTerceiros: 600 };

  it("o número principal é sempre o bruto", () => {
    expect(apresentarEntradas(comTerceiros).valor).toBe(1000);
  });

  it("HOJE nenhuma linha de terceiros aparece, mesmo com R$ 600 de terceiros", () => {
    expect(apresentarEntradas(comTerceiros).detalhe).toBeNull();
  });

  it("sem terceiros, nenhuma linha", () => {
    expect(apresentarEntradas({
      entradas: 1000,
      entradasMeu: 1000,
      entradasTerceiros: 0,
    }).detalhe).toBeNull();
  });

  it.each([
    "src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx",
    "src/app/(app)/relatorios/relatorios-client.tsx",
    "src/components/dashboard/general/finance-card.tsx",
  ])("os três cards de Entradas leem só do apresentador: %s", (arquivo) => {
    const fonte = fs.readFileSync(path.join(process.cwd(), arquivo), "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\r\n]*/g, "");

    expect(fonte).toContain("apresentarEntradas(");
    expect(fonte).not.toMatch(/formatCurrency\(\s*[\w.?]*\.entradas\s*\)/);
  });
});
