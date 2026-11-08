/**
 * REDESIGN-09-B — as primitivas em vidro, provadas por chamada direta de `cva`/`cn`
 * (o projeto não tem teste de componente). Um `describe` por primitiva.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALFA_PERIGO } from "@/lib/theme/alfas";
import { SRC, semComentarios } from "@/lib/theme/ler-tokens";
import { buttonVariants } from "./button";
import { PRESSAO } from "./materiais";

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
    expect(padrao).toContain("hover:brightness-110");
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
 * Texto de cada abertura `<Card ...>` (só `Card`, não `CardHeader` etc.): vai até o `>` que
 * fecha a tag, ignorando `>` dentro de `{ }` (como `=>`) e de aspas.
 */
function aberturasDeCard(codigo: string): string[] {
  const achadas: string[] = [];
  for (const m of codigo.matchAll(/<Card(?![A-Za-z0-9_])/g)) {
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

describe("Card", () => {
  const fonte = semComentarios(
    fs.readFileSync(path.join(SRC, "components", "ui", "card.tsx"), "utf8"),
  );
  const card = corpoDaFuncao(fonte, "Card");

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
});
