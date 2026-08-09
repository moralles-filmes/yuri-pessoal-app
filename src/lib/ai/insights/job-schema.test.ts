/**
 * Fase 18-E · Bloco 4 — as travas do JOB que moram NO BANCO, conferidas no repositório.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE VARRER MIGRATION EM VEZ DE CONFIAR NO CÓDIGO                                  ║
 * ║                                                                                       ║
 * ║ O dono do run sem sessão, o marcador `automatic` e o teto próprio não são `if`s do     ║
 * ║ TypeScript — são um `coalesce` dentro de uma função `security invoker`, uma coluna     ║
 * ║ derivada e um ramo de orçamento. Um teste que exercitasse só o TS continuaria verde    ║
 * ║ depois de alguém remover qualquer um dos três, porque o caminho feliz não passa por    ║
 * ║ eles: eles existem para o caminho que ninguém escreveu.                                ║
 * ║                                                                                       ║
 * ║ ⚠️ O arquivo é procurado por CONTEÚDO, nunca por nome fixo — mesma disciplina de       ║
 * ║ `approval/schema.test.ts`.                                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS = path.resolve(__dirname, "..", "..", "..", "..", "supabase", "migrations");

function sqlCompleto(): string {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

/** Só as declarações — comentário que descreve a regra não pode fazer o teste passar. */
function semComentarios(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
}

const SQL = semComentarios(sqlCompleto());

describe("ai_insight_jobs", () => {
  it("é criada, com RLS e FORCE RLS", () => {
    expect(SQL).toContain("create table if not exists public.ai_insight_jobs");
    expect(SQL).toContain("alter table public.ai_insight_jobs enable row level security");
    expect(SQL).toContain("alter table public.ai_insight_jobs force row level security");
  });

  it("tem índice em user_id", () => {
    expect(SQL).toMatch(/ai_insight_jobs_user_executed_idx[\s\S]{0,80}\(user_id/);
  });

  it("⛔ é APPEND-ONLY: só policy de SELECT, nenhuma de insert/update/delete", () => {
    // Quem escreve é a service role (bypassrls). Um usuário autenticado não tem como forjar,
    // corrigir nem apagar o registro de uma varredura.
    const policies = [...SQL.matchAll(/create policy\s+"([^"]+)"\s+on public\.ai_insight_jobs\s+for (\w+)/g)];
    expect(policies.length).toBeGreaterThan(0);
    for (const [, nome, comando] of policies) {
      expect(comando, `policy ${nome} não deveria existir`).toBe("select");
    }
  });

  it("desfecho ruim SEM motivo é recusado pelo banco", () => {
    // A mesma disciplina do `Indicador` (invariante 65): ausência sem motivo não existe.
    expect(SQL).toContain("ai_insight_jobs_motivo_coerente");
    expect(SQL).toMatch(
      /desfecho in \('pulado', 'falhou'\) and motivo is not null and btrim\(motivo\) <> ''/,
    );
  });

  it("os quatro desfechos e os três módulos são allowlist", () => {
    expect(SQL).toMatch(
      /check \(desfecho in \('gerado', 'reaproveitado', 'pulado', 'falhou'\)\)/,
    );
    expect(SQL).toMatch(/check \(modulo in \('financeiro', 'treinos', 'dieta'\)\)/);
  });

  it("run_id e insight_id NÃO têm FK — invariante 38 aplicada aqui", () => {
    // O registro de que a varredura rodou é auditoria e tem de sobreviver ao insight.
    const bloco = SQL.slice(
      SQL.indexOf("create table if not exists public.ai_insight_jobs"),
    ).slice(0, 900);
    expect(bloco).toMatch(/run_id\s+uuid,/);
    expect(bloco).toMatch(/insight_id\s+uuid,/);
    expect(bloco).not.toMatch(/run_id\s+uuid[^,]*references/);
    expect(bloco).not.toMatch(/insight_id\s+uuid[^,]*references/);
  });
});

describe("as duas chaves novas em ai_user_preferences", () => {
  it("allow_insight_jobs nasce FALSE", () => {
    expect(SQL).toMatch(
      /add column if not exists allow_insight_jobs boolean not null default false/,
    );
  });

  it("⛔ job_monthly_budget é NOT NULL — o teto do gasto invisível não é opcional", () => {
    expect(SQL).toMatch(
      /add column if not exists job_monthly_budget numeric\(10,4\) not null default/,
    );
    expect(SQL).toContain("check (job_monthly_budget >= 0)");
  });
});

describe("ai_runs.automatic", () => {
  it("existe, com default false", () => {
    expect(SQL).toMatch(/add column if not exists automatic boolean not null default false/);
  });

  it("⛔ é DERIVADO de auth.uid(), nunca recebido por parâmetro", () => {
    // Um `p_automatic boolean` daria ao chamador o poder de escolher contra qual dos dois
    // tetos ele gasta.
    expect(SQL).toContain("v_automatic := (v_session is null);");
    expect(SQL).not.toMatch(/p_automatic\s+boolean/);
  });
});

describe("ai_begin_insight_run — o dono sem sessão", () => {
  it("a assinatura ganhou p_user_id, com default null", () => {
    expect(SQL).toMatch(/p_user_id\s+uuid\s+default null/);
  });

  it("⛔ a SESSÃO SEMPRE VENCE: coalesce(auth.uid(), p_user_id), nessa ordem", () => {
    expect(SQL).toContain("v_session        uuid := auth.uid();");
    expect(SQL).toContain("v_user      := coalesce(v_session, p_user_id);");
    // A ordem invertida ignoraria a sessão em favor do parâmetro.
    expect(SQL).not.toContain("coalesce(p_user_id, v_session)");
  });

  it("⛔ continua SECURITY INVOKER — é a RLS que trava, não o coalesce", () => {
    const fn = SQL.slice(SQL.lastIndexOf("create or replace function public.ai_begin_insight_run"));
    expect(fn).toContain("security invoker");
    expect(fn).not.toContain("security definer");
    expect(fn).toContain("set search_path = ''");
  });

  it("a sobrecarga antiga de 7 parâmetros é DERRUBADA antes de recriar", () => {
    // `create or replace` não substitui ao acrescentar parâmetro: cria uma segunda função.
    expect(SQL).toContain(
      "drop function if exists public.ai_begin_insight_run(text, text, text, text, numeric, text, integer);",
    );
  });

  it("anon continua sem execute; authenticated continua com", () => {
    expect(SQL).toContain(
      "revoke all on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer, uuid) from anon;",
    );
    expect(SQL).toContain(
      "grant execute on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer, uuid) to authenticated;",
    );
  });
});

describe("o segundo teto — os DOIS valem", () => {
  it("o teto do job só é avaliado no caminho automático", () => {
    expect(SQL).toContain("if v_automatic then");
    expect(SQL).toContain("AI_JOB_BUDGET_EXCEEDED");
  });

  it("⛔ ele soma SÓ runs automatic — senão seria o mesmo teto global com outro nome", () => {
    const ramo = SQL.slice(SQL.indexOf("if v_automatic then"));
    const ateOFim = ramo.slice(0, ramo.indexOf("AI_JOB_BUDGET_EXCEEDED"));
    expect(ateOFim).toContain("and r.automatic");
  });

  it("⛔ o orçamento GLOBAL continua sendo avaliado depois — não foi substituído", () => {
    const depois = SQL.slice(SQL.indexOf("AI_JOB_BUDGET_EXCEEDED"));
    expect(depois).toContain("AI_BUDGET_EXCEEDED_DAILY");
    expect(depois).toContain("AI_BUDGET_EXCEEDED_MONTHLY");
  });

  it("a chave do mecanismo é conferida DENTRO do RPC, não só na rota", () => {
    // Um usuário autenticado pode chamar o RPC direto; a rota não é a última barreira.
    expect(SQL).toContain("AI_JOBS_NOT_ALLOWED");
    expect(SQL).toContain("if v_automatic and not coalesce(v_jobs_allowed, false) then");
  });

  it("o mês do teto é o de BRASÍLIA, não o de UTC", () => {
    expect(SQL).toMatch(
      /v_month_start := date_trunc\('month', v_now at time zone 'America\/Sao_Paulo'\)/,
    );
  });
});
