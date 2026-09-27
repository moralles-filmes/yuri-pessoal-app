/**
 * REDESIGN-03-B2 (B1) — toda leitura DE LISTA de `card_statements_with_total` filtra
 * `.gt("itens", 0)`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Fatura sem item nasce do get-or-create (parcela cancelada ou movida deixa a            ║
 * ║ competência vazia) e NÃO é fatura real — §13.5 das métricas: "sem lançamentos          ║
 * ║ conhecidos" não é R$ 0,00. `getStatements` sempre filtrou; o Cron e a busca global     ║
 * ║ não, e o sino mandava "Fatura atrasada" urgente de fatura vazia.                       ║
 * ║                                                                                       ║
 * ║ A varredura usa o compiler API do TypeScript (sem checker): acha cada                  ║
 * ║ `.from("card_statements_with_total")`, sobe a cadeia de chamadas encadeadas e          ║
 * ║ classifica. A exceção é ESTRUTURAL, não uma lista de nomes: cadeia com `.eq("id", …)`  ║
 * ║ é leitura POR ID (uma fatura escolhida), e ali o filtro não se aplica.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");
const VIEW = "card_statements_with_total";

type Metodo = { nome: string; args: Array<string | number | null> };
type Leitura = { arquivo: string; linha: number; metodos: Metodo[] };

function arquivosDeCodigo(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return arquivosDeCodigo(caminho);
    return /\.(ts|tsx)$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)
      ? [caminho]
      : [];
  });
}

function literal(e: ts.Expression): string | number | null {
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isNumericLiteral(e)) return Number(e.text);
  return null;
}

function leiturasDaView(caminho: string): Leitura[] {
  const texto = fs.readFileSync(caminho, "utf8");
  if (!texto.includes(VIEW)) return [];
  const fonte = ts.createSourceFile(
    caminho,
    texto,
    ts.ScriptTarget.Latest,
    true,
    caminho.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const arquivo = path.relative(SRC, caminho).split(path.sep).join("/");
  const achadas: Leitura[] = [];
  const visitar = (no: ts.Node): void => {
    if (
      ts.isCallExpression(no) &&
      ts.isPropertyAccessExpression(no.expression) &&
      no.expression.name.text === "from" &&
      no.arguments.length > 0 &&
      literal(no.arguments[0]) === VIEW
    ) {
      // Sobe a cadeia `.from(...).select(...).gt(...)…` enquanto cada elo é chamada encadeada.
      const metodos: Metodo[] = [];
      let atual: ts.Node = no;
      while (
        ts.isPropertyAccessExpression(atual.parent) &&
        atual.parent.expression === atual &&
        ts.isCallExpression(atual.parent.parent) &&
        atual.parent.parent.expression === atual.parent
      ) {
        const chamada = atual.parent.parent;
        metodos.push({ nome: atual.parent.name.text, args: chamada.arguments.map(literal) });
        atual = chamada;
      }
      const { line } = fonte.getLineAndCharacterOfPosition(no.getStart(fonte));
      achadas.push({ arquivo, linha: line + 1, metodos });
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return achadas;
}

const temMetodo = (l: Leitura, nome: string, ...args: Array<string | number>) =>
  l.metodos.some((m) => m.nome === nome && args.every((a, i) => m.args[i] === a));

const porId = (l: Leitura) => temMetodo(l, "eq", "id");
const comFiltro = (l: Leitura) => temMetodo(l, "gt", "itens", 0);

describe("03-B2 B1 — leituras da view de faturas", () => {
  const arquivos = arquivosDeCodigo(SRC);
  const leituras = arquivos.flatMap(leiturasDaView);
  const arquivosDe = (filtro: (l: Leitura) => boolean) =>
    [...new Set(leituras.filter(filtro).map((l) => l.arquivo))].sort();

  it("a varredura leu o repositório e reconhece as três formas", () => {
    expect(arquivos.length).toBeGreaterThan(100);
    expect(arquivosDe(comFiltro)).toContain("lib/finance/queries.ts");
    expect(arquivosDe(porId)).toEqual(["lib/actions/statements.ts"]);
  });

  /**
   * ⚠️ CARACTERIZAÇÃO — congela o HOJE, antes do conserto da B1 (decisão do dono em
   * 2026-09-27: o Cron E a busca passam a filtrar). O commit de conserto atualiza ESTE teste
   * para a lista vazia.
   */
  it("B1 — CARACTERIZAÇÃO: as leituras de lista sem .gt('itens', 0) são o Cron e a busca", () => {
    expect(arquivosDe((l) => !porId(l) && !comFiltro(l))).toEqual([
      "lib/notifications/cron.ts",
      "lib/search/queries.ts",
    ]);
  });
});
