/** 03-C2 · A4 — a fiação da tela de categorias (o projeto não tem teste de componente). */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DIR = path.resolve(__dirname, "..", "..", "app", "(app)", "financeiro", "categorias");
const semComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const FORM = semComentarios(fs.readFileSync(path.join(DIR, "category-form.tsx"), "utf8"));
const LISTA = semComentarios(fs.readFileSync(path.join(DIR, "categories-client.tsx"), "utf8"));

describe("03-C2 · A4 — fiação da tela de categorias", () => {
  it("o payload da categoria passa por marcacaoParaGravar (P2)", () => {
    expect(FORM).toMatch(/classificacao_padrao:\s*marcacaoParaGravar\(/);
  });
  it("os erros do servidor passam por mapServerFieldErrors", () => {
    expect(FORM).toContain("mapServerFieldErrors(");
    expect(FORM).not.toContain("applyFieldErrors(");
  });
  it("a lista sai de agruparCategoriasPorTipo", () => {
    expect(LISTA).toContain("agruparCategoriasPorTipo(");
  });
});
