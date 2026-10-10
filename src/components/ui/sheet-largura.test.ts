import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-A · F5 — a largura de uma gaveta lateral precisa do prefixo `data-[side=…]:`.
 *
 * A primitiva (`ui/sheet.tsx`) põe a largura em `data-[side=right]:w-3/4` e
 * `data-[side=right]:sm:max-w-sm`. Um `w-full` ou `sm:max-w-xl` do chamador é OUTRO grupo de
 * variante: o `twMerge` mantém os dois, e o seletor de atributo vence a cascata. Medido no
 * Chrome com o CSS real: o painel de detalhe do TO-DO pedia 576 px e saía com 384. É a regra 1
 * do layout (`cn()` é `twMerge`) num lugar que ela não tinha alcançado.
 */
const SRC = path.resolve(__dirname, "..", "..");

/** Exceções DECLARADAS, com dono — e cada uma tem de continuar violando. */
const EXCECOES = new Map<string, string>([
  ["app/(app)/nutricao/planejamento/planning-client.tsx", "07-B"],
  ["app/(app)/nutricao/refeicoes/meal-templates-client.tsx", "07-B"],
  ["components/nutrition/food-detail-sheet.tsx", "07-B"],
  ["components/nutrition/recipe-detail-sheet.tsx", "07-B"],
  ["components/training/exercise-detail-sheet.tsx", "07-C"],
  ["components/training/workout-exercise-sheet.tsx", "07-C"],
  ["components/layout/mobile-nav.tsx", "casca — fora da 07-A"],
  ["components/shared/module-shell.tsx", "compartilhado por Dieta, Treinos e IA — 07-B/C/D"],
  // `side={desktop ? "right" : "bottom"}`: a varredura não lê lado dinâmico e assume "right".
  // No desktop o `w-full` é mesmo morto (`data-[side=right]:w-3/4` vence), mas o
  // `data-[side=right]:sm:max-w-lg` limita no mesmo valor e nada muda na tela; na gaveta de
  // baixo o `inset-x-0` da primitiva já ocupa a largura. `floating-assistant*` é intocável na 07-A.
  ["components/ai/floating-assistant-panel.tsx", "07-D — lado dinâmico, sem efeito visível"],
]);

/** Texto da abertura `<SheetContent …>` a partir de `i`, respeitando `{…}` e aspas. */
function tag(fonte: string, i: number): string {
  let prof = 0;
  let aspa: string | null = null;
  for (let j = i; j < fonte.length; j++) {
    const c = fonte[j];
    if (aspa) {
      if (c === aspa) aspa = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") aspa = c;
    else if (c === "{") prof++;
    else if (c === "}") prof--;
    else if (c === ">" && prof === 0) return fonte.slice(i, j);
  }
  return fonte.slice(i);
}

/** Classes de largura SEM o prefixo de lado nas gavetas laterais do texto. */
export function larguraSemPrefixo(fonte: string): string[] {
  const achadas: string[] = [];
  for (const m of fonte.matchAll(/<SheetContent\b/g)) {
    const t = tag(fonte, m.index);
    const lado = t.match(/\bside="(\w+)"/)?.[1] ?? "right"; // padrão da primitiva
    if (lado !== "left" && lado !== "right") continue;
    const classes = [...t.matchAll(/className=(?:"([^"]*)"|\{[^}]*?"([^"]*)")/g)]
      .map((c) => c[1] ?? c[2])
      .join(" ");
    for (const cls of classes.split(/\s+/)) {
      if (/^(?:[a-z0-9]+:)*(?:max-|min-)?w-/.test(cls) && !cls.startsWith("data-[side=")) achadas.push(cls);
    }
  }
  return achadas;
}

function tsxDe(dir: string): string[] {
  return fs.readdirSync(path.join(SRC, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name).split(path.sep).join("/");
    return e.isDirectory() ? tsxDe(rel) : e.name.endsWith(".tsx") ? [rel] : [];
  });
}

describe("F5 — gaveta lateral: largura só com o prefixo de lado", () => {
  it("a varredura sabe dizer sim e não (fixture)", () => {
    expect(larguraSemPrefixo('<SheetContent className="w-full overflow-y-auto sm:max-w-xl">')).toEqual(["w-full", "sm:max-w-xl"]);
    expect(larguraSemPrefixo('<SheetContent side="left" className="data-[side=left]:w-[17rem]">')).toEqual([]);
    expect(larguraSemPrefixo('<SheetContent side="bottom" className="max-h-[88vh] w-full">')).toEqual([]);
    expect(larguraSemPrefixo('<SheetContent\n  side="right"\n  className="flex w-full p-0"\n>')).toEqual(["w-full"]);
  });

  it("nenhuma gaveta lateral fora das exceções passa largura morta", () => {
    const arquivos = [...tsxDe("app"), ...tsxDe("components")].filter((a) => a !== "components/ui/sheet.tsx");
    // Sem comentários: `floating-assistant-panel.tsx` tem um bloco `/* … */` DENTRO da tag
    // `<SheetContent>` (explicando justamente este defeito), e ele citaria classes que não existem.
    const violam = arquivos
      .filter((a) => !EXCECOES.has(a))
      .map((a) => [a, larguraSemPrefixo(semComentarios(fs.readFileSync(path.join(SRC, a), "utf8")))] as const)
      .filter(([, cls]) => cls.length > 0)
      .map(([a, cls]) => `${a}: ${cls.join(" ")}`);
    expect(violam).toEqual([]);
  });

  it.each([...EXCECOES])("a exceção %s ainda viola (%s)", (arquivo) => {
    expect(larguraSemPrefixo(semComentarios(fs.readFileSync(path.join(SRC, arquivo), "utf8"))).length).toBeGreaterThan(0);
  });
});
