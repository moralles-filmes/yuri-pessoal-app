import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-B · D6 — erro de campo devolvido pelo servidor NUNCA some.
 *
 * `applyFieldErrors` (`components/financeiro/form-utils.ts`) faz `setError` em qualquer nome
 * que a action devolva: se o campo não existe na tela, o erro some em silêncio e o toast ainda
 * diz "Verifique os campos destacados." — com nada destacado. É a regra 2 de formulário do
 * CLAUDE.md. Em Hábitos e Estudos o caminho é `mapServerFieldErrors` (campo da tela →
 * `setError`; campo que a tela não tem → toast com o nome) + `serverErrorMessage`.
 *
 * `form-utils.ts` NÃO é editado: Financeiro, Agenda, Tarefas e Rotinas ainda o usam (G14).
 * Lê o código (invariante 25), sem comentários.
 */
const SRC = path.resolve(__dirname, "..");
const DIRS = ["app/(app)/habitos", "app/(app)/estudos", "components/habits", "components/studies"];

function tsx(dir: string): string[] {
  const achados: string[] = [];
  for (const e of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name).split(path.sep).join("/");
    if (e.isDirectory()) achados.push(...tsx(rel));
    else if (e.name.endsWith(".tsx")) achados.push(rel);
  }
  return achados;
}

const ARQUIVOS = DIRS.flatMap(tsx).map((a) => ({
  a,
  f: semComentarios(fs.readFileSync(path.join(SRC, a), "utf8")),
}));
/** Quem lê o `fieldErrors` de um `ActionResult` — ou seja, quem decide o destino do erro. */
const LEITORES = ARQUIVOS.filter((x) => /\.fieldErrors\b/.test(x.f));

describe("D6 — erro de campo do servidor nunca some", () => {
  it("acha os formulários dos dois módulos (anti-tautologia)", () => {
    // Hábito, Registro de hábito, Curso, Módulo, Aula, Sessão, Vocabulário, Prática.
    expect(LEITORES.length).toBeGreaterThanOrEqual(8);
  });

  it.each(ARQUIVOS.map((x) => x.a))("%s não usa applyFieldErrors", (a) => {
    expect(ARQUIVOS.find((x) => x.a === a)!.f).not.toMatch(/\bapplyFieldErrors\b/);
  });

  it.each(LEITORES.map((x) => x.a))("%s passa fieldErrors por mapServerFieldErrors e serverErrorMessage", (a) => {
    const f = LEITORES.find((x) => x.a === a)!.f;
    expect(f).toMatch(/\bmapServerFieldErrors\(\s*\w+\.fieldErrors\b/);
    expect(f).toMatch(/\bserverErrorMessage\(/);
  });
});
