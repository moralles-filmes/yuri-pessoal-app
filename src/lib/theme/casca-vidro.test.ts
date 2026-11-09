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

  it("é uma barra grudada ao topo, em vidro", () => {
    for (const c of ["sticky", "top-0", "z-30", "h-16", "vidro-casca"]) {
      expect(tem(header, c), c).toBe(true);
    }
  });

  it("fica FORA da regra que tira o desfoque sob diálogo: é a única casca com conteúdo passando atrás", () => {
    expect(header).not.toContain("data-casca");
  });

  it("o recuo e o canto animam junto com a sidebar, sem saltar", () => {
    for (const c of ["transition-[margin]", "duration-300", "ease-in-out", "motion-reduce:transition-none"]) {
      expect(tem(header, c), c).toBe(true);
    }
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

  it("tem foco visível por contorno", () => {
    for (const c of ["focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-ring"]) {
      expect(tem(gatilho, c), c).toBe(true);
    }
  });

  it("o kbd perde o fundo cinza, usa a borda do ladrilho e herda a cor do texto", () => {
    expect(kbd, "<kbd>").not.toBe("");
    expect(tem(kbd, "border-tile-border")).toBe(true);
    expect(tem(kbd, "bg-muted")).toBe(false);
    expect(kbd).not.toMatch(/(?:^|\s)text-(?!\[10px\])/);
  });
});

describe("09-C · iniciais do avatar", () => {
  const menu = ler("components", "layout", "user-menu.tsx");
  const fallback = menu.match(/<AvatarFallback[^>]*>/)?.[0] ?? "";

  it("usa a pílula forte com a tinta do item ativo (par medido), não primary sobre primary/15", () => {
    expect(fallback, "<AvatarFallback …>").not.toBe("");
    for (const c of ["bg-pill-strong", "text-nav-ativo-ink"]) {
      expect(tem(fallback, c), c).toBe(true);
    }
    expect(tem(fallback, "text-primary")).toBe(false);
    expect(tem(fallback, "bg-primary/15")).toBe(false);
  });
});

describe("09-C · gaveta do celular", () => {
  const gaveta = ler("components", "layout", "mobile-nav.tsx");

  it("a linha da marca perde a divisória e a gaveta segue à esquerda, só no celular", () => {
    expect(gaveta).not.toContain("border-sidebar-border");
    expect(gaveta).not.toMatch(/border-b\b/);
    expect(tem(gaveta, "lg:hidden")).toBe(true);
    expect(gaveta).toMatch(/<SheetContent side="left"/);
  });
});

describe("09-C · botão do assistente", () => {
  const fonte = ler("components", "ai", "floating-assistant.tsx");
  // A tag de abertura do botão nativo, isolada: `rounded-full` também existe no selo.
  const botao = fonte.match(/<button\b[^>]*?\n?[\s\S]*?\n\s*>\s*\n/)?.[0] ?? "";
  const ramos = botao.match(/canto === "direita"\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/);
  // O selo informativo é o ramo que NÃO é `proposta`.
  const selo = fonte.match(/aviso\.tipo === "proposta"\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/);

  it("é um <button> nativo (o Button traria fundo próprio) marcado como casca", () => {
    expect(botao, "tag <button …>").not.toBe("");
    expect(botao).toMatch(/^<button\b/);
    expect(botao).toContain('type="button"');
    expect(botao).toContain("data-casca");
    expect(fonte).not.toMatch(/<Button\b/);
    expect(fonte).not.toMatch(/from "@\/components\/ui\/button"/);
  });

  it("é um círculo de vidro fixo, centralizado, com pressão e foco por contorno", () => {
    for (const c of [
      "vidro-casca", "fixed", "bottom-4", "z-40", "size-12", "rounded-full",
      "inline-flex", "items-center", "justify-center",
      "focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-ring",
    ]) {
      expect(tem(botao, c), c).toBe(true);
    }
    expect(botao).toMatch(/\bPRESSAO\b/);
    expect(fonte).toMatch(/import \{ PRESSAO \} from "@\/components\/ui\/materiais"/);
    // Sem fundo, borda ou sombra soltos junto do material (nem o `shadow-lg` antigo).
    expect(botao).not.toMatch(/(?:^|[\s"'`])(?:[\w-]+:)*(?:bg|border|shadow)-/m);
    expect(tem(botao, "relative")).toBe(false);
  });

  it("o canto escolhe só o lado", () => {
    expect(ramos, 'ramo `canto === "direita" ? "…" : "…"`').not.toBeNull();
    expect(tem(ramos?.[1] ?? "", "right-4")).toBe(true);
    expect(tem(ramos?.[2] ?? "", "left-4")).toBe(true);
    expect(tem(ramos?.[1] ?? "", "left-4")).toBe(false);
    expect(tem(ramos?.[2] ?? "", "right-4")).toBe(false);
  });

  it("mantém o nome, o atalho e o estado do disclosure", () => {
    for (const trecho of ["aria-label=", "aria-keyshortcuts=", "aria-haspopup=", "aria-expanded="]) {
      expect(botao, trecho).toContain(trecho);
    }
  });

  it("o ícone usa a tinta do item ativo", () => {
    const icone = fonte.match(/<Sparkles\b[^>]*>/)?.[0] ?? "";
    expect(icone, "<Sparkles …>").not.toBe("");
    expect(tem(icone, "text-nav-ativo-ink")).toBe(true);
  });

  it("o selo de proposta segue destrutivo; o informativo usa o preenchimento primário", () => {
    expect(selo, "ramos do selo").not.toBeNull();
    expect(tem(selo?.[1] ?? "", "bg-destructive")).toBe(true);
    expect(tem(selo?.[1] ?? "", "text-destructive-foreground")).toBe(true);
    for (const c of ["bg-primary-fill", "text-primary-fill-foreground"]) {
      expect(tem(selo?.[2] ?? "", c), c).toBe(true);
    }
    expect(tem(selo?.[2] ?? "", "bg-primary")).toBe(false);
    expect(tem(selo?.[2] ?? "", "text-primary-foreground")).toBe(false);
  });

  it("a invariante 91: nada da lista proibida entra na casca e o dynamic é literal", () => {
    const imports = [...fonte.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const origem of imports) {
      expect(origem, origem).not.toBe("@/lib/ai/constants");
      expect(origem, origem).not.toMatch(/^@\/lib\/validators(\/|$)/);
      expect(origem, origem).not.toMatch(/chat-client/);
      expect(origem, origem).not.toBe("@/components/ui/sheet");
      expect(origem, origem).not.toBe("@/components/ui/dropdown-menu");
    }
    expect(fonte).toMatch(/dynamic\(\s*\(\)\s*=>[\s\S]*?\{\s*ssr:\s*false,\s*loading:\s*\(\)\s*=>/);
  });
});

describe("09-C · login e cadastro", () => {
  const layout = ler("app", "(auth)", "layout.tsx");
  const formulario = ler("components", "auth", "auth-form.tsx");
  const css = ler("app", "globals.css");
  const linhas = layout.split("\n");
  // A div que embrulha `{children}` abre na linha anterior à dele.
  const iFilhos = linhas.findIndex((l) => l.includes("{children}"));
  const cartao = linhas.slice(Math.max(0, iFilhos - 1), iFilhos + 1).join("\n");

  it("o cartão do formulário é de vidro, com canto e respiro próprios", () => {
    expect(iFilhos, "linha de {children}").toBeGreaterThan(0);
    for (const c of ["vidro-cartao", "rounded-[28px]", "p-6", "sm:p-8"]) {
      expect(tem(cartao, c), c).toBe(true);
    }
    // Material não convive com fundo, borda ou sombra soltos na mesma peça.
    expect(cartao).not.toMatch(/(?:^|[\s"'`])(?:[\w-]+:)*(?:bg|border|shadow)-/m);
  });

  it("a coluna da marca não tem fundo próprio nem manchas: o texto vai direto na névoa", () => {
    for (const proibida of ["bg-neutral-950", "text-neutral-", "-ink", "text-gradient-brand", "blur-3xl"]) {
      expect(layout, proibida).not.toContain(proibida);
    }
    // Cores coloridas por classe inteira: `text-primary-fill-foreground` não é `text-primary`.
    for (const proibida of ["text-primary", "text-destructive"]) {
      expect(tem(layout, proibida), proibida).toBe(false);
    }
    // Sem cor colorida direta na névoa: só `text-foreground` e `text-muted-on-fog` (o monograma
    // tem fundo próprio, e seu texto é medido sobre ele).
    const cores = [...layout.matchAll(/\btext-([a-z][\w-]*)/g)]
      .map((m) => m[1])
      .filter((n) => !/^(sm|xs|lg|xl|[2-9]xl|base|center|left|right)$/.test(n));
    for (const nome of cores) {
      expect(["foreground", "muted-on-fog", "primary-fill-foreground"], `text-${nome}`).toContain(nome);
    }
    expect(tem(layout, "text-muted-on-fog")).toBe(true);
  });

  it("os ícones dos destaques ficam num ladrilho com text-foreground", () => {
    const item = layout.match(/<span className="[^"]*ladrilho[^"]*">/)?.[0] ?? "";
    expect(item, "span do ícone").not.toBe("");
    expect(tem(item, "text-foreground")).toBe(true);
    expect(tem(item, "ladrilho")).toBe(true);
    expect(item).not.toMatch(/(?:^|[\s"'`])(?:[\w-]+:)*(?:bg|border|ring|shadow)-/m);
  });

  it("o monograma usa o preenchimento primário com contraste próprio", () => {
    expect(tem(layout, "bg-primary-fill")).toBe(true);
    expect(tem(layout, "text-primary-fill-foreground")).toBe(true);
    expect(tem(layout, "bg-primary")).toBe(false);
    expect(tem(layout, "text-primary-foreground")).toBe(false);
  });

  it("o texto da marca não mudou e o gradiente saiu do título", () => {
    expect(layout).toContain("organizada num só lugar.");
    expect(layout).toContain("<br />");
    expect(layout).not.toContain("<span className=\"text-gradient");
  });

  it("o utilitário do gradiente deixou de existir", () => {
    expect(css).not.toContain("@utility text-gradient-brand");
  });

  it("o formulário está sobre vidro: nenhum text-muted-on-fog sobrou", () => {
    expect(formulario).not.toContain("text-muted-on-fog");
    expect(tem(formulario, "text-muted-foreground")).toBe(true);
  });
});
