/**
 * REDESIGN-04-A — as peças comuns do painel (banner, indicador, bloco, olho, montanha).
 *
 * O projeto não tem teste de componente (`environment: "node"`, zero `.test.tsx`), então o contrato
 * é verificado no CÓDIGO-FONTE, no molde de `src/lib/ai/chat-events.test.ts` — fraco, e melhor que
 * nada. O que não dá para varrer é coberto pela parte pura (`estadoDoBloco`).
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { estadoDoBloco } from "@/lib/painel/bloco";

const PASTA = __dirname;
const SRC = path.resolve(__dirname, "..", "..", "..");

function ler(nome: string): string {
  return fs.readFileSync(path.join(PASTA, nome), "utf8");
}

/** Tira comentários de linha e de bloco, para a varredura não casar com a explicação da regra. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Os módulos importados (`from "x"` e `import "x"`), já sem comentários. */
function importsDe(codigo: string): string[] {
  const limpo = semComentarios(codigo);
  const achados: string[] = [];
  for (const m of limpo.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) {
    achados.push(m[1]);
  }
  return achados;
}

function temUseClient(codigo: string): boolean {
  return /^\s*["']use client["']/m.test(codigo);
}

const arquivosDoPainel = fs
  .readdirSync(PASTA)
  .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"));

describe("banner e montanha — Server Components, sem JS de cliente", () => {
  const permitido = (mod: string) =>
    mod === "react" ||
    mod === "./montanha" ||
    mod === "@/lib/utils" ||
    mod.startsWith("@/lib/painel/");

  for (const arquivo of ["banner-de-boas-vindas.tsx", "montanha.tsx"]) {
    it(`${arquivo} não declara "use client"`, () => {
      expect(temUseClient(ler(arquivo))).toBe(false);
    });

    it(`${arquivo} só importa de react, ./montanha, @/lib/utils e @/lib/painel/*`, () => {
      const fora = importsDe(ler(arquivo)).filter((m) => !permitido(m));
      expect(fora).toEqual([]);
    });
  }

  it("a frase só aparece de sm para cima", () => {
    expect(ler("banner-de-boas-vindas.tsx")).toContain("hidden sm:block");
  });

  it("o emoji de aceno é aria-hidden", () => {
    expect(ler("banner-de-boas-vindas.tsx")).toMatch(/aria-hidden[^>]*>\s*👋|👋/);
  });

  it("a montanha é aria-hidden e usa currentColor", () => {
    const m = ler("montanha.tsx");
    expect(m).toContain("aria-hidden");
    expect(m).toContain("currentColor");
  });
});

describe("olho dos valores — a ilha cliente", () => {
  const olho = ler("olho-dos-valores.tsx");

  it('declara "use client" e usa COOKIE_DO_OLHO', () => {
    expect(temUseClient(olho)).toBe(true);
    expect(olho).toContain("COOKIE_DO_OLHO");
  });

  it("grava o cookie por 1 ano, em path=/ e samesite=lax", () => {
    expect(olho).toContain("max-age=31536000");
    expect(olho).toContain("path=/");
    expect(olho).toContain("samesite=lax");
  });

  it("expõe o estado por data-ocultar num invólucro de caixa própria (não `contents`)", () => {
    // Conferência visual (04-A): com `display: contents` o invólucro não recebe o espaçamento do
    // `space-y` do pai, e os indicadores encostavam no bloco seguinte.
    expect(olho).toContain("data-ocultar");
    expect(olho).toContain('className="group/olho"');
    expect(olho).not.toContain("group/olho contents");
  });

  it("diz na dica que é discrição, não sigilo", () => {
    expect(olho).toContain("É discrição, não sigilo.");
  });
});

describe("indicador", () => {
  const ind = ler("indicador.tsx");

  it('não declara "use client" (os indicadores continuam no servidor)', () => {
    expect(temUseClient(ind)).toBe(false);
  });

  it("tem @container e min-w-0 no lado do texto", () => {
    expect(ind).toContain("@container");
    expect(ind).toContain("min-w-0");
  });

  it("nunca escreve R$ 0,00 — erro de leitura não vira zero", () => {
    expect(ind).not.toContain("R$ 0,00");
  });

  it("troca o valor por R$ •••• só por CSS, com os dois spans no servidor", () => {
    expect(ind).toContain("group-data-[ocultar=true]/olho:hidden");
    expect(ind).toContain("group-data-[ocultar=true]/olho:inline");
    expect(ind).toContain("R$ ••••");
  });
});

describe("bloco — vazio e falha têm desenhos distintos", () => {
  const bloco = ler("bloco.tsx");

  it('não declara "use client"', () => {
    expect(temUseClient(bloco)).toBe(false);
  });

  it("vazio usa Inbox e falha usa AlertTriangle", () => {
    expect(bloco).toContain("Inbox");
    expect(bloco).toContain("AlertTriangle");
  });
});

describe("04-A2 L3 — indicador: dica por toque e teclado, valor oculto anunciado", () => {
  const fonte = semComentarios(ler("indicador.tsx"));

  it("a dica é <details>/<summary> nativo, não title={dica}", () => {
    expect(fonte).toContain("<details");
    expect(fonte).toContain("<summary");
    expect(fonte).not.toContain("title={dica}");
    expect(temUseClient(fonte)).toBe(false);
  });

  it('o summary soma "o que é este número" ao rótulo, sem aria-label que o apagaria', () => {
    expect(fonte).toContain('<span className="sr-only">, o que é este número</span>');
    expect(fonte).not.toContain('aria-label="O que é este número"');
    // A dica abre no fluxo: um painel absoluto seria cortado pelo overflow-hidden do card.
    expect(fonte).toContain("overflow-hidden");
    expect(fonte).not.toMatch(/absolute[^"]*top-full/);
  });

  it('"valor oculto" mora num span sr-only que só existe com o olho fechado', () => {
    expect(fonte).toMatch(
      /<span[^>]*sr-only[^>]*>[^<]*valor oculto[^<]*<\/span>|<span[^>]*>\s*<span[^>]*sr-only[^>]*>\s*valor oculto/,
    );
    // o invólucro some da árvore (display:none) fora do olho fechado
    expect(fonte).toMatch(/hidden group-data-\[ocultar=true\]\/olho:block/);
  });

  it("o R$ •••• continua aria-hidden", () => {
    expect(fonte).toMatch(/aria-hidden="true"[^>]*>\s*R\$ ••••/);
  });

  it("trata o estado naoSegue no valor, sem número", () => {
    expect(fonte).toContain("naoSegue");
    expect(fonte).toContain("border-dashed");
  });
});

describe("04-A2 — bloco: o estado nao-segue é o quarto desenho", () => {
  const fonte = semComentarios(ler("bloco.tsx"));
  const ramo = fonte.slice(fonte.indexOf('estado === "nao-segue"'));

  it("tem o ramo nao-segue", () => {
    expect(fonte).toContain('estado === "nao-segue"');
  });

  it("o ramo não reusa Inbox (vazio) nem AlertTriangle (falha) e tem ícone próprio", () => {
    expect(ramo).not.toContain("Inbox");
    expect(ramo).not.toContain("AlertTriangle");
    expect(ramo).toMatch(/CircleSlash|Ban/);
  });

  it("mostra a frase pronta e o Link Ver sem o filtro para hrefSemFiltro", () => {
    expect(ramo).toContain("naoSegue?.frase");
    expect(ramo).toContain("hrefSemFiltro");
    expect(ramo).toContain("Ver sem o filtro");
    expect(ramo).toContain('role="note"');
  });
});

describe("estadoDoBloco", () => {
  it("leitura que falhou é falha", () => {
    expect(estadoDoBloco({ ok: false })).toBe("falha");
  });

  it("leitura ok sem itens é vazio — e não falha", () => {
    expect(estadoDoBloco({ ok: true, itens: [] })).toBe("vazio");
  });

  it("leitura ok com itens é conteúdo", () => {
    expect(estadoDoBloco({ ok: true, itens: [1] })).toBe("conteudo");
  });
});

describe("fronteiras", () => {
  it("nenhuma peça importa @/lib/finance (as peças recebem texto pronto)", () => {
    expect(arquivosDoPainel.length).toBeGreaterThanOrEqual(5);
    for (const arquivo of arquivosDoPainel) {
      const finance = importsDe(ler(arquivo)).filter((m) =>
        m.startsWith("@/lib/finance"),
      );
      expect(finance, arquivo).toEqual([]);
    }
  });
});

describe("tokens do banner em globals.css", () => {
  const css = fs.readFileSync(path.join(SRC, "app", "globals.css"), "utf8");

  /** O corpo de um bloco de topo (`:root { … }` / `.dark { … }`), por contagem de chaves. */
  function corpoDe(seletor: string): string {
    const inicio = css.indexOf(`\n${seletor} {`);
    expect(inicio, `não achei o bloco ${seletor}`).toBeGreaterThan(-1);
    const abre = css.indexOf("{", inicio);
    let fundo = 1;
    let i = abre + 1;
    while (fundo > 0 && i < css.length) {
      if (css[i] === "{") fundo++;
      else if (css[i] === "}") fundo--;
      i++;
    }
    return css.slice(abre, i);
  }

  for (const seletor of [":root", ".dark"]) {
    it(`${seletor} define --banner-from e --banner-to`, () => {
      const corpo = corpoDe(seletor);
      expect(corpo).toMatch(/--banner-from\s*:/);
      expect(corpo).toMatch(/--banner-to\s*:/);
    });
  }
});

describe("conferência visual e revisão final (04-A) — o indicador", () => {
  const fonteIndicador = fs.readFileSync(path.join(process.cwd(), "src/components/shared/painel/indicador.tsx"), "utf8");

  it("rótulo e valor quebram linha em vez de cortar (o dinheiro nunca é truncado)", () => {
    expect(fonteIndicador).not.toMatch(/className="[^"]*truncate[^"]*text-2xl/);
    expect(fonteIndicador).not.toMatch(/className="min-w-0 truncate text-sm/);
    expect(fonteIndicador).toMatch(/text-2xl[^"]*break-words|break-words[^"]*text-2xl/);
  });

  it("o detalhe com valor em dinheiro também some com o olho", () => {
    expect(fonteIndicador).toContain("detalheComValor");
    expect(fonteIndicador).toMatch(/detalheComValor[\s\S]*group-data-\[ocultar=true\]\/olho:hidden/);
  });
});

describe("conferência visual (04-A2) — o cabeçalho do bloco", () => {
  const fonteBloco = semComentarios(ler("bloco.tsx"));

  it("o título quebra linha em vez de cortar (a 390 px, 'valor cheio' e 'mês a mês' sumiam)", () => {
    expect(fonteBloco).not.toMatch(/<h3 className="[^"]*\btruncate\b/);
    expect(fonteBloco).toMatch(/<h3 className="[^"]*\bbreak-words\b/);
  });

  it("a ação (selo 'filtrado: …') desce para a linha de baixo quando falta espaço, em vez de espremer o título", () => {
    expect(fonteBloco).toMatch(/className="flex flex-wrap items-start justify-between/);
    expect(fonteBloco).toMatch(/className="min-w-0 flex-\[1_1_12rem\]"/);
  });
});
