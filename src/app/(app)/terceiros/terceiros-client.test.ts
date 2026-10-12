/**
 * 03-D · A5 — fiação da tela por varredura do fonte (o projeto não tem teste de componente,
 * invariante 25). A REGRA está em `recebimentos.test.ts`; aqui só se prova que a tela a usa.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const semComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const FONTE = semComentarios(
  fs.readFileSync(path.join(process.cwd(), "src", "app", "(app)", "terceiros", "terceiros-client.tsx"), "utf8"),
);

describe("03-D · A5 — a tela de terceiros", () => {
  it("não declara cópia local de status em aberto", () => {
    expect(FONTE).not.toMatch(/const\s+OPEN_STATUSES\b/);
  });
  it("as seções saem de secoesDaLista, e 'Não será cobrado' é uma delas (D11)", () => {
    expect(FONTE).toMatch(/secoesDaLista\(/);
    expect(FONTE).toMatch(/naoSeraCobrado/);
    expect(FONTE).toContain("Não será cobrado");
  });
  it("o estado é o DERIVADO", () => {
    expect(FONTE).toMatch(/estadoDoRecebivel\(/);
    expect(FONTE).toMatch(/EstadoDoRecebivelBadge/);
  });
  it("o diálogo de recebimento entra por next/dynamic + useLazyDialog", () => {
    expect(FONTE).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/registrar-recebimento-dialog["']\)/);
    expect(FONTE).toMatch(/useLazyDialog\(/);
  });
});
