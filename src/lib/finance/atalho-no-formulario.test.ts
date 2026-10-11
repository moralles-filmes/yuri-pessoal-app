/** 03-C2 · A5 — a fiação do atalho no formulário (o projeto não tem teste de componente). */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ARQ = path.resolve(
  __dirname, "..", "..", "app", "(app)", "financeiro", "lancamentos", "transaction-form.tsx",
);
const semComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const FORM = semComentarios(fs.readFileSync(ARQ, "utf8"));

describe("03-C2 · A5 — o atalho no formulário de lançamento", () => {
  it("a regra é a pura, e o modo de edição é passado a ela", () => {
    expect(FORM).toContain("aplicarAtalhoDaCategoria(");
    expect(FORM).toMatch(/modo:\s*isEdit\s*\?\s*"editar"\s*:\s*"criar"/);
  });
  it("os DOIS gatilhos reavaliam o atalho: trocar o tipo e trocar a categoria (Review Focus 1)", () => {
    expect(FORM.match(/reavaliarAtalho\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3); // definição + 2 chamadas
  });
  it("a escolha no seletor vira do usuário, e reabrir o diálogo volta a origem a 'padrao' (Review Focus 2)", () => {
    expect(FORM).toContain('setOrigem("usuario")');
    expect(FORM).toMatch(/onOpenChange=\{\(v\)\s*=>\s*\{[^}]*setOrigem\("padrao"\)/);
  });
  it("o payload não ganha chave: a origem não vai ao servidor", () => {
    expect(FORM).not.toMatch(/origem\s*:/);
  });
});

const FILTROS = semComentarios(
  fs.readFileSync(path.resolve(path.dirname(ARQ), "transaction-filters.tsx"), "utf8"),
);

describe("03-C2 · A6 — a barra de filtros", () => {
  it("o 'Limpar' alcança o filtro novo: 'marcadas' está na lista de hasFilters", () => {
    const lista = FILTROS.match(/const hasFilters = \[([\s\S]*?)\]/)?.[1] ?? "";
    expect(lista).toContain('"marcadas"');
  });
});
