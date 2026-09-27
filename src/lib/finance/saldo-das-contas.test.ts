import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { saldoDasContas } from "@/lib/finance/saldo-das-contas";

// Mesmo idioma da varredura de pipeline.test.ts: só código, sem comentários.
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function arquivosDeCodigo(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return arquivosDeCodigo(caminho);
    return /\.(ts|tsx)$/.test(entrada.name) ? [caminho] : [];
  });
}

const SRC = path.resolve(process.cwd(), "src");
const PROPRIO = path.join(SRC, "lib/finance/saldo-das-contas.ts");
const SOMA_DE_SALDOS = /\.reduce\([\s\S]{0,200}?current_balance/;
const DEPENDENCIA = /\bimport\b|\brequire\s*\(/;

describe("03-B2 (A6) — saldoDasContas", () => {
  it("soma os saldos, com nulo contando como zero", () => {
    const contas = [
      { current_balance: 120.5 },
      { current_balance: null },
      { current_balance: -20.25 },
      { current_balance: 0 },
    ] as const;
    expect(saldoDasContas(contas)).toBe(100.25);
  });

  it("lista vazia tem saldo zero", () => {
    expect(saldoDasContas([])).toBe(0);
  });

  it("o módulo não tem import nem require, ignorando comentários", () => {
    const codigo = semComentarios(fs.readFileSync(PROPRIO, "utf8"));
    expect(codigo).toContain("export function saldoDasContas");
    expect(DEPENDENCIA.test(codigo)).toBe(false);
    expect(DEPENDENCIA.test('import { algo } from "modulo";')).toBe(true);
    expect(DEPENDENCIA.test('require("modulo")')).toBe(true);
    expect(DEPENDENCIA.test(semComentarios('// import algo\n/* require("modulo") */'))).toBe(false);
  });
});

describe("03-B2 (A6) — fronteira da soma de saldos", () => {
  const varridos = arquivosDeCodigo(SRC)
    .filter((f) => !/\.test\.tsx?$/.test(f) && f !== PROPRIO)
    .map((f) => ({
      arquivo: path.relative(SRC, f).split(path.sep).join("/"),
      codigo: semComentarios(fs.readFileSync(f, "utf8")),
    }));

  it("a varredura leu arquivos reais e reconhece a soma, ignorando comentários", () => {
    expect(varridos.length).toBeGreaterThan(100);
    for (const arquivo of [
      "lib/finance/pipeline.ts",
      "app/(app)/financeiro/page.tsx",
      "app/(app)/financeiro/contas/accounts-client.tsx",
    ]) {
      expect(varridos.find((f) => f.arquivo === arquivo)?.codigo).toContain("saldoDasContas");
    }
    expect(SOMA_DE_SALDOS.test(semComentarios(fs.readFileSync(PROPRIO, "utf8")))).toBe(true);
    const soma = "accounts.reduce((s, a) => s + (a.current_balance ?? 0), 0)";
    expect(SOMA_DE_SALDOS.test(soma)).toBe(true);
    expect(SOMA_DE_SALDOS.test("accounts.reduce(\n  (s, a) => s + a.current_balance, 0)"))
      .toBe(true);
    expect(SOMA_DE_SALDOS.test(semComentarios(`// ${soma}\n/* ${soma} */`))).toBe(false);
  });

  it("ninguém soma current_balance fora do módulo (M9)", () => {
    // A exceção da IA saiu no conserto da B3.
    const encontrados = varridos
      .filter((f) => SOMA_DE_SALDOS.test(f.codigo))
      .map((f) => f.arquivo)
      .sort();
    expect(encontrados).toEqual([]);
  });
});
