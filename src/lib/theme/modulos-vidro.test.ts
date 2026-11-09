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

// ---------------------------------------------------------------------------------------------
// 09-F · T3 a T5 · superfícies por módulo: nenhum `bg-card` feito à mão, nenhum Card trocando o
// próprio fundo. `PENDENTES_DA_09F` é a dívida que ainda não foi paga (Tasks 4 e 5) e ENCOLHE a
// cada lote; as exceções finais (`EXCECOES`) entram na Task 5.
// ---------------------------------------------------------------------------------------------

/** Arquivos dos módulos que ainda têm `bg-card` à mão ou `<Card>` com fundo próprio. */
const PENDENTES_DA_09F: string[] = [
  "src/app/(app)/estudos/[id]/course-detail-client.tsx",
  "src/app/(app)/nutricao/compras/shopping-client.tsx",
  "src/app/(app)/nutricao/diario/diary-client.tsx",
  "src/app/(app)/nutricao/metas/goals-client.tsx",
  "src/app/(app)/nutricao/receitas/recipes-client.tsx",
  "src/app/(app)/nutricao/refeicoes/meal-templates-client.tsx",
  "src/app/(app)/todo/todo-client.tsx",
  "src/app/(app)/treinos/calendario/calendar-client.tsx",
  "src/app/(app)/treinos/evolucao/evolution-client.tsx",
  "src/app/(app)/treinos/exercicios/exercises-client.tsx",
  "src/app/(app)/treinos/historico/history-client.tsx",
  "src/app/(app)/treinos/programas/programs-client.tsx",
  "src/app/(app)/treinos/recordes/records-client.tsx",
  "src/app/(app)/treinos/treinos/workouts-client.tsx",
  "src/app/(app)/treinos/treinos/[id]/builder-client.tsx",
  "src/components/ai/action-history-client.tsx",
  "src/components/ai/chat-client.tsx",
  "src/components/ai/conversation-list.tsx",
  "src/components/ai/insights-client.tsx",
  "src/components/calendar/month-view.tsx",
  "src/components/calendar/time-grid.tsx",
  "src/components/habits/habit-card.tsx",
  "src/components/nutrition/pantry-panel.tsx",
  "src/components/todo/quick-task-input.tsx",
  "src/components/todo/recurrence-editor.tsx",
  "src/components/todo/task-board.tsx",
  "src/components/todo/task-calendar.tsx",
  "src/components/todo/task-row.tsx",
  "src/components/training/exercise-filters.tsx",
  "src/components/training/session/rest-panel.tsx",
  "src/components/training/session/session-live-client.tsx",
];

/** Exceções DECLARADAS (com o motivo, na Task 5). */
const EXCECOES: string[] = [];

/** Literais de texto de uma fonte: "…", '…' e `…`, com a posição do início. */
function literais(fonte: string): Array<{ texto: string; i: number }> {
  return [...fonte.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => ({
    texto: m[1] ?? m[2] ?? m[3] ?? "",
    i: m.index ?? 0,
  }));
}

/** `bg-card`, `bg-card/40`, `hover:bg-card/60`… — o fundo de cartão feito à mão. */
const ehBgCard = (c: string) => /^(?:[^:\s]+:)*bg-card(?:\/\S+)?$/.test(c);

function ocorrenciasDeBgCard(fonte: string): number[] {
  return literais(fonte)
    .filter((l) => l.texto.split(/\s+/).some(ehBgCard))
    .map((l) => linhaDe(fonte, l.i));
}

/** `<Card …>` cujo className troca o fundo (`bg-primary/…`, `bg-amber-500/…`, `bg-muted/…`). */
function cardsComFundoProprio(fonte: string): number[] {
  const achados: number[] = [];
  let de = 0;
  for (const abertura of aberturas(fonte, "Card")) {
    const i = fonte.indexOf(abertura, de);
    de = i + abertura.length;
    const k = abertura.indexOf("className=");
    if (k >= 0 && /bg-(?:primary|amber-500|muted)\//.test(abertura.slice(k))) {
      achados.push(linhaDe(fonte, i));
    }
  }
  return achados;
}

const foraDeUi = () => todosOsTsx().filter((p) => !dentroDeUi(p));

describe("09-F · T3 · superfícies dos módulos", () => {
  it("a varredura leu código de verdade", () => {
    expect(todosOsTsx().length).toBeGreaterThan(400);
    const cards = foraDeUi().flatMap((p) => aberturas(fonteSemComentarios(p), "Card"));
    expect(cards.length, "aberturas de <Card>").toBeGreaterThan(100);
  });

  it("bg-card só nas exceções (e nos pendentes declarados)", () => {
    const permitidos = new Set([...PENDENTES_DA_09F, ...EXCECOES]);
    const sobrou: string[] = [];
    for (const arquivo of foraDeUi()) {
      if (permitidos.has(relativo(arquivo))) continue;
      const fonte = fonteSemComentarios(arquivo);
      for (const linha of ocorrenciasDeBgCard(fonte)) sobrou.push(`${relativo(arquivo)}:${linha}`);
    }
    expect(sobrou, `bg-card à mão (use MATERIAL_*): ${sobrou.join(", ")}`).toEqual([]);
  });

  it("nenhum Card troca o próprio fundo (a situação fica na borda)", () => {
    const permitidos = new Set(PENDENTES_DA_09F);
    const sobrou: string[] = [];
    for (const arquivo of foraDeUi()) {
      if (permitidos.has(relativo(arquivo))) continue;
      for (const linha of cardsComFundoProprio(fonteSemComentarios(arquivo))) {
        sobrou.push(`${relativo(arquivo)}:${linha}`);
      }
    }
    expect(sobrou, `<Card> com fundo próprio: ${sobrou.join(", ")}`).toEqual([]);
  });

  it("a lista de pendentes só cita arquivo que ainda tem a ocorrência", () => {
    const todos = new Map(foraDeUi().map((p) => [relativo(p), p]));
    const velhos: string[] = [];
    for (const rel of PENDENTES_DA_09F) {
      const arquivo = todos.get(rel);
      if (!arquivo) {
        velhos.push(`${rel} (não existe)`);
        continue;
      }
      const fonte = fonteSemComentarios(arquivo);
      if (ocorrenciasDeBgCard(fonte).length + cardsComFundoProprio(fonte).length === 0) {
        velhos.push(rel);
      }
    }
    expect(velhos, `tire da lista (já pagos): ${velhos.join(", ")}`).toEqual([]);
  });

  it("as exceções declaradas existem e ainda têm bg-card", () => {
    const todos = new Map(foraDeUi().map((p) => [relativo(p), p]));
    for (const rel of EXCECOES) {
      const arquivo = todos.get(rel);
      expect(arquivo, rel).toBeDefined();
      expect(ocorrenciasDeBgCard(fonteSemComentarios(arquivo as string)).length, rel).toBeGreaterThan(0);
    }
  });

  // Cada peça amarrada ao LITERAL do seu className: a constante do material e o raio da regra.
  const MATERIAIS: Array<[arquivo: string, material: string, raio: string, quantas: number]> = [
    ["src/app/(app)/busca/busca-client.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
    ["src/app/(app)/configuracoes/page.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
    ["src/app/(app)/notificacoes/notifications-client.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
    ["src/components/cartoes/proximos-meses.tsx", "MATERIAL_CARTAO", "rounded-[14px]", 1],
    ["src/components/quick-add/quick-add.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 2],
    ["src/app/(app)/financeiro/lancamentos/transaction-form.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 3],
    ["src/app/(app)/importar/import-review.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 1],
    ["src/app/(app)/importar/import-upload.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 2],
    ["src/app/(app)/relatorios/relatorios-client.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 4],
    ["src/components/dashboard/general/invoices-card.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 1],
    ["src/components/financeiro/reembolso-da-receita.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 2],
    ["src/app/(app)/cartoes/proximos-meses/page.tsx", "MATERIAL_PILULA", "rounded-full", 1],
    ["src/app/(app)/cartoes/relatorios/page.tsx", "MATERIAL_PILULA", "rounded-full", 1],
  ];
  const RAIZ = path.resolve(SRC, "..");

  for (const [rel, material, raio, quantas] of MATERIAIS) {
    it(`${rel}: ${quantas}× ${material} com ${raio} no mesmo className`, () => {
      const fonte = fonteSemComentarios(path.join(RAIZ, rel));
      expect(fonte).toMatch(
        new RegExp(`import \\{[^}]*\\b${material}\\b[^}]*\\} from "@/components/ui/materiais"`),
      );
      const casam = literais(fonte).filter((l) => {
        const classes = l.texto.split(/\s+/);
        return l.texto.includes("${" + material + "}") && classes.includes(raio);
      });
      expect(casam, `literais com \${${material}} e ${raio}`).toHaveLength(quantas);
      for (const l of casam) {
        expect(l.texto, "sem borda concorrente da constante").not.toMatch(/(^|\s)border-border(\s|$)/);
      }
    });
  }

  it("seletores de cartões: o item ativo é foreground (primary não chega a 4,5:1 sobre a pílula no escuro)", () => {
    for (const rel of [
      "src/app/(app)/cartoes/proximos-meses/page.tsx",
      "src/app/(app)/cartoes/relatorios/page.tsx",
    ]) {
      const fonte = fonteSemComentarios(path.join(RAIZ, rel));
      const ativos = literais(fonte).filter((l) => l.texto.includes("bg-primary/10"));
      expect(ativos.length, rel).toBeGreaterThan(0);
      for (const l of ativos) {
        const classes = l.texto.split(/\s+/);
        expect(classes, rel).toContain("text-foreground");
        expect(classes, rel).toContain("font-semibold");
        expect(classes, rel).not.toContain("text-primary");
      }
      expect(fonte, rel).toMatch(/aria-current=\{[^}]*"page"/);
    }
  });

  it("EmptyState: bg-tile com a borda tracejada (vazio continua distinto de zero e de falha)", () => {
    const fonte = fonteSemComentarios(path.join(RAIZ, "src/components/shared/empty-state.tsx"));
    const raiz = literais(fonte).filter((l) => l.texto.includes("border-dashed"));
    expect(raiz).toHaveLength(1);
    const classes = (raiz[0]?.texto ?? "").split(/\s+/);
    expect(classes).toContain("bg-tile");
    expect(classes).toContain("border");
    expect(classes).toContain("border-border");
    expect(classes.some(ehBgCard)).toBe(false);
  });

  it("notificações: a linha não lida perde o tingimento de fundo e mantém a borda e o texto", () => {
    const fonte = fonteSemComentarios(
      path.join(RAIZ, "src/app/(app)/notificacoes/notifications-client.tsx"),
    );
    const linha = aberturas(fonte, "li").find((a) => a.includes("MATERIAL_CARTAO")) ?? "";
    expect(linha).not.toBe("");
    expect(linha).toMatch(/border-primary\/30/);
    expect(linha).not.toMatch(/bg-primary/);
    expect(fonte).toMatch(/Não lida/);
  });

  it("proximos-meses: a célula prevista continua sem fundo (tracejada), sem sombra de cartão", () => {
    const fonte = fonteSemComentarios(path.join(RAIZ, "src/components/cartoes/proximos-meses.tsx"));
    const prevista = literais(fonte).find((l) => l.texto.includes("border-dashed"));
    const classes = (prevista?.texto ?? "").split(/\s+/);
    expect(classes).toContain("bg-transparent");
    expect(classes).toContain("bg-none");
    expect(classes).toContain("shadow-none");
  });
});
