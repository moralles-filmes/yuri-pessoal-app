import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/test/links-inline";

/**
 * REDESIGN-07-C · D2 — os diálogos de Dieta e Treinos carregam SOB DEMANDA.
 *
 * Dieta tinha 46 diálogos e só 3 lazy; Treinos + body, 40 e 9. Estáticos, eles (e o
 * `react-hook-form`/`zod`/primitivas que só eles usam) entravam no primeiro byte das telas —
 * `/nutricao/compras` era a rota mais pesada do lote. O par é `next/dynamic` (objeto literal
 * escrito ali mesmo) + `useLazyDialog`, e as duas metades são exigidas:
 *
 * - import estático põe o diálogo de volta no primeiro byte;
 * - `{aberto && <Dialog/>}` sem o hook QUEBRA a animação de fechamento (regra 2 do
 *   carregamento sob demanda).
 *
 * `next/dynamic` carrega MÓDULOS: um diálogo definido junto da tela viaja com ela, por isso os
 * locais saíram para arquivo próprio (movimento puro, conferido por script).
 *
 * Exceções DECLARADAS:
 * - os 5 da sessão ao vivo — offline no meio do treino, o diálogo tem de já estar lá;
 * - `TodoLinkDialog` — o botão mora dentro dele (`trigger`), lazy ele sumiria da tela;
 * - confirmações escritas INLINE em JSX (não são componente nem import).
 *
 * Lê o código, não o renderiza (invariante 25). Comentários saem antes da leitura.
 */
const SRC = path.resolve(__dirname, "..");
const DIRS = [
  "app/(app)/nutricao",
  "app/(app)/treinos",
  "components/nutrition",
  "components/training",
  "components/body",
];

/** Todo diálogo/gaveta dos dois módulos que tem de ser carregado por `next/dynamic`. */
const DIALOGOS = [
  // Dieta — locais que saíram para arquivo próprio
  "NewMealDialog",
  "FreeEntryDialog",
  "TemplatePickerDialog",
  "EditQuantityDialog",
  "NewPlannedMealDialog",
  "ScopeDialog",
  "ApplyPlanDialog",
  "PlanDialog",
  "CopyDialog",
  "ModelDaysSheet",
  "MeasurementDialog",
  "BatchDialog",
  "GoalDialog",
  "PeriodDialog",
  "ProfileDialog",
  "TemplateFormDialog",
  "FreeItemDialog",
  "PlanTemplateDialog",
  "GroupDialog",
  "OptionDialog",
  "PantryFormDialog",
  // Dieta — já em arquivo próprio
  "FoodPickerDialog",
  "RecipePickerDialog",
  "SubstitutionCompareDialog",
  "ScheduleMealDialog",
  "MarketCategoriesDialog",
  "ShoppingGenerateDialog",
  "ShoppingItemDialog",
  "RecipeFormDialog",
  "RecipeDetailSheet",
  "BarcodeScannerDialog",
  "FoodDetailSheet",
  "FoodFormDialog",
  "MeasureDialog",
  // body
  "MeasurementTypesDialog",
  "UploadDialog",
  "CompareDialog",
  // Treinos — locais que saíram para arquivo próprio
  "NewEntryDialog",
  "OutcomeDialog",
  "GenerateDialog",
  "DuplicateWeekDialog",
  "RecordProgressDialog",
  "RegisterMeasurementDialog",
  // Treinos — já em arquivo próprio
  "DeleteWithDestinationDialog",
  "ExerciseFormDialog",
  "ExerciseDetailSheet",
  "ExercisePickerDialog",
  "GoalFormDialog",
  "ProgramFormDialog",
  "ProgressionRuleDialog",
  "WorkoutFormDialog",
  "WorkoutExerciseSheet",
] as const;
const EH_DIALOGO = new Set<string>(DIALOGOS);

/** Offline no meio do treino: continuam estáticos (spec 07-C §6.2). */
const SESSAO = "components/training/session/session-live-client.tsx";
const DA_SESSAO = ["AddExerciseSheet", "ExerciseListSheet", "PlateCalculatorSheet", "SubstituteSheet"];
/** O botão mora dentro dele (`trigger`). */
const TODO_LINK = "TodoLinkDialog";

const EH_NOME_DE_DIALOGO = (n: string) => /^[A-Z]\w*(Dialog|Sheet)$/.test(n);

function tsx(dir: string): string[] {
  const achados: string[] = [];
  for (const e of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name).split(path.sep).join("/");
    if (e.isDirectory()) achados.push(...tsx(rel));
    else if (e.name.endsWith(".tsx")) achados.push(rel);
  }
  return achados;
}

/** Nomes importados POR VALOR, com o módulo. `import type { X }` e `{ type X }` não contam. */
export function importsEstaticos(fonte: string): { nome: string; de: string }[] {
  const nomes: { nome: string; de: string }[] = [];
  for (const m of fonte.matchAll(/^import\s+(?!type\b)\{([^}]*)\}\s+from\s+"([^"]+)";/gm)) {
    for (const parte of m[1].split(",")) {
      const t = parte.trim();
      if (!t || t.startsWith("type ")) continue;
      nomes.push({ nome: t.split(/\s+as\s+/).pop()!.trim(), de: m[2] });
    }
  }
  return nomes;
}

/** Componentes carregados por `dynamic(() => import(…).then((m) => m.X)`. */
export function dinamicos(fonte: string): string[] {
  return [...fonte.matchAll(/dynamic\(\s*\(\)\s*=>\s*import\([^)]*\)\s*\.then\(\s*\(m\)\s*=>\s*m\.(\w+)\s*,?\s*\)/g)].map(
    (m) => m[1],
  );
}

/** Funções de topo definidas no arquivo (exportadas ou não). */
function funcoes(fonte: string): { nome: string; exportada: boolean }[] {
  return [...fonte.matchAll(/^(export\s+)?function\s+(\w+)\s*[(<]/gm)].map((m) => ({
    nome: m[2],
    exportada: Boolean(m[1]),
  }));
}

/** O arquivo É um diálogo (exporta um componente com nome de diálogo/gaveta)? */
export function ehArquivoDeDialogo(fonte: string): boolean {
  return funcoes(fonte).some((f) => f.exportada && EH_NOME_DE_DIALOGO(f.nome));
}

/**
 * Diálogo/gaveta definido no MESMO arquivo de uma tela (um componente exportado que não é
 * diálogo): ele viaja com a tela no primeiro byte, por mais que o import dele seja preguiçoso.
 */
export function dialogosJuntoDaTela(fonte: string): string[] {
  const fs_ = funcoes(fonte);
  const telas = fs_.filter((f) => f.exportada && /^[A-Z]/.test(f.nome) && !EH_NOME_DE_DIALOGO(f.nome));
  return telas.length > 0 ? fs_.filter((f) => EH_NOME_DE_DIALOGO(f.nome)).map((f) => f.nome) : [];
}

const contar = (fonte: string, re: RegExp) => (fonte.match(re) ?? []).length;

const ARQUIVOS = DIRS.flatMap(tsx).map((a) => ({
  a,
  f: semComentarios(fs.readFileSync(path.join(SRC, a), "utf8")),
}));
const fonteDe = (a: string) => {
  const achado = ARQUIVOS.find((x) => x.a === a);
  if (!achado) throw new Error(`arquivo fora da varredura: ${a}`);
  return achado.f;
};
const TELAS = ARQUIVOS.filter((x) => !ehArquivoDeDialogo(x.f));

describe("D2 — a varredura sabe dizer sim e não (fixture)", () => {
  it("import por valor conta, com o módulo; import de tipo não", () => {
    expect(importsEstaticos('import { PlanDialog } from "./plan-dialog";')).toEqual([
      { nome: "PlanDialog", de: "./plan-dialog" },
    ]);
    expect(importsEstaticos('import type { PlanDialog } from "./plan-dialog";')).toEqual([]);
    expect(importsEstaticos('import { type PlanDialog, Outro } from "./plan-dialog";')).toEqual([
      { nome: "Outro", de: "./plan-dialog" },
    ]);
  });

  it("dynamic conta pelo nome do componente carregado", () => {
    expect(dinamicos('const X = dynamic(() => import("./a").then((m) => m.ScopeDialog), { ssr: false });')).toEqual([
      "ScopeDialog",
    ]);
    expect(dinamicos('import { ScopeDialog } from "./a";')).toEqual([]);
    // quebrado em linhas, com vírgula final (o formato de nome longo)
    expect(
      dinamicos('const D = dynamic(\n  () =>\n    import("./d").then(\n      (m) => m.DeleteWithDestinationDialog,\n    ),\n  { ssr: false },\n);'),
    ).toEqual(["DeleteWithDestinationDialog"]);
  });

  it("diálogo morando com a tela é visto; diálogo no arquivo próprio não", () => {
    expect(dialogosJuntoDaTela("export function DiaryClient() {}\nfunction NewMealDialog({ a }: P) {}")).toEqual([
      "NewMealDialog",
    ]);
    expect(dialogosJuntoDaTela("export function NewMealDialog({ a }: P) {}\nfunction ajuda() {}")).toEqual([]);
    expect(ehArquivoDeDialogo("export function NewMealDialog({ a }: P) {}")).toBe(true);
    expect(ehArquivoDeDialogo("export function DiaryClient() {}")).toBe(false);
  });
});

describe("D2 — diálogos de Dieta e Treinos carregam sob demanda", () => {
  it("lê os dois módulos (anti-tautologia)", () => {
    // Contados no commit que introduziu a varredura (07-C, D2): 165 arquivos, 108 telas.
    expect(ARQUIVOS.length).toBeGreaterThanOrEqual(160);
    expect(TELAS.length).toBeGreaterThanOrEqual(100);
  });

  it.each(TELAS.map((x) => x.a))("%s não importa diálogo estaticamente", (a) => {
    const estaticos = importsEstaticos(fonteDe(a))
      .filter((i) => EH_NOME_DE_DIALOGO(i.nome) && !i.de.startsWith("@/components/ui/"))
      .map((i) => i.nome)
      .filter((n) => !(a === SESSAO && DA_SESSAO.includes(n)) && n !== TODO_LINK);
    expect(estaticos).toEqual([]);
  });

  it.each(ARQUIVOS.map((x) => x.a))("%s não define diálogo junto da tela", (a) => {
    const junto = dialogosJuntoDaTela(fonteDe(a)).filter((n) => !(a === SESSAO && n === "ConfirmFinishDialog"));
    expect(junto).toEqual([]);
  });

  it.each(ARQUIVOS.map((x) => x.a))("%s monta cada diálogo lazy atrás de useLazyDialog", (a) => {
    const f = fonteDe(a);
    expect(contar(f, /\buseLazyDialog\(/g)).toBeGreaterThanOrEqual(dinamicos(f).filter(EH_NOME_DE_DIALOGO).length);
  });

  it("cada diálogo da lista é carregado por next/dynamic em algum lugar", () => {
    const carregados = new Set(ARQUIVOS.flatMap((x) => dinamicos(x.f)));
    expect(DIALOGOS.filter((d) => !carregados.has(d))).toEqual([]);
  });

  it("todo diálogo carregado por next/dynamic está na lista (diálogo novo entra nela)", () => {
    const carregados = ARQUIVOS.flatMap((x) => dinamicos(x.f)).filter(EH_NOME_DE_DIALOGO);
    expect(carregados.filter((d) => !EH_DIALOGO.has(d))).toEqual([]);
  });
});

describe("D2 — exceções declaradas", () => {
  it.each(DA_SESSAO)("%s continua estático na sessão ao vivo (offline no meio do treino)", (nome) => {
    const f = fonteDe(SESSAO);
    expect(importsEstaticos(f).map((i) => i.nome)).toContain(nome);
    expect(dinamicos(f)).not.toContain(nome);
  });

  it("ConfirmFinishDialog mora na tela da sessão e não é dinâmico", () => {
    const f = fonteDe(SESSAO);
    expect(dialogosJuntoDaTela(f)).toContain("ConfirmFinishDialog");
    expect(f).not.toMatch(/\bdynamic\(/);
  });

  it(`${TODO_LINK} continua estático (o botão mora nele)`, () => {
    expect(ARQUIVOS.some((x) => importsEstaticos(x.f).some((i) => i.nome === TODO_LINK))).toBe(true);
    expect(ARQUIVOS.flatMap((x) => dinamicos(x.f))).not.toContain(TODO_LINK);
  });
});

describe("D2 — @dnd-kit só quando a lista é reordenável", () => {
  it.each(["app/(app)/nutricao/compras/shopping-client.tsx", "app/(app)/treinos/programas/programs-client.tsx"])(
    "%s carrega SortableList sob demanda",
    (a) => {
      const f = fonteDe(a);
      expect(dinamicos(f)).toContain("SortableList");
      expect(importsEstaticos(f).map((i) => i.nome)).not.toContain("SortableList");
    },
  );

  it("o construtor de treino mantém SortableList estático (a lista aparece sempre)", () => {
    expect(importsEstaticos(fonteDe("app/(app)/treinos/treinos/[id]/builder-client.tsx")).map((i) => i.nome)).toContain(
      "SortableList",
    );
  });
});
