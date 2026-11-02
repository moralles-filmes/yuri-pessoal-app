import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CategoriaSlice } from "@/lib/finance/dashboard";
import { reaisParaCentavos } from "@/lib/format";
import { dobrarEmOutros } from "./rosca";

/**
 * 06, Tarefa 5 — D15: acima de 8 categorias, as 7 maiores + "Outros (N categorias)".
 */

const cat = (name: string, meu: number, categoryId: string | null = name): CategoriaSlice => ({
  categoryId,
  name,
  color: null,
  movimentado: meu,
  meu,
});

const somaCentavos = (fatias: readonly CategoriaSlice[]) =>
  fatias.reduce((s, f) => s + reaisParaCentavos(f.meu), 0);

describe("dobrarEmOutros", () => {
  it("8 fatias devolvem 8, nenhuma com 'dobradas'", () => {
    const entrada = [
      cat("A", 800),
      cat("B", 700),
      cat("C", 600),
      cat("D", 500),
      cat("E", 400),
      cat("F", 300),
      cat("G", 200),
      cat("H", 100),
    ];
    const saida = dobrarEmOutros(entrada);
    expect(saida).toHaveLength(8);
    for (const f of saida) expect(f.dobradas).toBeUndefined();
  });

  it("9 fatias devolvem 8, a última é 'Outros (2 categorias)' com os 2 menores dobrados", () => {
    const entrada = [
      cat("Alimentação", 900),
      cat("Moradia", 800),
      cat("Transporte", 700),
      cat("Lazer", 600),
      cat("Saúde", 500),
      cat("Educação", 400),
      cat("Vestuário", 300),
      cat("Pets", 200),
      cat("Viagem", 100),
    ];
    const saida = dobrarEmOutros(entrada);
    expect(saida).toHaveLength(8);
    expect(saida.slice(0, 7).map((f) => f.name)).toEqual([
      "Alimentação",
      "Moradia",
      "Transporte",
      "Lazer",
      "Saúde",
      "Educação",
      "Vestuário",
    ]);
    const outros = saida[7];
    expect(outros.name).toBe("Outros (2 categorias)");
    expect(outros.categoryId).toBeNull();
    expect(outros.dobradas).toEqual(["Pets", "Viagem"]);
    expect(outros.meu).toBe(300);
  });

  it("Σ reaisParaCentavos(meu) da saída é igual à da entrada, com centavos quebrados", () => {
    const entrada = [
      cat("A", 10.01),
      cat("B", 0.02),
      cat("C", 3.33),
      cat("D", 7.77),
      cat("E", 1.11),
      cat("F", 0.05),
      cat("G", 2.22),
      cat("H", 4.44),
      cat("I", 0.99),
      cat("J", 5.55),
    ];
    const saida = dobrarEmOutros(entrada);
    expect(saida).toHaveLength(8);
    expect(somaCentavos(saida)).toBe(somaCentavos(entrada));
    const outros = saida[7];
    // As três dobradas são as de menor valor: 0,99 + 0,05 + 0,02 = 1,06.
    expect(outros.dobradas).toEqual(["I", "F", "B"]);
    expect(reaisParaCentavos(outros.meu)).toBe(106);
  });

  it("empate na fronteira: fica a de nome alfabeticamente menor, nos dois sentidos da entrada", () => {
    // Seis grandes, depois dois empatados em 300 (Zeta e Alfa) e uma pequena. A 7ª posição é a do empate.
    const base = [
      cat("N1", 900),
      cat("N2", 800),
      cat("N3", 700),
      cat("N4", 600),
      cat("N5", 500),
      cat("N6", 400),
      cat("Zeta", 300),
      cat("Alfa", 300),
      cat("Pequena", 100),
    ];
    const ida = dobrarEmOutros([...base]);
    const volta = dobrarEmOutros([...base].reverse());

    for (const saida of [ida, volta]) {
      const nomesNoTopo = saida.slice(0, 7).map((f) => f.name);
      expect(nomesNoTopo).toContain("Alfa");
      expect(nomesNoTopo).not.toContain("Zeta");
      expect(saida[7].dobradas).toEqual(["Zeta", "Pequena"]);
    }
    expect(ida).toEqual(volta);
  });

  it("varredura da fachada: dobra depois de dadosDaRosca e foraDaRosca continua com as categorias originais", () => {
    const fonte = readFileSync(
      join(process.cwd(), "src", "components", "dashboard", "rosca-categorias-chart.tsx"),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(fonte).toContain("dobrarEmOutros(dadosDaRosca(");
    expect(fonte).toContain("foraDaRosca(categorias");
  });
});
