/**
 * REDESIGN-09-C — a casca do app em vidro. Sem infraestrutura de teste de componente, a
 * prova é a varredura da FONTE sem comentários: cada classe do contrato é checada sozinha
 * (a ordem delas não é contrato), e o que o `twMerge` poderia engolir é provado chamando
 * `cn()` de verdade.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRESSAO } from "@/components/ui/materiais";
import { cn } from "@/lib/utils";
import { SRC, semComentarios } from "./ler-tokens";

const ler = (...partes: string[]) =>
  semComentarios(fs.readFileSync(path.join(SRC, ...partes), "utf8"));

const classes = (fonte: string) => new Set(fonte.match(/[^\s"'`{}<>]+/g) ?? []);
const tem = (fonte: string, classe: string) => classes(fonte).has(classe);

describe("09-C · sidebar flutuante", () => {
  const sidebar = ler("components", "layout", "sidebar.tsx");

  it("o aside é uma coluna transparente que anima largura e recuo", () => {
    for (const c of [
      "sticky", "top-0", "hidden", "h-svh", "shrink-0", "flex-col", "lg:flex",
      "w-64", "w-[4.75rem]", "w-0",
      "transition-[width,padding]", "motion-reduce:transition-none",
    ]) {
      expect(tem(sidebar, c), c).toBe(true);
    }
    expect(tem(sidebar, "bg-sidebar")).toBe(false);
    expect(tem(sidebar, "border-r")).toBe(false);
    expect(tem(sidebar, "border-r-0")).toBe(false);
  });

  it("oculta: sem padding (conta na largura) e sem transbordar; visível: recuo", () => {
    // As classes do ramo oculto são lidas DO RAMO (`hidden ? "…"`): `overflow-hidden` também
    // existe no painel filho, então varrer o arquivo inteiro não provaria que o `aside` o tem.
    const ramoOculto = sidebar.match(/\bhidden\s*\?\s*"([^"]*)"/)?.[1];
    expect(ramoOculto, "ramo `hidden ? \"…\"` do aside").toBeDefined();
    for (const c of ["w-0", "overflow-hidden", "p-0"]) {
      expect(tem(ramoOculto ?? "", c), `oculto: ${c}`).toBe(true);
    }
    for (const c of ["py-3", "pl-3"]) {
      expect(tem(sidebar, c), c).toBe(true);
    }
    expect(sidebar).toMatch(/aria-hidden=\{hidden \|\| undefined\}/);
    expect(sidebar).toMatch(/inert=\{hidden \|\| undefined\}/);
  });

  it("o painel filho carrega o vidro e o marcador da casca", () => {
    expect(sidebar).toContain("data-casca");
    for (const c of ["vidro-casca", "rounded-[28px]", "overflow-hidden", "h-full", "min-h-0"]) {
      expect(tem(sidebar, c), c).toBe(true);
    }
  });

  it("sem divisórias antigas; a marca tem h-14 e a lista rola", () => {
    expect(sidebar).not.toContain("border-sidebar-border");
    expect(tem(sidebar, "h-14")).toBe(true);
    expect(tem(sidebar, "px-2")).toBe(true);
    expect(tem(sidebar, "px-3")).toBe(true);
    expect(sidebar).toMatch(/<ScrollArea className="min-h-0 flex-1">/);
  });
});

describe("09-C · item do menu", () => {
  const nav = ler("components", "layout", "nav-links.tsx");

  it("o ativo é uma pílula com tinta própria", () => {
    for (const c of [
      "bg-pill-strong", "text-nav-ativo-ink", "font-semibold",
      "shadow-[inset_0_1px_0_var(--glass-hi),0_6px_16px_-8px_rgba(16,24,40,.3)]",
      "forced-colors:outline", "forced-colors:outline-2",
    ]) {
      expect(tem(nav, c), c).toBe(true);
    }
  });

  it("recolhido, o ativo ganha aro (não há texto que confirme o estado)", () => {
    expect(tem(nav, "ring-1")).toBe(true);
    expect(tem(nav, "ring-nav-ativo-ink")).toBe(true);
  });

  it("hover em ladrilho, pressão compartilhada e foco por contorno interno", () => {
    for (const c of [
      "hover:bg-tile", "rounded-[14px]", "text-foreground", "text-muted-foreground",
      "focus-visible:outline-2", "focus-visible:-outline-offset-2", "focus-visible:outline-ring",
    ]) {
      expect(tem(nav, c), c).toBe(true);
    }
    expect(nav).toContain("PRESSAO");
    expect(nav).toMatch(/from "@\/components\/ui\/materiais"/);
    expect(tem(nav, "transition-colors")).toBe(false);
  });

  it("some o resíduo da identidade antiga", () => {
    expect(nav).not.toContain("bg-primary/10");
    expect(nav).not.toContain("text-sidebar-foreground/80");
    expect(nav).not.toContain("<span className=\"absolute");
    expect(nav).not.toContain("muted-foreground/70");
  });

  it("o rótulo de seção usa muted-foreground inteiro", () => {
    expect(nav).toMatch(/uppercase tracking-wider text-muted-foreground"/);
  });

  it("o twMerge não engole nenhuma classe do item ativo", () => {
    const resultado = cn(
      PRESSAO,
      "group relative flex items-center gap-3 rounded-[14px] px-3 py-2 text-sm font-medium text-foreground",
      "bg-pill-strong font-semibold text-nav-ativo-ink",
      "shadow-[inset_0_1px_0_var(--glass-hi),0_6px_16px_-8px_rgba(16,24,40,.3)]",
      "forced-colors:outline forced-colors:outline-2",
      "ring-1 ring-nav-ativo-ink",
    );
    const sobrou = classes(resultado);
    for (const c of ["bg-pill-strong", "text-nav-ativo-ink", "font-semibold", "ring-1", "ring-nav-ativo-ink", "forced-colors:outline-2"]) {
      expect(sobrou.has(c), c).toBe(true);
    }
    // A pressão sobrevive inteira: sem `transition-colors` a competir com ela.
    for (const c of PRESSAO.split(" ")) expect(sobrou.has(c), c).toBe(true);
  });
});

describe("09-C · monograma", () => {
  it("usa o preenchimento primário com contraste próprio", () => {
    const logo = ler("components", "shared", "logo.tsx");
    expect(tem(logo, "bg-primary-fill")).toBe(true);
    expect(tem(logo, "text-primary-fill-foreground")).toBe(true);
    expect(tem(logo, "bg-primary")).toBe(false);
  });
});

describe("09-C · header em vidro", () => {
  const header = ler("components", "layout", "header.tsx");
  // Só o ramo de cada estado da sidebar: `lg:ml-3` solto no arquivo não prova que ele é condicional.
  const ramoVisivel = header.match(/sidebarHidden\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/)?.[2];
  const ramoOculto = header.match(/sidebarHidden\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/)?.[1];

  it("é uma barra grudada ao topo, em vidro, com o marcador da casca", () => {
    for (const c of ["sticky", "top-0", "z-30", "h-16", "vidro-casca"]) {
      expect(tem(header, c), c).toBe(true);
    }
    expect(header).toContain("data-casca");
  });

  it("não sobra o desenho antigo nem fundo, borda ou sombra junto do material", () => {
    for (const c of ["backdrop-blur", "bg-background", "border-b", "border-border"]) {
      expect(tem(header, c), c).toBe(false);
    }
    expect(header).not.toMatch(/supports-\[backdrop-filter\]/);
    expect(header).not.toMatch(/(?:^|[\s"'`])(?:[\w-]+:)*(?:bg|border|shadow)-/m);
  });

  it("recuo e canto só existem com a sidebar visível", () => {
    expect(ramoVisivel, "ramo `sidebarHidden ? \"…\" : \"…\"`").toBeDefined();
    for (const c of ["lg:ml-3", "lg:rounded-bl-[20px]"]) {
      expect(tem(ramoVisivel ?? "", c), `visível: ${c}`).toBe(true);
      expect(tem(ramoOculto ?? "", c), `oculto: ${c}`).toBe(false);
      // Fora de qualquer ramo, a classe valeria nos dois estados.
      const foraDosRamos = header.replace(/sidebarHidden\s*\?\s*"[^"]*"\s*:\s*"[^"]*"/, "");
      expect(tem(foraDosRamos, c), `fora do ramo: ${c}`).toBe(false);
    }
  });
});

describe("09-C · gatilho desktop da busca", () => {
  const busca = ler("components", "search", "search-command.tsx");
  const gatilho = busca.match(/<button[\s\S]*?<\/button>/)?.[0] ?? "";
  const kbd = gatilho.match(/<kbd[^>]*>/)?.[0] ?? "";

  it("é uma pílula em ladrilho com aro de campo e brilho interno", () => {
    expect(gatilho, "gatilho desktop").not.toBe("");
    for (const c of [
      "rounded-full", "bg-tile", "border-(--field-border)", "hover:border-foreground/60",
      "shadow-[inset_0_1px_0_var(--glass-hi)]", "h-9", "w-full", "max-w-sm",
    ]) {
      expect(tem(gatilho, c), c).toBe(true);
    }
  });

  it("não tem cartão translúcido nem desfoque, e o hover não troca o fundo", () => {
    expect(tem(gatilho, "bg-card")).toBe(false);
    expect(gatilho).not.toMatch(/backdrop-/);
    expect(tem(gatilho, "hover:bg-tile")).toBe(false);
    expect(gatilho).not.toMatch(/hover:bg-/);
  });

  it("o kbd perde o fundo cinza, usa a borda do ladrilho e herda a cor do texto", () => {
    expect(kbd, "<kbd>").not.toBe("");
    expect(tem(kbd, "border-tile-border")).toBe(true);
    expect(tem(kbd, "bg-muted")).toBe(false);
    expect(kbd).not.toMatch(/(?:^|\s)text-(?!\[10px\])/);
  });
});
