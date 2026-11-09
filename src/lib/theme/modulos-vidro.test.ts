/**
 * REDESIGN-09-F — a varredura dos módulos em vidro. Sem infraestrutura de teste de componente
 * (ambiente `node`), a prova é a varredura da FONTE sem comentários, amarrando a classe ao
 * elemento certo: "a classe aparece no arquivo" não prova que ela está no elemento que importa.
 *
 * Os dois ajudantes exportados abaixo (`fonteSemComentarios`, `todosOsTsx`) são reusados pelos
 * blocos seguintes da 09-F, que também varrem o `src/` inteiro.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bloco, SRC, semComentarios } from "./ler-tokens";

/** Fonte do arquivo com os comentários trocados por espaços (a linha reportada não desliza). */
export function fonteSemComentarios(caminho: string): string {
  return fs
    .readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_, antes: string) => antes);
}

/** Todo `.tsx` de `src/` (caminho absoluto), em ordem estável. */
export function todosOsTsx(dir: string = SRC): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return todosOsTsx(p);
      return e.name.endsWith(".tsx") ? [p] : [];
    })
    .sort();
}

/** Caminho relativo à raiz do repositório, com `/`, para mensagens. */
export const relativo = (p: string) =>
  path.relative(path.resolve(SRC, ".."), p).replaceAll(path.sep, "/");

/** Linha (1-based) de um deslocamento no texto. */
export const linhaDe = (texto: string, i: number) => texto.slice(0, i).split("\n").length;

const dentroDeUi = (p: string) => relativo(p).startsWith("src/components/ui/");

describe("09-F · T1 · campos nativos em ladrilho", () => {
  it("a varredura leu código de verdade", () => {
    expect(todosOsTsx().length).toBeGreaterThan(400);
  });

  it("nenhum campo nativo usa border-input bg-transparent", () => {
    const sobrou: string[] = [];
    for (const arquivo of todosOsTsx()) {
      if (dentroDeUi(arquivo)) continue;
      const fonte = fonteSemComentarios(arquivo);
      // Qualquer literal de texto: className="…", constante "…" ou template `…`. O campo é
      // detectado pelas DUAS classes no mesmo literal, em qualquer ordem e com qualquer raio.
      for (const m of fonte.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
        const classes = (m[1] ?? m[2] ?? m[3] ?? "").split(/\s+/);
        if (classes.includes("border-input") && classes.includes("bg-transparent")) {
          sobrou.push(`${relativo(arquivo)}:${linhaDe(fonte, m.index ?? 0)}`);
        }
      }
    }
    expect(sobrou, `Campo sem o material (use campo-nativo): ${sobrou.join(", ")}`).toEqual([]);
  });

  it("nenhum literal com campo-nativo carrega bg-*, shadow-* ou rounded-* (nem com variante)", () => {
    // `campo-nativo` é desconhecida do twMerge e `.campo-nativo` sai ANTES das utilitárias com
    // variante no CSS gerado: `dark:bg-input/30` sobrescreveria o ladrilho no escuro. Fora da
    // proibição: `[&>option]:bg-*` (estiliza a <option>, não o campo) e variantes de BORDA.
    const proibido = /^(?:bg|shadow|rounded)(?:-|$)/;
    const sobrou: string[] = [];
    for (const arquivo of todosOsTsx()) {
      if (dentroDeUi(arquivo)) continue;
      const fonte = fonteSemComentarios(arquivo);
      for (const m of fonte.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
        const classes = (m[1] ?? m[2] ?? m[3] ?? "").split(/\s+/);
        if (!classes.includes("campo-nativo")) continue;
        for (const c of classes) {
          if (c.startsWith("[&>option]:")) continue;
          if (proibido.test(c.slice(c.lastIndexOf(":") + 1))) {
            sobrou.push(`${relativo(arquivo)}:${linhaDe(fonte, m.index ?? 0)} ${c}`);
          }
        }
      }
    }
    expect(sobrou, `Classe que briga com campo-nativo: ${sobrou.join(", ")}`).toEqual([]);
  });

  it("campo-nativo usa --field-border e --tile", () => {
    const b = semComentarios(bloco("@utility campo-nativo "));
    expect(b, "@utility campo-nativo existe").not.toBe("");
    expect(b).toMatch(/background\s*:\s*var\(--tile\)/);
    expect(b).toMatch(/border\s*:\s*1px solid var\(--field-border\)/);
    expect(b).toMatch(/border-radius\s*:\s*10px/);
    expect(b).toMatch(/box-shadow\s*:\s*inset 0 1px 2px rgba\(16,\s*24,\s*40,\s*0?\.06\)/);
    // Transparência reduzida cai no sólido do ladrilho; cores forçadas, em CanvasText.
    expect(b).toMatch(/prefers-reduced-transparency[\s\S]*background\s*:\s*var\(--tile-solid\)/);
    expect(b).toMatch(/forced-colors[\s\S]*border-color\s*:\s*CanvasText/);
  });
});

// ---------------------------------------------------------------------------------------------
// 09-F · T2 · o círculo de concluir (TO-DO e hábitos).
// ---------------------------------------------------------------------------------------------

/**
 * Abertura de um elemento JSX (`<Tag … >`), do `<` ao `>` que fecha a abertura. Percorre a fonte
 * respeitando chaves e aspas: o `=>` de um handler não encerra a abertura.
 */
export function aberturas(fonte: string, tag: string): string[] {
  const achados: string[] = [];
  let de = 0;
  for (;;) {
    const i = fonte.indexOf(`<${tag}`, de);
    if (i < 0) return achados;
    const depois = fonte[i + tag.length + 1];
    if (depois !== undefined && /[\w.]/.test(depois)) {
      de = i + 1;
      continue;
    }
    let chaves = 0;
    let aspa: string | null = null;
    let j = i + tag.length + 1;
    for (; j < fonte.length; j += 1) {
      const c = fonte[j];
      if (aspa) {
        if (c === aspa) aspa = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") aspa = c;
      else if (c === "{") chaves += 1;
      else if (c === "}") chaves -= 1;
      else if (c === ">" && chaves === 0 && fonte[j - 1] !== "=") break;
    }
    achados.push(fonte.slice(i, j + 1));
    de = j + 1;
  }
}

/** Classes de todo literal de texto do `className` (`className="…"` ou `className={cn("…", …)}`). */
function classesDe(abertura: string): string[] {
  const i = abertura.indexOf("className=");
  if (i < 0) return [];
  const resto = abertura.slice(i);
  const literais = [...resto.matchAll(/"([^"\n]*)"/g)].map((m) => m[1] ?? "");
  // `className="a b"` tem um só literal; `className={cn("a", cond && "b")}` tem vários.
  return literais.flatMap((l) => l.split(/\s+/)).filter(Boolean);
}

describe("09-F · T2 · círculo de concluir", () => {
  const CIRCULO = path.join(SRC, "components/shared/circulo-de-concluir.tsx");
  const existe = fs.existsSync(CIRCULO);
  const fonte = existe ? fonteSemComentarios(CIRCULO) : "";
  const raiz = existe ? aberturas(fonte, "CheckboxPrimitive.Root") : [];
  const visivel = existe ? aberturas(fonte, "span").filter((s) => /aria-hidden/.test(s)) : [];

  it("o componente existe e usa o Checkbox do radix", () => {
    expect(existe, "src/components/shared/circulo-de-concluir.tsx existe").toBe(true);
    expect(fonte).toMatch(/import \{ Checkbox as CheckboxPrimitive \} from "radix-ui"/);
    expect(fonte).toMatch(/export function CirculoDeConcluir/);
    expect(raiz).toHaveLength(1);
  });

  it("o botão tem 44 px de verdade: size-11 shrink-0, sem pseudo-elemento nem inset negativo", () => {
    const classes = classesDe(raiz[0] ?? "");
    expect(classes).toContain("size-11");
    expect(classes).toContain("shrink-0");
    expect(classes).toContain("group/circulo");
    expect(
      classes.filter((c) => c.includes("after:") || c.includes("-inset")),
      "a área de toque é espaço reservado, não uma sobreposição",
    ).toEqual([]);
  });

  it("o círculo visível é um span aria-hidden de 22 px, redondo", () => {
    expect(visivel).toHaveLength(1);
    const classes = classesDe(visivel[0] ?? "");
    expect(classes).toContain("size-[22px]");
    expect(classes).toContain("rounded-full");
    expect(classes).toContain("border-foreground/52");
  });

  it("a transição do círculo lista scale e motion-reduce a desliga", () => {
    const classes = classesDe(visivel[0] ?? "");
    const transicao = classes.find((c) => c.startsWith("transition-["));
    expect(transicao, "transition-[...] explícito").toBeDefined();
    expect(transicao).toMatch(/\bscale\b/);
    expect(classes.some((c) => c.startsWith("motion-reduce:"))).toBe(true);
    expect(classes).toContain("group-active/circulo:scale-[.9]");
  });

  it("o grupo é NOMEADO: nenhum group sem nome nem group-*: sem /circulo no componente", () => {
    // Sem nome, `group-active:` casa com QUALQUER ancestral `.group` (a linha do TO-DO é um):
    // pressionar o título ou o menu da linha encolheria o círculo.
    const sem: string[] = [];
    for (const m of fonte.matchAll(/"([^"\n]*)"/g)) {
      for (const c of (m[1] ?? "").split(/\s+/)) {
        const base = c.slice(c.lastIndexOf(":") + 1);
        if (base === "group") sem.push(c);
        const variantes = c.slice(0, c.lastIndexOf(":") + 1);
        for (const v of variantes.split(":").filter(Boolean)) {
          if (/^group-/.test(v) && !/^group-.+\/circulo$/.test(v.replace(/\[[^\]]*\]/g, ""))) {
            sem.push(c);
          }
        }
      }
    }
    expect(sem, `group sem nome em: ${sem.join(", ")}`).toEqual([]);
    expect(classesDe(raiz[0] ?? "")).toContain("group/circulo");
  });

  it("o foco aparece no círculo, e o visto entra com ease-estalo", () => {
    const classes = classesDe(visivel[0] ?? "");
    expect(classes).toContain("group-focus-visible/circulo:outline-2");
    expect(classes).toContain("group-focus-visible/circulo:outline-offset-2");
    expect(classes).toContain("group-focus-visible/circulo:outline-ring");
    expect(fonte).toMatch(/<CheckboxPrimitive\.Indicator/);
    expect(fonte).toMatch(/ease-estalo/);
  });

  const CHAMADORES = [
    "src/components/todo/task-row.tsx",
    "src/components/todo/task-board.tsx",
    "src/components/habits/habit-card.tsx",
    "src/components/dashboard/general/habits-card-body.tsx",
  ];
  const RAIZ = path.resolve(SRC, "..");

  for (const rel of CHAMADORES) {
    it(`${rel}: o controle de concluir é CirculoDeConcluir, e Checkbox não o faz mais`, () => {
      const f = fonteSemComentarios(path.join(RAIZ, rel));
      const circulos = aberturas(f, "CirculoDeConcluir");
      expect(circulos, "um CirculoDeConcluir").toHaveLength(1);
      expect(circulos[0]).toMatch(/aria-label=\{?(?:\w+\s*\?\s*)?[`"'](?:Concluir|Reabrir)\b/);
      const quadradas = aberturas(f, "Checkbox").filter((a) => /(Concluir|Reabrir)/.test(a));
      expect(quadradas, "nenhum Checkbox quadrado com aria-label Concluir/Reabrir").toEqual([]);
    });
  }

  it("a caixa Selecionar do task-row continua Checkbox, quadrada", () => {
    const f = fonteSemComentarios(path.join(RAIZ, "src/components/todo/task-row.tsx"));
    const caixas = aberturas(f, "Checkbox");
    expect(caixas).toHaveLength(1);
    expect(caixas[0]).toMatch(/aria-label=\{`Selecionar /);
    expect(f).toMatch(/import \{ Checkbox \} from "@\/components\/ui\/checkbox"/);
  });

  it("o botão de 44 px nunca sobrepõe vizinho: nenhum chamador usa after: nem inset", () => {
    for (const rel of CHAMADORES) {
      const f = fonteSemComentarios(path.join(RAIZ, rel));
      const [circulo] = aberturas(f, "CirculoDeConcluir");
      expect(
        classesDe(circulo ?? "").filter((c) => c.includes("after:") || c.includes("inset")),
        rel,
      ).toEqual([]);
    }
  });

  it("no card do dashboard a linha (label) reserva os 44 px em vez de usar margem negativa", () => {
    const f = fonteSemComentarios(
      path.join(RAIZ, "src/components/dashboard/general/habits-card-body.tsx"),
    );
    const [rotulo] = aberturas(f, "label");
    expect(classesDe(rotulo ?? "")).toContain("min-h-11");
    const [circulo] = aberturas(f, "CirculoDeConcluir");
    expect(classesDe(circulo ?? "").filter((c) => /^-m[xytrbl]?-/.test(c))).toEqual([]);
  });
});
