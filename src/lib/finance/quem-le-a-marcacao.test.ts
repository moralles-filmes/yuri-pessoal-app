/**
 * REDESIGN-03-C2 · A1 — a prova da D8 ANTES do primeiro leitor.
 *
 * ⛔ A categoria PROPÕE, o lançamento REGISTRA (METRICAS-FINANCEIRAS.md §11). Este arquivo
 * prova quem menciona `classificacao_padrao` no código de produção: o conjunto tem de ser
 * EXATAMENTE a allowlist abaixo. É allowlist, não lista de proibidos — uma lista de proibidos
 * fura no primeiro arquivo novo.
 *
 * Ela nasce VAZIA (nenhum arquivo de produção mencionava a coluna em 2026-10-11) e cada passo
 * da 03-C2 acrescenta o seu arquivo de propósito, com o motivo.
 *
 * ⚠️ É uma varredura TEXTUAL: um valor copiado com outro nome passaria por ela (RR-C2-1). A
 * segunda linha é o bloco 7 de `dashboard-caracterizacao.test.ts`, que é comportamental.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");
const COLUNA = "classificacao_padrao";

/** Caminho relativo a `src/` → por que este arquivo pode mencionar a marcação. */
const ALLOWLIST: Record<string, string> = {
  "types/supabase.ts": "tipos gerados do banco (M3)",
};

/**
 * Os que NUNCA podem mencionar — nem entrar na allowlist. A segunda trava impede que alguém
 * "conserte" o vermelho acrescentando o motor à lista de cima.
 */
const NUNCA = [
  "lib/finance/dashboard.ts",
  "lib/finance/pipeline.ts",
  "lib/finance/services.ts",
  "lib/finance/queries.ts",
  "lib/actions/transactions.ts",
  "lib/actions/quick-add.ts",
  "lib/actions/imports.ts",
  "lib/import/split-totals.ts",
  "lib/reports/queries.ts",
  "lib/dashboard/queries.ts",
  "lib/ai/tools/adapters/finance.ts",
  "lib/ai/tools/registry.ts",
  "lib/ai/insights/collectors/finance.ts",
  "lib/ai/approval/commands/finance-preview.ts",
  "lib/ai/approval/commands/finance.ts",
  "lib/notifications/generate.ts",
  "lib/notifications/cron.ts",
] as const;

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function arquivosDeProducao(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return arquivosDeProducao(caminho);
    return /\.(ts|tsx)$/.test(entrada.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entrada.name)
      ? [caminho]
      : [];
  });
}

const VARRIDOS = arquivosDeProducao(SRC).map((arquivo) => ({
  caminho: path.relative(SRC, arquivo).split(path.sep).join("/"),
  codigo: semComentarios(fs.readFileSync(arquivo, "utf8")),
}));

const QUE_MENCIONAM = VARRIDOS.filter((v) => v.codigo.includes(COLUNA))
  .map((v) => v.caminho)
  .sort();

describe("03-C2 · A1 — quem menciona a marcação da categoria (D8)", () => {
  it("a varredura alcança o código de produção — não afirma [] === []", () => {
    expect(VARRIDOS.length).toBeGreaterThan(700);
    const caminhos = new Set(VARRIDOS.map((v) => v.caminho));
    for (const arquivo of NUNCA) expect(caminhos.has(arquivo), arquivo).toBe(true);
  });

  it("só os arquivos da allowlist mencionam classificacao_padrao", () => {
    expect(QUE_MENCIONAM).toEqual(Object.keys(ALLOWLIST).sort());
  });

  it("a allowlist não tem entrada morta, e toda entrada diz por quê", () => {
    for (const [arquivo, motivo] of Object.entries(ALLOWLIST)) {
      expect(QUE_MENCIONAM, arquivo).toContain(arquivo);
      expect(motivo.trim().length, arquivo).toBeGreaterThan(10);
    }
  });

  it.each(NUNCA)("%s não menciona a marcação e não está na allowlist", (arquivo) => {
    expect(Object.keys(ALLOWLIST)).not.toContain(arquivo);
    expect(QUE_MENCIONAM).not.toContain(arquivo);
  });
});
