/**
 * REDESIGN-09-B — as primitivas em vidro, provadas por chamada direta de `cva`/`cn`
 * (o projeto não tem teste de componente). Um `describe` por primitiva.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALFA_PERIGO } from "@/lib/theme/alfas";
import { css, SRC, semComentarios } from "@/lib/theme/ler-tokens";
import { badgeVariants } from "./badge";
import { buttonVariants } from "./button";
import { Checkbox } from "./checkbox";
import { Input } from "./input";
import { PRESSAO } from "./materiais";
import { SelectTrigger } from "./select";
import { Separator } from "./separator";
import { Skeleton } from "./skeleton";
import { Switch } from "./switch";
import { tabsListVariants, TabsTrigger } from "./tabs";
import { Textarea } from "./textarea";

describe("Button", () => {
  const padrao = buttonVariants();

  it("é pílula, com preenchimento primário, mola e movimento reduzido", () => {
    for (const classe of [
      "rounded-full",
      "bg-primary-fill",
      "text-primary-fill-foreground",
      "ease-mola",
      "motion-reduce:",
    ]) {
      expect(padrao, classe).toContain(classe);
    }
  });

  it("não conserva o deslocamento nem o azul antigo", () => {
    expect(padrao).not.toContain("translate-y-px");
    expect(padrao).not.toMatch(/bg-primary(\s|$|\/)/);
    expect(padrao).not.toContain("hover:bg-primary/80");
    expect(padrao).toContain("hover:brightness-95");
    expect(padrao).not.toContain("hover:brightness-110");
  });

  it("o brilho do botão padrão termina acima da letra (a letra ocupa de 30% a 70% da altura)", () => {
    const fim = padrao.match(/rgba\(255,255,255,\.\d+\),transparent_(\d+)%/);
    expect(fim).not.toBeNull();
    expect(Number(fim![1])).toBeLessThanOrEqual(30);
  });

  it("a escala de pressão só vale fora de gatilho de menu (aria-haspopup)", () => {
    expect(padrao).toMatch(/not-aria-\[haspopup\]:active:scale/);
    // nenhum `active:scale` sem o prefixo (o twMerge não o removeria do gatilho de menu)
    for (const m of padrao.matchAll(/(\S*)active:scale\S*/g)) {
      expect(m[1], m[0]).toMatch(/(^|:)not-aria-\[haspopup\]:$/);
    }
    for (const m of padrao.matchAll(/(\S*)active:duration-120/g)) {
      expect(m[1], m[0]).toMatch(/(^|:)not-aria-\[haspopup\]:$/);
    }
    // e o movimento reduzido fica parado: a escala só nasce sob `motion-safe:`
    expect(padrao).toContain("motion-safe:not-aria-[haspopup]:active:scale");
    expect(padrao).toContain("motion-reduce:transition-none");
  });

  it("a transição cobre `scale` (no Tailwind v4 a escala é a propriedade `scale`, não `transform`)", () => {
    for (const texto of [padrao, PRESSAO]) {
      const lista = texto.match(/transition-\[([^\]]+)\]/)?.[1].split(",");
      expect(lista).toContain("scale");
      expect(lista).toContain("transform");
    }
  });

  it("foco por contorno, não por anel", () => {
    expect(padrao).toContain("focus-visible:outline-solid");
    expect(padrao).toContain("focus-visible:outline-2");
    expect(padrao).toContain("focus-visible:outline-offset-2");
    expect(padrao).toContain("focus-visible:outline-ring");
    expect(padrao).not.toContain("focus-visible:ring-3");
  });

  const alturas = [
    ["default", "h-8"],
    ["xs", "h-6"],
    ["sm", "h-7"],
    ["lg", "h-9"],
    ["icon", "size-8"],
    ["icon-xs", "size-6"],
    ["icon-sm", "size-7"],
    ["icon-lg", "size-9"],
  ] as const;

  it.each(alturas)("tamanho %s mantém a altura %s e é pílula", (size, altura) => {
    const classes = buttonVariants({ size });
    expect(classes.split(/\s+/)).toContain(altura);
    expect(classes).not.toContain("rounded-[");
  });

  it("outline e secondary usam o material de pílula", () => {
    for (const variant of ["outline", "secondary"] as const) {
      const classes = buttonVariants({ variant });
      expect(classes, variant).toContain("bg-pill");
      expect(classes, variant).toContain("hover:bg-pill-strong");
    }
  });

  it("ghost não ganha azul no texto", () => {
    const classes = buttonVariants({ variant: "ghost" });
    expect(classes).toContain("hover:bg-primary/10");
    expect(classes).toContain("hover:text-foreground");
  });

  it("destructive usa o alfa medido na Task 1", () => {
    const classes = buttonVariants({ variant: "destructive" });
    const alfa = Math.round(ALFA_PERIGO * 100);
    expect(classes.split(/\s+/)).toContain(`bg-destructive/${alfa}`);
    expect(classes).toContain("text-destructive");
    expect(classes).toContain("border-destructive/25");
  });
});

/** Corpo da função `nome` em `card.tsx`, sem comentários, até a próxima função de topo. */
function corpoDaFuncao(codigo: string, nome: string): string {
  const inicio = codigo.indexOf(`function ${nome}(`);
  if (inicio < 0) return "";
  const proxima = codigo.indexOf("\nfunction ", inicio + 1);
  const fim = codigo.indexOf("\nexport {", inicio);
  const limites = [proxima, fim].filter((n) => n > 0);
  return codigo.slice(inicio, limites.length ? Math.min(...limites) : undefined);
}

/** Todos os arquivos `.tsx` sob `src/`. */
function arquivosTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivosTsx(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

/**
 * Texto de cada abertura `<Tag ...>` (só a tag exata, não `TagHeader` etc.): vai até o `>` que
 * fecha a tag, ignorando `>` dentro de `{ }` (como `=>`) e de aspas.
 */
function aberturasDe(codigo: string, tag: string): string[] {
  const achadas: string[] = [];
  for (const m of codigo.matchAll(new RegExp(`<${tag}(?![A-Za-z0-9_])`, "g"))) {
    let profundidade = 0;
    let aspas: string | null = null;
    let i = m.index;
    for (; i < codigo.length; i += 1) {
      const c = codigo[i];
      if (aspas) {
        if (c === aspas) aspas = null;
      } else if (profundidade === 0 && (c === '"' || c === "'")) aspas = c;
      else if (c === "{") profundidade += 1;
      else if (c === "}") profundidade -= 1;
      else if (c === ">" && profundidade === 0) break;
    }
    achadas.push(codigo.slice(m.index, i + 1));
  }
  return achadas;
}

const aberturasDeCard = (codigo: string) => aberturasDe(codigo, "Card");

describe("Card", () => {
  const fonte = semComentarios(
    fs.readFileSync(path.join(SRC, "components", "ui", "card.tsx"), "utf8"),
  );
  const card = corpoDaFuncao(fonte, "Card");

  it("desconta da medida o 1px da borda: a largura interna é a de antes do vidro", () => {
    expect(card).toContain("[--card-spacing:15px]");
    expect(card).toContain("data-[size=sm]:[--card-spacing:11px]");
  });

  it("é vidro de cartão: material importado, raio de 24px (20px no sm)", () => {
    expect(fonte).toContain('import { MATERIAL_CARTAO } from "./materiais"');
    expect(card).toContain("MATERIAL_CARTAO");
    expect(card).toContain("rounded-[24px]");
    expect(card).toContain("data-[size=sm]:rounded-[20px]");
  });

  it("não conserva o anel, o raio antigo nem classes vidro-*", () => {
    expect(card).not.toContain("ring-1");
    expect(card).not.toContain("ring-foreground");
    expect(card).not.toContain("rounded-xl");
    expect(card).not.toContain("vidro-");
    expect(card).not.toMatch(/bg-card(\s|")/);
  });

  it("cabeçalho, rodapé e imagens herdam o raio (concêntrico, sem número repetido)", () => {
    for (const nome of ["Card", "CardHeader", "CardFooter"]) {
      const corpo = corpoDaFuncao(fonte, nome);
      expect(corpo, nome).not.toContain("rounded-t-xl");
      expect(corpo, nome).not.toContain("rounded-b-xl");
    }
    expect(corpoDaFuncao(fonte, "CardHeader")).toContain("rounded-t-[inherit]");
    expect(corpoDaFuncao(fonte, "CardFooter")).toContain("rounded-b-[inherit]");
    expect(card).toContain("*:[img:first-child]:rounded-t-[inherit]");
    expect(card).toContain("*:[img:last-child]:rounded-b-[inherit]");
  });

  it("o rodapé é ladrilho com filete de luz", () => {
    const rodape = corpoDaFuncao(fonte, "CardFooter");
    expect(rodape).toContain("border-t border-glass-border");
    expect(rodape).toContain("bg-tile");
    expect(rodape).not.toContain("bg-muted/50");
  });

  it("nenhum chamador apaga o fundo do cartão com bg-transparent sem bg-none", () => {
    // `bg-transparent` tira `bg-card`, mas o brilho do material é um `background-image`:
    // só `bg-none` o remove. Sem ele, um cartão que quer ser invisível aparece com brilho.
    const culpados: string[] = [];
    for (const arquivo of arquivosTsx(SRC)) {
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      for (const abertura of aberturasDeCard(codigo)) {
        if (/(^|[\s"'`:])bg-transparent(?=[\s"'`])/.test(abertura) && !/(^|[\s"'`:])bg-none(?=[\s"'`])/.test(abertura)) {
          culpados.push(path.relative(SRC, arquivo).replaceAll("\\", "/"));
        }
      }
    }
    expect(culpados).toEqual([]);
  });

  /** Aberturas de `<Card` em todo `src/`, com o arquivo de origem. */
  const todasAsAberturas = () =>
    arquivosTsx(SRC).flatMap((arquivo) =>
      aberturasDeCard(semComentarios(fs.readFileSync(arquivo, "utf8"))).map((abertura) => ({
        arquivo: path.relative(SRC, arquivo).replaceAll("\\", "/"),
        abertura,
      })),
    );
  /** Cada literal de string do `<Card ...>`: o que está junto num literal é aplicado junto. */
  const literais = (abertura: string) =>
    [...abertura.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)].map((m) =>
      (m[1] ?? m[2] ?? m[3]).split(/\s+/).filter(Boolean),
    );
  const todosOsLiterais = () =>
    todasAsAberturas().flatMap(({ arquivo, abertura }) =>
      literais(abertura).map((classes) => ({ arquivo, classes })),
    );

  it("só um cartão invisível (bg-transparent) pode tirar a sombra de vidro com shadow-none", () => {
    // por literal: `"overflow-hidden shadow-none"` incondicional com um `bg-transparent`
    // condicional em outro literal do mesmo <Card> ainda tira a sombra de todos os cartões
    const culpados = todosOsLiterais()
      .filter(({ classes }) => classes.includes("shadow-none") && !classes.includes("bg-transparent"))
      .map(({ arquivo }) => arquivo);
    expect(culpados).toEqual([]);
  });

  it("borda tracejada declara a cor da borda (senão herda o branco do vidro, invisível no claro)", () => {
    // largura (`border-0`, `border-2`), lado (`border-l-4`, `border-t`) e estilo não são cor
    const naoECor = /^(\d+|[xytblrse](-.*)?|dashed|dotted|solid|double|none|hidden)$/;
    const temCor = (classes: string[]) =>
      classes.some((t) => {
        const m = /^border-([a-z0-9-]+)(\/\d+)?$/.exec(t);
        return m !== null && !naoECor.test(m[1]);
      });
    const culpados = todosOsLiterais()
      .filter(({ classes }) => classes.includes("border-dashed") && !temCor(classes))
      .map(({ arquivo }) => arquivo);
    expect(culpados).toEqual([]);
  });
});

/** `className` que a primitiva entrega ao elemento, chamando a função direto (sem hooks, sem render). */
function classesDe(el: unknown): string {
  return (el as { props: { className: string } }).props.className;
}

/** Foco de campo (spec 6.7): anel de 2px (contorno sobre a borda) + halo suave de 4px; inválido continua vermelho. */
function focoDeCampo(base: string) {
  const c = base.split(/\s+/);
  for (const classe of [
    "focus-visible:border-ring",
    "focus-visible:outline-2",
    "focus-visible:outline-solid",
    "focus-visible:outline-ring",
    "focus-visible:outline-offset-[-1px]",
    "focus-visible:ring-4",
    "focus-visible:ring-ring/20",
    "aria-invalid:border-destructive",
    "aria-invalid:ring-destructive/20",
    "aria-invalid:focus-visible:outline-destructive",
  ]) {
    expect(c, classe).toContain(classe);
  }
  expect(c).toContain("outline-none");
}

describe("Input", () => {
  const fonte = semComentarios(fs.readFileSync(path.join(SRC, "components", "ui", "input.tsx"), "utf8"));
  const corpo = corpoDaFuncao(fonte, "Input");
  const base = classesDe(Input({}));

  it("é ladrilho: material importado, raio de 10px e halo de foco de 4px", () => {
    expect(fonte).toContain('import { MATERIAL_LADRILHO } from "./materiais"');
    expect(corpo).toContain("MATERIAL_LADRILHO");
    expect(base.split(/\s+/)).toContain("bg-tile");
    expect(base.split(/\s+/)).toContain("border-(--field-border)");
    focoDeCampo(base);
    expect(base).toContain("rounded-[10px]");
    expect(base).toContain("focus-visible:border-ring");
  });

  it("não conserva o raio, o fundo transparente nem o fundo escuro antigos", () => {
    expect(base).not.toContain("rounded-lg");
    expect(base).not.toMatch(/(^|\s)bg-transparent/);
    expect(base).not.toContain("dark:bg-input");
    expect(base).not.toContain("disabled:bg-input");
    expect(base).not.toContain("border-input");
  });

  it("mantém a altura e o inválido destrutivo", () => {
    expect(base.split(/\s+/)).toContain("h-8");
    expect(base).toContain("aria-invalid:border-destructive");
    expect(base).toContain("aria-invalid:ring-destructive/20");
  });

  it("o chamador vence: border-0 bg-transparent shadow-none apaga o ladrilho", () => {
    const c = classesDe(Input({ className: "border-0 bg-transparent shadow-none" })).split(/\s+/);
    expect(c).toContain("border-0");
    expect(c).not.toContain("border");
    expect(c).not.toContain("bg-tile");
    expect(c.some((t) => t.startsWith("shadow-[inset"))).toBe(false);
  });
});

describe("Textarea", () => {
  const fonte = semComentarios(fs.readFileSync(path.join(SRC, "components", "ui", "textarea.tsx"), "utf8"));
  const corpo = corpoDaFuncao(fonte, "Textarea");
  const base = classesDe(Textarea({}));

  it("é ladrilho: material importado, raio de 14px e halo de foco de 4px", () => {
    expect(fonte).toContain('import { MATERIAL_LADRILHO } from "./materiais"');
    expect(corpo).toContain("MATERIAL_LADRILHO");
    expect(base.split(/\s+/)).toContain("bg-tile");
    expect(base.split(/\s+/)).toContain("border-(--field-border)");
    focoDeCampo(base);
    expect(base).toContain("rounded-[14px]");
  });

  it("não conserva o raio, o fundo transparente nem o fundo escuro antigos", () => {
    expect(base).not.toContain("rounded-lg");
    expect(base).not.toMatch(/(^|\s)bg-transparent/);
    expect(base).not.toContain("dark:bg-input");
    expect(base).not.toContain("border-input");
  });

  it("mantém a altura mínima e o inválido destrutivo", () => {
    expect(base.split(/\s+/)).toContain("min-h-16");
    expect(base).toContain("aria-invalid:border-destructive");
  });
});

describe("SelectTrigger", () => {
  const fonte = semComentarios(fs.readFileSync(path.join(SRC, "components", "ui", "select.tsx"), "utf8"));
  const corpo = corpoDaFuncao(fonte, "SelectTrigger");
  const base = classesDe(SelectTrigger({ children: null }));

  it("é ladrilho: material importado, raio de 10px (9px no sm), hover de pílula e halo de 4px", () => {
    expect(fonte).toContain('import { MATERIAL_LADRILHO } from "./materiais"');
    expect(corpo).toContain("MATERIAL_LADRILHO");
    expect(base).toContain("rounded-[10px]");
    expect(base).toContain("data-[size=sm]:rounded-[9px]");
    expect(base).toContain("hover:bg-pill");
    focoDeCampo(base);
    expect(base.split(/\s+/)).toContain("bg-tile");
    expect(base.split(/\s+/)).toContain("border-(--field-border)");
  });

  it("não conserva o raio, o fundo transparente nem o fundo escuro antigos", () => {
    expect(base).not.toContain("rounded-lg");
    expect(base).not.toContain("--radius-md");
    expect(base).not.toMatch(/(^|\s)bg-transparent/);
    expect(base).not.toContain("dark:bg-input");
    expect(base).not.toContain("dark:hover:bg-input");
    expect(base).not.toContain("border-input");
  });

  it("mantém as alturas por tamanho e o inválido destrutivo", () => {
    expect(base).toContain("data-[size=default]:h-8");
    expect(base).toContain("data-[size=sm]:h-7");
    expect(base).toContain("aria-invalid:border-destructive");
  });

  it("o chamador vence: border-0 ring-1 rounded-full tira borda e raio do ladrilho", () => {
    const c = classesDe(SelectTrigger({ children: null, className: "rounded-full border-0 ring-1 ring-border" })).split(/\s+/);
    expect(c).toContain("rounded-full");
    expect(c).not.toContain("rounded-[10px]");
    expect(c).toContain("border-0");
    expect(c).not.toContain("border");
  });

  it("no size=sm o chamador precisa de data-[size=sm]:rounded-full para vencer o raio de 9px", () => {
    const sem = classesDe(SelectTrigger({ children: null, size: "sm", className: "rounded-full" })).split(/\s+/);
    expect(sem).toContain("data-[size=sm]:rounded-[9px]");
    const com = classesDe(
      SelectTrigger({ children: null, size: "sm", className: "rounded-full data-[size=sm]:rounded-full" }),
    ).split(/\s+/);
    expect(com).toContain("data-[size=sm]:rounded-full");
    expect(com).not.toContain("data-[size=sm]:rounded-[9px]");
  });

  it("o caller de import-review passa data-[size=sm]:rounded-full", () => {
    const f = fs.readFileSync(path.join(SRC, "app", "(app)", "importar", "import-review.tsx"), "utf8");
    expect(f).toContain("rounded-full data-[size=sm]:rounded-full border-0");
  });
});

// ---------------------------------------------------------------------------------------------
// Sobreposições (Task 6): Dialog, Sheet, Popover, DropdownMenu, Select, Tooltip, sonner.
// ---------------------------------------------------------------------------------------------

const lerUi = (arquivo: string) =>
  semComentarios(fs.readFileSync(path.join(SRC, "components", "ui", arquivo), "utf8"));

/** Conteúdos que são vidro de sobreposição: arquivo, função e o raio que cada um declara. */
const SOBREPOSICOES = [
  { arquivo: "dialog.tsx", funcao: "DialogContent", raio: "rounded-[28px]" },
  { arquivo: "sheet.tsx", funcao: "SheetContent", raio: "data-[side=right]:rounded-l-[28px]" },
  { arquivo: "popover.tsx", funcao: "PopoverContent", raio: "rounded-[18px]" },
  { arquivo: "dropdown-menu.tsx", funcao: "DropdownMenuContent", raio: "rounded-[18px]" },
  { arquivo: "dropdown-menu.tsx", funcao: "DropdownMenuSubContent", raio: "rounded-[18px]" },
  { arquivo: "select.tsx", funcao: "SelectContent", raio: "rounded-[18px]" },
  { arquivo: "tooltip.tsx", funcao: "TooltipContent", raio: "rounded-[10px]" },
] as const;

describe("Sobreposições em vidro", () => {
  for (const { arquivo, funcao, raio } of SOBREPOSICOES) {
    const corpo = corpoDaFuncao(lerUi(arquivo), funcao);

    it(`${funcao} é vidro de sobreposição, sem fundo, anel nem sombra próprios`, () => {
      expect(corpo, `${funcao} não encontrado`).not.toBe("");
      expect(corpo).toContain("vidro-sobreposicao");
      expect(corpo).not.toMatch(/(^|[\s"'`:])bg-popover(?![-\w])/);
      expect(corpo).not.toContain("ring-foreground/10");
      expect(corpo).not.toMatch(/(^|[\s"'`:])ring-1(?=[\s"'`])/);
      expect(corpo).not.toMatch(/(^|[\s"'`:])shadow-(md|lg)(?=[\s"'`])/);
      expect(corpo).toContain(raio);
    });
  }

  it("nenhum arquivo de ui/ usa o véu desfocado (vidro sobre vidro)", () => {
    const culpados = fs
      .readdirSync(path.join(SRC, "components", "ui"))
      .filter((n) => n.endsWith(".tsx"))
      .filter((n) => lerUi(n).includes("backdrop-blur-xs"));
    expect(culpados).toEqual([]);
  });

  it("o véu de Dialog e Sheet é preto translúcido, mais denso no escuro", () => {
    for (const [arquivo, funcao] of [
      ["dialog.tsx", "DialogOverlay"],
      ["sheet.tsx", "SheetOverlay"],
    ] as const) {
      const corpo = corpoDaFuncao(lerUi(arquivo), funcao);
      expect(corpo, funcao).toContain("bg-black/20 dark:bg-black/45");
      expect(corpo, funcao).not.toContain("bg-black/10");
      expect(corpo, funcao).not.toContain("backdrop-blur");
    }
  });

  it("Dialog: raio de 28px, rodapé herda o raio e usa ladrilho", () => {
    const fonte = lerUi("dialog.tsx");
    expect(corpoDaFuncao(fonte, "DialogContent")).not.toContain("rounded-xl");
    const rodape = corpoDaFuncao(fonte, "DialogFooter");
    expect(rodape).toContain("rounded-b-[inherit]");
    expect(rodape).toContain("bg-tile");
    expect(rodape).not.toContain("rounded-b-xl");
    expect(rodape).not.toContain("bg-muted/50");
  });

  it("Sheet: arredonda só a borda exposta e perde o filete de um lado só", () => {
    const corpo = corpoDaFuncao(lerUi("sheet.tsx"), "SheetContent");
    for (const lado of [
      "data-[side=right]:rounded-l-[28px]",
      "data-[side=left]:rounded-r-[28px]",
      "data-[side=bottom]:rounded-t-[28px]",
      "data-[side=top]:rounded-b-[28px]",
    ]) {
      expect(corpo, lado).toContain(lado);
    }
    for (const filete of ["border-l", "border-r", "border-t", "border-b"]) {
      expect(corpo, filete).not.toMatch(new RegExp(`data-\\[side=\\w+\\]:${filete}(?=[\\s"'])`));
    }
    expect(corpo).not.toContain("bg-clip-padding");
  });

  it("DropdownMenu e Select: padding de 6px e itens concêntricos de 12px", () => {
    const menu = lerUi("dropdown-menu.tsx");
    for (const funcao of ["DropdownMenuContent", "DropdownMenuSubContent"]) {
      expect(corpoDaFuncao(menu, funcao), funcao).toMatch(/(^|[\s"'`:])p-1\.5(?=[\s"'`])/);
    }
    for (const funcao of ["DropdownMenuItem", "DropdownMenuCheckboxItem", "DropdownMenuRadioItem", "DropdownMenuSubTrigger"]) {
      const corpo = corpoDaFuncao(menu, funcao);
      expect(corpo, funcao).toContain("rounded-[12px]");
      expect(corpo, funcao).not.toContain("rounded-md");
    }
    const select = lerUi("select.tsx");
    expect(corpoDaFuncao(select, "SelectItem")).toContain("rounded-[12px]");
    expect(corpoDaFuncao(select, "SelectItem")).not.toContain("rounded-md");
    // O padding do Select é do viewport (o conteúdo rola por inteiro).
    expect(corpoDaFuncao(select, "SelectContent")).toMatch(/(^|[\s"'`:])p-1\.5(?=[\s"'`])/);
    expect(corpoDaFuncao(select, "SelectContent")).not.toMatch(/(^|[\s"'`:])p-1(?=[\s"'`])/);
  });

  it("Select: botões de rolagem cobrem a lista com o sólido da sobreposição", () => {
    const select = lerUi("select.tsx");
    for (const funcao of ["SelectScrollUpButton", "SelectScrollDownButton"]) {
      const corpo = corpoDaFuncao(select, funcao);
      expect(corpo, funcao).toContain("bg-popover-solid");
      expect(corpo, funcao).not.toMatch(/(^|[\s"'`:])bg-popover(?![-\w])/);
    }
  });

  it("Tooltip: texto de popover (não invertido), seta no sólido, sem bg-foreground", () => {
    const fonte = lerUi("tooltip.tsx");
    expect(fonte).not.toContain("bg-foreground");
    expect(fonte).not.toContain("fill-foreground");
    expect(fonte).not.toContain("text-background");
    expect(fonte).toContain("text-popover-foreground");
    expect(fonte).toContain("bg-popover-solid fill-popover-solid");
  });

  it("sonner: variáveis de cor e raio; o vidro NÃO vem de classe Tailwind", () => {
    const fonte = lerUi("sonner.tsx");
    expect(fonte).toContain('"--normal-bg": "var(--popover)"');
    expect(fonte).toContain('"--normal-border": "var(--glass-border)"');
    expect(fonte).toContain('"--border-radius": "20px"');
    // O sonner declara `box-shadow` fora de qualquer @layer: classe de utilitário perde para ele.
    expect(fonte).not.toContain("backdrop-blur");
    expect(fonte).not.toContain("shadow-(--shadow-vidro)");
  });

  it("sonner: a cor do tipo vai para o ícone (tokens -ink), não para o fundo do aviso", () => {
    const fonte = lerUi("sonner.tsx");
    const icones: Record<string, string> = {
      success: "text-success-ink",
      info: "text-info-ink",
      warning: "text-warning-ink",
      error: "text-destructive",
    };
    for (const [tipo, classe] of Object.entries(icones)) {
      expect(fonte, tipo).toMatch(new RegExp(tipo + String.raw`: \(\s*<\w+ className="[^"]*${classe}[^"]*"`));
    }
    const layout = semComentarios(fs.readFileSync(path.join(SRC, "app", "layout.tsx"), "utf8"));
    const toaster = aberturasDe(layout, "Toaster")[0];
    expect(toaster).toBeDefined();
    expect(toaster).not.toContain("richColors");
  });

  it("globals.css: o vidro do aviso é regra SEM camada, mais específica que a do sonner", () => {
    const regra = css.match(/\[data-sonner-toaster\]\s+\[data-sonner-toast\]\[data-styled="true"\]\s*\{([^}]*)\}/);
    expect(regra, "regra do toast não encontrada").not.toBeNull();
    const corpo = regra![1].replace(/\s+/g, " ");
    expect(corpo).toContain("background: var(--popover)");
    expect(corpo).toContain("border-color: var(--glass-border)");
    expect(corpo).toContain("box-shadow: inset 0 1px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo), var(--glass-shadow);");
    expect(corpo).toContain("-webkit-backdrop-filter: blur(24px) saturate(160%)");
    expect(corpo.indexOf("-webkit-backdrop-filter")).toBeLessThan(corpo.indexOf(" backdrop-filter:"));
    // "Sem camada": a regra não pode estar dentro de um @layer nem de um @utility.
    const antes = css.slice(0, css.indexOf(regra![0]));
    let profundidade = 0;
    for (const c of antes) {
      if (c === "{") profundidade += 1;
      else if (c === "}") profundidade -= 1;
    }
    expect(profundidade).toBe(0);
    // Transparência reduzida: sólido e sem filtro (prefixado primeiro).
    const media = css.match(/@media \(prefers-reduced-transparency: reduce\)\s*\{\s*\[data-sonner-toaster\][^{]*\{([^}]*)\}/);
    expect(media, "media de transparência reduzida do aviso").not.toBeNull();
    expect(media![1]).toContain("background: var(--glass-solid)");
    expect(media![1]).toContain("-webkit-backdrop-filter: none");
    expect(media![1].indexOf("-webkit-backdrop-filter")).toBeLessThan(media![1].indexOf(" backdrop-filter: none"));
  });

  it("globals.css: o aviso focado por teclado mostra anel (a regra do vidro apagaria o do sonner)", () => {
    // O sonner dá box-shadow ao :focus-visible do aviso (que é focável e sem outline).
    // Nossa regra do vidro, mais específica, sempre define box-shadow: sem esta irmã, o foco some.
    const alvo = '[data-sonner-toaster] [data-sonner-toast][data-styled="true"]:focus-visible';
    const regra = css.match(
      /\[data-sonner-toaster\]\s+\[data-sonner-toast\]\[data-styled="true"\]:focus-visible\s*\{([^}]*)\}/,
    );
    expect(regra, "regra de foco do aviso").not.toBeNull();
    const corpo = regra![1].replace(/\s+/g, " ");
    expect(corpo).toContain("inset 0 1px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo), var(--glass-shadow), 0 0 0 2px var(--ring)");
    let profundidade = 0;
    for (const c of css.slice(0, css.indexOf(regra![0]))) {
      if (c === "{") profundidade += 1;
      else if (c === "}") profundidade -= 1;
    }
    expect(profundidade).toBe(0);
    // Depois da regra do vidro do aviso e antes da do vidro aninhado.
    expect(css.indexOf(alvo)).toBeGreaterThan(css.indexOf('[data-sonner-toaster] [data-sonner-toast][data-styled="true"] {'));
    expect(css.indexOf(alvo)).toBeLessThan(css.indexOf("body:has("));
  });

  it("globals.css: vidro dentro de Dialog/Sheet não desfoca de novo (vidro sobre vidro)", () => {
    const m = css.match(/body:has\(([^)]*)\)\s*:is\(([\s\S]*?)\)\s*\{([^}]*)\}/);
    expect(m, "regra do vidro aninhado").not.toBeNull();
    const [, painel, filhos, corpo] = m!;
    for (const slot of ["dialog-content", "sheet-content"]) expect(painel).toContain('[data-slot="' + slot + '"]');
    for (const slot of ["select-content", "popover-content", "dropdown-menu-content", "dropdown-menu-sub-content", "tooltip-content"]) {
      expect(filhos).toContain('[data-slot="' + slot + '"]');
    }
    expect(filhos).toContain('[data-sonner-toast][data-styled="true"]');
    expect(corpo).toContain("-webkit-backdrop-filter: none");
    expect(corpo.indexOf("-webkit-backdrop-filter")).toBeLessThan(corpo.indexOf(" backdrop-filter: none"));
    // Vem DEPOIS da regra do aviso (empate de especificidade resolve pela ordem).
    expect(css.indexOf(m![0])).toBeGreaterThan(css.indexOf('[data-sonner-toaster] [data-sonner-toast][data-styled="true"]'));
  });

  it("os slots citados pela regra existem nos componentes", () => {
    for (const [arquivo, slot] of [
      ["select.tsx", "select-content"],
      ["popover.tsx", "popover-content"],
      ["dropdown-menu.tsx", "dropdown-menu-content"],
      ["dropdown-menu.tsx", "dropdown-menu-sub-content"],
      ["tooltip.tsx", "tooltip-content"],
      ["dialog.tsx", "dialog-content"],
      ["sheet.tsx", "sheet-content"],
    ]) {
      expect(lerUi(arquivo), slot).toContain('data-slot="' + slot + '"');
    }
  });

  it("nenhum chamador sobrescreve fundo, raio, sombra, anel, borda ou desfoque de uma sobreposição", () => {
    // `vidro-sobreposicao` é desconhecida do twMerge: ela não é removida pelo `className` do
    // chamador, e o `bg-`/`shadow-` dele ficaria brigando com ela. Lista fixa: chamador novo reprova.
    const EXCECOES = new Set<string>(); // a da gaveta (rounded-t-2xl, 09-D) saiu na 09-F T6
    const tags = SOBREPOSICOES.map((s) => s.funcao);
    const culpados: string[] = [];
    for (const arquivo of arquivosTsx(SRC)) {
      const rel = path.relative(SRC, arquivo).replaceAll("\\", "/");
      if (rel.startsWith("components/ui/") || EXCECOES.has(rel)) continue;
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      for (const tag of tags) {
        for (const abertura of aberturasDe(codigo, tag)) {
          const inicio = abertura.indexOf("className=");
          if (inicio < 0) continue;
          const classes = [...abertura.slice(inicio).matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)]
            .map((m) => m[1] ?? m[2] ?? m[3])
            .join(" ");
          if (/(^|[\s:])(bg-|rounded|shadow|ring|border|backdrop-)/.test(classes)) culpados.push(`${rel} <${tag}>`);
        }
      }
    }
    expect(culpados).toEqual([]);
  });

  it("a lista de exceções está vazia: a gaveta de registros deixou o raio para a SheetContent", () => {
    const f = fs.readFileSync(path.join(SRC, "components", "shared", "painel", "gaveta-de-registros-impl.tsx"), "utf8");
    expect(f).not.toContain("rounded-t-2xl");
  });
});

describe("Rodapés de gaveta", () => {
  it("nenhum elemento sticky bottom-0 usa bg-background (transparente atrás do vidro)", () => {
    const culpados: string[] = [];
    for (const arquivo of arquivosTsx(SRC)) {
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      for (const m of codigo.matchAll(/(["'`])((?:(?!\1)[^\n])*)\1/g)) {
        const classes = m[2];
        if (/(^|\s)sticky(\s|$)/.test(classes) && /(^|\s)bottom-0(\s|$)/.test(classes) && /(^|\s)bg-background(\s|$)/.test(classes)) {
          culpados.push(path.relative(SRC, arquivo).replaceAll("\\", "/"));
        }
      }
    }
    expect(culpados).toEqual([]);
  });

  it("as gavetas usam o sólido da sobreposição; o chat só quando compacto", () => {
    for (const rel of ["components/todo/task-detail-sheet.tsx", "components/training/workout-exercise-sheet.tsx"]) {
      const codigo = semComentarios(fs.readFileSync(path.join(SRC, rel), "utf8"));
      expect(codigo, rel).toMatch(/sticky bottom-0[^"]*bg-popover-solid/);
    }
    // O mesmo ChatView aparece em /ia, fora de gaveta: lá o rodapé continua bg-background.
    const chat = semComentarios(fs.readFileSync(path.join(SRC, "components", "ai", "chat-client.tsx"), "utf8"));
    expect(chat).toMatch(/compacto \? "bg-popover-solid" : "bg-background"/);
    expect(chat).toContain('"sticky bottom-0 space-y-2 pt-3"');
  });
});

// ---------------------------------------------------------------------------------------------
// Controles (Task 7): Switch, Checkbox, Tabs, Badge, Skeleton, Separator.
// ---------------------------------------------------------------------------------------------

const SEIS_CONTROLES = ["switch.tsx", "checkbox.tsx", "tabs.tsx", "badge.tsx", "skeleton.tsx", "separator.tsx"];

describe("Controles — ausências nos seis arquivos", () => {
  it("nenhum usa bg-primary nem border-primary sem -fill", () => {
    for (const arquivo of SEIS_CONTROLES) {
      expect(lerUi(arquivo), arquivo).not.toMatch(/(?<![\w-])bg-primary(?!-fill)(?![\w-])/);
      expect(lerUi(arquivo), arquivo).not.toMatch(/(?<![\w-])border-primary(?!-fill)(?![\w-])/);
    }
  });
});

describe("Switch", () => {
  const codigo = lerUi("switch.tsx");
  const raiz = classesDe(Switch({}));
  const classesRaiz = raiz.split(/\s+/);
  const polegar = corpoDaFuncao(codigo, "Switch");

  it("trilho 52x32, p-0.5, redondo, com o foco do Button", () => {
    for (const c of [
      "group",
      "h-8",
      "w-[52px]",
      "p-0.5",
      "rounded-full",
      "outline-none",
      "focus-visible:outline-2",
      "focus-visible:outline-solid",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-ring",
    ]) {
      expect(classesRaiz, c).toContain(c);
    }
  });

  it("desligado é foreground a 16%, ligado é o azul de preenchimento", () => {
    expect(raiz).toContain("data-[state=unchecked]:bg-[color-mix(in_oklch,var(--foreground)_16%,transparent)]");
    expect(classesRaiz).toContain("data-[state=checked]:bg-primary-fill");
  });

  it("o botão é branco, 28 px, desliza 20 px e estica ao pressionar", () => {
    for (const c of [
      "size-7",
      "bg-white",
      "shadow-[0_2px_6px_rgba(0,0,0,.25)]",
      "data-[state=checked]:translate-x-5",
      "group-active:w-[34px]",
      "data-[state=checked]:group-active:translate-x-[14px]",
      "duration-450",
      "ease-mola",
      "motion-reduce:transition-none",
    ]) {
      expect(polegar, c).toContain(c);
    }
  });

  it("a transição lista translate e width (translate-x-* não é transform no Tailwind v4)", () => {
    expect(polegar).toMatch(/transition-\[translate,width\]/);
  });

  it("o estiramento só vale com movimento permitido", () => {
    expect(polegar).toContain("motion-safe:group-active:w-[34px]");
    expect(polegar).toContain("motion-safe:data-[state=checked]:group-active:translate-x-[14px]");
  });

  it("a medida antiga h-5 w-9 saiu", () => {
    expect(codigo).not.toContain("h-5 w-9");
  });
});

describe("Checkbox", () => {
  const classes = classesDe(Checkbox({})).split(/\s+/);
  const codigo = lerUi("checkbox.tsx");

  it("continua quadrada, raio 6, ladrilho desligada", () => {
    expect(classes).toContain("size-4.5");
    expect(classes).toContain("rounded-[6px]");
    expect(classes).toContain("bg-tile");
  });

  it("ligada é o azul de preenchimento", () => {
    for (const c of [
      "data-[state=checked]:bg-primary-fill",
      "data-[state=checked]:border-primary-fill",
      "data-[state=checked]:text-primary-fill-foreground",
    ]) {
      expect(classes, c).toContain(c);
    }
  });

  it("o visto entra com estalo e o movimento reduzido o dispensa", () => {
    for (const c of [
      "data-[state=checked]:animate-in",
      "data-[state=checked]:zoom-in-50",
      "duration-300",
      "ease-estalo",
      "motion-reduce:animate-none",
    ]) {
      expect(codigo, c).toContain(c);
    }
  });

  it("tem o foco do Button", () => {
    for (const c of ["outline-none", "focus-visible:outline-2", "focus-visible:outline-solid", "focus-visible:outline-offset-2", "focus-visible:outline-ring"]) {
      expect(classes, c).toContain(c);
    }
  });
});

describe("Tabs", () => {
  const lista = tabsListVariants({ variant: "default" }).split(/\s+/);
  const linha = tabsListVariants({ variant: "line" });
  const codigo = lerUi("tabs.tsx");
  const gatilho = classesDe(TabsTrigger({ value: "a" }));

  it("a lista é um controle segmentado redondo sobre o trilho", () => {
    for (const c of ["group-data-horizontal/tabs:h-9", "rounded-full", "bg-track", "border", "border-tile-border", "p-[3px]"]) {
      expect(lista, c).toContain(c);
    }
    expect(lista).not.toContain("bg-muted");
    expect(lista).not.toContain("rounded-lg");
  });

  it("a variante line não ganha trilho nem borda", () => {
    expect(linha).not.toContain("bg-track");
    expect(linha).not.toContain("border-tile-border");
    expect(linha).toContain("bg-transparent");
    expect(linha).toContain("data-[variant=line]:rounded-none");
  });

  it("o gatilho é redondo, mudo e, ativo, vira pílula forte", () => {
    const c = gatilho.split(/\s+/);
    expect(c).toContain("rounded-full");
    expect(c).not.toContain("rounded-md");
    expect(c).toContain("text-muted-foreground");
    expect(gatilho).toContain("data-[state=active]:bg-pill-strong");
    expect(gatilho).toContain("data-[state=active]:text-foreground");
    expect(gatilho).toContain("shadow-[0_1px_3px_rgba(16,24,40,.14),inset_0_1px_0_var(--glass-hi)]");
  });

  it("a pressão encolhe, com mola, e o movimento reduzido a desliga", () => {
    const c = gatilho.split(/\s+/);
    expect(c).toContain("active:scale-[.96]");
    expect(c).toContain("ease-mola");
    expect(gatilho).toContain("motion-reduce:transition-none");
    expect(gatilho).toContain("motion-reduce:active:scale-100");
    // Tailwind v4: scale-* é a propriedade `scale`, não `transform`.
    expect(gatilho).toMatch(/transition-\[[^\]]*\bscale\b[^\]]*\]/);
  });

  it("o estado ativo é escrito como data-[state=active], o atributo que o Radix grava", () => {
    expect(codigo).not.toMatch(/(?<![\w-])data-active:/);
    expect(codigo).toContain("data-[state=active]:bg-pill-strong");
  });

  it("não restou bg-background nem bg-muted", () => {
    expect(codigo).not.toMatch(/(?<![\w-])bg-(?:background|muted)(?![\w-])/);
  });
});

describe("Badge", () => {
  it("é redondo (rounded-4xl virava 41 px com --radius 1rem) e mantém a altura", () => {
    const base = badgeVariants({}).split(/\s+/);
    expect(base).toContain("rounded-full");
    expect(base).toContain("h-5");
    expect(lerUi("badge.tsx")).not.toContain("rounded-4xl");
  });

  it("default é azul de preenchimento com texto sobre ele", () => {
    const c = badgeVariants({ variant: "default" }).split(/\s+/);
    expect(c).toContain("bg-primary-fill");
    expect(c).toContain("text-primary-fill-foreground");
    expect(c).not.toContain("bg-primary");
  });
});

describe("Skeleton", () => {
  it("é o trilho do vidro, pulsa e para com movimento reduzido", () => {
    const c = classesDe(Skeleton({})).split(/\s+/);
    for (const k of ["bg-track", "rounded-[10px]", "animate-pulse", "motion-reduce:animate-none"]) {
      expect(c, k).toContain(k);
    }
    expect(lerUi("skeleton.tsx")).not.toMatch(/(?<![\w-])bg-muted(?![\w-])/);
  });
});

describe("Separator", () => {
  it("usa o traço de grade, não a borda opaca", () => {
    const c = classesDe(Separator({})).split(/\s+/);
    expect(c).toContain("bg-grid");
    expect(lerUi("separator.tsx")).not.toMatch(/(?<![\w-])bg-border(?![\w-])/);
  });
});

describe("Controles desligados — contraste de componente (WCAG 1.4.11)", () => {
  it("Checkbox: a borda desmarcada é foreground/52 e o twMerge tirou a borda clara do ladrilho", () => {
    const classes = classesDe(Checkbox({})).split(/\s+/);
    expect(classes).toContain("border-foreground/52");
    expect(classes).not.toContain("border-tile-border");
    expect(classes).toContain("bg-tile");
    expect(classes).toContain("data-[state=checked]:border-primary-fill");
  });

  it("Switch: o trilho desligado ganha aro interno e o botão desligado ganha aro, só no estado desligado", () => {
    const trilho = classesDe(Switch({})).split(/\s+/);
    for (const c of [
      "data-[state=unchecked]:ring-1",
      "data-[state=unchecked]:ring-inset",
      "data-[state=unchecked]:ring-foreground/50",
    ]) {
      expect(trilho, c).toContain(c);
    }
    // Ligado não ganha aro: nenhuma classe de ring sem o prefixo do estado desligado.
    for (const c of trilho) {
      if (/(^|:)ring-/.test(c)) expect(c, c).toMatch(/^data-\[state=unchecked\]:/);
    }
    const codigo = lerUi("switch.tsx");
    const botao = codigo.slice(codigo.indexOf("<SwitchPrimitive.Thumb"));
    expect(botao).toContain("data-[state=unchecked]:ring-1");
    expect(botao).toContain("data-[state=unchecked]:ring-foreground/60");
    expect(botao).not.toMatch(/(?<![\w:-])ring-(?:0|1)(?![\w-])/);
  });

  it("o aro não ocupa espaço: a geometria do trilho continua 52x32 sem borda", () => {
    const trilho = classesDe(Switch({})).split(/\s+/);
    expect(trilho).toContain("h-8");
    expect(trilho).toContain("w-[52px]");
    expect(trilho).not.toContain("border");
  });
});
