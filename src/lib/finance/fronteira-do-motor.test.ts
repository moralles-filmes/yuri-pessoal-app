/**
 * 03-B2 A3 — fronteira do motor pelo compiler API do TypeScript COM checker.
 * O tipo contextual revela montagens em Array<DashTx>, satisfies, argumentos inline
 * e callbacks com retorno anotado, sem depender de como o tipo foi escrito.
 * A regra (b) também olha a chamada: no map genérico o contexto do literal pode ser
 * o parâmetro U, não DashStatement; no flatMap o callback pode devolver [{ ... }].
 *
 * Complementa a regex da 03-B em pipeline.test.ts, que continua varrendo TODOS os
 * arquivos, inclusive quem chega ao motor por reexportação. Aqui só entram imports
 * diretos do motor, mas as regras enxergam qualquer forma descrita acima e casts.
 * Risco residual: objeto construído sem literal e depois empurrado numa lista escapa.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");
const PIPELINE = path.join(SRC, "lib", "finance", "pipeline.ts");
const DASHBOARD = path.join(SRC, "lib", "finance", "dashboard.ts");
const IMPORTA_MOTOR = /from\s+["']@\/lib\/finance\/(dashboard|pipeline)["']/;
const TIPOS_DO_MOTOR = new Set([
  "DashTx",
  "DashStatement",
  "DashReceivable",
  "DashCard",
  "DashBill",
  "DashInstallmentItem",
  "DashRecurrence",
]);

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function arquivosDeCodigo(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      return entrada.name === "__tests__" ? [] : arquivosDeCodigo(caminho);
    }
    return /\.(ts|tsx)$/.test(entrada.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entrada.name)
      ? [caminho]
      : [];
  });
}

function relativoASrc(arquivo: string): string {
  return path.relative(SRC, arquivo).split(path.sep).join("/");
}

function semParenteses(expressao: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(expressao)) expressao = expressao.expression;
  return expressao;
}

function ehLiteralDeMontagem(expressao: ts.Expression): boolean {
  const valor = semParenteses(expressao);
  return (
    ts.isObjectLiteralExpression(valor) ||
    (ts.isArrayLiteralExpression(valor) &&
      valor.elements.some((elemento) => ts.isObjectLiteralExpression(semParenteses(elemento))))
  );
}

function callbackMontaLiteral(argumento: ts.Expression): boolean {
  const callback = semParenteses(argumento);
  if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) return false;
  if (!ts.isBlock(callback.body)) return ehLiteralDeMontagem(callback.body);

  function temRetornoLiteral(no: ts.Node): boolean {
    // O retorno de uma função aninhada não é o retorno deste callback.
    if (ts.isFunctionLike(no)) return false;
    if (ts.isReturnStatement(no)) {
      return no.expression !== undefined && ehLiteralDeMontagem(no.expression);
    }
    return ts.forEachChild(no, temRetornoLiteral) ?? false;
  }

  return temRetornoLiteral(callback.body);
}

function montagens(arquivo: ts.SourceFile, checker: ts.TypeChecker): string[] {
  function ehDash(tipo: ts.Type | undefined): boolean {
    if (!tipo) return false;
    if (tipo.isUnion()) return tipo.types.some(ehDash);
    const simbolo = tipo.aliasSymbol ?? tipo.getSymbol();
    return (
      simbolo !== undefined &&
      TIPOS_DO_MOTOR.has(simbolo.getName()) &&
      (simbolo.getDeclarations()?.some(
        (declaracao) => path.resolve(declaracao.getSourceFile().fileName) === DASHBOARD,
      ) ?? false)
    );
  }

  function ehListaDeDash(tipo: ts.Type | undefined): boolean {
    if (!tipo) return false;
    if (tipo.isUnion()) return tipo.types.some(ehListaDeDash);
    if (!checker.isArrayType(tipo) && !checker.isArrayLikeType(tipo)) return false;
    // O índice numérico cobre tanto Array<T> quanto ReadonlyArray<T>.
    return ehDash(checker.getIndexTypeOfType(tipo, ts.IndexKind.Number));
  }

  const encontrados = new Set<string>();
  function visitar(no: ts.Node): void {
    let montagem = false;
    if (ts.isObjectLiteralExpression(no)) {
      // (a) O contexto vem da anotação, de satisfies ou do argumento da chamada.
      montagem = ehDash(checker.getContextualType(no));
    } else if (ts.isCallExpression(no)) {
      // (b) O contexto da chamada atravessa o U do map/flatMap genérico.
      montagem =
        ehListaDeDash(checker.getContextualType(no)) && no.arguments.some(callbackMontaLiteral);
    } else if (ts.isAsExpression(no) || ts.isTypeAssertionExpression(no)) {
      // (c) Inclui asserções duplas como linhas as unknown as DashTx[].
      const tipo = checker.getTypeFromTypeNode(no.type);
      montagem = ehDash(tipo) || ehListaDeDash(tipo);
    }
    if (montagem) {
      const { line } = arquivo.getLineAndCharacterOfPosition(no.getStart(arquivo));
      encontrados.add(`${relativoASrc(arquivo.fileName)}:${line + 1}`);
    }
    ts.forEachChild(no, visitar);
  }

  visitar(arquivo);
  return [...encontrados].sort();
}

describe("03-B2 — fronteira: nenhum importador do motor monta Dash* fora de pipeline.ts", () => {
  let varridos: ts.SourceFile[];
  let pipeline: ts.SourceFile;
  let checker: ts.TypeChecker;

  beforeAll(() => {
    const caminhos = arquivosDeCodigo(SRC).filter(
      (arquivo) =>
        arquivo !== PIPELINE &&
        IMPORTA_MOTOR.test(semComentarios(fs.readFileSync(arquivo, "utf8"))),
    );
    const raiz = path.resolve(SRC, "..");
    const config = ts.readConfigFile(path.join(raiz, "tsconfig.json"), ts.sys.readFile);
    expect(config.error).toBeUndefined();
    const configuracao = ts.parseJsonConfigFileContent(config.config, ts.sys, raiz);
    expect(configuracao.errors).toEqual([]);
    // Um único programa/checker para a fronteira e o controle positivo.
    const programa = ts.createProgram({
      rootNames: [...caminhos, PIPELINE],
      options: { ...configuracao.options, noEmit: true, skipLibCheck: true },
    });
    checker = programa.getTypeChecker();

    function fonte(caminho: string): ts.SourceFile {
      const arquivo = programa.getSourceFile(caminho);
      if (!arquivo) throw new Error(`Arquivo ausente do programa: ${relativoASrc(caminho)}`);
      return arquivo;
    }
    varridos = caminhos.map(fonte);
    pipeline = fonte(PIPELINE);
  }, 60_000);

  it("a varredura inclui os cinco chamadores esperados e exclui pipeline.ts", () => {
    const caminhos = varridos.map((arquivo) => relativoASrc(arquivo.fileName));
    expect(caminhos).toEqual(
      expect.arrayContaining([
        "lib/notifications/cron.ts",
        "lib/finance/queries.ts",
        "lib/dashboard/queries.ts",
        "lib/reports/queries.ts",
        "app/(app)/dashboard/financeiro/page.tsx",
      ]),
    );
    expect(caminhos).not.toContain("lib/finance/pipeline.ts");
  }, 60_000);

  it("as mesmas regras encontram pelo menos sete montagens legítimas em pipeline.ts", () => {
    expect(montagens(pipeline, checker).length).toBeGreaterThanOrEqual(7);
  }, 60_000);

  it("zero montagens fora de pipeline.ts, com caminho e linha para cada achado", () => {
    const encontrados = varridos.flatMap((arquivo) => montagens(arquivo, checker)).sort();
    expect(encontrados).toEqual([]);
  }, 60_000);
});
