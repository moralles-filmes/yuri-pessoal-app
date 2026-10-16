import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-C · D5 — erro de campo devolvido pelo servidor NUNCA some em Dieta e Treinos.
 *
 * As actions dos dois módulos recusam com `invalid()`: "Verifique os campos destacados." +
 * `fieldErrors`. Dieta inteira e quase todo Treinos repassavam só `result.error` — num toast,
 * ou num `<p role="alert">` — e mensagens explícitas da action se perdiam ("Já existe uma
 * medida com esse nome.", "Escolha o treino substituto.", o arquivo da foto…), com nada
 * destacado na tela (regra 2 de formulário do CLAUDE.md).
 *
 * O conjunto de actions é DERIVADO do código (as exportadas de
 * `src/lib/actions/{nutrition,training,body}*.ts` cujo corpo chama `invalid(`), não uma lista
 * escrita à mão — que ficaria para trás na primeira action nova. Toda tela dos dois módulos que
 * importa uma delas tem de passar o erro por `mapServerFieldErrors` (direto, ou por
 * `mensagemDaAction`, que o envolve) e não pode repassar `X.error` cru.
 *
 * Lê o código (invariante 25), sem comentários.
 */
const SRC = path.resolve(__dirname, "..");
const DIRS = [
  "app/(app)/nutricao",
  "app/(app)/treinos",
  "components/nutrition",
  "components/training",
  "components/body",
];

/** Exceções DECLARADAS, com o motivo. */
const EXCECOES = new Map<string, string>([
  [
    "components/training/session/session-mutations.ts",
    "tradução da fila da sessão: o erro vai para o SyncStatus (lastError) do laço, não para um campo",
  ],
  [
    "app/(app)/nutricao/planejamento/model-days-sheet.tsx",
    "executa as actions pelo `onRun` da tela de planejamento, que passa o erro por mensagemDaAction",
  ],
]);

/** Actions exportadas que chamam `invalid(` no corpo — derivado das fontes (só leitura). */
export function actionsComInvalid(fontes: Record<string, string>): Set<string> {
  const nomes = new Set<string>();
  for (const fonte of Object.values(fontes)) {
    const pos = [...fonte.matchAll(/^export\s+async\s+function\s+(\w+)\s*\(/gm)].map((m) => ({ n: m[1], i: m.index! }));
    pos.forEach((p, k) => {
      const corpo = fonte.slice(p.i, pos[k + 1]?.i ?? fonte.length);
      if (/\binvalid\(/.test(corpo)) nomes.add(p.n);
    });
  }
  return nomes;
}

/** Nomes importados POR VALOR de `@/lib/actions/…`. */
export function actionsImportadas(fonte: string): string[] {
  const nomes: string[] = [];
  for (const m of fonte.matchAll(/^import\s+(?!type\b)\{([^}]*)\}\s+from\s+"@\/lib\/actions\/[^"]+";/gm)) {
    for (const parte of m[1].split(",")) {
      const t = parte.trim();
      if (t && !t.startsWith("type ")) nomes.push(t.split(/\s+as\s+/).pop()!.trim());
    }
  }
  return nomes;
}

/** Repasse cru do erro: `toast.error(r.error)`, `toast.error(r.error ?? …)`, `setErro(r.error)`. */
export const REPASSE_CRU = /\btoast\.error\(\s*\w+\.error\s*(?:\)|\?\?)|\bset\w*Error\(\s*\w+\.error\s*\)/;

const PASSA_PELO_MAPA = /\bmapServerFieldErrors\(|\bmensagemDaAction\(|\berrosDaAction\(/;

function arquivos(dir: string): string[] {
  const achados: string[] = [];
  for (const e of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name).split(path.sep).join("/");
    if (e.isDirectory()) achados.push(...arquivos(rel));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) achados.push(rel);
  }
  return achados;
}

const FONTES_DAS_ACTIONS = Object.fromEntries(
  fs
    .readdirSync(path.join(SRC, "lib/actions"))
    .filter((f) => /^(nutrition|training|body)[\w-]*\.ts$/.test(f) && !f.endsWith(".test.ts"))
    .map((f) => [f, fs.readFileSync(path.join(SRC, "lib/actions", f), "utf8")]),
);
const COM_INVALID = actionsComInvalid(FONTES_DAS_ACTIONS);

const TELAS = DIRS.flatMap(arquivos)
  .map((a) => ({ a, f: semComentarios(fs.readFileSync(path.join(SRC, a), "utf8")) }))
  .filter((x) => actionsImportadas(x.f).some((n) => COM_INVALID.has(n)));
const COBERTAS = TELAS.filter((x) => !EXCECOES.has(x.a));

describe("D5 — a varredura sabe dizer sim e não (fixture)", () => {
  it("deriva só as actions exportadas que chamam invalid(", () => {
    // O corpo vai até a próxima export: uma função interna DEPOIS de uma exportada conta para
    // ela — erra para o lado seguro (cobra uma tela a mais, nunca uma a menos).
    const nomes = actionsComInvalid({
      "a.ts": [
        "async function interna() { return invalid(e); }",
        "export async function salva(x: unknown) { if (!ok) return invalid(e); }",
        "export async function exclui(id: string) { return dbError('x'); }",
      ].join("\n"),
    });
    expect([...nomes]).toEqual(["salva"]);
  });

  it("import de action por valor conta; de tipo não", () => {
    expect(actionsImportadas('import { salva, type X } from "@/lib/actions/nutrition-diary";')).toEqual(["salva"]);
    expect(actionsImportadas('import type { Y } from "@/lib/actions/nutrition-diary";')).toEqual([]);
  });

  it("repasse cru é visto; repasse pelo mapa não", () => {
    expect(REPASSE_CRU.test("if (!result.ok) return toast.error(result.error);")).toBe(true);
    expect(REPASSE_CRU.test('toast.error(res.error ?? "Falhou.")')).toBe(true);
    expect(REPASSE_CRU.test("setError(result.error);")).toBe(true);
    expect(REPASSE_CRU.test("toast.error(mensagemDaAction(result));")).toBe(false);
    expect(REPASSE_CRU.test("setErro(mensagemDaAction(result, CAMPOS));")).toBe(false);
  });
});

describe("D5 — erro de campo do servidor nunca some em Dieta e Treinos", () => {
  it("deriva as actions e acha as telas (anti-tautologia)", () => {
    // Contados no commit que introduziu a varredura (07-C, D5): 145 actions, 52 arquivos.
    expect(COM_INVALID.size).toBeGreaterThanOrEqual(140);
    expect(TELAS.length).toBeGreaterThanOrEqual(50);
  });

  it.each(COBERTAS.map((x) => x.a))("%s passa o erro da action por mapServerFieldErrors", (a) => {
    expect(COBERTAS.find((x) => x.a === a)!.f).toMatch(PASSA_PELO_MAPA);
  });

  it.each(COBERTAS.map((x) => x.a))("%s não repassa X.error cru", (a) => {
    const f = COBERTAS.find((x) => x.a === a)!.f;
    expect(f.split("\n").filter((l) => REPASSE_CRU.test(l))).toEqual([]);
  });

  it.each([...EXCECOES])("a exceção %s ainda existe e ainda importa action com invalid (%s)", (a) => {
    expect(TELAS.some((x) => x.a === a)).toBe(true);
  });
});
