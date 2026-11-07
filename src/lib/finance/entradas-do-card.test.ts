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
  // muda. 04-A2 (L2, desenho §7): o RELATÓRIO saiu da lista — a aba Financeiro monta os
  // indicadores por `indicadoresDoResumo`, a mesma função do painel. 06 (D-06-2): o card Financeiro
  // do dashboard geral também saiu — as entradas foram para a faixa do Resumo financeiro. Na
  // integração das duas, nenhuma tela lê mais do apresentador; a função fica (só o teste a usa)
  // como pendência de limpeza declarada, não apagada.
  it.each([
    "src/app/(app)/relatorios/relatorios-client.tsx",
    "src/components/dashboard/general/finance-card.tsx",
  ])(
    "nenhum consumidor antigo volta a ler do apresentador nem do bruto: %s",
    (arquivo) => {
      const fonte = fs.readFileSync(path.join(process.cwd(), arquivo), "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\r\n]*/g, "");

      expect(fonte).not.toContain("apresentarEntradas(");
      expect(fonte).not.toMatch(/formatCurrency\(\s*[\w.?]*\.entradas\s*\)/);
    },
  );

  it("L2 (04-A2) — o relatório não usa apresentarEntradas: os indicadores saem de indicadoresDoResumo, como no painel", () => {
    const ler = (arquivo: string) =>
      fs.readFileSync(path.join(process.cwd(), arquivo), "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\r\n]*/g, "");
    expect(ler("src/app/(app)/relatorios/relatorios-client.tsx")).not.toContain("apresentarEntradas(");
    expect(ler("src/lib/reports/financeiro.ts")).toContain("indicadoresDoResumo(");
  });

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
    // 04-A2 (D-A2-15): a chamada saiu da página para `indicadoresDoResumo` (`finance/painel.ts`),
    // compartilhada com o relatório. A garantia é a mesma — o número vem de `indicadorMinhasEntradas`
    // — e ela pode estar em UM dos dois lugares.
    const painel = ler("src/lib/finance/painel.ts");
    // A função é DEFINIDA em painel.ts, então `includes("indicadorMinhasEntradas(")` ali é sempre
    // verdadeiro. A garantia é a CHAMADA: tira-se a linha da definição antes de procurar.
    const chamaSemDefinir = (fonte: string) =>
      fonte.replace(/export function indicadorMinhasEntradas\(/g, "").includes("indicadorMinhasEntradas(");
    expect(chamaSemDefinir(painel), "indicadoresDoResumo chama indicadorMinhasEntradas").toBe(true);
    expect(chamaSemDefinir(pagina) || chamaSemDefinir(painel)).toBe(true);
    expect(cliente).not.toMatch(/formatCurrency\(\s*[\w.?]*\.entradas\s*\)/);
    expect(pagina).not.toMatch(/formatCurrency\(\s*[\w.?]*\.entradas\s*\)/);
  });
});
