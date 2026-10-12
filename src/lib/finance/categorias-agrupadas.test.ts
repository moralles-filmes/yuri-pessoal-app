import { describe, expect, it } from "vitest";
import { agruparCategoriasPorTipo } from "@/lib/finance/categorias-agrupadas";

const c = (id: string, kind: string) => ({ id, kind });

describe("03-C2 · A4 — agruparCategoriasPorTipo", () => {
  const entrada = [c("a", "receita"), c("b", "despesa"), c("c", "ambos"), c("d", "despesa"), c("e", "receita")];
  const grupos = agruparCategoriasPorTipo(entrada);

  it("nenhuma categoria some: a soma dos grupos é o total", () => {
    expect(grupos.flatMap((g) => g.categorias)).toHaveLength(entrada.length);
  });
  it("cada categoria está no grupo do seu tipo", () => {
    for (const g of grupos) for (const cat of g.categorias) expect(cat.kind).toBe(g.chave);
  });
  it("a ordem dos grupos é a de CATEGORY_KINDS, com os títulos", () => {
    expect(grupos.map((g) => [g.chave, g.titulo])).toEqual([
      ["despesa", "Despesas"],
      ["receita", "Receitas"],
      ["ambos", "Receitas e despesas"],
    ]);
  });
  it("a ordem interna é a de entrada", () => {
    expect(grupos[0].categorias.map((x) => x.id)).toEqual(["b", "d"]);
    expect(grupos[1].categorias.map((x) => x.id)).toEqual(["a", "e"]);
  });
  it("grupo vazio some", () => {
    expect(agruparCategoriasPorTipo([c("a", "receita")]).map((g) => g.chave)).toEqual(["receita"]);
  });
  it("tipo fora da lista vai para o último grupo em vez de sumir", () => {
    const comEstranha = agruparCategoriasPorTipo([c("a", "receita"), c("z", "inventado")]);
    expect(comEstranha.at(-1)).toMatchObject({ chave: "desconhecido", titulo: "Tipo não reconhecido" });
    expect(comEstranha.at(-1)?.categorias.map((x) => x.id)).toEqual(["z"]);
  });
});
