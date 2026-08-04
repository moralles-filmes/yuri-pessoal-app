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

  it("nenhuma query de módulo (finance, todo, nutrition, training…) é importada por src/lib/ai/", () => {
    const modulos = [
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
    const violacoes: string[] = [];

    for (const arquivo of listarArquivos(RAIZ)) {
      if (arquivo.endsWith(".test.ts")) continue;
      const codigo = fs.readFileSync(arquivo, "utf8");
      for (const spec of especificadores(codigo)) {
        for (const modulo of modulos) {
          if (spec.startsWith(`@/lib/${modulo}/`)) {
            violacoes.push(`${path.relative(SRC, arquivo)} → ${spec}`);
          }
        }
      }
    }

    // A 18-A não lê NADA dos módulos. A primeira leitura é 18-B, e vai entrar por
    // ferramentas registradas — não por import direto de `queries.ts`.
    expect(violacoes).toEqual([]);
  });
});
