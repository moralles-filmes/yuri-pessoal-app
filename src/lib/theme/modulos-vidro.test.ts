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
// próprio fundo. A dívida (`PENDENTES_DA_09F`) foi paga na Task 5: só restam as exceções
// declaradas, com o motivo ao lado.
// ---------------------------------------------------------------------------------------------

/** Exceções DECLARADAS (cada uma com o motivo ao lado). */
const EXCECOES: string[] = [
  // A célula do dia do calendário do TO-DO continua `bg-card` por decisão do dono: ela não ganha
  // controle nem material próprio (o dia é uma grade de células, não um cartão).
  "src/components/todo/task-calendar.tsx",
];

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

  it("bg-card só nas exceções declaradas", () => {
    const permitidos = new Set(EXCECOES);
    const sobrou: string[] = [];
    for (const arquivo of foraDeUi()) {
      if (permitidos.has(relativo(arquivo))) continue;
      const fonte = fonteSemComentarios(arquivo);
      for (const linha of ocorrenciasDeBgCard(fonte)) sobrou.push(`${relativo(arquivo)}:${linha}`);
    }
    expect(sobrou, `bg-card à mão (use MATERIAL_*): ${sobrou.join(", ")}`).toEqual([]);
  });

  it("nenhum Card troca o próprio fundo (a situação fica na borda)", () => {
    const sobrou: string[] = [];
    for (const arquivo of foraDeUi()) {
      for (const linha of cardsComFundoProprio(fonteSemComentarios(arquivo))) {
        sobrou.push(`${relativo(arquivo)}:${linha}`);
      }
    }
    expect(sobrou, `<Card> com fundo próprio: ${sobrou.join(", ")}`).toEqual([]);
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
    ["src/components/cartoes/proximos-meses.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 1],
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

  it("proximos-meses: a célula prevista continua sem fundo (tracejada), sem o material do ladrilho", () => {
    const fonte = fonteSemComentarios(path.join(RAIZ, "src/components/cartoes/proximos-meses.tsx"));
    const prevista = literais(fonte).find((l) => l.texto.includes("border-dashed"));
    const classes = (prevista?.texto ?? "").split(/\s+/);
    expect(classes).toContain("bg-transparent");
    expect(classes).toContain("shadow-none");
  });
});

// ---------------------------------------------------------------------------------------------
// 09-F · T4 · TO-DO, agenda, estudos, hábitos e IA. O ancestral de cada peça foi conferido lendo
// quem a renderiza (relatório da task): direto na névoa é cartão; dentro de Card, Dialog, Sheet ou
// de outro ladrilho é ladrilho.
// ---------------------------------------------------------------------------------------------

describe("09-F · T4 · superfícies do TO-DO, agenda, estudos, hábitos e IA", () => {
  const RAIZ = path.resolve(SRC, "..");
  const MATERIAIS_T4: Array<[arquivo: string, material: string, raio: string, quantas: number]> = [
    ["src/app/(app)/estudos/[id]/course-detail-client.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 1],
    ["src/app/(app)/todo/todo-client.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 2],
    ["src/components/ai/action-history-client.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
    ["src/components/ai/conversation-list.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
    ["src/components/calendar/month-view.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
    ["src/components/calendar/time-grid.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
    ["src/components/todo/task-row.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
    // Usado direto na névoa (todo-client) e dentro da coluna do quadro (ladrilho): cartão nos dois.
    ["src/components/todo/quick-task-input.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
    ["src/components/todo/recurrence-editor.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 1],
    // Coluna do quadro (ladrilho na névoa) e o cartão da tarefa dentro dela. Ladrilho dentro do
    // ladrilho reprova no escuro (muted-foreground 4,01:1 em fog-1): o cartão de vidro passa.
    ["src/components/todo/task-board.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 1],
    ["src/components/todo/task-board.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
  ];

  for (const [rel, material, raio, quantas] of MATERIAIS_T4) {
    it(`${rel}: ${quantas}× ${material} com ${raio}, sem borda nem fundo concorrente`, () => {
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
        // Depois da constante, `border`, `border-border` e `bg-*` sem variante removeriam parte do
        // material (twMerge): o estado entra em outro literal do `cn()`, depois dela.
        for (const c of l.texto.split(/\s+/)) {
          expect(c, `classe que briga com ${material}`).not.toMatch(/^(?:border|border-border|bg-.+|shadow-.+)$/);
        }
      }
    });
  }

  it("chat-client: a bolha do assistente é ladrilho (no /ia e no painel), com o raio da bolha e o erro depois", () => {
    const fonte = fonteSemComentarios(path.join(RAIZ, "src/components/ai/chat-client.tsx"));
    expect(fonte).toMatch(
      /import \{[^}]*\bMATERIAL_LADRILHO\b[^}]*\} from "@\/components\/ui\/materiais"/,
    );
    const bolhas = aberturas(fonte, "div").filter((a) => a.includes("${MATERIAL_LADRILHO}"));
    expect(bolhas, "uma bolha com o material").toHaveLength(1);
    const bolha = bolhas[0] ?? "";
    expect(bolha).toMatch(/rounded-2xl/);
    expect(bolha).not.toMatch(/border bg-card/);
    // A borda de falha vem DEPOIS da constante, ou o material a apagaria.
    expect(bolha.indexOf("border-destructive/40")).toBeGreaterThan(bolha.indexOf("MATERIAL_LADRILHO"));
    // A bolha do dono continua tingida (é dela, não material).
    expect(bolha).toMatch(/bg-primary\/10 text-foreground/);
  });

  it("habit-card: concluído sem o tingimento do fundo; o estado segue dito por círculo, texto riscado e borda", () => {
    const fonte = fonteSemComentarios(path.join(RAIZ, "src/components/habits/habit-card.tsx"));
    const [card] = aberturas(fonte, "Card");
    expect(card).not.toMatch(/bg-primary/);
    expect(card).toMatch(/border-l-4/);
    expect(card).toMatch(/borderLeftColor/);
    expect(fonte).toMatch(/checked=\{habit\.todayDone\}/);
    expect(fonte).toMatch(/habit\.todayDone &&\s*"text-muted-foreground line-through/);
  });

  it("insights-client: o insight não vigente perde o fundo e continua dito pelo selo de texto", () => {
    const fonte = fonteSemComentarios(path.join(RAIZ, "src/components/ai/insights-client.tsx"));
    const cards = aberturas(fonte, "Card");
    expect(cards.some((c) => /bg-muted/.test(c))).toBe(false);
    expect(fonte).toMatch(/ROTULO_DO_ESTADO_DE_INSIGHT\[insight\.estado\.estado\]/);
    expect(fonte).toMatch(/\{!vigente \? \(\s*<Badge variant="outline"/);
  });

  it("a célula do dia do TO-DO é a exceção: continua bg-card, sem material e sem controle novo", () => {
    const fonte = fonteSemComentarios(path.join(RAIZ, "src/components/todo/task-calendar.tsx"));
    expect(fonte).not.toMatch(/MATERIAL_/);
    expect(ocorrenciasDeBgCard(fonte).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------
// 09-F · T5 · Treinos e Dieta. O ancestral de cada peça foi conferido lendo quem a renderiza
// (relatório da task): direto na névoa é cartão; dentro de Card é ladrilho.
// ---------------------------------------------------------------------------------------------

describe("09-F · T5 · superfícies de Treinos e Dieta", () => {
  const RAIZ = path.resolve(SRC, "..");
  const T = "src/app/(app)/treinos/";
  const MATERIAIS_T5: Array<[arquivo: string, material: string, raio: string, quantas: number]> = [
    // Dieta: o resumo da lista de compras está direto na névoa e usa /60 (regra: ladrilho).
    ["src/app/(app)/nutricao/compras/shopping-client.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 1],
    // Treinos: barras de filtro e de ação, linhas e itens de lista direto na névoa.
    [`${T}calendario/calendar-client.tsx`, "MATERIAL_CARTAO", "rounded-[16px]", 1],
    [`${T}evolucao/evolution-client.tsx`, "MATERIAL_CARTAO", "rounded-[16px]", 1],
    [`${T}exercicios/exercises-client.tsx`, "MATERIAL_CARTAO", "rounded-[16px]", 1],
    // Barra de ações em massa e cartão da linha do tempo na névoa; a linha da sessão está dentro do
    // Card do grupo (ladrilho).
    // + a `SessionRow` do agrupamento "nenhum", que também está direto na névoa (`sobreNevoa`).
    [`${T}historico/history-client.tsx`, "MATERIAL_CARTAO", "rounded-[16px]", 3],
    [`${T}historico/history-client.tsx`, "MATERIAL_LADRILHO", "rounded-[14px]", 1],
    [`${T}programas/programs-client.tsx`, "MATERIAL_CARTAO", "rounded-[16px]", 1],
    // O treino dentro do programa expandido está no CardContent do programa.
    [`${T}programas/programs-client.tsx`, "MATERIAL_LADRILHO", "rounded-[14px]", 1],
    // O recorde está dentro do Card "Constância".
    [`${T}recordes/records-client.tsx`, "MATERIAL_LADRILHO", "rounded-[14px]", 1],
    [`${T}treinos/workouts-client.tsx`, "MATERIAL_CARTAO", "rounded-[16px]", 2],
    [`${T}treinos/[id]/builder-client.tsx`, "MATERIAL_CARTAO", "rounded-[16px]", 1],
    // O painel de filtros avançados é `bg-card/40` (regra: ladrilho), na névoa.
    ["src/components/training/exercise-filters.tsx", "MATERIAL_LADRILHO", "rounded-[14px]", 1],
    // Sessão ao vivo: só material e raio (rounded-2xl já era 16 px). Layout, cronômetro e handlers
    // intactos.
    ["src/components/training/session/rest-panel.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
    ["src/components/training/session/session-live-client.tsx", "MATERIAL_CARTAO", "rounded-[16px]", 1],
  ];

  for (const [rel, material, raio, quantas] of MATERIAIS_T5) {
    it(`${rel}: ${quantas}× ${material} com ${raio}, sem borda nem fundo concorrente`, () => {
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
        for (const c of l.texto.split(/\s+/)) {
          expect(c, `classe que briga com ${material}`).not.toMatch(/^(?:border|border-border|bg-.+|shadow-.+)$/);
        }
        expect(l.texto, "raio antigo no mesmo literal").not.toMatch(/rounded-(?:lg|xl|2xl)\b/);
      }
    });
  }

  it("history-client: SessionRow só é cartão quando está direto na névoa (sobreNevoa), senão ladrilho", () => {
    const fonte = fonteSemComentarios(path.join(RAIZ, `${T}historico/history-client.tsx`));
    const usos = aberturas(fonte, "SessionRow");
    expect(usos, "três usos de SessionRow").toHaveLength(3);
    const sobre = usos.filter((u) => /\bsobreNevoa\b/.test(u));
    expect(sobre, "um uso na névoa").toHaveLength(1);
    // O uso na névoa é o do agrupamento "nenhum" (sem Card em volta); os outros dois estão no Card.
    const nenhum = fonte.indexOf('grouping === "nenhum"');
    expect(nenhum).toBeGreaterThan(0);
    expect(fonte.indexOf(sobre[0] ?? "")).toBeGreaterThan(nenhum);
    const emCard = usos.filter((u) => !/\bsobreNevoa\b/.test(u));
    for (const u of emCard) {
      const i = fonte.indexOf(u);
      expect(fonte.lastIndexOf("<Card", i), "dentro de um Card").toBeGreaterThan(fonte.lastIndexOf("</Card>", i));
    }
    // A definição escolhe o material pela prop.
    expect(fonte).toMatch(/sobreNevoa\s*\?\s*`\$\{MATERIAL_CARTAO\} rounded-\[16px\]`\s*:\s*`\$\{MATERIAL_LADRILHO\} rounded-\[14px\]`/);
  });

  it("calendar-client: o estado 'planejado' é ladrilho e os outros sete continuam distintos, com ícone ou rótulo", () => {
    const fonte = fonteSemComentarios(path.join(RAIZ, `${T}calendario/calendar-client.tsx`));
    const mapa = fonte.match(/const STATUS_STYLES[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
    expect(mapa).not.toBe("");
    expect(mapa).toMatch(/planejado:\s*MATERIAL_LADRILHO,/);
    // Cada estado continua com o SEU tratamento (borda/tom/traço), nenhum igual ao do planejado.
    const valores = [...mapa.matchAll(/(\w+):\s*(?:"([^"]*)"|(MATERIAL_LADRILHO))/g)].map((m) => [m[1], m[2] ?? m[3]]);
    expect(valores.map((v) => v[0])).toEqual([
      "planejado", "hoje", "atrasado", "concluido", "nao_realizado", "reagendado", "cancelado", "descanso",
    ]);
    expect(new Set(valores.map((v) => v[1])).size, "oito tratamentos distintos").toBe(8);
    expect(mapa).toMatch(/hoje:\s*"border-primary\/50 bg-primary\/10"/);
    expect(mapa).toMatch(/cancelado:[^\n]*line-through/);
    expect(mapa).toMatch(/descanso:\s*"border-dashed/);
    // O estado não fica só na cor: ícone por estado e rótulo em texto continuam.
    expect(fonte).toMatch(/const STATUS_ICONE/);
    expect(fonte).toMatch(/title=\{ROTULOS_DO_STATUS\[status\]\}/);
    // O arrasto continua dito pela sombra e pela opacidade, e o alvo por `isOver`.
    expect(fonte).toMatch(/isDragging && "z-20 opacity-90 shadow-lg"/);
    expect(fonte).toMatch(/isOver && "border-primary bg-primary\/10 ring-2 ring-primary\/30"/);
  });

  it("os cartões de Dieta com borda de situação perdem só o fundo e mantêm a borda e o texto", () => {
    const casos: Array<[string, RegExp, RegExp]> = [
      ["src/app/(app)/nutricao/compras/shopping-client.tsx", /<Card className="border-primary\/30">/, /item selecionado|itens selecionados/],
      ["src/app/(app)/nutricao/diario/diary-client.tsx", /<Card className="border-primary\/30">/, /Há \{props\.planned\.length\} refeição/],
      ["src/app/(app)/nutricao/metas/goals-client.tsx", /<Card className="border-amber-500\/40">/, /sobreposi/],
      ["src/app/(app)/nutricao/receitas/recipes-client.tsx", /<Card className="border-primary\/30">/, /selecionada/],
      ["src/app/(app)/nutricao/refeicoes/meal-templates-client.tsx", /<Card className="border-primary\/30">/, /selecionada/],
      ["src/components/nutrition/pantry-panel.tsx", /<Card className="border-primary\/30">/, /abaixo do estoque mínimo/],
    ];
    for (const [rel, borda, texto] of casos) {
      const fonte = fonteSemComentarios(path.join(RAIZ, rel));
      const achou = borda.exec(fonte);
      expect(achou, rel).not.toBeNull();
      // O texto tem de estar DENTRO do <Card> tingido, não em qualquer ponto do arquivo.
      const de = achou?.index ?? 0;
      const ate = fonte.indexOf("</Card>", de);
      expect(ate, `${rel}: Card fechado`).toBeGreaterThan(de);
      expect(fonte.slice(de, ate), `${rel}: a situação é dita por texto no Card`).toMatch(texto);
    }
  });

  it("pantry-panel: o aviso de escopo é bg-tile com a borda tracejada, sem constante", () => {
    const fonte = fonteSemComentarios(path.join(RAIZ, "src/components/nutrition/pantry-panel.tsx"));
    const aviso = literais(fonte).filter((l) => l.texto.includes("border-dashed"));
    expect(aviso).toHaveLength(1);
    const classes = (aviso[0]?.texto ?? "").split(/\s+/);
    expect(classes).toContain("bg-tile");
    expect(classes).toContain("border");
    expect(classes).toContain("border-dashed");
    expect(classes).toContain("border-border");
    expect(fonte).not.toMatch(/MATERIAL_/);
  });

  it("estados que ficam depois da constante: seleção, descanso concluído e hover", () => {
    const hist = fonteSemComentarios(path.join(RAIZ, `${T}historico/history-client.tsx`));
    // Seleção: a borda continua; a caixa marcada (checked) já diz o estado em forma.
    expect(hist).toMatch(/selected && "border-primary\/60",/);
    expect(hist).toMatch(/checked=\{selected\}/);
    expect(hist).toMatch(/hover:border-primary\/50/);
    for (const rel of [`${T}exercicios/exercises-client.tsx`, `${T}treinos/workouts-client.tsx`]) {
      expect(fonteSemComentarios(path.join(RAIZ, rel)), rel).toMatch(/selected\.has\([\w.]+\) && "border-primary\/75"/);
    }
    const rest = fonteSemComentarios(path.join(RAIZ, "src/components/training/session/rest-panel.tsx"));
    expect(rest).toMatch(/over && "border-primary",/);
    expect(rest).not.toMatch(/bg-primary\/5/);
    // O descanso concluído continua dito por texto e pelo relógio em primary.
    expect(rest).toMatch(/Descanso concluído/);
    expect(rest).toMatch(/over && "text-primary"/);
  });
});

// ---------------------------------------------------------------------------------------------
// 09-F · T6 · anéis e peças de estilo próprio. O anel (`ring`) é `box-shadow`: o vão do
// `ring-offset` é pintado com uma cor OPACA e sobre o vidro aparece como um remendo. O contorno
// (`outline`) deixa o vão transparente. Cartão e linha selecionada trocam o anel pela BORDA.
// ---------------------------------------------------------------------------------------------

describe("09-F · T6 · anéis e peças de estilo próprio", () => {
  const RAIZ = path.resolve(SRC, "..");
  const fonteDe = (rel: string) => fonteSemComentarios(path.join(RAIZ, rel));
  /** Classes de todos os literais de uma fonte. */
  const classesDosLiterais = (fonte: string) =>
    literais(fonte).flatMap((l) => l.texto.split(/\s+/).filter(Boolean));

  it("nenhum ring-offset-background (nem ring-offset-card) em src/", () => {
    const sobrou: string[] = [];
    for (const arquivo of todosOsTsx()) {
      const fonte = fonteSemComentarios(arquivo);
      for (const m of fonte.matchAll(/ring-offset-(?:background|card)\b/g)) {
        sobrou.push(`${relativo(arquivo)}:${linhaDe(fonte, m.index ?? 0)}`);
      }
    }
    expect(sobrou, `O vão do ring-offset é opaco sobre o vidro: ${sobrou.join(", ")}`).toEqual([]);
  });

  it("nenhum <Card> tem ring-* no className (a situação do cartão é a borda)", () => {
    const sobrou: string[] = [];
    for (const arquivo of foraDeUi()) {
      const fonte = fonteSemComentarios(arquivo);
      let de = 0;
      for (const abertura of aberturas(fonte, "Card")) {
        const i = fonte.indexOf(abertura, de);
        de = i + abertura.length;
        const k = abertura.indexOf("className=");
        if (k < 0) continue;
        const classes = classesDosLiterais(abertura.slice(k));
        // `ring-0` é o reset que tira o anel (cartão sem material), não um anel.
        if (classes.some((c) => /^ring(?:-|$)/.test(c) && c !== "ring-0")) sobrou.push(`${relativo(arquivo)}:${linhaDe(fonte, i)}`);
      }
    }
    expect(sobrou, `Card com anel: ${sobrou.join(", ")}`).toEqual([]);
  });

  it("os dois cartões com situação (painel do dashboard e programa ativo) usam border-primary/75", () => {
    const dash = fonteDe("src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx");
    expect(dash).toMatch(/<Card className="overflow-hidden border-primary\/75">/);
    const prog = fonteDe("src/app/(app)/treinos/programas/programs-client.tsx");
    expect(prog).toMatch(/<Card className=\{cn\(program\.isActive && "border-primary\/75"\)\}>/);
  });

  it("linha selecionada (exercícios e treinos): border-primary/75 depois da constante, sem anel", () => {
    for (const rel of [
      "src/app/(app)/treinos/exercicios/exercises-client.tsx",
      "src/app/(app)/treinos/treinos/workouts-client.tsx",
    ]) {
      const fonte = fonteDe(rel);
      expect(fonte, rel).toMatch(/\$\{MATERIAL_CARTAO\}[^`]*`,\s*selected\.has\([\w.]+\) && "border-primary\/75",/);
      expect(fonte, rel).not.toMatch(/ring-1 ring-primary\/40/);
      // A caixa marcada continua dizendo a seleção em forma.
      expect(fonte, rel).toMatch(/checked=\{selected\.has\(/);
    }
  });

  it("module-shell: o item ativo é bg-pill-strong com texto foreground e sem anel", () => {
    const fonte = fonteDe("src/components/shared/module-shell.tsx");
    const ativo = /ativo\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/.exec(fonte);
    expect(ativo, "ternário do item ativo").not.toBeNull();
    const classes = (ativo?.[1] ?? "").split(/\s+/);
    expect(classes).toContain("bg-pill-strong");
    expect(classes).toContain("text-foreground");
    expect(classes).toContain("font-medium");
    expect(classes.filter((c) => /^ring(?:-|$)/.test(c)), "sem anel no ativo").toEqual([]);
    expect(classes).not.toContain("bg-primary/10");
    // O ativo continua dito sem cor: aria-current e o ícone em primary.
    expect(fonte).toMatch(/aria-current=\{ativo \? "page" : undefined\}/);
    expect(fonte).toMatch(/ativo && "text-primary"/);
  });

  it("os sete quadradinhos de ícone perdem o anel e mantêm o tom", () => {
    const sete = [
      "src/app/(app)/configuracoes/page.tsx",
      "src/app/(app)/financeiro/page.tsx",
      "src/app/(app)/importar/import-history.tsx",
      "src/app/(app)/importar/import-upload.tsx",
      "src/components/dashboard/general/finance-card.tsx",
      "src/components/dashboard/general/primitives.tsx",
      "src/components/shared/empty-state.tsx",
    ];
    for (const rel of sete) {
      const fonte = fonteDe(rel);
      expect(fonte, `${rel}: sem ring-primary/15`).not.toMatch(/ring-primary\/15/);
      expect(fonte, `${rel}: o tom bg-primary/10 continua`).toMatch(/bg-primary\/10/);
    }
    // E nenhum outro literal do projeto junta o tom e o aro de 15%.
    const sobrou: string[] = [];
    for (const arquivo of todosOsTsx()) {
      const fonte = fonteSemComentarios(arquivo);
      for (const l of literais(fonte)) {
        if (/\bbg-primary\/10\b/.test(l.texto) && /\bring-1 ring-primary\/15\b/.test(l.texto)) {
          sobrou.push(`${relativo(arquivo)}:${linhaDe(fonte, l.i)}`);
        }
      }
    }
    expect(sobrou).toEqual([]);
  });

  it("o anel de 'hoje' e o da seleção de cor viram outline com vão transparente", () => {
    const casos: Array<[rel: string, padrao: RegExp]> = [
      ["src/components/training/consistency-calendar.tsx", /const HOJE_STYLE = "outline-2 outline-solid outline-offset-1 outline-primary";/],
      ["src/components/habits/habit-heatmap.tsx", /const ANEL_HOJE = "outline-2 outline-solid outline-offset-1 outline-foreground";/],
      ["src/components/habits/water-view.tsx", /const ANEL_HOJE = "outline-2 outline-solid outline-offset-1 outline-foreground";/],
      ["src/components/shared/deep-link-highlight.tsx", /active && "outline-2 outline-solid outline-offset-2 outline-primary"/],
    ];
    for (const [rel, padrao] of casos) {
      const fonte = fonteDe(rel);
      expect(fonte, rel).toMatch(padrao);
      expect(fonte, rel).not.toMatch(/(^|[\s"'`])ring-(?:2|offset)/);
    }
  });

  it("os quatro formulários de cor: selecionada = outline-primary; o 'sem cor' ganha borda", () => {
    const forms = [
      "src/app/(app)/estudos/course-form.tsx",
      "src/app/(app)/habitos/habit-form.tsx",
      "src/app/(app)/rotinas/routine-form.tsx",
      "src/app/(app)/tarefas/project-form.tsx",
    ];
    for (const rel of forms) {
      const fonte = fonteDe(rel);
      // `outline-solid` é obrigatório: o foco da amostra usa `outline-none`, que zera o estilo.
      expect(fonte, rel).toMatch(/field\.value === c && "outline-2 outline-solid outline-offset-1 outline-primary"/);
      expect(fonte, rel).toMatch(/!field\.value &&\s*"outline-2 outline-solid outline-offset-1 outline-primary border-primary text-foreground"/);
      expect(fonte, rel).not.toMatch(/ring-2|ring-offset/);
      // A seleção continua dita por forma: o visto dentro da amostra e aria-pressed.
      expect(fonte, rel).toMatch(/aria-pressed=\{field\.value === c\}/);
      expect(fonte, rel).toMatch(/<Check className="size-3\.5 text-white"/);
    }
  });

  it("calendário de consistência: nenhum estado ganha vermelho nem cobrança", () => {
    const fonte = fonteDe("src/components/training/consistency-calendar.tsx");
    const mapa = fonte.match(/const STATE_STYLE[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
    expect(mapa).not.toBe("");
    expect(mapa).not.toMatch(/destructive|red-|rose-|amber-|orange-/);
  });

  it("deep-link-highlight: sem transition-shadow (o destaque é outline, não sombra: a classe ficaria morta)", () => {
    // `outline-style` não é interpolável: o contorno entra de uma vez, e uma transição de
    // `outline-color` partiria da cor do texto. Sem fade real, sem classe.
    const fonte = fonteDe("src/components/shared/deep-link-highlight.tsx");
    expect(fonte).not.toMatch(/transition-/);
  });

  it("gaveta de registros: sem rounded-t-2xl (o raio é o da SheetContent)", () => {
    const fonte = fonteDe("src/components/shared/painel/gaveta-de-registros-impl.tsx");
    expect(fonte).not.toMatch(/rounded-t-2xl/);
    const abertura = aberturas(fonte, "SheetContent")[0] ?? "";
    expect(abertura).not.toBe("");
    expect(classesDosLiterais(abertura).filter((c) => /rounded/.test(c))).toEqual([]);
    expect(abertura).toMatch(/data-\[side=bottom\]:max-h-\[88dvh\]/);
  });
});

describe("09-F · T7 · hierarquia de títulos", () => {
  const raiz = path.resolve(SRC, "..");
  const fonteDe = (rel: string) => fonteSemComentarios(path.join(raiz, rel));
  const classesDe = (abertura: string) =>
    (/className="([^"]*)"/.exec(abertura)?.[1] ?? "").split(/\s+/).filter(Boolean);

  it("Bloco: o título é a tag vinda de `nivel` (2 ou 3, padrão 3), sem <h3> fixo", () => {
    const fonte = fonteDe("src/components/shared/painel/bloco.tsx");
    expect(fonte).toContain("nivel?: 2 | 3");
    expect(fonte).toMatch(/nivel\s*=\s*3\b/);
    expect(fonte).toMatch(/const Titulo\s*=\s*nivel === 2 \? "h2" : "h3"/);
    expect(fonte).not.toMatch(/<h3\b/);
    const titulo = aberturas(fonte, "Titulo")[0] ?? "";
    expect(titulo).not.toBe("");
    // O tamanho visual é o mesmo de antes: 17 px, semibold, tracking e quebra de palavra.
    for (const c of ["text-[1.0625rem]", "leading-snug", "font-semibold", "tracking-[-0.018em]", "break-words"]) {
      expect(classesDe(titulo), c).toContain(c);
    }
  });

  it.each([
    "src/app/(app)/faturas/statements-client.tsx",
    "src/app/(app)/parcelamentos/installments-client.tsx",
    "src/components/cartoes/proximos-meses.tsx",
    "src/components/cartoes/relatorio-de-cartao.tsx",
  ])("%s: página sem <h2> — todo <Bloco> passa nivel={2}", (rel) => {
    const blocos = aberturas(fonteDe(rel), "Bloco");
    expect(blocos.length).toBeGreaterThan(0);
    for (const a of blocos) expect(a, a).toMatch(/\bnivel=\{2\}/);
  });

  it("relatórios e painel financeiro: já há <h2> de seção acima — os <Bloco> ficam no padrão 3", () => {
    for (const rel of [
      "src/app/(app)/relatorios/relatorios-client.tsx",
      "src/app/(app)/dashboard/financeiro/financial-dashboard-client.tsx",
    ]) {
      for (const a of aberturas(fonteDe(rel), "Bloco")) expect(a, rel).not.toMatch(/\bnivel=/);
    }
  });

  it("próximos meses: o título de cada mês é <h3> (sob o <h2> do Bloco), sem pular para <h4>", () => {
    const fonte = fonteDe("src/components/cartoes/proximos-meses.tsx");
    expect(fonte).not.toMatch(/<h4\b/);
    const h3 = aberturas(fonte, "h3")[0] ?? "";
    expect(classesDe(h3)).toEqual(["min-w-0", "text-sm", "font-semibold"]);
  });

  it("EmptyState: o título é a tag vinda de `nivel` (2, 3 ou 4; padrão 2), sem <h3> fixo", () => {
    const fonte = fonteDe("src/components/shared/empty-state.tsx");
    expect(fonte).toContain("nivel?: 2 | 3 | 4");
    expect(fonte).toMatch(/nivel\s*=\s*2\b/);
    expect(fonte).toMatch(/const Titulo\s*=\s*`h\$\{nivel\}` as const/);
    expect(fonte).not.toMatch(/<h3\b/);
    expect(classesDe(aberturas(fonte, "Titulo")[0] ?? "")).toEqual(["text-base", "font-semibold"]);
  });

  // Chamadores que moram DENTRO de uma seção já titulada na mesma tela: o estado vazio é filho
  // desse título e não pode empatar com ele. [arquivo, título do estado vazio, nível esperado]
  it.each([
    ["src/app/(app)/estudos/[id]/course-detail-client.tsx", "Nenhuma sessão registrada para este curso", 3],
    ["src/components/studies/course-tree.tsx", "Sem módulos ainda", 3],
    ["src/components/studies/vocabulary-view.tsx", "Sem vocabulário", 3],
    ["src/components/studies/vocabulary-view.tsx", "Nenhum termo neste nível", 3],
    ["src/components/studies/practice-view.tsx", "Nenhuma prática registrada ainda", 4],
    ["src/app/(app)/rotinas/routines-client.tsx", "Nenhuma rotina para hoje", 3],
    ["src/app/(app)/tarefas/tasks-client.tsx", "Dia tranquilo por aqui", 3],
    ["src/app/(app)/tarefas/tasks-client.tsx", "Nenhuma rotina para hoje", 3],
    ["src/app/(app)/treinos/page.tsx", "Nenhum treino registrado nesta semana ainda", 3],
    ["src/app/(app)/ia/comprovantes/page.tsx", "Nenhum comprovante enviado", 3],
  ] as const)("%s: EmptyState «%s» fica sob um título e passa nivel={%i}", (rel, titulo, nivel) => {
    const alvo = aberturas(fonteDe(rel), "EmptyState").filter((a) => a.includes(`"${titulo}"`));
    expect(alvo, titulo).toHaveLength(1);
    expect(alvo[0]).toMatch(new RegExp(String.raw`\bnivel=\{${nivel}\}`));
  });

  it("colunas do quadro: o título da coluna é <h2>, com as mesmas classes", () => {
    const todo = fonteDe("src/components/todo/task-board.tsx");
    expect(todo).not.toMatch(/<h3\b/);
    expect(classesDe(aberturas(todo, "h2")[0] ?? "")).toEqual(["min-w-0", "flex-1", "truncate", "text-sm", "font-semibold"]);
    const tarefas = fonteDe("src/components/tasks/kanban-board.tsx");
    expect(tarefas).not.toMatch(/<h3\b/);
    expect(classesDe(aberturas(tarefas, "h2")[0] ?? "")).toEqual(["text-sm", "font-semibold"]);
  });

  it("preferências da IA: as três seções são <h2> (irmãs de «Provedores» e «Seus dados»), mesmas classes", () => {
    const fonte = fonteDe("src/components/ai/ai-preferences-form.tsx");
    expect(fonte).not.toMatch(/<h3\b/);
    const h2 = aberturas(fonte, "h2");
    expect(h2).toHaveLength(3);
    for (const a of h2) expect(classesDe(a)).toEqual(["text-sm", "font-medium"]);
  });
});
