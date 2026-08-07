/**
 * Fase 18-A — IA · TESTE DE FRONTEIRA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ESTE TESTE EXISTE SE JÁ HÁ REGRA DO ESLINT                                    ║
 * ║                                                                                       ║
 * ║ `no-restricted-imports` NÃO enxerga `await import(...)`. Um import dinâmico do AI SDK ║
 * ║ dentro de `core/` passaria pelo lint, passaria no build e só apareceria como bundle   ║
 * ║ inchado — ou, pior, como pacote de fornecedor chegando ao navegador.                  ║
 * ║                                                                                       ║
 * ║ Este teste varre o CÓDIGO-FONTE procurando as duas formas. É a terceira camada, e a   ║
 * ║ única que cobre o caso dinâmico.                                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname);
const SRC = path.resolve(__dirname, "..", "..");

function listarArquivos(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const saida: string[] = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...listarArquivos(completo));
    else if (/\.(ts|tsx)$/.test(entrada.name)) saida.push(completo);
  }
  return saida;
}

/** Pega `import x from 'y'`, `export … from 'y'` E `await import('y')`. */
function especificadores(codigo: string): string[] {
  const encontrados: string[] = [];
  const padroes = [
    /(?:^|\n)\s*import\s+(?:[\s\S]*?)\s*from\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*import\s*["']([^"']+)["']/g,
    /(?:^|\n)\s*export\s+(?:[\s\S]*?)\s*from\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const padrao of padroes) {
    for (const m of codigo.matchAll(padrao)) encontrados.push(m[1]);
  }
  return encontrados;
}

/**
 * Remove comentários antes de procurar chamada de banco.
 *
 * Sem isto o teste acusaria o PRÓPRIO cabeçalho que documenta a proibição ("nenhum
 * `.from()` neste arquivo") — e a saída seria arrumar a documentação em vez do código.
 * Só bloco `/* … *\/` e linha que COMEÇA com `//` ou `*`: cortar `//` no meio da linha
 * mutilaria uma URL e poderia esconder uma chamada real depois dela.
 *
 * ⚠️ HONESTIDADE SOBRE O QUE ISTO É: uma varredura LÉXICA, não um parser. Um literal de
 * string que contenha `/*` faz o corte de bloco engolir código real até o próximo `*\/`,
 * e a partir daí uma chamada de banco passaria despercebida. Não vale escrever um parser
 * de TypeScript aqui: a rede de baixo (`chamaBanco`) cobre também a forma indireta
 * `supabase["from"](…)`, e a fronteira de verdade é o `no-restricted-imports` mais a
 * revisão — este teste é a terceira camada, não a única.
 */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !/^\s*(\/\/|\*)/.test(linha))
    .join("\n");
}

/**
 * Acesso ao banco em qualquer das duas formas. `supabase.from(...)` é a que se escreve;
 * `supabase["from"](...)` é a que escapa de um grep ingênuo — e é justamente a que alguém
 * usaria para contornar este teste.
 */
function chamaBanco(codigo: string): string[] {
  const achados: string[] = [];
  for (const metodo of ["from", "select"]) {
    const ponto = new RegExp(`\\.${metodo}\\(`);
    const colchete = new RegExp(`\\[\\s*["'\`]${metodo}["'\`]\\s*\\]`);
    if (ponto.test(codigo)) achados.push(`.${metodo}(`);
    else if (colchete.test(codigo)) achados.push(`["${metodo}"](`);
  }
  return achados;
}

const ehPacoteDeFornecedor = (spec: string) =>
  spec === "ai" || spec.startsWith("ai/") || spec.startsWith("@ai-sdk/");

const CAMADAS_PURAS = [
  "core",
  "agents",
  "tools",
  "usage",
  "security",
  "context",
  "approval",
] as const;

describe("fronteiras arquiteturais do módulo de IA", () => {
  it("nenhuma camada pura importa pacote de fornecedor (estático ou dinâmico)", () => {
    const violacoes: string[] = [];

    for (const camada of CAMADAS_PURAS) {
      for (const arquivo of listarArquivos(path.join(RAIZ, camada))) {
        if (arquivo.endsWith(".test.ts")) continue;
        const codigo = fs.readFileSync(arquivo, "utf8");
        for (const spec of especificadores(codigo)) {
          if (ehPacoteDeFornecedor(spec)) {
            violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
          }
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  it("nenhuma camada pura alcança providers/ nem server/", () => {
    const violacoes: string[] = [];

    for (const camada of CAMADAS_PURAS) {
      for (const arquivo of listarArquivos(path.join(RAIZ, camada))) {
        if (arquivo.endsWith(".test.ts")) continue;
        const codigo = fs.readFileSync(arquivo, "utf8");
        for (const spec of especificadores(codigo)) {
          if (/(^|\/)ai\/(providers|server)\//.test(spec) || /^\.\.\/(providers|server)\//.test(spec)) {
            violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
          }
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  it("só providers/ importa o AI SDK, em todo o src/", () => {
    const permitido = path.join(RAIZ, "providers");
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(SRC)) {
      if (arquivo.startsWith(permitido)) continue;
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (ehPacoteDeFornecedor(spec)) {
          violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  it("credential-crypto só é importado por server/", () => {
    const permitido = path.join(RAIZ, "server");
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(SRC)) {
      if (arquivo.startsWith(permitido)) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        if (spec.includes("credential-crypto")) {
          violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  it("todo arquivo de server/ importa `server-only`", () => {
    const semGuarda: string[] = [];

    for (const arquivo of listarArquivos(path.join(RAIZ, "server"))) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      // `keyring.ts` é a exceção DECLARADA: pura manipulação de bytes, sem segredo embutido
      // e sem I/O. Ela precisa ser testável, e não expõe nada que o client possa usar.
      if (path.basename(arquivo) === "keyring.ts") continue;
      if (!/import\s+["']server-only["']/.test(codigo)) {
        semGuarda.push(path.relative(SRC, arquivo));
      }
    }

    expect(semGuarda).toEqual([]);
  });

  /**
   * A 18-A não lia NADA dos módulos. A 18-B abriu a primeira leitura — e abriu por UMA
   * porta só: `tools/adapters/`. O teste não deixou de valer; ele passou a nomear a
   * exceção. Um `import` de `@/lib/training/...` dentro de `chat-runner.ts`, de `core/` ou
   * de qualquer outro lugar continua sendo violação, porque seria uma leitura de dado do
   * usuário fora do Tool Registry, sem guard, sem teto e sem auditoria.
   *
   * `actions` está na lista pela metade de ESCRITA da mesma invariante — que é o escopo da
   * 18-C. Sem ele, um `import { criarSessao } from "@/lib/actions/training"` dentro de
   * `core/` passaria por tudo: escrita sem confirmação, sem `requiresConfirmation`, sem
   * Approval Engine e sem linha em `ai_tool_calls`.
   */
  it("query e action de módulo só são importadas por tools/adapters/ — a única porta", () => {
    const modulos = [
      "actions",
      "finance",
      "todo",
      "tasks",
      "nutrition",
      "training",
      "habits",
      "studies",
      "calendar",
      "body",
      "dashboard",
      "reports",
      "import",
    ];
    const adapters = path.join(RAIZ, "tools", "adapters");
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(RAIZ)) {
      if (arquivo.endsWith(".test.ts")) continue;
      if (arquivo.startsWith(adapters)) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        for (const modulo of modulos) {
          if (spec.startsWith(`@/lib/${modulo}/`)) {
            violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
          }
        }
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ AS FERRAMENTAS NÃO REIMPLEMENTAM QUERY DE MÓDULO (18-B).                            ║
   * ║                                                                                     ║
   * ║ Uma segunda leitura discordaria da primeira no primeiro campo novo — e o número que ║
   * ║ a IA relata deixaria de bater com o número que o usuário vê na tela. `audit.ts` é a ║
   * ║ ÚNICA exceção: ele grava a auditoria do próprio módulo de IA.                       ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("nenhum .from() nem select() em src/lib/ai/tools/, exceto a auditoria", () => {
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(path.join(RAIZ, "tools"))) {
      if (arquivo.endsWith(".test.ts")) continue;
      if (path.basename(arquivo) === "audit.ts") continue;
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      for (const achado of chamaBanco(codigo)) {
        violacoes.push(`${path.relative(SRC, arquivo)} → ${achado}`);
      }
    }

    expect(violacoes).toEqual([]);
  });

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ A NORMALIZAÇÃO DE TEXTO É UMA SÓ, E MORA EM CAMADA NEUTRA.                          ║
   * ║                                                                                     ║
   * ║ Dois consumidores a usam por motivos DIFERENTES — o roteador procura palavra com    ║
   * ║ fronteira, o filtro de recordes procura substring em nome de exercício. Não é a     ║
   * ║ mesma busca; é o mesmo PREPARO do texto. Uma segunda declaração faria "triceps"     ║
   * ║ casar num lado e não no outro, e a resposta afirmaria que não há recorde onde há.   ║
   * ║                                                                                     ║
   * ║ Ela também não pode morar em `agents/`: `tools/adapters/` importar do roteador       ║
   * ║ acopla a leitura de dado à seleção de agente, que não têm nada em comum.            ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("normalizarTexto é declarada UMA vez, e em core/", () => {
    const declaracoes: string[] = [];

    for (const arquivo of listarArquivos(RAIZ)) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      if (/function\s+normalizarTexto\s*\(/.test(codigo)) {
        declaracoes.push(path.relative(SRC, arquivo).replace(/\\/g, "/"));
      }
    }

    expect(declaracoes).toEqual(["lib/ai/core/text.ts"]);
  });

  it("audit.ts é a exceção DECLARADA — e não escreve em tabela de módulo do usuário", () => {
    const codigo = fs.readFileSync(path.join(RAIZ, "tools", "audit.ts"), "utf8");
    const tabelas = [...codigo.matchAll(/\.from\(\s*["']([^"']+)["']/g)].map((m) => m[1]);

    expect(tabelas.length).toBeGreaterThan(0);
    for (const tabela of tabelas) expect(tabela, tabela).toMatch(/^ai_/);
  });
});
