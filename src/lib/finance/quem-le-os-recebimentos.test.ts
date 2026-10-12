/**
 * REDESIGN-03-D · A1 — quem menciona `receivable_receipts` no código de produção.
 *
 * ⛔ Uma leitura e uma escrita (spec §5.1, P3). O conjunto de arquivos que mencionam a tabela
 * tem de ser EXATAMENTE a allowlist abaixo — allowlist, não lista de proibidos. Nasce VAZIA
 * (2026-10-11) e cada passo acrescenta o seu arquivo, com o motivo.
 *
 * ⚠️ Varredura TEXTUAL (RR-D-1). A prova comportamental da D3 é o Y9 e `parteDoTerceiroCentavos`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");
const TABELA = "receivable_receipts";

/** Caminho relativo a `src/` → por que este arquivo pode mencionar a tabela. */
const ALLOWLIST: Record<string, string> = {
  "types/supabase.ts": "tipos gerados do banco (M1)",
  "lib/settings/export-tables.ts": "a tabela entra no backup do usuario",
};

/** Os que NUNCA podem mencionar — nem entrar na allowlist. */
const NUNCA = [
  "lib/finance/dashboard.ts",
  "lib/finance/pipeline.ts",
  "lib/finance/recebimentos.ts",
  "lib/finance/split.ts",
  "lib/finance/split-persist.ts",
  "lib/finance/split-reapply.ts",
  "lib/finance/services.ts",
  "lib/finance/queries.ts",
  "lib/actions/receivables.ts",
  "lib/actions/transactions.ts",
  "lib/actions/installments.ts",
  "lib/actions/imports.ts",
  "lib/reports/queries.ts",
  "lib/dashboard/queries.ts",
  "lib/ai/tools/adapters/finance.ts",
  "lib/ai/tools/registry.ts",
  "lib/ai/insights/collectors/finance.ts",
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

const QUE_MENCIONAM = VARRIDOS.filter((v) => v.codigo.includes(TABELA))
  .map((v) => v.caminho)
  .sort();

describe("03-D · A1 — quem menciona a tabela de recebimentos", () => {
  it("a varredura alcança o código de produção — não afirma [] === []", () => {
    expect(VARRIDOS.length).toBeGreaterThan(700);
    const caminhos = new Set(VARRIDOS.map((v) => v.caminho));
    for (const arquivo of NUNCA) expect(caminhos.has(arquivo), arquivo).toBe(true);
  });

  it("só os arquivos da allowlist mencionam receivable_receipts", () => {
    expect(QUE_MENCIONAM).toEqual(Object.keys(ALLOWLIST).sort());
  });

  it("a allowlist não tem entrada morta, e toda entrada diz por quê", () => {
    for (const [arquivo, motivo] of Object.entries(ALLOWLIST)) {
      expect(QUE_MENCIONAM, arquivo).toContain(arquivo);
      expect(motivo.trim().length, arquivo).toBeGreaterThan(10);
    }
  });

  it.each(NUNCA)("%s não menciona a tabela e não está na allowlist", (arquivo) => {
    expect(Object.keys(ALLOWLIST)).not.toContain(arquivo);
    expect(QUE_MENCIONAM).not.toContain(arquivo);
  });
});
