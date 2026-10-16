import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * REDESIGN-07-A · M10 — TO-DO e Tarefas continuam SEPARADOS.
 *
 * Agrupar visualmente ("Rotinas e tarefas" na sidebar) não é fundir dados: `todo_*` e `tasks`
 * são tabelas distintas, com semânticas distintas (recorrência que avança a linha × status
 * gravado). Hoje nenhum arquivo de um lado importa do outro; este teste transforma o "é verdade
 * hoje" em regra. Unificar componentes (D6) exigiria um que conhecesse os dois formatos — a
 * porta para a mistura.
 */
const SRC = path.resolve(__dirname, "..");

const LADOS = [
  {
    nome: "Tarefas e Rotinas",
    pastas: ["components/tasks", "app/(app)/tarefas", "app/(app)/rotinas"],
    proibidos: [/^@\/lib\/todo(\/|$)/, /^@\/components\/todo(\/|$)/, /^@\/lib\/actions\/todo[\w-]*$/],
  },
  {
    nome: "TO-DO",
    pastas: ["components/todo", "app/(app)/todo"],
    proibidos: [/^@\/lib\/tasks(\/|$)/, /^@\/components\/tasks(\/|$)/, /^@\/lib\/actions\/(tasks|routines|projects)$/],
  },
] as const;

function arquivos(rel: string): string[] {
  const abs = path.join(SRC, rel);
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? arquivos(path.join(rel, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(rel, e.name)] : [],
  );
}

/** Especificador normalizado para a forma `@/…` (relativos resolvidos a partir do arquivo). */
function especificadores(rel: string): string[] {
  const fonte = fs.readFileSync(path.join(SRC, rel), "utf8");
  return [...fonte.matchAll(/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => {
    const s = m[1];
    if (!s.startsWith(".")) return s;
    const abs = path.resolve(path.dirname(path.join(SRC, rel)), s);
    return `@/${path.relative(SRC, abs).split(path.sep).join("/")}`;
  });
}

describe("M10 — TO-DO e Tarefas não se importam", () => {
  it("a regra sabe dizer sim e não", () => {
    const [tarefas, todo] = LADOS;
    expect(tarefas.proibidos.some((re) => re.test("@/lib/todo/constants"))).toBe(true);
    expect(tarefas.proibidos.some((re) => re.test("@/lib/todos"))).toBe(false);
    expect(tarefas.proibidos.some((re) => re.test("@/lib/actions/todo-extras"))).toBe(true);
    expect(todo.proibidos.some((re) => re.test("@/components/tasks/task-card"))).toBe(true);
    expect(todo.proibidos.some((re) => re.test("@/lib/actions/calendar"))).toBe(false);
  });

  it.each(LADOS)("$nome não importa do outro módulo", ({ pastas, proibidos }) => {
    const todos = pastas.flatMap(arquivos);
    expect(todos.length).toBeGreaterThan(5);
    const cruzados = todos.flatMap((arq) =>
      especificadores(arq).filter((s) => proibidos.some((re) => re.test(s))).map((s) => `${arq} → ${s}`),
    );
    expect(cruzados).toEqual([]);
  });
});
