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
    expect(fonteBloco).not.toMatch(/<Titulo className="[^"]*\btruncate\b/);
    expect(fonteBloco).toMatch(/<Titulo className="[^"]*\bbreak-words\b/);
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

describe("09-D T2 - indicador em vidro", () => {
  const fonte = semComentarios(ler("indicador.tsx"));
  const cartao = /<Card className=\{[^}]*\}/.exec(fonte)?.[0] ?? "";
  const quadrado = /<div\s+aria-hidden="true"\s+className=\{cn\(([\s\S]*?)\)\}/.exec(fonte)?.[1] ?? "";
  const mapaDeChips = /const CHIP_POR_TOM[\s\S]*?\n\};/.exec(fonte)?.[0] ?? "";
  const paragrafos = [...fonte.matchAll(/<p\s+className="([^"]*)"/g)].map((m) => m[1]);
  const doNumero = paragrafos.filter((c) => c.includes("text-2xl"));
  const dosEstados = paragrafos.filter(
    (c) => c.includes("border-dashed") || c.includes("italic") || /^text-sm text-muted-foreground$/.test(c),
  );

  it("a varredura leu o Card, o quadrado, o mapa e os parágrafos (anti-tautologia)", () => {
    expect(cartao).toContain("<Card className=");
    expect(quadrado).toContain("size-10");
    expect(mapaDeChips).toContain("saldo:");
    expect(doNumero).toHaveLength(2);
    expect(dosEstados).toHaveLength(3);
  });

  it("o Card não declara raio: herda os 24 px da primitiva", () => {
    expect(cartao).not.toContain("rounded-");
  });

  it("o quadrado do ícone é size-10 rounded-[12px], sem ring", () => {
    expect(quadrado).toContain("size-10");
    expect(quadrado).toContain("rounded-[12px]");
    expect(quadrado).not.toContain("ring");
    expect(mapaDeChips).not.toContain("ring-");
  });

  it("os dois parágrafos de número (string e semDinheiro) têm o degrau por contêiner", () => {
    for (const classes of doNumero) {
      for (const parte of [
        "text-2xl",
        "@[16rem]:text-[1.75rem]",
        "tracking-[-0.028em]",
        "tabular-nums",
        "break-words",
      ]) {
        expect(classes, parte).toContain(parte);
      }
    }
  });

  it("naoSegue, ausente e erro não herdam o 28 px e seguem text-sm", () => {
    for (const classes of dosEstados) {
      expect(classes).not.toContain("1.75rem");
      expect(classes).toContain("text-sm");
    }
    expect(fonte.match(/1\.75rem/g)).toHaveLength(2);
  });

  it("a comparação segue o significado: cor por sentido, seta e palavra", () => {
    expect(fonte).toContain("COR_POR_SENTIDO[comparacao.sentido]");
    expect(fonte).toContain("variacao.palavra");
    expect(fonte).toContain("<variacao.Seta");
  });

  it("o celular continua vencendo no número pequeno dos secundários", () => {
    expect(fonte).toContain("[&_.text-2xl]");
  });
});

describe("09-D T3 - bloco e moldura do dashboard em vidro", () => {
  const bloco = semComentarios(ler("bloco.tsx"));
  const cardShell = semComentarios(
    fs.readFileSync(path.join(SRC, "components", "dashboard", "general", "card-shell.tsx"), "utf8"),
  );
  const financeiro = semComentarios(
    fs.readFileSync(path.join(SRC, "app", "(app)", "dashboard", "financeiro", "financial-dashboard-client.tsx"), "utf8"),
  );

  const doCard = /<Card className=\{cn\(([\s\S]*?)\)\}/.exec(bloco)?.[1] ?? "";
  const doH3 = /<Titulo className="([^"]*)"/.exec(bloco)?.[1] ?? "";
  const doLink = /<Link\s+href=\{verTodos\.href\}\s+className="([^"]*)"/.exec(bloco)?.[1] ?? "";
  const doIcone = /<Icone\b[^>]*\/>/.exec(bloco)?.[0] ?? "";

  it("a varredura leu o Card, o título, o link e o ícone (anti-tautologia)", () => {
    expect(doCard).toContain("overflow-hidden");
    expect(doH3).toContain("break-words");
    expect(doLink).toContain("text-primary");
    expect(doIcone).toContain("<Icone");
  });

  it("Bloco: o Card tem 28 px de raio", () => {
    expect(doCard).toContain("rounded-[28px]");
  });

  it("Bloco: o título é 17 px, semibold, com tracking e quebra palavra", () => {
    for (const classe of ["text-[1.0625rem]", "font-semibold", "tracking-[-0.018em]", "break-words"]) {
      expect(doH3.split(/\s+/), classe).toContain(classe);
    }
  });

  it("Bloco: o ícone é opcional, decorativo e não encolhe", () => {
    expect(bloco).toContain("icone?: LucideIcon");
    expect(bloco).toMatch(/\bicone:\s*Icone\b/);
    expect(bloco).toMatch(/\{Icone\s*\?\s*\(/);
    expect(doIcone).toContain('aria-hidden="true"');
    expect(doIcone).toContain("size-[1.1875rem]");
    expect(doIcone).toContain("shrink-0");
    expect(bloco).toContain("min-w-0");
  });

  it('Bloco: o link de verTodos é text-sm font-medium text-primary e o texto padrão é "Ver tudo"', () => {
    for (const classe of ["text-sm", "font-medium", "text-primary"]) {
      expect(doLink.split(/\s+/), classe).toContain(classe);
    }
    expect(bloco).toContain('verTodos.rotulo ?? "Ver tudo"');
    expect(bloco).not.toContain('"Ver todas"');
  });

  it("Bloco: os quatro estados continuam distintos", () => {
    const vazio = bloco.slice(bloco.indexOf('estado === "vazio"'), bloco.indexOf('estado === "falha"'));
    const falha = bloco.slice(bloco.indexOf('estado === "falha"'), bloco.indexOf('estado === "nao-segue"'));
    const naoSegue = bloco.slice(bloco.indexOf('estado === "nao-segue"'));
    expect(bloco).toContain('estado === "conteudo" ? children');
    expect(vazio).toContain("<Inbox");
    expect(falha).toContain("<AlertTriangle");
    expect(falha).toContain('role="alert"');
    expect(naoSegue).toContain("<CircleSlash");
    expect(naoSegue).toContain("border-dashed");
    expect(naoSegue).toContain("Ver sem o filtro");
    expect(naoSegue).not.toContain("Inbox");
    expect(naoSegue).not.toContain("AlertTriangle");
  });

  it("CardShell: raio de 28 px, título de 17 px com tracking, link Ver tudo em text-sm", () => {
    const cn = /<Card[\s\S]*?className=\{cn\(([\s\S]*?)\n\s*\)\}/.exec(cardShell)?.[1] ?? "";
    const titulo = /<CardTitle className="([^"]*)"/.exec(cardShell)?.[1] ?? "";
    const link = /<Link\s+href=\{DASH_CARD_HREF\[id\]\}\s+className="([^"]*)"/.exec(cardShell)?.[1] ?? "";
    expect(cn).toContain("overflow-hidden");
    expect(cn).toContain("rounded-[28px]");
    expect(titulo.split(/\s+/)).toContain("text-[1.0625rem]");
    expect(titulo.split(/\s+/)).toContain("tracking-[-0.018em]");
    expect(link.split(/\s+/)).toContain("text-sm");
    expect(cardShell).toMatch(/Ver tudo\s*<ChevronRight/);
    expect(cardShell).not.toContain("Ver mais");
  });

  it("CardShell: o modo Personalizar mantém o cursor de arrastar e o raio", () => {
    expect(cardShell).toContain("cursor-grab");
    expect(cardShell).toContain("draggable={personalizing}");
    expect(cardShell).toContain("rounded-[28px]");
    expect(cardShell).toContain('className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-primary/10 text-primary"');
  });

  it("financeiro: cada um dos seis <Bloco> tem icone={", () => {
    const aberturas = [...financeiro.matchAll(/<Bloco\s[\s\S]*?\n {8}>\n/g)].map((m) => m[0]);
    expect(aberturas).toHaveLength(6);
    for (const abertura of aberturas) expect(abertura).toContain("icone={");
  });

  it("financeiro: o ícone vem do destino (relatórios, cartões, faturas, lançamentos, terceiros, categorias)", () => {
    const porTitulo = (titulo: string) =>
      /icone=\{(\w+)\}/.exec(
        [...financeiro.matchAll(/<Bloco\s[\s\S]*?\n {8}>\n/g)].map((m) => m[0]).find((a) => a.includes(`titulo="${titulo}"`)) ?? "",
      )?.[1];
    expect(porTitulo("Minhas entradas × saídas")).toBe("BarChart3");
    expect(porTitulo("Meus gastos por categoria")).toBe("PieChart");
    expect(porTitulo("Cartões de crédito")).toBe("CreditCard");
    expect(porTitulo("Próximas faturas")).toBe("Receipt");
    expect(porTitulo("Últimas transações")).toBe("ArrowLeftRight");
    expect(porTitulo("Pendente de terceiros")).toBe("Users");
  });

  it("financeiro: o card-âncora do detalhamento tem 19 px de respiro e o quadrado sem ring", () => {
    const ancora = financeiro.slice(financeiro.indexOf('<section aria-labelledby="painel-detalhamento"'));
    const conteudo = /<CardContent className="([^"]*)"/.exec(ancora)?.[1] ?? "";
    const quadrado = /<div className="(grid size-10[^"]*)"/.exec(ancora)?.[1] ?? "";
    expect(conteudo).toContain("p-[19px]");
    expect(conteudo).not.toContain("p-5");
    expect(quadrado).toContain("rounded-[12px]");
    expect(quadrado).not.toContain("ring");
  });
});

describe("09-D T4 - StatCard e PageHeader em vidro", () => {
  const lerShared = (nome: string) =>
    semComentarios(fs.readFileSync(path.resolve(PASTA, "..", nome), "utf8"));
  const stat = lerShared("stat-card.tsx");
  const header = lerShared("page-header.tsx");

  const conteudo = /<CardContent className="([^"]*)"/.exec(stat)?.[1] ?? "";
  const quadradoStat = /<div className="(hidden size-10[^"]*)"/.exec(stat)?.[1] ?? "";
  const numero = /<p className="([^"]*\btext-2xl\b[^"]*)"/.exec(stat)?.[1] ?? "";
  const h1 = /<h1 className="([^"]*)"/.exec(header)?.[1] ?? "";
  const descricao = /<p className="([^"]*)"/.exec(header)?.[1] ?? "";
  const props = /\{\s*title,\s*description,\s*children,\s*className,\s*\}/.exec(header)?.[0] ?? "";

  it("a varredura leu o conteúdo, o quadrado, o número, o h1, a descrição e as props (anti-tautologia)", () => {
    expect(conteudo).toContain("flex");
    expect(quadradoStat).toContain("size-10");
    expect(numero).toContain("tabular-nums");
    expect(h1).toContain("break-words");
    expect(descricao).toContain("text-sm");
    expect(props).toContain("title");
  });

  it("StatCard: o respiro do CardContent é 15 px, e 19 px de sm para cima", () => {
    const partes = conteudo.split(/\s+/);
    expect(partes).toContain("p-[15px]");
    expect(partes).toContain("sm:p-[19px]");
    expect(partes).not.toContain("p-4");
    expect(partes).not.toContain("sm:p-5");
  });

  it("StatCard: o quadrado do ícone é size-10 rounded-[12px], sem ring, e some abaixo de 13rem de card", () => {
    const partes = quadradoStat.split(/\s+/);
    expect(partes).toContain("size-10");
    expect(partes).toContain("rounded-[12px]");
    expect(partes).toContain("bg-primary/10");
    expect(partes).toContain("text-primary");
    expect(partes).toContain("hidden");
    expect(partes).toContain("@[13rem]:grid");
    expect(quadradoStat).not.toContain("ring");
  });

  it("StatCard: a seta up usa text-success-ink, não emerald", () => {
    expect(stat).not.toContain("emerald");
    expect(stat).toMatch(/direction === "up" && "text-success-ink"/);
  });

  it("StatCard: o número continua text-2xl e tabular-nums", () => {
    expect(numero.split(/\s+/)).toContain("text-2xl");
    expect(numero.split(/\s+/)).toContain("tabular-nums");
  });

  it("PageHeader: o <h1> tem 26 px no celular, 32 px de sm, negrito, tracking e quebra palavra", () => {
    const partes = h1.split(/\s+/);
    for (const classe of ["text-[1.625rem]", "sm:text-[2rem]", "font-bold", "tracking-[-0.03em]", "break-words"]) {
      expect(partes, classe).toContain(classe);
    }
    expect(partes).not.toContain("text-xl");
    expect(partes).not.toContain("sm:text-2xl");
    expect(partes).not.toContain("font-semibold");
  });

  it("PageHeader: a descrição continua na névoa e a API não mudou", () => {
    expect(descricao.split(/\s+/)).toContain("text-muted-on-fog");
    expect(props).toContain("children");
    expect(header).toMatch(/title: string;\s*description\?: string;\s*children\?: React\.ReactNode;\s*className\?: string;/);
  });
});
