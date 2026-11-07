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
import { bloco, css, SRC, semComentarios } from "./ler-tokens";

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
    expect(reduzida).toMatch(/background\s*:\s*var\(--glass-solid\)/);
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
