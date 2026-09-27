/**
 * O extrator ÚNICO dos deep-links montados à mão (`link: …`), compartilhado pelo R4
 * (`deep-links-inline.test.ts`: a rota tem página) e pelo contrato da 07-A
 * (`deep-links-query-string.test.ts`: o parâmetro é lido pela página).
 *
 * Mora fora dos dois testes porque uma segunda cópia do instrumento divergiria na primeira
 * correção — e os dois passariam a medir coisas diferentes chamando-as pelo mesmo nome.
 */

import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..");

/** O que ocupa um `${…}` para a rota ficar concreta. Um segmento dinâmico casa com um. */
export const VALOR_DE_EXEMPLO = "abc123";

/**
 * A varredura olha CÓDIGO, não prosa: sem isto, um `link: "/rota-que-morreu"` citado
 * dentro de um comentário explicativo entraria na conta e o teste cobraria uma rota que
 * ninguém mais abre — ou pior, passaria a aprovar o comentário em vez do código.
 *
 * Cada comentário vira espaço do MESMO tamanho, e não uma string vazia, para que os
 * deslocamentos não andem: é assim que a linha relatada no erro é a linha de verdade.
 *
 * ⚠️ Esta limpeza não conhece string: um `"https://…"` dentro de um literal seria
 * mutilado pelo `//`. Hoje nenhum dos arquivos varridos tem `://` — e o primeiro teste do
 * R4 afirma isso, para que o dia em que isso mudar seja um vermelho e não um silêncio.
 */
export function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/** Índice da aspa que FECHA o literal aberto em `i` (crase entende `${…}`). */
function fimDoLiteral(fonte: string, i: number): number {
  const aspa = fonte[i];
  for (let j = i + 1; j < fonte.length; j++) {
    const c = fonte[j];
    if (c === "\\") {
      j++;
      continue;
    }
    if (aspa === "`" && c === "$" && fonte[j + 1] === "{") {
      j = fimDaInterpolacao(fonte, j + 2);
      continue;
    }
    if (c === aspa) return j;
  }
  return fonte.length;
}

/** Índice da chave que FECHA a interpolação aberta em `i` (já depois do `${`). */
function fimDaInterpolacao(fonte: string, i: number): number {
  let profundidade = 0;
  for (let j = i; j < fonte.length; j++) {
    const c = fonte[j];
    if (c === '"' || c === "'" || c === "`") {
      j = fimDoLiteral(fonte, j);
      continue;
    }
    if (c === "{") profundidade++;
    else if (c === "}") {
      if (profundidade === 0) return j;
      profundidade--;
    }
  }
  return fonte.length;
}

/**
 * A expressão atribuída ao `link:` (ou ao `link =`) que começa em `i`, logo depois do
 * separador.
 *
 * Para na vírgula que fecha a propriedade, ou no fecha-chaves do objeto quando o `link:`
 * é a última. Respeita aspas e aninhamento — senão o `}` de um `${…}` encerraria a
 * leitura no meio do próprio link, e o ternário de três linhas perderia a segunda ponta.
 * O `;` é o fim da atribuição; propriedade de objeto nunca tem `;` no nível zero.
 */
function expressaoDoLink(fonte: string, i: number): string {
  let profundidade = 0;
  let j = i;
  for (; j < fonte.length; j++) {
    const c = fonte[j];
    if (c === '"' || c === "'" || c === "`") {
      j = fimDoLiteral(fonte, j);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") profundidade++;
    else if (c === ")" || c === "]" || c === "}") {
      if (profundidade === 0) break;
      profundidade--;
    } else if ((c === "," || c === ";") && profundidade === 0) break;
  }
  return fonte.slice(i, j);
}

/**
 * Todo literal da expressão que comece por `/` — string ou template.
 *
 * O que NÃO começa por `/` fica de fora de propósito: `link: foodLink(f.id)` é rota
 * montada pela fonte única do módulo, e a 02-D já a cobre pelo teste daquele arquivo;
 * `link: string | null` é declaração de tipo. Repescá-los aqui seria conferir duas vezes
 * o que já tem dono, e deixar de conferir continua sendo o defeito que este teste fecha.
 */
function rotasDaExpressao(expressao: string): string[] {
  const achadas: string[] = [];
  for (let j = 0; j < expressao.length; j++) {
    const c = expressao[j];
    if (c !== '"' && c !== "'" && c !== "`") continue;
    const fim = fimDoLiteral(expressao, j);
    const conteudo = expressao.slice(j + 1, fim);
    if (conteudo.startsWith("/")) achadas.push(conteudo);
    j = fim;
  }
  return achadas;
}

export type PontoDeLink = {
  arquivo: string;
  linha: number;
  /** Como está escrito no código, com `${…}` preservado — é o que o erro precisa mostrar. */
  literal: string;
  /** Pronto para `temPagina`, com cada `${…}` trocado por um valor. */
  concreta: string;
};

/**
 * Toda rota inline do texto, com o arquivo e a linha de onde saiu.
 *
 * Casa `link:` (propriedade) e `link =` (atribuição, F2 da 07-A). O `(?![=>])` deixa de
 * fora `link ===` (comparação) e `(link) => …` (parâmetro de arrow).
 */
export function pontosDeLink(arquivo: string, fonte: string): PontoDeLink[] {
  const pontos: PontoDeLink[] = [];
  for (const m of fonte.matchAll(/\blink\s*(?::|=(?![=>]))/g)) {
    const inicio = m.index + m[0].length;
    const linha = fonte.slice(0, m.index).split("\n").length;
    for (const literal of rotasDaExpressao(expressaoDoLink(fonte, inicio))) {
      pontos.push({
        arquivo,
        linha,
        literal,
        // Interpolação não aninha em nenhum destes links; o `[^}]` basta e diz isso.
        concreta: literal.replace(/\$\{[^}]*\}/g, VALOR_DE_EXEMPLO),
      });
    }
  }
  return pontos;
}

/** Lê um arquivo de `src/` (caminho relativo a ele) e devolve os links que ele cunha. */
export function lerLinks(arquivo: string) {
  const bruto = fs.readFileSync(path.join(SRC, arquivo), "utf8");
  const fonte = semComentarios(bruto);
  return { arquivo, bruto, fonte, pontos: pontosDeLink(arquivo, fonte) };
}
