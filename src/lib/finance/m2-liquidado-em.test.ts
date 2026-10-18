/**
 * REDESIGN-03-E · A2 — o arquivo da M2, conferido no repositório (padrão de
 * `m1-recebimentos.test.ts`: achado por CONTEÚDO, SQL sem comentários).
 *
 * A M2 é aditiva: uma coluna nula, um CHECK e um índice parcial. O que este teste trava é o que
 * a tornaria outra coisa: a coluna sem o CHECK de coerência com o status (Z1), e qualquer escrita
 * de dado — `liquidado_em` NUNCA é preenchido por dedução (Z2).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations");

function semComentarios(sql: string): string {
  return sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
}

const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const ler = (f: string) => semComentarios(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
const DA_M2 = ARQUIVOS.filter((f) => ler(f).includes("add column if not exists liquidado_em"));
const SQL = (DA_M2.length === 1 ? ler(DA_M2[0]) : "").toLowerCase().replace(/\s+/g, " ");

describe("03-E · A2 — a M2 (transactions.liquidado_em)", () => {
  it("existe exatamente um arquivo que cria a coluna", () => {
    expect(DA_M2).toHaveLength(1);
  });

  it("a coluna é data pura e nula", () => {
    expect(SQL).toContain("alter table public.transactions add column if not exists liquidado_em date;");
    expect(SQL).not.toMatch(/liquidado_em date (not null|default)/);
  });

  it("o comentário da coluna proíbe preencher por dedução", () => {
    expect(SQL).toContain("comment on column public.transactions.liquidado_em is");
    expect(SQL).toContain("nunca preencher por dedução.");
  });

  it("o CHECK de coerência com o status, recriado de forma idempotente (Z1)", () => {
    const drop = SQL.indexOf("drop constraint if exists transactions_liquidado_em_coerente");
    const add = SQL.indexOf(
      "add constraint transactions_liquidado_em_coerente check (liquidado_em is null or status in ('pago', 'recebido'))",
    );
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("o índice parcial só sobre as linhas com data", () => {
    expect(SQL).toContain(
      "create index if not exists transactions_user_liquidado_idx on public.transactions (user_id, liquidado_em) where liquidado_em is not null;",
    );
  });

  it("o arquivo NÃO escreve dado — sem backfill (Z2)", () => {
    expect(SQL).not.toMatch(/\binsert\s+into\b/);
    expect(SQL).not.toMatch(/\bupdate\s+(public\.)?transactions\b/);
    expect(SQL).not.toMatch(/\bupdate\s+public\./);
    expect(SQL).not.toMatch(/\bdelete\s+from\b/);
    expect(SQL).not.toMatch(/\btruncate\b/);
    expect(SQL).not.toMatch(/\bdrop\s+(column|table)\b/);
  });

  it("não toca em função nenhuma — account_balance e account_balance_before ficam para a B1", () => {
    expect(SQL).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/);
  });
});
