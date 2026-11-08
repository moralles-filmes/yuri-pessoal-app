/**
 * REDESIGN-04-A — as peças comuns do painel (abertura, indicador, bloco, olho).
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

describe("abertura — Server Component, direto na névoa", () => {
  const fonte = semComentarios(ler("abertura.tsx"));

  /** O `className` literal de cada `<tag className="...">` do arquivo, para ligar a classe ao elemento. */
  function classesDe(tag: string): string[] {
    return [...fonte.matchAll(new RegExp(`<${tag}\\b[^>]*?className="([^"]*)"`, "g"))].map((m) => m[1]);
  }

  it('não declara "use client"', () => {
    expect(temUseClient(fonte)).toBe(false);
  });

  it("só importa de react, @/lib/utils e @/lib/painel/*", () => {
    const fora = importsDe(fonte).filter(
      (m) => !(m === "react" || m === "@/lib/utils" || m.startsWith("@/lib/painel/")),
    );
    expect(fora).toEqual([]);
  });

  it("o <h1> é o título da página: 54 px no desktop, 38 px no celular, negrito, quebra palavra longa", () => {
    const h1 = classesDe("h1");
    expect(h1).toHaveLength(1);
    for (const classe of ["text-[3.375rem]", "text-[2.375rem]", "font-bold", "break-words", "text-foreground"]) {
      expect(h1[0].split(/\s+/).some((c) => c === classe || c.endsWith(`:${classe}`)), classe).toBe(true);
    }
  });

  it("todo <p> direto na névoa usa text-muted-on-fog", () => {
    const ps = classesDe("p");
    expect(ps.length).toBeGreaterThanOrEqual(2);
    for (const classe of ps) expect(classe.split(/\s+/)).toContain("text-muted-on-fog");
  });

  it("não tem cor de texto nem fundo que não sejam os da névoa", () => {
    for (const proibido of ["bg-", "text-white", "text-primary", "text-destructive", "-ink", "👋", "Montanha"]) {
      expect(fonte, proibido).not.toContain(proibido);
    }
  });

  it("montanha.tsx e banner-de-boas-vindas.tsx não existem mais", () => {
    expect(fs.existsSync(path.join(PASTA, "montanha.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(PASTA, "banner-de-boas-vindas.tsx"))).toBe(false);
  });

  it("globals.css não tem mais --banner-from nem --banner-to", () => {
    const css = fs.readFileSync(path.join(SRC, "app", "globals.css"), "utf8");
    expect(css).not.toContain("--banner-from");
    expect(css).not.toContain("--banner-to");
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

  it("trata { ausente } como ramo próprio, em itálico, sem a máscara de valor", () => {
    const codigo = semComentarios(ind);
    expect(codigo).toContain('"ausente" in valor');
    expect(codigo).toContain("italic");
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
    expect(arquivosDoPainel.length).toBeGreaterThanOrEqual(4);
    for (const arquivo of arquivosDoPainel) {
      const finance = importsDe(ler(arquivo)).filter((m) =>
        m.startsWith("@/lib/finance"),
      );
      expect(finance, arquivo).toEqual([]);
    }
  });
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

describe("08-T1 — o Link do indicador não rola a página quando abre a gaveta", () => {
  const fonte = semComentarios(ler("indicador.tsx"));

  it("importa abreAGaveta de @/lib/painel/detalhe-url", () => {
    expect(importsDe(fonte)).toContain("@/lib/painel/detalhe-url");
  });

  it("passa scroll={!abreAGaveta(href)} ao <Link> de 'Ver registros'", () => {
    expect(fonte).toContain("scroll={!abreAGaveta(href)}");
  });
});

describe("08 C4 - valor que nao e dinheiro", () => {
  const fonte = semComentarios(ler("indicador.tsx"));

  it("o tipo do valor aceita { semDinheiro: string } e o ramo é testado por 'semDinheiro' in valor", () => {
    expect(fonte).toContain("{ semDinheiro: string }");
    expect(fonte).toContain('"semDinheiro" in valor');
  });

  it("o ramo semDinheiro não desenha o R$ •••• nem o 'valor oculto'", () => {
    const inicio = fonte.indexOf('"semDinheiro" in valor');
    expect(inicio).toBeGreaterThan(-1);
    const fim = fonte.indexOf(") : ", inicio);
    expect(fim).toBeGreaterThan(inicio);
    const ramo = fonte.slice(inicio, fim);
    expect(ramo).not.toContain("R$ ••••");
    expect(ramo).not.toContain("valor oculto");
    expect(ramo).toContain("valor.semDinheiro");
  });

  const caminhoParcelamentos = path.resolve(
    SRC,
    "app",
    "(app)",
    "parcelamentos",
    "installments-client.tsx",
  );
  const caminhoFaturas = path.resolve(
    SRC,
    "app",
    "(app)",
    "faturas",
    "statements-client.tsx",
  );

  it("Parcelamentos ativos (contagem) é semDinheiro", () => {
    const cliente = fs.readFileSync(caminhoParcelamentos, "utf8");
    expect(cliente).toContain("valor={{ semDinheiro: String(totais.ativos) }}");
  });

  it("Próximo vencimento (data dd/mm) é semDinheiro", () => {
    const cliente = fs.readFileSync(caminhoFaturas, "utf8");
    expect(cliente).toContain("semDinheiro: diaMes(proximo.data)");
  });

  it("nenhum dos dois indicadores passa o valor por valor={String(...)}", () => {
    expect(fs.readFileSync(caminhoParcelamentos, "utf8")).not.toContain("valor={String(");
    expect(fs.readFileSync(caminhoFaturas, "utf8")).not.toContain("valor={String(");
  });
});
