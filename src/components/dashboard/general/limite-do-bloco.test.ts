/**
 * REDESIGN-06 (§6) — o limite de erro por bloco, por varredura do código-fonte (o projeto não
 * tem teste de componente — invariante 25).
 *
 * O que cai aqui: o limite deixar de usar o `catchError` do Next (que relê os dados e só então
 * troca a falha pelo conteúdo, e deixa `redirect()`/`notFound()` passarem), perder a frase da
 * falha, ou virar um Link (que mantém o limite com erro e perde o `?periodo`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const bruto = readFileSync(join(__dirname, "limite-do-bloco.tsx"), "utf8");
const codigo = bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("06 · LimiteDoBloco", () => {
  it("é Client Component", () => {
    expect(bruto.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("usa o limite de erro do Next, não uma classe própria", () => {
    expect(codigo).toContain('from "next/error"');
    expect(codigo).toContain("catchError(");
    expect(codigo).not.toContain("getDerivedStateFromError");
  });

  it("a nova tentativa relê os dados sem sair da página", () => {
    expect(codigo).toContain("retry()");
    expect(codigo).not.toContain('href="/dashboard"');
  });

  it("diz por que o card fica sem valores", () => {
    expect(codigo).toContain("O card fica sem valores para não mostrar um número errado.");
  });
});
