import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { apresentarEntradas } from "@/lib/finance/entradas-do-card";
import { formatCurrency } from "@/lib/format";

/**
 * Preserva o número bruto e mostra a separação na dica quando há terceiros.
 */
describe("apresentarEntradas", () => {
  const comTerceiros = { entradas: 1000, entradasMeu: 400, entradasTerceiros: 600 };

  it("o número principal é sempre o bruto", () => {
    expect(apresentarEntradas(comTerceiros).valor).toBe(1000);
  });

  it("com terceiros, a dica mostra a minha parte e a de terceiros", () => {
    expect(apresentarEntradas(comTerceiros).detalhe).toBe(
      `minha ${formatCurrency(400)} · de terceiros ${formatCurrency(600)}`,
    );
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
