/**
 * Chat livre com coordenador — a migration das TRILHAS, conferida no repositório (padrão de
 * `finance/m2-liquidado-em.test.ts`: achada por CONTEÚDO, SQL sem comentários).
 *
 * Por que existe: `ai_usage_events_one_active_uidx` era `UNIQUE (run_id) WHERE status =
 * 'started'` — uma tentativa aberta por RUN. Com especialistas chamando o modelo em paralelo
 * dentro do mesmo run, a segunda chamada daria `23505` em runtime, e nenhum teste de unidade
 * pega isso, porque a trava é do banco. A migration troca a trava por TRILHA (0 = coordenador,
 * 1..MAX_ESPECIALISTAS = especialista na ordem do acionamento). O que este teste prende é o que a
 * tornaria outra coisa: o índice novo sem o filtro de `started` (travaria o histórico), o teto da
 * trilha divergindo do servidor, e qualquer escrita de dado.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_ESPECIALISTAS } from "@/lib/ai/agents/especialistas";

const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function semComentarios(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
}

const ARQUIVOS = fs
  .readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const ler = (f: string) => semComentarios(fs.readFileSync(path.join(MIGRATIONS, f), "utf8"));
const DA_TRILHA = ARQUIVOS.filter((f) =>
  /add column if not exists trilha\b/i.test(ler(f)),
);
const SQL = (DA_TRILHA.length === 1 ? ler(DA_TRILHA[0]) : "").toLowerCase().replace(/\s+/g, " ");

describe("chat livre — migration das trilhas (ai_usage_events / ai_tool_calls)", () => {
  it("existe exatamente um arquivo que cria a coluna trilha", () => {
    expect(DA_TRILHA).toHaveLength(1);
  });

  it("trilha é smallint, not null, padrão 0 (a main sempre usa a trilha 0)", () => {
    expect(SQL).toContain(
      "alter table public.ai_usage_events add column if not exists trilha smallint not null default 0;",
    );
  });

  it("o teto da trilha é MAX_ESPECIALISTAS, recriado de forma idempotente", () => {
    const drop = SQL.indexOf("drop constraint if exists ai_usage_events_trilha_check");
    const add = SQL.indexOf(
      `add constraint ai_usage_events_trilha_check check (trilha between 0 and ${MAX_ESPECIALISTAS})`,
    );
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("o índice antigo sai e o novo é por (run_id, trilha), só para started", () => {
    expect(SQL).toContain("drop index if exists public.ai_usage_events_one_active_uidx;");
    expect(SQL).toContain(
      "create unique index if not exists ai_usage_events_one_active_per_trilha_uidx on public.ai_usage_events (run_id, trilha) where status = 'started';",
    );
  });

  it("ESPECIALISTA entra e os quatro tipos antigos ficam", () => {
    const drop = SQL.indexOf("drop constraint if exists ai_usage_events_attempt_type_check");
    const add = SQL.indexOf(
      "add constraint ai_usage_events_attempt_type_check check (attempt_type in ('primary', 'retry', 'fallback', 'tool_step', 'especialista'))",
    );
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("o tipo da tentativa é coerente com a trilha: PRIMARY só na 0, ESPECIALISTA só fora dela", () => {
    const drop = SQL.indexOf("drop constraint if exists ai_usage_events_tipo_coerente_com_trilha");
    const add = SQL.indexOf(
      "add constraint ai_usage_events_tipo_coerente_com_trilha check ((attempt_type <> 'primary' or trilha = 0) and (attempt_type <> 'especialista' or trilha > 0))",
    );
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(add).toBeGreaterThan(drop);
  });

  it("prompt_version e agent_id são nulos (sem not null, sem default)", () => {
    expect(SQL).toContain(
      "alter table public.ai_usage_events add column if not exists prompt_version text;",
    );
    expect(SQL).toContain("alter table public.ai_tool_calls add column if not exists agent_id text;");
    expect(SQL).not.toMatch(/prompt_version text (not null|default)/);
    expect(SQL).not.toMatch(/agent_id text (not null|default)/);
  });

  it("agent_id tem tamanho limitado quando presente", () => {
    expect(SQL).toContain("drop constraint if exists ai_tool_calls_agent_id_check");
    expect(SQL).toContain(
      "add constraint ai_tool_calls_agent_id_check check (agent_id is null or char_length(agent_id) between 1 and 60)",
    );
  });

  it("prompt_version tem tamanho limitado quando presente", () => {
    expect(SQL).toContain("drop constraint if exists ai_usage_events_prompt_version_check");
    expect(SQL).toContain(
      "add constraint ai_usage_events_prompt_version_check check (prompt_version is null or char_length(prompt_version) between 1 and 200)",
    );
  });

  it("o arquivo NÃO escreve dado — linha antiga fica nula, nunca preenchida com chute", () => {
    expect(SQL).not.toMatch(/\binsert\s+into\b/);
    expect(SQL).not.toMatch(/\bupdate\s+public\./);
    expect(SQL).not.toMatch(/\bdelete\s+from\b/);
    expect(SQL).not.toMatch(/\btruncate\b/);
    expect(SQL).not.toMatch(/\bdrop\s+(column|table)\b/);
  });
});
