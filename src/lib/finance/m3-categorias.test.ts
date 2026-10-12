/**
 * REDESIGN-03-C2 · A3 — o arquivo da M3, conferido no repositório (padrão de
 * `ai/approval/schema.test.ts`: achado por CONTEÚDO, SQL sem comentários).
 *
 * A M3 é aditiva e nula. O que este teste trava é o que a tornaria outra coisa: um CHECK que
 * prometesse `compartilhada` (que o atalho não entrega) e qualquer escrita de dado — a
 * migration não marca categoria nenhuma (D10).
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
const DA_M3 = ARQUIVOS.filter((f) => ler(f).includes("categories_classificacao_padrao_check"));
const SQL = DA_M3.length === 1 ? ler(DA_M3[0]).toLowerCase() : "";

describe("03-C2 · A3 — a M3 (categories.classificacao_padrao)", () => {
  it("existe exatamente um arquivo que cria a marcação", () => {
    expect(DA_M3).toHaveLength(1);
  });

  it("a coluna é acrescentada nula, sem default, de forma idempotente", () => {
    expect(SQL).toMatch(
      /alter table public\.categories\s+add column if not exists classificacao_padrao text\s*;/,
    );
    expect(SQL).not.toMatch(/\bnot null\b/);
    expect(SQL).not.toMatch(/\bdefault\b/);
  });

  it("o CHECK aceita exatamente 'pessoal' e 'terceiro' — compartilhada fica de fora", () => {
    const lista = SQL.match(/classificacao_padrao in \(([^)]*)\)/);
    expect(lista).not.toBeNull();
    const valores = [...(lista?.[1] ?? "").matchAll(/'([^']*)'/g)].map((m) => m[1]).sort();
    expect(valores).toEqual(["pessoal", "terceiro"]);
    expect(SQL).toContain("classificacao_padrao is null");
    expect(SQL).not.toContain("compartilhada");
  });

  it("o CHECK é recriado de forma idempotente", () => {
    const drop = SQL.indexOf("drop constraint if exists categories_classificacao_padrao_check");
    const add = SQL.indexOf("add constraint categories_classificacao_padrao_check");
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("o arquivo NÃO escreve dado nem mexe em policy (D10)", () => {
    expect(SQL).not.toMatch(/\bupdate\s+public\./);
    expect(SQL).not.toMatch(/\binsert\s+into\b/);
    expect(SQL).not.toMatch(/\bdelete\s+from\b/);
    expect(SQL).not.toMatch(/\btruncate\b/);
    expect(SQL).not.toMatch(/\bpolicy\b/);
    expect(SQL).not.toMatch(/row level security/);
    expect(SQL).not.toMatch(/\bdrop\s+(column|table)\b/);
  });

  it("a coluna leva o comentário que diz que ela é atalho, não verdade", () => {
    expect(SQL).toMatch(/comment on column public\.categories\.classificacao_padrao is/);
  });

  it("'Restaurar padrão' não marca nada: a semente não menciona a coluna", () => {
    const tudo = ARQUIVOS.map(ler).join("\n").toLowerCase();
    const inicio = tudo.lastIndexOf("create or replace function public.seed_default_categories");
    expect(inicio).toBeGreaterThanOrEqual(0);
    const corpo = tudo.slice(inicio, tudo.indexOf("$$;", tudo.indexOf("$$", inicio) + 2));
    expect(corpo).toContain("insert into public.categories");
    expect(corpo).not.toContain("classificacao_padrao");
  });
});
