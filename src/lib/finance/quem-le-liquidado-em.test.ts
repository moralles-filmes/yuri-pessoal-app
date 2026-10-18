/**
 * REDESIGN-03-E · A1 — quem menciona `liquidado_em` no código de produção.
 *
 * ⛔ A data de caixa tem UM leitor de regra (spec §5.1, P3): `caixa.ts`. O conjunto de arquivos
 * que mencionam a coluna tem de ser EXATAMENTE a allowlist abaixo — allowlist, não lista de
 * proibidos. Nasce com `caixa.ts` e cada passo seguinte acrescenta o seu arquivo, com o motivo.
 *
 * `dashboard.ts` fica na lista NUNCA de propósito: o motor da base competência é cego à data de
 * caixa, e é isso que deixa a competência intocada por construção.
 *
 * ⚠️ Varredura TEXTUAL, só do código (comentários removidos): citar a coluna num comentário não
 * conta como leitura.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");
const COLUNA = "liquidado_em";

/** Caminho relativo a `src/` → por que este arquivo pode mencionar a coluna. */
const ALLOWLIST: Record<string, string> = {
  "lib/finance/caixa.ts": "as regras puras da base caixa: a ÚNICA que decide a data de caixa (A1)",
  "types/supabase.ts": "tipos GERADOS pelo MCP depois da M2 (A2): Row/Insert/Update de transactions",
  "lib/validators/transaction.ts":
    "o campo \"Data do pagamento\" do formulário (A3, K0.1): só aceita a forma; quem decide gravar é o servidor",
  "test/check-liquidado-em.ts": "o CHECK da M2 simulado para o harness (P12) — só para teste",
};

/** Os que NUNCA podem mencionar — nem entrar na allowlist. */
const NUNCA = [
  "lib/finance/dashboard.ts",
  "lib/finance/pipeline.ts",
  "lib/reports/queries.ts",
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

describe("03-E · A1 — quem menciona a data de caixa", () => {
  it("a varredura alcança o código de produção — não afirma [] === []", () => {
    expect(VARRIDOS.length).toBeGreaterThan(700);
    const caminhos = new Set(VARRIDOS.map((v) => v.caminho));
    for (const arquivo of NUNCA) expect(caminhos.has(arquivo), arquivo).toBe(true);
    for (const arquivo of Object.keys(ALLOWLIST)) expect(caminhos.has(arquivo), arquivo).toBe(true);
  });

  it("só os arquivos da allowlist mencionam liquidado_em", () => {
    expect(QUE_MENCIONAM).toEqual(Object.keys(ALLOWLIST).sort());
  });

  it("a allowlist não tem entrada fantasma, e toda entrada diz por quê", () => {
    for (const [arquivo, motivo] of Object.entries(ALLOWLIST)) {
      expect(QUE_MENCIONAM, arquivo).toContain(arquivo);
      expect(motivo.trim().length, arquivo).toBeGreaterThan(10);
    }
  });

  it.each(NUNCA)("%s não menciona a coluna e não está na allowlist", (arquivo) => {
    expect(Object.keys(ALLOWLIST)).not.toContain(arquivo);
    expect(QUE_MENCIONAM).not.toContain(arquivo);
  });
});
