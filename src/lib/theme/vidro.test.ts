/**
 * REDESIGN-09-A — o contrato dos quatro materiais (`vidro-casca`, `vidro-cartao`,
 * `vidro-sobreposicao`, `ladrilho`) e da névoa que fica atrás deles.
 *
 * O Tailwind v4 só emite o CSS de uma utilitária quando alguma classe a usa, então o build
 * não prova que elas existem. Este teste lê a FONTE (`globals.css`, sem comentários) e fixa
 * o que cada material promete: onde há `backdrop-filter`, que os dois modos de acessibilidade
 * (transparência reduzida, cores forçadas) estão em cada um, e que o raio é do componente.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bloco, claro, css, escuro, SRC, semComentarios } from "./ler-tokens";

const MATERIAIS = ["vidro-casca", "vidro-cartao", "vidro-sobreposicao", "ladrilho"] as const;
const COM_DESFOQUE = new Set<string>(["vidro-casca", "vidro-sobreposicao"]);

const corpo = (nome: string) => bloco(`@utility ${nome} `);

/**
 * `backdrop-filter` SEM prefixo: a âncora `(?<![-\w])` impede de casar dentro de
 * `-webkit-backdrop-filter`, que antes tornava as asserções sem prefixo vácuas.
 */
const SEM_PREFIXO = String.raw`(?<![-\w])backdrop-filter\s*:\s*`;
const COM_PREFIXO = String.raw`-webkit-backdrop-filter\s*:\s*`;

/** Corpo do primeiro `@media (<condição>) { … }` dentro de um trecho de CSS, por profundidade. */
function corpoDaMedia(trecho: string, condicao: string): string {
  const inicio = trecho.indexOf(`@media (${condicao})`);
  if (inicio < 0) return "";
  const abre = trecho.indexOf("{", inicio);
  let profundidade = 0;
  for (let i = abre; i < trecho.length; i += 1) {
    if (trecho[i] === "{") profundidade += 1;
    else if (trecho[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return trecho.slice(abre + 1, i);
    }
  }
  return "";
}

describe("os quatro materiais", () => {
  it.each(MATERIAIS)("%s existe como @utility", (nome) => {
    expect(css).toContain(`@utility ${nome} {`);
    expect(corpo(nome).trim().length).toBeGreaterThan(0);
  });

  it.each(MATERIAIS)("%s só tem backdrop-filter se for casca ou sobreposição", (nome) => {
    const c = corpo(nome);
    const comDesfoque = COM_DESFOQUE.has(nome);
    expect(new RegExp(`${SEM_PREFIXO}blur\\(`).test(c)).toBe(comDesfoque);
    expect(new RegExp(`${COM_PREFIXO}blur\\(`).test(c)).toBe(comDesfoque);
  });

  it("vidro-cartao e ladrilho não mencionam backdrop-filter fora do modo reduzido", () => {
    for (const nome of ["vidro-cartao", "ladrilho"]) {
      const fora = corpo(nome).replace(/@media[^{]*\{[^{}]*\}/g, "");
      expect(fora).not.toMatch(/backdrop-filter/);
    }
  });

  it.each(MATERIAIS)("%s trata transparência reduzida e cores forçadas", (nome) => {
    const reduzida = corpoDaMedia(corpo(nome), "prefers-reduced-transparency: reduce");
    // 09-B: o ladrilho cai no SEU sólido (1 degrau mais claro que o cartão em que está).
    const solido = nome === "ladrilho" ? "--tile-solid" : "--glass-solid";
    expect(reduzida).toMatch(new RegExp(String.raw`background\s*:\s*var\(${solido}\)`));
    expect(reduzida).toMatch(new RegExp(`${SEM_PREFIXO}none`));
    expect(reduzida).toMatch(new RegExp(`${COM_PREFIXO}none`));

    const forcadas = corpoDaMedia(corpo(nome), "forced-colors: active");
    expect(forcadas).toMatch(/border-color\s*:\s*CanvasText/);
  });

  it.each(MATERIAIS)("%s não define border-radius (o raio é do componente)", (nome) => {
    expect(corpo(nome)).not.toContain("border-radius");
  });

  it("usa os tokens certos em cada material", () => {
    expect(corpo("vidro-casca")).toContain("var(--glass)");
    expect(corpo("vidro-cartao")).toContain("var(--glass)");
    expect(corpo("vidro-sobreposicao")).toContain("var(--glass-strong)");
    expect(corpo("ladrilho")).toContain("var(--tile)");
    expect(corpo("ladrilho")).toContain("var(--tile-border)");
    expect(corpo("ladrilho")).not.toContain("box-shadow");
  });

  it.each(MATERIAIS)(
    "%s escreve -webkit-backdrop-filter ANTES de backdrop-filter (Lightning CSS do build)",
    (nome) => {
      const corpoDoMaterial = corpo(nome);
      const blocos = [corpoDoMaterial.replace(/@media[^{]*\{[^{}]*\}/g, "")];
      for (const m of corpoDoMaterial.matchAll(/@media[^{]*\{([^{}]*)\}/g)) blocos.push(m[1]);
      for (const b of blocos) {
        for (const m of b.matchAll(/(?<!-webkit-)backdrop-filter\s*:/g)) {
          const antes = b.slice(0, m.index);
          expect(
            antes,
            "O Lightning CSS do Next funde as duas declarações iguais em UMA prefixada quando o " +
              "-webkit- vem DEPOIS, e o Chrome não usa o prefixado: o backdrop-filter sem " +
              "prefixo some do CSS de produção. Escreva -webkit-backdrop-filter primeiro.",
          ).toMatch(/-webkit-backdrop-filter\s*:/);
        }
      }
    },
  );

  it("nenhum lugar usa background-attachment: fixed (quebra no iOS)", () => {
    expect(css).not.toMatch(/background-attachment\s*:\s*fixed/);
  });
});

describe("09-B · sólido do ladrilho", () => {
  it("--tile-solid difere de --glass-solid nos dois temas (o campo continua 1 degrau acima do cartão)", () => {
    for (const [nome, tm] of [["claro", claro], ["escuro", escuro]] as const) {
      expect(tm.get("tile-solid"), nome).toBeDefined();
      expect(tm.get("tile-solid"), nome).not.toBe(tm.get("glass-solid"));
    }
  });

  it("o ladrilho não cai mais em --glass-solid com a transparência reduzida", () => {
    const reduzida = corpoDaMedia(corpo("ladrilho"), "prefers-reduced-transparency: reduce");
    expect(reduzida).not.toContain("--glass-solid");
  });
});

describe("transparência reduzida no nível dos tokens (§6.12)", () => {
  /** O CSS sem o corpo de nenhuma `@utility`: sobra só o que está fora dos quatro materiais. */
  function foraDasUtilitarias(): string {
    let saida = "";
    let i = 0;
    for (const m of css.matchAll(/@utility\s+[\w-]+\s*\{/g)) {
      const inicio = m.index ?? 0;
      if (inicio < i) continue;
      saida += css.slice(i, inicio);
      let prof = 0;
      let j = inicio + m[0].length - 1;
      for (; j < css.length; j += 1) {
        if (css[j] === "{") prof += 1;
        else if (css[j] === "}" && (prof -= 1) === 0) break;
      }
      i = j + 1;
    }
    return saida + css.slice(i);
  }

  const CONDICAO = "prefers-reduced-transparency: reduce";

  it("--card, --popover e --sidebar viram --glass-solid nos dois temas", () => {
    const fora = foraDasUtilitarias();
    expect(fora).not.toContain("@utility");
    const corpoDoBloco = corpoDaMedia(fora, CONDICAO);
    expect(corpoDoBloco, "falta o @media de topo que redefine os tokens").not.toBe("");
    for (const token of ["card", "popover", "sidebar"]) {
      expect(corpoDoBloco).toMatch(new RegExp(String.raw`--${token}\s*:\s*var\(--glass-solid\)`));
    }
    const seletor = corpoDoBloco.slice(0, corpoDoBloco.indexOf("{"));
    expect(seletor).toMatch(/:root/);
    expect(seletor).toMatch(/\.dark/);
  });

  it("o bloco vem DEPOIS de `.dark { … }` (mesma especificidade, vence pela ordem)", () => {
    const fora = foraDasUtilitarias();
    const dark = fora.indexOf(".dark {");
    const media = fora.indexOf(`@media (${CONDICAO})`);
    expect(dark).toBeGreaterThan(0);
    expect(media).toBeGreaterThan(dark);
  });
});

describe("a névoa no fundo (T4)", () => {
  const lerFonte = (...partes: string[]) =>
    semComentarios(fs.readFileSync(path.join(SRC, ...partes), "utf8"));

  it("body::before é fixo, atrás de tudo, e pinta as três manchas", () => {
    const b = bloco("body::before");
    expect(b).toMatch(/position\s*:\s*fixed/);
    expect(b).toMatch(/z-index\s*:\s*-1/);
    expect(b).toMatch(/pointer-events\s*:\s*none/);
    for (const n of ["fog-1", "fog-2", "fog-3"]) {
      expect(b).toContain(`var(--${n})`);
    }
  });

  it("body cria o próprio contexto de empilhamento e mantém o fundo da base", () => {
    const b = bloco("  body {");
    expect(b).toMatch(/isolation\s*:\s*isolate/);
    expect(b).toContain("bg-background");
  });

  it("a div raiz do AppShell não tem bg-background (senão esconde a névoa)", () => {
    const fonte = lerFonte("components", "layout", "app-shell.tsx");
    const depoisDoReturn = fonte.slice(fonte.indexOf("return ("));
    const classe = /className="([^"]*)"/.exec(depoisDoReturn)?.[1] ?? "";
    expect(classe).toContain("min-h-svh");
    expect(classe).not.toContain("bg-background");
  });

  it("a coluna do formulário do login não tem bg-background", () => {
    const fonte = lerFonte("app", "(auth)", "layout.tsx");
    const linhas = fonte.split("\n");
    const i = linhas.findIndex((l) => l.includes("{children}"));
    expect(i).toBeGreaterThan(0);
    // A div que embrulha `{children}` abre na linha anterior à do `max-w-sm`.
    const coluna = linhas.slice(Math.max(0, i - 2), i + 1).join("\n");
    expect(coluna).toContain("justify-center");
    expect(coluna).not.toContain("bg-background");
  });
});

/** Todos os `.tsx` de `src/`, para as varreduras abaixo. */
function arquivosTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivosTsx(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

const relativo = (p: string) => path.relative(path.resolve(SRC, ".."), p).replaceAll(path.sep, "/");

/** Linha (1-based) de um deslocamento no texto. */
const linhaDe = (texto: string, i: number) => texto.slice(0, i).split("\n").length;

describe("superfícies que cobrem conteúdo rolando (T5)", () => {
  const ARQUIVOS = arquivosTsx(SRC).map((p) => ({
    rel: relativo(p),
    // Comentários saem trocados por espaços de mesmo tamanho de linha: a linha reportada não desliza.
    fonte: fs
      .readFileSync(p, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|[^:])\/\/[^\n]*/g, (_, antes: string) => antes),
  }));

  it("nenhuma classe com sticky/fixed usa bg-card (translúcido sobre o que rola)", () => {
    const ocorrencias: string[] = [];
    for (const { rel, fonte } of ARQUIVOS) {
      // Qualquer literal de texto: className="…", constante "…" ou template `…`.
      for (const m of fonte.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)) {
        const texto = m[1] ?? m[2] ?? m[3] ?? "";
        const classes = texto.split(/\s+/);
        const fixa = classes.some((c) => /^(?:[\w-]+:)*(?:sticky|fixed)$/.test(c));
        const cardTranslucido = classes.some((c) => /^(?:[\w-]+:)*bg-card(?:\/\d+)?$/.test(c));
        if (fixa && cardTranslucido) ocorrencias.push(`${rel}:${linhaDe(fonte, m.index ?? 0)}`);
      }
    }
    expect(
      ocorrencias,
      `fundo translúcido sobre conteúdo que rola: use \`vidro-casca\` (barra) ou \`bg-glass-solid\` (coluna de tabela):\n${ocorrencias.join("\n")}`,
    ).toEqual([]);
  });

  it("nenhum cn()/clsx() junta sticky/fixed e bg-card, mesmo em literais e constantes separados", () => {
    const ocorrencias: string[] = [];
    for (const { rel, fonte } of ARQUIVOS) {
      // Constantes de texto do arquivo: `const NOME = "…"` (a string pode ficar na linha de baixo).
      const constantes = new Map<string, string>();
      for (const m of fonte.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:"([^"]*)"|'([^']*)'|`([^`]*)`)/g)) {
        constantes.set(m[1], m[2] ?? m[3] ?? m[4] ?? "");
      }
      for (const m of fonte.matchAll(/\b(?:cn|clsx)\(/g)) {
        // Corpo da chamada, por profundidade de parênteses.
        const abre = (m.index ?? 0) + m[0].length - 1;
        let prof = 0;
        let fim = abre;
        for (let i = abre; i < fonte.length; i += 1) {
          if (fonte[i] === "(") prof += 1;
          else if (fonte[i] === ")" && (prof -= 1) === 0) {
            fim = i;
            break;
          }
        }
        const corpo = fonte.slice(abre + 1, fim);
        const literais = [...corpo.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map(
          (l) => l[1] ?? l[2] ?? l[3] ?? "",
        );
        // Identificadores soltos (fora de literais) que sejam constantes de texto conhecidas.
        const semLiterais = corpo.replace(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g, " ");
        const resolvidos = [...semLiterais.matchAll(/(?<![\w$.])[A-Za-z_$][\w$]*(?![\w$(])/g)]
          .map((id) => constantes.get(id[0]))
          .filter((v): v is string => v !== undefined);
        const classes = [...literais, ...resolvidos].flatMap((t) => t.split(/\s+/));
        const fixa = classes.some((c) => /^(?:[\w-]+:)*(?:sticky|fixed)$/.test(c));
        const cardTranslucido = classes.some((c) => /^(?:[\w-]+:)*bg-card(?:\/\d+)?$/.test(c));
        if (fixa && cardTranslucido) ocorrencias.push(`${rel}:${linhaDe(fonte, m.index ?? 0)}`);
      }
    }
    expect(
      ocorrencias,
      `fundo translúcido sobre conteúdo que rola: use \`vidro-casca\` (barra) ou \`bg-glass-solid\` (coluna de tabela):\n${ocorrencias.join("\n")}`,
    ).toEqual([]);
  });

  it("nenhum elemento sticky/fixed tem como primeiro filho um elemento com bg-card", () => {
    const ocorrencias: string[] = [];
    // Abertura de tag JSX: nome + atributos (strings e chaves podem conter `>`), até o `>` de fechar.
    const ABERTURA = /^\s*<[A-Za-z][\w.]*((?:"[^"]*"|'[^']*'|\{[^{}]*\}|[^>"'{])*)>/;
    for (const { rel, fonte } of ARQUIVOS) {
      for (const m of fonte.matchAll(/className="([^"]*)"/g)) {
        const fixa = m[1].split(/\s+/).some((c) => /^(?:[\w-]+:)*(?:sticky|fixed)$/.test(c));
        if (!fixa) continue;
        // Fim da tag que carrega a className, e então a próxima tag de abertura (o primeiro filho).
        const fimDaTag = fonte.indexOf(">", (m.index ?? 0) + m[0].length);
        if (fimDaTag < 0) continue;
        const filho = ABERTURA.exec(fonte.slice(fimDaTag + 1));
        const classeDoFilho = /className="([^"]*)"/.exec(filho?.[1] ?? "")?.[1] ?? "";
        if (classeDoFilho.split(/\s+/).some((c) => /^(?:[\w-]+:)*bg-card(?:\/\d+)?$/.test(c))) {
          const posicao = fimDaTag + 1 + (fonte.slice(fimDaTag + 1).search(/<[A-Za-z]/));
          ocorrencias.push(`${rel}:${linhaDe(fonte, posicao)}`);
        }
      }
    }
    expect(
      ocorrencias,
      `fundo translúcido sobre conteúdo que rola: use \`vidro-casca\` (barra) ou \`bg-glass-solid\` (coluna de tabela). O material vai no elemento sticky, não no filho:\n${ocorrencias.join("\n")}`,
    ).toEqual([]);
  });

  it("nenhum gráfico pinta stroke/fill com var(--card) (vira linha tingida, não vão)", () => {
    const ocorrencias: string[] = [];
    for (const { rel, fonte } of ARQUIVOS) {
      for (const m of fonte.matchAll(/\b(?:stroke|fill)\s*=\s*(?:\{\s*)?["'`]var\(--card\)["'`]/g)) {
        ocorrencias.push(`${rel}:${linhaDe(fonte, m.index ?? 0)}`);
      }
    }
    expect(
      ocorrencias,
      `--card é translúcido: use \`var(--glass-solid)\` no stroke/fill:\n${ocorrencias.join("\n")}`,
    ).toEqual([]);
  });
});

describe("09-C · a casca não desfoca sob sobreposição", () => {
  const regra = css.match(/body:has\([^)]*\)\s*\[data-casca\]\s*\{[^}]*\}/)?.[0] ?? "";

  it("tem regra própria para [data-casca] sob dialog/sheet, sem camada", () => {
    expect(regra, "regra `body:has(…) [data-casca]`").not.toBe("");
    expect(regra).toContain('[data-slot="dialog-content"]');
    expect(regra).toContain('[data-slot="sheet-content"]');
    const antes = css.slice(0, css.indexOf(regra));
    // Sem camada: nenhum `@layer … {` ainda aberto na posição da regra.
    const abertas = (antes.match(/\{/g) ?? []).length - (antes.match(/\}/g) ?? []).length;
    expect(abertas).toBe(0);
  });

  it("zera o filtro nas duas grafias, com -webkit- antes", () => {
    const comPrefixo = regra.search(new RegExp(COM_PREFIXO + "none"));
    const semPrefixo = regra.search(new RegExp(SEM_PREFIXO + "none"));
    expect(comPrefixo).toBeGreaterThan(-1);
    expect(semPrefixo).toBeGreaterThan(comPrefixo);
  });

  it("vem depois da regra de vidro sobre vidro", () => {
    const outra = css.indexOf('[data-sonner-toast][data-styled="true"]');
    expect(outra).toBeGreaterThan(-1);
    expect(css.indexOf(regra)).toBeGreaterThan(outra);
  });
});
