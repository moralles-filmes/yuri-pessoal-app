/**
 * REDESIGN-09-G — a barra de ações do celular. Sem infraestrutura de teste de componente, a
 * prova é a varredura da FONTE sem comentários: cada classe do contrato é checada sozinha
 * (a ordem delas não é contrato).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SRC, semComentarios } from "./ler-tokens";

const ler = (...partes: string[]) =>
  semComentarios(fs.readFileSync(path.join(SRC, ...partes), "utf8"));

const classes = (fonte: string) => new Set(fonte.match(/[^\s"'`{}<>]+/g) ?? []);
const tem = (fonte: string, classe: string) => classes(fonte).has(classe);

describe("09-G · área segura e recuo", () => {
  it("o layout raiz exporta `viewport` com viewport-fit=cover (tipo importado de next)", () => {
    const layout = ler("app", "layout.tsx");
    expect(layout).toMatch(/import type \{[^}]*\bViewport\b[^}]*\} from "next"/);
    expect(layout).toContain("export const viewport");
    expect(layout).toMatch(/viewportFit:\s*"cover"/);
  });

  it("globals.css define a altura da barra e o recuo, e zera o recuo a partir de lg", () => {
    const css = ler("app", "globals.css");
    expect(css).toContain("--barra-acoes-altura: calc(52px + 1.25rem);");
    expect(css).toContain(
      "--recuo-barra-acoes: calc(var(--barra-acoes-altura) + env(safe-area-inset-bottom, 0px));",
    );
    expect(css).toMatch(/@media \(width >= 64rem\)\s*\{[^}]*:root\s*\{[^}]*--recuo-barra-acoes: 0px;/);
  });

  it("as duas variáveis moram em :root", () => {
    const css = ler("app", "globals.css");
    const bloco = css.match(/:root\s*\{[^}]*--barra-acoes-altura[^}]*\}/);
    expect(bloco, "bloco :root com --barra-acoes-altura").not.toBeNull();
    expect(bloco?.[0]).toContain("--recuo-barra-acoes:");
  });

  it("a casca recua a área segura lateral e o <main> reserva o espaço da barra", () => {
    const shell = ler("components", "layout", "app-shell.tsx");
    expect(tem(shell, "pl-[env(safe-area-inset-left)]")).toBe(true);
    expect(tem(shell, "pr-[env(safe-area-inset-right)]")).toBe(true);
    const main = shell.match(/<main[^>]*>/)?.[0] ?? "";
    expect(tem(main, "pt-6")).toBe(true);
    expect(tem(main, "pb-[calc(var(--recuo-barra-acoes)+1.5rem)]")).toBe(true);
    expect(tem(main, "py-6")).toBe(false);
  });
});

describe("09-G · barra e eventos", () => {
  const FONTE_EVENTOS = ler("components", "layout", "acoes-da-casca.ts");
  const barra = ler("components", "layout", "barra-de-acoes.tsx");
  const busca = ler("components", "search", "search-command.tsx");
  const lancamento = ler("components", "quick-add", "quick-add.tsx");

  // A primeira tag do `return`: o contêiner da barra.
  const conteiner = barra.match(/return\s*\(\s*(<div\b[^>]*>)/)?.[1] ?? "";
  const botaoBuscar = barra.match(/<button\b[\s\S]*?<\/button>/)?.[0] ?? "";
  const botaoNovo = barra.match(/<Button\b[\s\S]*?<\/Button>/)?.[0] ?? "";

  it("acoes-da-casca.ts não importa nada e declara dois eventos distintos com prefixo yuri:", () => {
    expect(FONTE_EVENTOS).not.toMatch(/\bimport\b/);
    const busca = FONTE_EVENTOS.match(/EVENTO_ABRIR_BUSCA\s*=\s*"([^"]+)"/)?.[1] ?? "";
    const novo = FONTE_EVENTOS.match(/EVENTO_ABRIR_LANCAMENTO\s*=\s*"([^"]+)"/)?.[1] ?? "";
    expect(busca).toMatch(/^yuri:/);
    expect(novo).toMatch(/^yuri:/);
    expect(busca).not.toBe(novo);
    expect(FONTE_EVENTOS).toMatch(/window\.dispatchEvent\(new Event\(evento\)\)/);
  });

  it("o contêiner é um grupo fixo no pé, sem eventos de ponteiro e que some (contents) em lg", () => {
    expect(conteiner, "contêiner").not.toBe("");
    expect(conteiner).toContain('role="group"');
    expect(conteiner).toContain('aria-label="Ações rápidas"');
    for (const c of [
      "fixed", "inset-x-0", "bottom-0", "z-40", "flex", "items-center", "gap-2.5", "pt-2",
      "pb-[calc(env(safe-area-inset-bottom)+0.75rem)]",
      "pl-[max(1rem,env(safe-area-inset-left))]",
      "pr-[max(1rem,env(safe-area-inset-right))]",
      "pointer-events-none", "lg:contents",
    ]) {
      expect(tem(conteiner, c), c).toBe(true);
    }
  });

  it("o contêiner não cria bloco de contenção para o `fixed` do desktop nem leva material", () => {
    for (const c of classes(conteiner)) {
      expect(c, c).not.toMatch(
        /^(?:[\w-]+:)*(?:transform|translate-|scale-|filter|blur|backdrop-|vidro-|will-change)/,
      );
    }
  });

  it("Buscar: botão nativo em vidro, com pressão, alvo de 52 px e só no celular", () => {
    expect(botaoBuscar, "botão Buscar").not.toBe("");
    expect(botaoBuscar).toContain('type="button"');
    expect(botaoBuscar).toContain("data-casca");
    expect(botaoBuscar).toContain('aria-keyshortcuts="Control+K Meta+K"');
    expect(botaoBuscar).toMatch(/\bPRESSAO\b/);
    for (const c of [
      "vidro-casca", "pointer-events-auto", "h-[52px]", "flex-1", "min-w-0", "rounded-full",
      "lg:hidden", "px-[18px]", "gap-2", "text-muted-foreground", "font-medium",
      "focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-ring",
    ]) {
      expect(tem(botaoBuscar, c), c).toBe(true);
    }
    expect(botaoBuscar).toMatch(/onClick=\{\(\) => pedirAcaoDaCasca\(EVENTO_ABRIR_BUSCA\)\}/);
    expect(botaoBuscar).toMatch(/<span className="truncate">Buscar<\/span>/);
    expect(botaoBuscar).toMatch(/<Search\b[^>]*aria-hidden/);
    expect(botaoBuscar).toMatch(/<Search\b[^>]*size-\[18px\]/);
    // Sem fundo, borda ou sombra soltos junto do material.
    expect(botaoBuscar).not.toMatch(/(?:^|[\s"'`])(?:[\w-]+:)*(?:bg|border|shadow)-/m);
  });

  it("Novo lançamento: Button primário de 52 px, só no celular, com nome acessível", () => {
    expect(botaoNovo, "botão Novo lançamento").not.toBe("");
    expect(botaoNovo).toContain('aria-label="Novo lançamento"');
    expect(botaoNovo).not.toMatch(/\bvariant=/);
    for (const c of ["size-[52px]", "shrink-0", "rounded-full", "pointer-events-auto", "lg:hidden"]) {
      expect(tem(botaoNovo, c), c).toBe(true);
    }
    expect(botaoNovo).toMatch(/onClick=\{\(\) => pedirAcaoDaCasca\(EVENTO_ABRIR_LANCAMENTO\)\}/);
    expect(botaoNovo).toMatch(/<Plus\b[^>]*size-\[22px\]/);
  });

  it("o twMerge deixa o Novo lançamento com 52 px, e não com o size-8 da variante", () => {
    // Exatamente o que `Button` faz: `cn(buttonVariants({ variant, size, className }))`.
    const resultado = classes(
      cn(
        buttonVariants({
          size: "icon",
          className: "size-[52px] shrink-0 rounded-full pointer-events-auto lg:hidden",
        }),
      ),
    );
    for (const c of ["size-[52px]", "shrink-0", "rounded-full", "pointer-events-auto", "lg:hidden"]) {
      expect(resultado.has(c), c).toBe(true);
    }
    expect(resultado.has("size-8")).toBe(false);
  });

  it("a invariante 91: a barra e os eventos não importam nada da lista proibida", () => {
    for (const fonte of [barra, FONTE_EVENTOS]) {
      for (const m of fonte.matchAll(/from\s+"([^"]+)"/g)) {
        const origem = m[1];
        expect(origem, origem).not.toBe("@/lib/ai/constants");
        expect(origem, origem).not.toMatch(/^@\/lib\/validators(\/|$)/);
        expect(origem, origem).not.toMatch(/chat-client/);
        expect(origem, origem).not.toBe("@/components/ui/sheet");
        expect(origem, origem).not.toBe("@/components/ui/dropdown-menu");
      }
    }
  });

  it("busca e lançamento ouvem o evento com a MESMA constante que a barra emite", () => {
    expect(barra).toMatch(/import \{[^}]*\bEVENTO_ABRIR_BUSCA\b[^}]*\} from "\.\/acoes-da-casca"/);
    expect(barra).toMatch(/import \{[^}]*\bEVENTO_ABRIR_LANCAMENTO\b[^}]*\} from "\.\/acoes-da-casca"/);
    for (const [fonte, evento] of [
      [busca, "EVENTO_ABRIR_BUSCA"],
      [lancamento, "EVENTO_ABRIR_LANCAMENTO"],
    ] as const) {
      expect(fonte).toMatch(new RegExp(String.raw`import \{[^}]*\b${evento}\b[^}]*\} from "@/components/layout/acoes-da-casca"`));
      expect(fonte).toContain(`addEventListener(${evento}`);
      expect(fonte).toContain(`removeEventListener(${evento}`);
    }
  });

  it("o gatilho de texto só aparece em lg, e não sobra gatilho de ícone abaixo disso", () => {
    expect(tem(busca, "hidden")).toBe(true);
    expect(tem(busca, "lg:flex")).toBe(true);
    expect(tem(lancamento, "lg:inline-flex")).toBe(true);
    for (const fonte of [busca, lancamento]) {
      expect(tem(fonte, "sm:hidden"), "sm:hidden").toBe(false);
      expect(tem(fonte, "sm:flex"), "sm:flex").toBe(false);
      expect(tem(fonte, "sm:inline-flex"), "sm:inline-flex").toBe(false);
    }
    // O gatilho de ícone do lançamento tinha este nome acessível.
    expect(lancamento).not.toContain('aria-label="Lançamento rápido"');
  });

  it("SearchCommand e QuickAdd continuam montados uma única vez em src", () => {
    const achados = { busca: 0, lancamento: 0 };
    const varrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) varrer(p);
        else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) {
          const f = semComentarios(fs.readFileSync(p, "utf8"));
          achados.busca += (f.match(/<SearchCommand\b/g) ?? []).length;
          achados.lancamento += (f.match(/<QuickAdd\b/g) ?? []).length;
        }
      }
    };
    varrer(SRC);
    expect(achados).toEqual({ busca: 1, lancamento: 1 });
  });
});

describe("09-G · assistente na barra", () => {
  const botaoFonte = ler("components", "ai", "floating-assistant.tsx");
  const shell = ler("components", "layout", "app-shell.tsx");
  // A tag de abertura do botão nativo, isolada: `rounded-full` também existe no selo.
  const botao = botaoFonte.match(/<button\b[^>]*?\n?[\s\S]*?\n\s*>\s*\n/)?.[0] ?? "";
  const ramos = botao.match(/canto === "direita"\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/);
  const indicador = botaoFonte.match(/<span role="status"[^>]*>/)?.[0] ?? "";
  const envoltorio = botaoFonte.match(/<div className=\{[^}]*\}>\s*<Painel\b/)?.[0] ?? "";

  it("o botão é o mesmo nas duas larguras: item da barra no celular, `fixed` só em lg", () => {
    expect(botao, "tag <button …>").not.toBe("");
    for (const c of [
      "vidro-casca", "relative", "pointer-events-auto", "size-[52px]", "shrink-0", "rounded-full",
      "lg:fixed", "lg:bottom-4", "lg:z-40", "lg:size-12",
      "inline-flex", "items-center", "justify-center",
      "focus-visible:outline-2", "focus-visible:outline-offset-2", "focus-visible:outline-ring",
    ]) {
      expect(tem(botao, c), c).toBe(true);
    }
    // Sem prefixo, estas classes tirariam o botão da linha da barra no celular.
    for (const c of ["fixed", "bottom-4", "z-40", "size-12", "right-4", "left-4"]) {
      expect(tem(botao, c), c).toBe(false);
    }
    expect(botao).toMatch(/\bPRESSAO\b/);
    expect(botao).toContain("data-casca");
    for (const trecho of ["aria-label=", "aria-keyshortcuts=", "aria-haspopup=", "aria-expanded="]) {
      expect(botao, trecho).toContain(trecho);
    }
    expect(botao).not.toMatch(/(?:^|[\s"'`])(?:[\w-]+:)*(?:bg|border|shadow)-/m);
  });

  it("o canto escolhe só o lado, e só em lg", () => {
    expect(ramos, 'ramo `canto === "direita" ? "…" : "…"`').not.toBeNull();
    expect(tem(ramos?.[1] ?? "", "lg:right-4")).toBe(true);
    expect(tem(ramos?.[2] ?? "", "lg:left-4")).toBe(true);
    expect(tem(ramos?.[1] ?? "", "lg:left-4")).toBe(false);
    expect(tem(ramos?.[2] ?? "", "lg:right-4")).toBe(false);
    for (const lado of [ramos?.[1] ?? "", ramos?.[2] ?? ""]) {
      expect(tem(lado, "right-4")).toBe(false);
      expect(tem(lado, "left-4")).toBe(false);
    }
  });

  it("o <div> que embrulha o painel é `contents`, para não virar item vazio (e gap) da barra", () => {
    expect(envoltorio, "<div …><Painel").not.toBe("");
    expect(tem(envoltorio, "contents")).toBe(true);
    // Os dois ramos do canto (e as variáveis do indicador) continuam lá.
    expect(envoltorio).toContain("--assistente-esquerda:1rem");
    expect(envoltorio).toContain("--assistente-direita:1rem");
  });

  it("o indicador de carregamento sobe pelo recuo da barra e vai para a direita no celular", () => {
    expect(indicador, '<span role="status" …>').not.toBe("");
    expect(tem(indicador, "bottom-[calc(var(--recuo-barra-acoes)+1rem)]")).toBe(true);
    expect(tem(indicador, "max-lg:right-4")).toBe(true);
    expect(tem(indicador, "max-lg:left-auto")).toBe(true);
    expect(tem(indicador, "bottom-4")).toBe(false);
  });

  it("a casca monta o assistente DENTRO da barra, e cada um aparece uma só vez em src", () => {
    expect(shell).toMatch(/<BarraDeAcoes>\s*<FloatingAssistant\b[\s\S]*?\/>\s*<\/BarraDeAcoes>/);
    expect(shell).toMatch(/import \{ BarraDeAcoes \} from "\.\/barra-de-acoes"/);
    const achados = { assistente: 0, barra: 0 };
    const varrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) varrer(p);
        else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) {
          const f = semComentarios(fs.readFileSync(p, "utf8"));
          achados.assistente += (f.match(/<FloatingAssistant\b/g) ?? []).length;
          achados.barra += (f.match(/<BarraDeAcoes\b/g) ?? []).length;
        }
      }
    };
    varrer(SRC);
    expect(achados).toEqual({ assistente: 1, barra: 1 });
  });

  it("a invariante 91 continua de pé: nada da lista proibida e o dynamic segue literal", () => {
    const imports = [...botaoFonte.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const origem of imports) {
      expect(origem, origem).not.toBe("@/lib/ai/constants");
      expect(origem, origem).not.toMatch(/^@\/lib\/validators(\/|$)/);
      expect(origem, origem).not.toMatch(/chat-client/);
      expect(origem, origem).not.toBe("@/components/ui/sheet");
      expect(origem, origem).not.toBe("@/components/ui/dropdown-menu");
    }
    expect(botaoFonte).toMatch(/dynamic\(\s*\(\)\s*=>[\s\S]*?\{\s*ssr:\s*false,\s*loading:\s*\(\)\s*=>/);
  });
});

describe("09-G · nada fica atrás da barra", () => {
  const SESSOES = [
    ["training", "session", "prepare-review-client.tsx"],
    ["training", "session", "session-live-client.tsx"],
    ["training", "session", "session-review-client.tsx"],
  ] as const;

  it.each(SESSOES)("a barra fixa de %s/%s/%s sobe para cima da barra de ações", (...partes) => {
    const fonte = ler("components", ...partes);
    const barra = fonte.match(/<div className="[^"]*\bfixed\b[^"]*\binset-x-0\b[^"]*"/)?.[0] ?? "";
    expect(barra, "div fixed inset-x-0").not.toBe("");
    expect(tem(barra, "bottom-(--recuo-barra-acoes)")).toBe(true);
    expect(tem(barra, "bottom-0")).toBe(false);
  });

  it("nenhuma classe `fixed` junto de `bottom-0` na mesma string (fora de ui/, testes e da própria barra)", () => {
    const culpados: string[] = [];
    const varrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          // `components/ui/` são as primitivas (Sheet, Dialog), que se posicionam sozinhas.
          if (p === path.join(SRC, "components", "ui")) continue;
          varrer(p);
        } else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) {
          // A própria barra é o que ocupa o fundo: `bottom-0` ali é o contrato dela.
          if (p === path.join(SRC, "components", "layout", "barra-de-acoes.tsx")) continue;
          const fonte = semComentarios(fs.readFileSync(p, "utf8"));
          for (const literal of fonte.match(/"[^"\n]*"|`[^`]*`/g) ?? []) {
            if (tem(literal, "fixed") && tem(literal, "bottom-0")) {
              culpados.push(`${path.relative(SRC, p)}: ${literal.slice(0, 80)}`);
            }
          }
        }
      }
    };
    varrer(path.join(SRC, "components"));
    varrer(path.join(SRC, "app"));
    expect(culpados).toEqual([]);
  });

  it("o compositor do chat usa bottom-0 na gaveta (compacto) e o recuo da barra fora dela", () => {
    const chat = ler("components", "ai", "chat-client.tsx");
    const m = chat.match(
      /cn\(\s*"([^"]*\bsticky\b[^"]*)",\s*compacto\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"\s*\)/,
    );
    expect(m, "cn(\"sticky …\", compacto ? … : …)").not.toBeNull();
    const [, base, ramoCompacto, ramoCheio] = m!;
    expect(tem(base, "bottom-0")).toBe(false);
    expect(tem(base, "bottom-(--recuo-barra-acoes)")).toBe(false);
    expect(tem(ramoCompacto, "bottom-0")).toBe(true);
    expect(tem(ramoCompacto, "bottom-(--recuo-barra-acoes)")).toBe(false);
    expect(tem(ramoCheio, "bottom-(--recuo-barra-acoes)")).toBe(true);
    expect(tem(ramoCheio, "bottom-0")).toBe(false);
  });
});

describe("09-G · configuração", () => {
  const form = ler("components", "ai", "ai-preferences-form.tsx");
  const painel = ler("components", "ai", "floating-assistant-panel.tsx");

  it("o cartão do botão diz sempre que o canto não vale no celular, e o seletor o referencia", () => {
    expect(form).toMatch(/<p id="pref-canto-botao-celular"[^>]*>\s*\{AVISO_DO_CANTO_NO_CELULAR\}\s*<\/p>/);
    const gatilho = form.match(/<SelectTrigger\s+id="pref-canto-botao"[\s\S]*?<\/SelectTrigger>/)?.[0] ?? "";
    expect(gatilho).toContain("pref-canto-botao-celular");
    expect(gatilho).toContain("pref-canto-botao-aviso");
    // O aviso do celular está fora do ramo `floatingHidden ?`.
    const ramo = form.match(/\{form\.floatingHidden \? \([\s\S]*?\) : null\}/)?.[0] ?? "";
    expect(ramo).not.toContain("AVISO_DO_CANTO_NO_CELULAR");
    expect(form).toMatch(/AVISO_DO_CANTO_NO_CELULAR[\s\S]*from "@\/lib\/ai\/painel"/);
  });

  it("o menu do painel marca `só no computador` no item de mover, e o toast cita atalho e Conversar", () => {
    const item = painel.match(/<DropdownMenuItem[^\n]*\n\s*<MoveHorizontal[\s\S]*?<\/DropdownMenuItem>/)?.[0] ?? "";
    expect(item, "item Mover").not.toBe("");
    const aviso = item.match(/<span className="([^"]*)">[^<]*só no computador[^<]*<\/span>/i);
    expect(aviso, "<span> com `só no computador`").not.toBeNull();
    expect(tem(aviso![1], "lg:hidden")).toBe(true);
    expect(painel).toContain(
      "`Botão oculto. O atalho ${ATALHO_DO_PAINEL} e a página Conversar continuam abrindo o assistente.`",
    );
  });
});

describe("09-G · correções finais", () => {
  const barra = ler("components", "layout", "barra-de-acoes.tsx");
  const css = ler("app", "globals.css");
  const sheet = ler("components", "ui", "sheet.tsx");
  const painel = ler("components", "ai", "floating-assistant-panel.tsx");
  const conteiner = barra.match(/return\s*\(\s*(<div\b[^>]*>)/)?.[1] ?? "";

  it("1. a barra não sai na impressão (print:hidden no contêiner)", () => {
    expect(conteiner, "contêiner").not.toBe("");
    expect(tem(conteiner, "print:hidden")).toBe(true);
  });

  it("2. foco e rolagem não ficam atrás da barra (scroll-padding-bottom em html)", () => {
    expect(css).toMatch(/html\s*\{[^}]*scroll-padding-bottom:\s*var\(--recuo-barra-acoes\);/);
  });

  it("3. a gaveta que sobe de baixo respeita a área segura, mesmo com p-0 do chamador", () => {
    const classe = "data-[side=bottom]:pb-[env(safe-area-inset-bottom)]";
    expect(sheet).toContain(classe);
    const base = sheet.match(/"(fixed z-50 flex flex-col[^"]*)"/)?.[1] ?? "";
    expect(base, "classes base do SheetContent").not.toBe("");
    // O que o painel do assistente passa: `p-0` sem prefixo.
    const resultado = classes(
      cn(base, "flex flex-col gap-0 p-0 data-[side=bottom]:h-[85svh] data-[side=right]:sm:max-w-lg"),
    );
    expect(resultado.has(classe)).toBe(true);
    expect(resultado.has("p-0")).toBe(true);
  });

  it("4. o menu `Mais opções` empilha rótulo e nota, e o nome acessível não cola", () => {
    const item = painel.match(/<DropdownMenuItem[^\n]*\n\s*<MoveHorizontal[\s\S]*?<\/DropdownMenuItem>/)?.[0] ?? "";
    expect(item).not.toBe("");
    const pilha = item.match(/<span className="([^"]*)">([\s\S]*?)<\/span>\s*<\/DropdownMenuItem>/);
    expect(pilha, "span empilhado").not.toBeNull();
    for (const c of ["flex", "min-w-0", "flex-col"]) expect(tem(pilha![1], c), c).toBe(true);
    expect(pilha![2]).toContain("Mover para o");
    const nota = item.match(/<span className="([^"]*)">\s*Só no computador\s*<\/span>/);
    expect(nota, "nota com maiúscula").not.toBeNull();
    for (const c of ["text-xs", "text-muted-foreground", "lg:hidden"]) expect(tem(nota![1], c), c).toBe(true);
    // Separação textual entre o rótulo e a nota (nome acessível: "…esquerdo Só no computador").
    expect(item).toMatch(/\{" "\}\s*<span className="[^"]*lg:hidden">/);
    const conteudo = painel.match(/<DropdownMenuContent\b[^>]*>/)?.[0] ?? "";
    expect(tem(conteudo, "w-64")).toBe(true);
  });

  it("6. a altura da barra soma as classes sem misturar unidades", () => {
    expect(css).toContain("--barra-acoes-altura: calc(52px + 1.25rem);");
    expect(css).not.toContain("--barra-acoes-altura: 4.5rem;");
    // pt-2 (0,5 rem) + botão (52 px) + base (0,75 rem) = 52px + 1.25rem.
    expect(tem(conteiner, "pt-2")).toBe(true);
    expect(tem(conteiner, "pb-[calc(env(safe-area-inset-bottom)+0.75rem)]")).toBe(true);
    expect(barra).toContain("h-[52px]");
  });
});
