import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-B · D4 — diálogo de formulário de Hábitos e Estudos carrega SOB DEMANDA.
 *
 * Os 8 diálogos eram import estático e ficavam sempre montados: `react-hook-form`, o código
 * dos formulários e as primitivas usadas só neles entravam no primeiro byte das três rotas
 * (`/habitos` era a terceira mais pesada do app). O par é `next/dynamic` (objeto literal escrito
 * ali mesmo) + `useLazyDialog` — e as duas metades são exigidas:
 *
 * - import estático põe o formulário de volta no primeiro byte;
 * - `{aberto && <Dialog/>}` sem o hook QUEBRA a animação de fechamento (regra 2 do
 *   carregamento sob demanda): o componente some no mesmo quadro em que o Radix o desmontaria.
 *
 * Lê o código, não o renderiza (invariante 25). Comentários saem antes da leitura.
 */
const SRC = path.resolve(__dirname, "..");
const DIRS = ["app/(app)/habitos", "app/(app)/estudos", "components/habits", "components/studies"];

/** Os 8 de formulário (spec §5.3). Um diálogo novo nos dois módulos entra aqui. */
const DIALOGOS = [
  "HabitFormDialog",
  "HabitLogDialog",
  "CourseFormDialog",
  "SessionFormDialog",
  "ModuleFormDialog",
  "LessonFormDialog",
  "VocabFormDialog",
  "PracticeFormDialog",
] as const;
const EH_DIALOGO = new Set<string>(DIALOGOS);

/**
 * Exceção DECLARADA: recebe o próprio botão por `trigger` — lazy, o botão sumiria da tela
 * junto com o diálogo. Tem de continuar sendo importada estaticamente (senão sai da lista).
 */
const EXCECAO = "DeleteConfirmDialog";

function tsx(dir: string): string[] {
  const achados: string[] = [];
  for (const e of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name).split(path.sep).join("/");
    if (e.isDirectory()) achados.push(...tsx(rel));
    else if (e.name.endsWith(".tsx")) achados.push(rel);
  }
  return achados;
}

/** Nomes importados POR VALOR. `import type { X }` e `{ type X }` não contam. */
export function importsEstaticos(fonte: string): string[] {
  const nomes: string[] = [];
  for (const m of fonte.matchAll(/^import\s+(?!type\b)\{([^}]*)\}\s+from\s+"[^"]+";/gm)) {
    for (const parte of m[1].split(",")) {
      const t = parte.trim();
      if (!t || t.startsWith("type ")) continue;
      nomes.push(t.split(/\s+as\s+/).pop()!.trim());
    }
  }
  return nomes;
}

/** Diálogos de formulário carregados por `dynamic(() => import(…).then((m) => m.X)`. */
export function dinamicos(fonte: string): string[] {
  return [...fonte.matchAll(/dynamic\(\s*\(\)\s*=>\s*import\([^)]*\)\s*\.then\(\s*\(m\)\s*=>\s*m\.(\w+)\s*\)/g)]
    .map((m) => m[1])
    .filter((n): boolean => EH_DIALOGO.has(n));
}

/** Diálogo de formulário DEFINIDO no arquivo (exportado ou não). */
export function definidos(fonte: string): string[] {
  return [...fonte.matchAll(/^(?:export\s+)?function\s+(\w+)\s*\(/gm)]
    .map((m) => m[1])
    .filter((n): boolean => EH_DIALOGO.has(n));
}

/**
 * Diálogo definido no MESMO arquivo de uma visão (um componente exportado que não é diálogo).
 * `next/dynamic` carrega MÓDULOS: um diálogo que mora com a visão viaja com ela no primeiro
 * byte, por mais que o import dela seja preguiçoso.
 */
export function dialogosJuntoDaVisao(fonte: string): string[] {
  const visoes = [...fonte.matchAll(/^export\s+function\s+([A-Z]\w*)/gm)]
    .map((m) => m[1])
    .filter((n): boolean => !EH_DIALOGO.has(n));
  return visoes.length > 0 ? definidos(fonte) : [];
}

const contar = (fonte: string, re: RegExp) => (fonte.match(re) ?? []).length;

const ARQUIVOS = DIRS.flatMap(tsx).map((a) => ({
  a,
  f: semComentarios(fs.readFileSync(path.join(SRC, a), "utf8")),
}));
const fonteDe = (a: string) => ARQUIVOS.find((x) => x.a === a)!.f;

describe("D4 — a varredura sabe dizer sim e não (fixture)", () => {
  it("import por valor conta; import de tipo não", () => {
    expect(importsEstaticos('import { HabitFormDialog } from "./habit-form";')).toEqual(["HabitFormDialog"]);
    expect(importsEstaticos('import type { HabitFormDialog } from "./habit-form";')).toEqual([]);
    expect(importsEstaticos('import { type HabitFormDialog, Outro } from "./habit-form";')).toEqual(["Outro"]);
  });

  it("dynamic de diálogo de formulário conta; de gráfico não", () => {
    expect(dinamicos('const X = dynamic(() => import("./a").then((m) => m.HabitLogDialog), { ssr: false });')).toEqual([
      "HabitLogDialog",
    ]);
    expect(dinamicos('const G = dynamic(() => import("./g-impl").then((m) => m.ConsistencyChart), { ssr: false });')).toEqual([]);
  });

  it("diálogo morando com a visão é visto; diálogo no arquivo próprio não", () => {
    expect(dialogosJuntoDaVisao("export function CourseTree() {}\nfunction ModuleFormDialog({ a }: P) {}")).toEqual([
      "ModuleFormDialog",
    ]);
    expect(dialogosJuntoDaVisao("export function ModuleFormDialog({ a }: P) {}\nfunction ajuda() {}")).toEqual([]);
    expect(dialogosJuntoDaVisao("export function VocabularyView() {}")).toEqual([]);
  });
});

describe("D4 — diálogo de formulário de Hábitos e Estudos carrega sob demanda", () => {
  it("lê os dois módulos (anti-tautologia)", () => {
    expect(ARQUIVOS.length).toBeGreaterThan(25);
  });

  it.each(ARQUIVOS.map((x) => x.a))("%s não importa diálogo de formulário estaticamente", (a) => {
    expect(importsEstaticos(fonteDe(a)).filter((n): boolean => EH_DIALOGO.has(n))).toEqual([]);
  });

  it.each(ARQUIVOS.map((x) => x.a))("%s não define diálogo de formulário junto da visão", (a) => {
    expect(dialogosJuntoDaVisao(fonteDe(a))).toEqual([]);
  });

  it.each(ARQUIVOS.map((x) => x.a))("%s monta cada diálogo lazy atrás de useLazyDialog", (a) => {
    const f = fonteDe(a);
    expect(contar(f, /\buseLazyDialog\(/g)).toBeGreaterThanOrEqual(dinamicos(f).length);
  });

  it("os 8 são carregados por next/dynamic em algum lugar", () => {
    const carregados = new Set(ARQUIVOS.flatMap((x) => dinamicos(x.f)));
    expect([...carregados].sort()).toEqual([...DIALOGOS].sort());
  });

  it(`a exceção ${EXCECAO} ainda é importada estaticamente (trigger)`, () => {
    expect(ARQUIVOS.some((x) => importsEstaticos(x.f).includes(EXCECAO))).toBe(true);
  });
});
