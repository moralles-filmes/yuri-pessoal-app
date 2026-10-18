/**
 * REDESIGN-03-E · B1 — o arquivo da M2b, conferido no repositório (padrão de
 * `m2-liquidado-em.test.ts`: achado por CONTEÚDO, SQL sem comentários).
 *
 * A M2b troca UMA linha de `account_balance_before`: o corte por `competence_date` vira o corte
 * pela data de caixa. O que este teste trava é tudo o que faria dela outra coisa: a tabela de
 * sinais mudando junto (comparada com a da migration anterior, palavra por palavra), a função
 * deixando de ser `security invoker` com `search_path` vazio, a assinatura mudando (perderia os
 * grants), `account_balance()` sendo tocada, e qualquer escrita de dado.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "supabase", "migrations");

function semComentarios(sql: string): string {
  return sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
}

const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
const ler = (f: string) =>
  semComentarios(fs.readFileSync(path.join(MIGRATIONS, f), "utf8")).toLowerCase().replace(/\s+/g, " ");

const CORTE_DE_CAIXA = "coalesce(t.liquidado_em, t.competence_date) < p_date";
const DA_M2B = ARQUIVOS.filter((f) => ler(f).includes(CORTE_DE_CAIXA));
const SQL = DA_M2B.length === 1 ? ler(DA_M2B[0]) : "";
const ANTERIOR = ler("20260809100000_account_balance_before.sql");

/** O bloco `case ... end` da tabela de sinais. */
const sinais = (sql: string) => sql.slice(sql.indexOf("case when"), sql.indexOf(" end)") + 5);

describe("03-E · B1 — a M2b (account_balance_before pela data de caixa)", () => {
  it("existe exatamente um arquivo com o corte pela data de caixa", () => {
    expect(DA_M2B).toHaveLength(1);
  });

  it("o corte é pela data de caixa, e o de competência saiu (Z15, lado SQL)", () => {
    expect(SQL).toContain(`and ${CORTE_DE_CAIXA}`);
    expect(SQL).not.toContain("and t.competence_date < p_date");
  });

  it("a tabela de sinais é IDÊNTICA à da migration anterior", () => {
    expect(sinais(ANTERIOR).length).toBeGreaterThan(100);
    expect(sinais(SQL)).toBe(sinais(ANTERIOR));
  });

  it("a assinatura não muda: os grants existentes ficam", () => {
    expect(SQL).toContain(
      "create or replace function public.account_balance_before( p_account_id uuid, p_date date ) returns numeric",
    );
  });

  it("continua security invoker, stable e com search_path vazio", () => {
    expect(SQL).toContain("security invoker");
    expect(SQL).toContain("stable");
    expect(SQL).toContain("set search_path = ''");
    expect(SQL).not.toContain("security definer");
  });

  it("não toca em account_balance() nem escreve dado", () => {
    expect(SQL).not.toMatch(/function public\.account_balance\s*\(/);
    expect(SQL).not.toMatch(/\binsert\s+into\b/);
    expect(SQL).not.toMatch(/\bupdate\s+public\./);
    expect(SQL).not.toMatch(/\bdelete\s+from\b/);
    expect(SQL).not.toMatch(/\balter\s+table\b/);
  });
});
