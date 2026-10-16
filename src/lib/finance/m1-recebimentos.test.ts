/**
 * REDESIGN-03-D · A2 — o arquivo da M1, conferido no repositório (padrão de
 * `m3-categorias.test.ts`: achado por CONTEÚDO, SQL sem comentários).
 *
 * A M1 é aditiva: uma tabela nova e um `unique` em `receivables`. O que este teste trava é o que
 * a tornaria outra coisa: RLS sem FORCE, FK sem o dono, trigger sem lock, e qualquer escrita de
 * dado — a M1 NÃO faz backfill (K0).
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
const DA_M1 = ARQUIVOS.filter((f) => ler(f).includes("create table if not exists public.receivable_receipts"));
const SQL = (DA_M1.length === 1 ? ler(DA_M1[0]) : "").toLowerCase().replace(/\s+/g, " ");

describe("03-D · A2 — a M1 (receivable_receipts)", () => {
  it("existe exatamente um arquivo que cria a tabela", () => {
    expect(DA_M1).toHaveLength(1);
  });

  it("receivables ganha unique (id, user_id), recriado de forma idempotente", () => {
    const drop = SQL.indexOf("drop constraint if exists receivables_id_user_uk");
    const add = SQL.indexOf("add constraint receivables_id_user_uk unique (id, user_id)");
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("a FK do recebível é COMPOSTA com o dono e cascade (invariante 23)", () => {
    expect(SQL).toContain(
      "foreign key (receivable_id, user_id) references public.receivables (id, user_id) on delete cascade",
    );
    expect(SQL).not.toMatch(/receivable_id uuid[^,]*references/);
  });

  it("RLS E FORCE RLS", () => {
    expect(SQL).toContain("alter table public.receivable_receipts enable row level security");
    expect(SQL).toContain("alter table public.receivable_receipts force row level security");
  });

  it("a policy usa (select auth.uid()) no using e no with check", () => {
    expect(SQL).toContain("using (user_id = (select auth.uid()))");
    expect(SQL).toContain("with check (user_id = (select auth.uid()))");
  });

  it("valor > 0 em reais e recebido_em é data pura", () => {
    expect(SQL).toContain("valor numeric(14,2) not null check (valor > 0)");
    expect(SQL).toContain("recebido_em date not null");
  });

  it("o trigger trava o excesso com FOR UPDATE, security invoker e search_path vazio", () => {
    expect(SQL).toContain("create or replace function public.receivable_receipts_nao_excede()");
    expect(SQL).toContain("security invoker");
    expect(SQL).toContain("set search_path = ''");
    expect(SQL).toMatch(/where r\.id = new\.receivable_id for update;/);
    expect(SQL).toContain("if v_recebido + new.valor > v_devido then");
    expect(SQL).toContain("errcode = 'check_violation'");
    expect(SQL).toContain(
      "before insert or update on public.receivable_receipts for each row execute function public.receivable_receipts_nao_excede()",
    );
  });

  it("o arquivo NÃO escreve dado — sem backfill (K0)", () => {
    expect(SQL).not.toMatch(/\binsert\s+into\b/);
    expect(SQL).not.toMatch(/\bupdate\s+public\./);
    expect(SQL).not.toMatch(/\bdelete\s+from\b/);
    expect(SQL).not.toMatch(/\btruncate\b/);
    expect(SQL).not.toMatch(/\bdrop\s+(column|table)\b/);
  });
});
