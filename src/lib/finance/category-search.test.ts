import { describe, expect, it } from "vitest";
import {
  categoriaServeAoTipo,
  categoriasDoTipo,
  filtrarOpcoesDeCategoria,
  normalizarBusca,
  rotuloDaCategoria,
} from "./category-search";

const CATS = [
  { id: "ali", name: "Alimentação", color: "#f00" },
  { id: "mor", name: "Moradia", color: null },
  { id: "tra", name: "Transporte" },
];
const SUBS = [
  { id: "deli", name: "Delivery", category_id: "ali" },
  { id: "rest", name: "Restaurante", category_id: "ali" },
  { id: "alug", name: "Aluguel", category_id: "mor" },
];

const chaves = (busca: string) =>
  filtrarOpcoesDeCategoria(CATS, SUBS, busca).map((o) => o.key);

describe("normalizarBusca", () => {
  it("tira acento e caixa", () => {
    expect(normalizarBusca("  ALIMENTAÇÃO ")).toBe("alimentacao");
  });
});

describe("filtrarOpcoesDeCategoria", () => {
  it("busca vazia devolve tudo, cada categoria seguida das suas subcategorias", () => {
    expect(chaves("")).toEqual(["ali", "ali:deli", "ali:rest", "mor", "mor:alug", "tra"]);
  });

  it("categoria que casa entra com todas as subcategorias", () => {
    expect(chaves("alimenta")).toEqual(["ali", "ali:deli", "ali:rest"]);
  });

  it("subcategoria que casa entra sob a categoria, sem as irmãs", () => {
    expect(chaves("deliv")).toEqual(["ali", "ali:deli"]);
  });

  it("ignora acento e caixa", () => {
    expect(chaves("ALIMENTACAO")).toEqual(["ali", "ali:deli", "ali:rest"]);
  });

  it("todos os termos precisam casar, somando categoria e subcategoria", () => {
    expect(chaves("ali rest")).toEqual(["ali", "ali:rest"]);
    expect(chaves("moradia rest")).toEqual([]);
  });

  it("a opção de subcategoria carrega a categoria dela", () => {
    const sub = filtrarOpcoesDeCategoria(CATS, SUBS, "aluguel").find(
      (o) => o.subcategoryId === "alug",
    );
    expect(sub).toMatchObject({ categoryId: "mor", categoryName: "Moradia", color: null });
  });

  it("sem subcategorias, funciona como lista de categorias", () => {
    expect(filtrarOpcoesDeCategoria(CATS, [], "tra").map((o) => o.key)).toEqual(["tra"]);
  });
});

describe("categoriasDoTipo", () => {
  const TIPADAS = [
    { id: "d", kind: "despesa" },
    { id: "r", kind: "receita" },
    { id: "a", kind: "ambos" },
  ];
  const ids = (tipo: string | null, manter?: string) =>
    categoriasDoTipo(TIPADAS, tipo, manter).map((c) => c.id);

  it("despesa vê despesa e ambos; receita vê receita e ambos", () => {
    expect(ids("despesa")).toEqual(["d", "a"]);
    expect(ids("receita")).toEqual(["r", "a"]);
  });

  it("ajuste (ou tipo desconhecido) vê todas", () => {
    expect(ids("ajuste")).toEqual(["d", "r", "a"]);
    expect(ids(null)).toEqual(["d", "r", "a"]);
  });

  it("a categoria já escolhida fica na lista mesmo sendo do outro tipo", () => {
    expect(ids("receita", "d")).toEqual(["d", "r", "a"]);
  });

  it("categoriaServeAoTipo decide a limpeza ao trocar o tipo", () => {
    expect(categoriaServeAoTipo("despesa", "receita")).toBe(false);
    expect(categoriaServeAoTipo("ambos", "receita")).toBe(true);
  });
});

describe("rotuloDaCategoria", () => {
  it("mostra categoria › subcategoria", () => {
    expect(rotuloDaCategoria(CATS, SUBS, { categoryId: "ali", subcategoryId: "deli" })).toBe(
      "Alimentação › Delivery",
    );
  });

  it("subcategoria de outra categoria não aparece", () => {
    expect(rotuloDaCategoria(CATS, SUBS, { categoryId: "mor", subcategoryId: "deli" })).toBe(
      "Moradia",
    );
  });

  it("sem categoria, ou categoria fora da lista, devolve null", () => {
    expect(rotuloDaCategoria(CATS, SUBS, { categoryId: null, subcategoryId: null })).toBeNull();
    expect(rotuloDaCategoria(CATS, SUBS, { categoryId: "x", subcategoryId: null })).toBeNull();
  });
});
