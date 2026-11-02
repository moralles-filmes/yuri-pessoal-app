/**
 * REDESIGN-06 (§6) — o limite de erro por bloco, por varredura do código-fonte (o projeto não
 * tem teste de componente — invariante 25).
 *
 * O que cai aqui: o limite deixar de ser um error boundary de classe, deixar de oferecer a nova
 * tentativa, perder a frase da falha, ou virar um Link (que mantém o boundary com erro).
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

  it("é um error boundary de classe", () => {
    expect(codigo).toContain("getDerivedStateFromError");
  });

  it("a nova tentativa recarrega os dados sem sair da página", () => {
    expect(codigo).toContain("router.refresh()");
    expect(codigo).not.toContain('href="/dashboard"');
  });

  it("diz por que o card fica sem valores", () => {
    expect(codigo).toContain("O card fica sem valores para não mostrar um número errado.");
  });
});
