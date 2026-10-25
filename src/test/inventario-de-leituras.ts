/**
 * REDESIGN-03-G (L8, D-G23) — o varredor da §2.3 refeito como módulo de teste.
 *
 * Visita cada `.from("…")` / `.rpc("…")` sobre a AST do TypeScript, sobe a cadeia fluente,
 * separa leitura de escrita e segue o resultado até onde o `error` é decidido:
 *
 *  • `helper`      — o resultado (direto, em variável, em builder guardado ou em `Promise.all`)
 *                    chega a `exigir`/`listaComTeto`/`listaCompleta`/`exigirCompleta`/`tentar`;
 *  • `tratado`     — o `error` é lido e o `if` que o testa lança ou devolve resultado de erro;
 *  • `repassado`   — o builder é devolvido a quem chama (a decisão é de lá);
 *  • `engolido`    — o `if` do erro devolve vazio (`[]`, `null`, `false`, `0`, `{}`);
 *  • `descartado`  — o `error` nunca é lido.
 *
 * ⚠️ É HEURÍSTICO de propósito, e erra para o lado que reprova: o que ele não reconhece vira
 * `descartado`. Um achado falso se resolve olhando o código; um varredor que aprova o que não
 * entende é o que deixaria o próximo `{ data }` sem `error` passar.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";

export type DestinoDaLeitura = "helper" | "tratado" | "repassado" | "descartado" | "engolido";

export type LeituraInventariada = {
  arquivo: string;
  linha: number;
  funcao: string;
  alvo: string;
  destino: DestinoDaLeitura;
};

const ESCRITA = new Set(["insert", "update", "upsert", "delete"]);
const HELPERS = ["exigir", "listaComTeto", "listaCompleta", "exigirCompleta", "tentar"];

function escapar(nome: string): string {
  return nome.replace(/[$]/g, "\\$");
}

function cadeia(no: ts.CallExpression): { topo: ts.Expression; metodos: string[] } {
  let n: ts.Expression = no;
  const metodos: string[] = [];
  for (;;) {
    const p = n.parent;
    if (
      p &&
      ts.isPropertyAccessExpression(p) &&
      p.expression === n &&
      p.parent &&
      ts.isCallExpression(p.parent) &&
      p.parent.expression === p
    ) {
      metodos.push(p.name.text);
      n = p.parent;
      continue;
    }
    return { topo: n, metodos };
  }
}

/** Sobe por `await`, parênteses, `as`, `!` e pelos ramos de um ternário. */
function semEnvoltorio(n: ts.Node): ts.Node {
  let x = n;
  while (
    x.parent &&
    (ts.isAwaitExpression(x.parent) ||
      ts.isParenthesizedExpression(x.parent) ||
      ts.isAsExpression(x.parent) ||
      ts.isNonNullExpression(x.parent) ||
      ts.isSatisfiesExpression(x.parent) ||
      (ts.isConditionalExpression(x.parent) && x.parent.condition !== x))
  ) {
    x = x.parent;
  }
  return x;
}

function funcaoQueContem(n: ts.Node): ts.Node {
  let x: ts.Node | undefined = n.parent;
  while (
    x &&
    !(
      ts.isFunctionDeclaration(x) ||
      ts.isFunctionExpression(x) ||
      ts.isArrowFunction(x) ||
      ts.isMethodDeclaration(x)
    )
  ) {
    x = x.parent;
  }
  return x ?? n.getSourceFile();
}

function nomeDaFuncao(f: ts.Node): string {
  let p: ts.Node | undefined = f;
  while (p) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) return p.name.getText();
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    p = p.parent;
  }
  return "(módulo)";
}

/** O corpo do `if` do erro: lança, devolve erro, devolve objeto tipado — ou engole. */
function classificaCorpo(corpo: string): "tratado" | "engolido" {
  const s = corpo.replace(/\s+/g, " ");
  if (/\bthrow\b/.test(s)) return "tratado";
  if (/falhaDeLeitura(Antes|Depois)\(|dbError\(|ok:\s*false|falhaNoMeio\(|return\s+"erro"/.test(s)) {
    return "tratado";
  }
  if (/return\s+\{\s*(erro|ok|userId)\b/.test(s)) return "tratado";
  return "engolido";
}

/** Todos os `if` da função cujo teste menciona o erro. Nenhum ⇒ o erro não decide nada. */
function destinoDoErro(escopo: ts.Node, teste: RegExp): DestinoDaLeitura {
  const corpos: string[] = [];
  const visita = (n: ts.Node) => {
    if (ts.isIfStatement(n) && teste.test(n.expression.getText())) corpos.push(n.thenStatement.getText());
    ts.forEachChild(n, visita);
  };
  visita(escopo);
  if (corpos.length === 0) return "descartado";
  return corpos.every((c) => classificaCorpo(c) === "tratado") ? "tratado" : "engolido";
}

/** O nome chega a um helper (`exigir(res`, `listaCompleta(await query`, `tentar("x", base`)? */
function chegaAoHelper(textoDaFuncao: string, nome: string): boolean {
  const n = escapar(nome);
  const helper = new RegExp(
    `\\b(${HELPERS.join("|")})\\(\\s*(?:"[^"]*",\\s*)?\\(?\\s*(?:await\\s+)?\\(?\\s*${n}\\b`,
  );
  return helper.test(textoDaFuncao);
}

/** Sobe de um nó pela cadeia fluente E pelos envoltórios, alternando, até parar de subir. */
function subir(n: ts.Node): ts.Node {
  let x = n;
  for (;;) {
    let y = x;
    while (
      y.parent &&
      ts.isPropertyAccessExpression(y.parent) &&
      y.parent.expression === y &&
      y.parent.parent &&
      ts.isCallExpression(y.parent.parent) &&
      y.parent.parent.expression === y.parent
    ) {
      y = y.parent.parent;
    }
    y = semEnvoltorio(y);
    if (y === x) return x;
    x = y;
  }
}

/** As referências a `nome` dentro da função (sem a própria declaração nem `obj.nome`). */
function referencias(fn: ts.Node, nome: string): ts.Identifier[] {
  const refs: ts.Identifier[] = [];
  const visita = (n: ts.Node) => {
    if (
      ts.isIdentifier(n) &&
      n.text === nome &&
      !(ts.isVariableDeclaration(n.parent) && n.parent.name === n) &&
      !(ts.isBindingElement(n.parent) && n.parent.name === n) &&
      !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)
    ) {
      refs.push(n);
    }
    ts.forEachChild(n, visita);
  };
  visita(fn);
  return refs;
}

const ORDEM: DestinoDaLeitura[] = ["helper", "tratado", "repassado", "engolido", "descartado"];

/** Segue um nome (variável com o resultado ou builder guardado) até a decisão sobre o erro. */
function seguir(fn: ts.Node, nome: string, profundidade: number): DestinoDaLeitura {
  const texto = fn.getText();
  const n = escapar(nome);
  if (chegaAoHelper(texto, nome)) return "helper";
  if (new RegExp(`\\b${n}\\??\\.error\\b`).test(texto)) {
    return destinoDoErro(fn, new RegExp(`\\b${n}\\??\\.error\\b`));
  }
  if (profundidade > 3) return "descartado";
  // Builder guardado: cada uso dele é seguido como se fosse a própria chamada.
  let melhor: DestinoDaLeitura = "descartado";
  for (const ref of referencias(fn, nome)) {
    const topo = subir(ref);
    // `base = base.eq(...)` só reatribui o builder: não decide nada.
    if (ts.isBinaryExpression(topo.parent) && topo.parent.left.getText() === nome) continue;
    const d = destinoDe(topo, fn, profundidade + 1);
    if (ORDEM.indexOf(d) < ORDEM.indexOf(melhor)) melhor = d;
  }
  return melhor;
}

function destinoDe(topo: ts.Node, fn: ts.Node, profundidade = 0): DestinoDaLeitura {
  const ext = semEnvoltorio(topo);
  const pai = ext.parent;
  if (!pai) return "descartado";

  if (ts.isVariableDeclaration(pai) && pai.initializer === ext) {
    if (ts.isObjectBindingPattern(pai.name)) {
      const el = pai.name.elements.find((e) => (e.propertyName ?? e.name).getText() === "error");
      if (!el) return "descartado";
      return destinoDoErro(fn, new RegExp(`(^|[^.\\w])${escapar(el.name.getText())}\\b`));
    }
    if (ts.isIdentifier(pai.name)) return seguir(fn, pai.name.text, profundidade);
    return "descartado";
  }

  if (ts.isArrayLiteralExpression(pai)) {
    const idx = pai.elements.indexOf(ext as ts.Expression);
    if (ts.isCallExpression(pai.parent) && HELPERS.includes(pai.parent.expression.getText())) return "helper";
    let p: ts.Node | undefined = pai.parent;
    while (p && !ts.isVariableDeclaration(p) && !ts.isBlock(p) && !ts.isSourceFile(p)) p = p.parent;
    if (p && ts.isVariableDeclaration(p) && ts.isArrayBindingPattern(p.name)) {
      const el = p.name.elements[idx];
      if (el && ts.isBindingElement(el)) {
        if (ts.isIdentifier(el.name)) return seguir(fn, el.name.text, profundidade);
        if (ts.isObjectBindingPattern(el.name)) {
          const e2 = el.name.elements.find((e) => (e.propertyName ?? e.name).getText() === "error");
          if (!e2) return "descartado";
          return destinoDoErro(fn, new RegExp(`(^|[^.\\w])${escapar(e2.name.getText())}\\b`));
        }
      }
    }
    return "descartado";
  }

  if (ts.isCallExpression(pai)) {
    const chamado = pai.expression.getText();
    // `tentar("faturas", service.from(...))`, `exigir(await ...)`
    if (HELPERS.includes(chamado)) return "helper";
    return "descartado";
  }

  if (ts.isReturnStatement(pai) || ts.isArrowFunction(pai)) return "repassado";

  // `let query = supabase.from(...)` reatribuído depois: `query = query.eq(...)`
  if (ts.isBinaryExpression(pai) && pai.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return seguir(fn, pai.left.getText(), profundidade);
  }
  return "descartado";
}

/** As LEITURAS de cada arquivo, com o destino do `error`. Escritas e Storage ficam fora. */
export function inventariarLeituras(arquivos: string[], raiz: string): LeituraInventariada[] {
  const saida: LeituraInventariada[] = [];
  for (const caminho of arquivos) {
    const texto = readFileSync(`${raiz}/${caminho}`, "utf8");
    const sf = ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visita = (n: ts.Node) => {
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        (n.expression.name.text === "from" || n.expression.name.text === "rpc") &&
        n.arguments.length >= 1 &&
        ts.isStringLiteralLike(n.arguments[0]) &&
        !/\bstorage$/.test(n.expression.expression.getText()) &&
        n.expression.expression.getText() !== "Array"
      ) {
        const { metodos } = cadeia(n);
        const topo = subir(n);
        if (!metodos.some((m) => ESCRITA.has(m))) {
          const fn = funcaoQueContem(n);
          saida.push({
            arquivo: caminho,
            linha: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
            funcao: nomeDaFuncao(fn),
            alvo: n.arguments[0].text,
            destino: destinoDe(topo, fn),
          });
        }
      }
      ts.forEachChild(n, visita);
    };
    visita(sf);
  }
  return saida;
}
