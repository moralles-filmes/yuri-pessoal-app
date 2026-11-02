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

  // K1 (04-A, decisão do dono): o painel financeiro troca o card de Entradas pelo indicador
  // "Minhas entradas", que lê `indicadorMinhasEntradas` (a minha parte); `apresentarEntradas` NÃO
  // muda e segue sendo a fonte única da tela de relatórios. Na 06 o RR4 foi para a faixa do Resumo
  // financeiro (D-06-2): o card Financeiro do dashboard geral não mostra mais Entradas.
  it.each(["src/app/(app)/relatorios/relatorios-client.tsx"])(
    "os cards de Entradas que restam leem só do apresentador: %s",
    (arquivo) => {
      const fonte = fs.readFileSync(path.join(process.cwd(), arquivo), "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\r\n]*/g, "");

      expect(fonte).toContain("apresentarEntradas(");
      expect(fonte).not.toMatch(/formatCurrency\(\s*[\w.?]*\.entradas\s*\)/);
    },
  );

  it("D-06-2 — as entradas do dashboard geral vivem na faixa (entradasInd), não no card Financeiro", () => {
    const ler = (arquivo: string) =>
      fs.readFileSync(path.join(process.cwd(), arquivo), "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\r\n]*/g, "");
    const card = ler("src/components/dashboard/general/finance-card.tsx");
    const faixa = ler("src/components/dashboard/general/resumo-financeiro.tsx");
    expect(card).not.toMatch(/formatCurrency\(\s*[\w.?]*\.entradas\s*\)/);
    expect(faixa).toContain("entradasInd");
  });

  it("K1 (04-A) — o painel financeiro lê Entradas só de indicadorMinhasEntradas, nunca do bruto", () => {
    const ler = (arquivo: string) =>
      fs.readFileSync(path.join(process.cwd(), arquivo), "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\r\n]*/g, "");
    const pagina = ler("src/app/(app)/dashboard/financeiro/page.tsx");
    const cliente = ler("src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx");
    expect(pagina).toContain("indicadorMinhasEntradas(");
    expect(cliente).not.toMatch(/formatCurrency\(\s*[\w.?]*\.entradas\s*\)/);
    expect(pagina).not.toMatch(/formatCurrency\(\s*[\w.?]*\.entradas\s*\)/);
  });
});
