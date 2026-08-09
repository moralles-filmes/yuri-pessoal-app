-- Fase 18-E · Bloco 4 — O JOB AUTOMÁTICO: o primeiro gasto sem o dono olhando.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ O QUE MUDA DE NATUREZA AQUI                                                           ║
-- ║                                                                                       ║
-- ║ Todo run de IA do projeto — chat (18-A), extração (18-D) e insight sob demanda        ║
-- ║ (18-E blocos 1-3) — nasceu de um clique do dono, dentro de uma sessão. Os três têm em ║
-- ║ comum uma coisa que nunca precisou ser dita: `auth.uid()` EXISTE.                     ║
-- ║                                                                                       ║
-- ║ O Cron da Vercel roda com service role e sem sessão. Duas consequências:              ║
-- ║                                                                                       ║
-- ║  1. Quem é o dono deixa de vir da sessão. `ai_begin_insight_run` ganha `p_user_id`,   ║
-- ║     honrado SÓ quando `auth.uid()` é nulo. ⛔ A TRAVA É A RLS, NÃO O `coalesce` — ver ║
-- ║     a nota longa na seção 4.                                                           ║
-- ║                                                                                       ║
-- ║  2. O orçamento ganha um SEGUNDO TETO, próprio do job. Ligar a varredura não pode     ║
-- ║     passar a comer o orçamento das conversas do dono sem ele ter mexido nisso.        ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Idempotente. RLS + FORCE RLS, índice em user_id.

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 1. As duas chaves novas em `ai_user_preferences`
-- ══════════════════════════════════════════════════════════════════════════════════════

alter table public.ai_user_preferences
  add column if not exists allow_insight_jobs boolean not null default false;

-- ⛔ `job_monthly_budget` é NOT NULL DE PROPÓSITO, ao contrário de `daily_budget` e
-- `monthly_budget` (nulos = sem teto). O job é o único gasto que acontece sem o dono estar
-- olhando; um segundo teto OPCIONAL seria um teto que a configuração padrão não tem.
alter table public.ai_user_preferences
  add column if not exists job_monthly_budget numeric(10,4) not null default 1.0000;

alter table public.ai_user_preferences
  drop constraint if exists ai_user_preferences_job_budget_check;
alter table public.ai_user_preferences
  add constraint ai_user_preferences_job_budget_check
  check (job_monthly_budget >= 0);

comment on column public.ai_user_preferences.allow_insight_jobs is
  'Fase 18-E Bloco 4. Interruptor do MECANISMO da varredura automática. Nasce false. Ela NÃO '
  'é ANDada com as chaves de módulo: o job PULA o módulo cuja allow_<modulo> está desligada e '
  'segue com os outros — ANDar faria desligar Dieta calar Financeiro junto.';

comment on column public.ai_user_preferences.job_monthly_budget is
  'Fase 18-E Bloco 4. Teto PRÓPRIO do job, em USD, no mês de Brasília. Vale JUNTO com '
  'daily_budget/monthly_budget: o job passa pelos dois, e qualquer um dos dois barra. NOT '
  'NULL porque um teto opcional sobre o gasto que ninguém está vendo é um teto que não '
  'existe na configuração padrão.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 2. `ai_runs.automatic` — o marcador que torna o teto próprio computável
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- ⛔ ELE NÃO VEM POR PARÂMETRO. O RPC o deriva de `auth.uid() is null`, dentro da mesma
-- transação que decide o dono. Quem chama não tem como se declarar automático — nem deixar
-- de ser. Um `p_automatic boolean` daria ao chamador o poder de escolher contra qual dos
-- dois tetos ele gasta.

alter table public.ai_runs
  add column if not exists automatic boolean not null default false;

comment on column public.ai_runs.automatic is
  'Fase 18-E Bloco 4. true = o run nasceu do Cron, sem sessão. DERIVADO pelo RPC de '
  '(auth.uid() is null); nunca recebido por parâmetro. É o que permite somar o gasto do job '
  'separado do gasto do dono.';

-- Índice do somatório do teto próprio: parcial, porque `automatic` é falso na esmagadora
-- maioria das linhas e um índice cheio seria quase todo desperdício.
create index if not exists ai_runs_automatic_mes_idx
  on public.ai_runs (user_id, created_at desc)
  where automatic;

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 3. `ai_insight_jobs` — o que a varredura fez, INCLUSIVE quando não fez nada
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- Uma linha POR MÓDULO, POR EXECUÇÃO, SEMPRE. Quando o job é barrado (chave desligada,
-- orçamento esgotado) não existe linha em `ai_runs` — e sem esta tabela o "registra o motivo
-- sanitizado" ficaria só no log da Vercel, que o dono não lê e a retenção apaga.
--
-- ⚠️ `run_id` e `insight_id` ficam SEM FK, DE PROPÓSITO — invariante 38 da 18-C aplicada
-- aqui. O registro de que a varredura rodou é auditoria e tem de sobreviver ao que
-- acontecer com o insight. Sem FK, também não há chave única ocupável por terceiro (17-F).

create table if not exists public.ai_insight_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  executed_at timestamptz not null default now(),
  modulo      text not null,
  desfecho    text not null,
  -- SEMPRE sanitizado (security/redact.ts). Nulo quando o desfecho é bom.
  motivo      text,
  run_id      uuid,
  insight_id  uuid,
  created_at  timestamptz not null default now()
);

alter table public.ai_insight_jobs
  drop constraint if exists ai_insight_jobs_modulo_check;
alter table public.ai_insight_jobs
  add constraint ai_insight_jobs_modulo_check
  check (modulo in ('financeiro', 'treinos', 'dieta'));

alter table public.ai_insight_jobs
  drop constraint if exists ai_insight_jobs_desfecho_check;
alter table public.ai_insight_jobs
  add constraint ai_insight_jobs_desfecho_check
  check (desfecho in ('gerado', 'reaproveitado', 'pulado', 'falhou'));

-- Desfecho ruim SEM motivo é a mesma ausência muda que a invariante 65 recusa no indicador.
alter table public.ai_insight_jobs
  drop constraint if exists ai_insight_jobs_motivo_coerente;
alter table public.ai_insight_jobs
  add constraint ai_insight_jobs_motivo_coerente
  check (
    (desfecho in ('pulado', 'falhou') and motivo is not null and btrim(motivo) <> '')
    or
    (desfecho in ('gerado', 'reaproveitado'))
  );

create index if not exists ai_insight_jobs_user_executed_idx
  on public.ai_insight_jobs (user_id, executed_at desc);

alter table public.ai_insight_jobs enable row level security;
alter table public.ai_insight_jobs force row level security;

-- ⛔ SÓ SELECT. Nenhuma policy de insert, update ou delete: quem escreve é a service role
-- (que tem bypassrls), e a tabela é append-only como `ai_insight_feedback`. Um usuário
-- autenticado não tem como forjar, corrigir nem apagar o registro de uma varredura.
-- ⚠️ `(select auth.uid())`, e nao `auth.uid()` puro: sem o select, o Postgres reavalia a
-- funcao LINHA A LINHA (lint `auth_rls_init_plan`). ESTADO MISTO DECLARADO — as outras 17
-- tabelas `ai_*` ainda usam a forma antiga (sao 40 lints, todos em `ai_*`). So a tabela desta
-- subfase foi corrigida; migrar as outras e trabalho a parte.
drop policy if exists "ai_insight_jobs_select_own" on public.ai_insight_jobs;
create policy "ai_insight_jobs_select_own"
  on public.ai_insight_jobs for select
  using (user_id = (select auth.uid()));

comment on table public.ai_insight_jobs is
  'Fase 18-E Bloco 4. Uma linha por MÓDULO por EXECUÇÃO da varredura automática — inclusive '
  'quando ela não rodou (desfecho `pulado`). Sem esta tabela, "job barrado registra o motivo '
  'sanitizado" ficaria só no log da Vercel. Append-only: só policy de SELECT, e quem escreve '
  'é a service role. run_id/insight_id sem FK de propósito (invariante 38 da 18-C).';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 4. `ai_begin_insight_run` ganha `p_user_id` — e o segundo teto
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- ⚠️ `create or replace` NÃO substitui a função ao acrescentar um parâmetro com default: ele
-- cria uma SOBRECARGA, e as duas passam a existir. O `drop` abaixo é obrigatório.

drop function if exists public.ai_begin_insight_run(text, text, text, text, numeric, text, integer);

create or replace function public.ai_begin_insight_run(
  p_modulo                   text,
  p_prompt_version           text,
  p_selected_provider        text,
  p_selected_model           text,
  p_reserved_cost            numeric,
  p_reservation_rate_version text,
  p_reservation_ttl_seconds  integer default 300,
  p_user_id                  uuid    default null
)
returns table (
  run_id         uuid,
  correlation_id uuid
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  c_lease          constant interval := interval '5 minutes';

  v_session        uuid := auth.uid();
  v_user           uuid;
  v_automatic      boolean;
  v_now            timestamptz := now();
  v_agent          text;
  v_allowed        boolean;
  v_jobs_allowed   boolean;
  v_cfg            public.ai_provider_configs%rowtype;
  v_cred_status    text;
  v_per_minute     integer;
  v_per_hour       integer;
  v_daily_budget   numeric;
  v_monthly_budget numeric;
  v_job_budget     numeric;
  v_block          boolean;
  v_count_minute   integer;
  v_count_hour     integer;
  v_spent          numeric;
  v_reserved       numeric;
  v_day_start      timestamptz;
  v_month_start    timestamptz;
  v_run            uuid;
  v_corr           uuid := gen_random_uuid();
begin
  -- ── 1. O DONO ───────────────────────────────────────────────────────────────────────
  --
  -- ⛔ A SESSÃO SEMPRE VENCE. Um autenticado que passe `p_user_id` de outra pessoa é
  -- simplesmente ignorado pelo `coalesce`.
  --
  -- ⛔ E A GARANTIA NÃO DEPENDE DESTA LINHA. A função continua `security invoker`: mesmo que
  -- alguém invertesse a ordem do `coalesce`, um autenticado apontando para outro dono
  --   · não leria `ai_user_preferences` dele        → AI_MODULE_NOT_ALLOWED
  --   · não leria `ai_provider_configs`/credenciais → AI_PROVIDER_NOT_AVAILABLE
  --   · não conseguiria o INSERT em `ai_runs`       → with check (user_id = auth.uid())
  --
  -- A trava é a RLS, não o `coalesce` — a mesma escolha que pôs o uso único num `unique` e o
  -- prazo num `default` (invariante 36 da 18-C), em vez de num `if` que alguém remove.
  --
  -- Quem passa por aqui com `auth.uid()` nulo é a service role, que já ignora a RLS por
  -- definição: nada é escalado, porque ela poderia escrever a linha direto.
  v_user      := coalesce(v_session, p_user_id);
  v_automatic := (v_session is null);

  if v_user is null then
    raise exception 'AI_NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  -- ── 2. O módulo é um dos três da fatia — allowlist, nunca lista de proibidos ─────────
  if p_modulo is null or p_modulo not in ('financeiro', 'treinos', 'dieta') then
    raise exception 'AI_MODULE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  v_agent := 'insights.' || p_modulo;

  -- ── 3. Lock TRANSACIONAL por usuário — MESMA chave das outras espécies ──────────────
  perform pg_advisory_xact_lock(hashtextextended('ai:begin_run:' || v_user::text, 0));

  -- ── 4. Recuperação preguiçosa ANTES de reservar ─────────────────────────────────────
  --
  -- ⚠️ Sob service role esta chamada varre GLOBAL em vez de só o usuário (ela é
  -- `security invoker` e a RLS não a recorta). Mantido de propósito: é a mesma varredura que
  -- /api/cron/notifications já faz com service role desde a 18-A.
  perform public.ai_reconcile_abandoned_runs(20);

  -- ── 5. A CHAVE DO MÓDULO PEDIDO — e, no job, a chave do MECANISMO ───────────────────
  select case p_modulo
           when 'financeiro' then p.allow_finance
           when 'treinos'    then p.allow_training
           when 'dieta'      then p.allow_nutrition
         end,
         p.allow_insight_jobs
    into v_allowed, v_jobs_allowed
    from public.ai_user_preferences p
   where p.user_id = v_user;

  if not found or not coalesce(v_allowed, false) then
    raise exception 'AI_MODULE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  -- ⚠️ Conferida AQUI também, e não só na rota: o RPC não é a segunda barreira de nada — ele
  -- é a última. (Mesma disciplina de `allow_vision` na 18-D.)
  if v_automatic and not coalesce(v_jobs_allowed, false) then
    raise exception 'AI_JOBS_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  -- ── 6. Validações da reserva ────────────────────────────────────────────────────────
  if p_prompt_version is null or btrim(p_prompt_version) = '' then
    raise exception 'AI_PROMPT_VERSION_REQUIRED' using errcode = 'P0001';
  end if;
  if p_reserved_cost is null or p_reserved_cost < 0 then
    raise exception 'AI_INVALID_RESERVATION' using errcode = 'P0001';
  end if;
  if p_reservation_rate_version is null or btrim(p_reservation_rate_version) = '' then
    raise exception 'AI_INVALID_RESERVATION' using errcode = 'P0001';
  end if;
  if p_reservation_ttl_seconds is null
     or p_reservation_ttl_seconds < 30
     or p_reservation_ttl_seconds > 1800 then
    raise exception 'AI_INVALID_RESERVATION' using errcode = 'P0001';
  end if;

  -- ── 7. Provedor, credencial e modelo ────────────────────────────────────────────────
  select * into v_cfg
    from public.ai_provider_configs c
   where c.user_id = v_user and c.provider = p_selected_provider;

  if not found or not v_cfg.enabled then
    raise exception 'AI_PROVIDER_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  select cr.status into v_cred_status
    from public.ai_provider_credentials cr
   where cr.user_id = v_user and cr.provider = p_selected_provider;

  if not found or v_cred_status = 'invalida' then
    raise exception 'AI_CREDENTIAL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- O `where m is not null` NÃO é decoração: `x not in (a, NULL)` devolve NULL quando
  -- x <> a, o `if` não dispara e o modelo passaria. (Mesma nota das outras duas RPCs.)
  if p_selected_model is null or p_selected_model not in (
       select m from unnest(array[
                v_cfg.default_model, v_cfg.economy_model,
                v_cfg.advanced_model, v_cfg.vision_model
              ]) as m
        where m is not null
     ) then
    raise exception 'AI_MODEL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- ── 8. Preferências: limites LIDOS PELO BANCO ───────────────────────────────────────
  select p.rate_limit_per_minute, p.rate_limit_per_hour,
         p.daily_budget, p.monthly_budget, p.budget_block_on_limit,
         p.job_monthly_budget
    into v_per_minute, v_per_hour, v_daily_budget, v_monthly_budget, v_block,
         v_job_budget
    from public.ai_user_preferences p
   where p.user_id = v_user;

  if not found then
    v_per_minute := 10; v_per_hour := 120;
    v_daily_budget := null; v_monthly_budget := null; v_block := true;
    v_job_budget := 0;
  end if;

  -- ── 9. Rate limit — a janela conta TODO run, de qualquer espécie ────────────────────
  select count(*) into v_count_minute
    from public.ai_runs r
   where r.user_id = v_user and r.created_at > v_now - interval '1 minute';

  select count(*) into v_count_hour
    from public.ai_runs r
   where r.user_id = v_user and r.created_at > v_now - interval '1 hour';

  if v_count_minute >= v_per_minute or v_count_hour >= v_per_hour then
    raise exception 'AI_RATE_LIMITED' using errcode = 'P0001';
  end if;

  -- ── 10. Orçamento — o dia e o mês são os de BRASÍLIA, não de UTC ────────────────────
  v_day_start   := date_trunc('day',   v_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_month_start := date_trunc('month', v_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';

  -- ── 10-A. O TETO PRÓPRIO DO JOB — e ele NÃO é alternativa ao global ─────────────────
  --
  -- ⛔ OS DOIS VALEM, NESTA ORDEM. O job passa por este e depois pelo diário/mensal de
  -- sempre; qualquer um dos dois barra. Sem isto, ligar a varredura passaria a consumir o
  -- orçamento das conversas do dono sem ele ter mexido em nada.
  --
  -- ⚠️ Este teto NÃO respeita `budget_block_on_limit`. Aquele interruptor é do dono decidindo
  -- se um gasto DELE deve parar ou só avisar; aqui não há ninguém para avisar no instante do
  -- gasto — avisar um processo automático é o mesmo que não ter teto.
  --
  -- A aritmética é a da invariante 9 (custo dos terminais + reserva dos não-terminais não
  -- vencidos), restrita a `automatic`.
  if v_automatic then
    select coalesce(sum(e.estimated_cost), 0) into v_spent
      from public.ai_usage_events e
      join public.ai_runs r on r.id = e.run_id and r.user_id = e.user_id
     where e.user_id = v_user
       and r.automatic
       and r.status in ('completed','cancelled','failed')
       and e.created_at >= v_month_start;

    select coalesce(sum(r.reserved_cost), 0) into v_reserved
      from public.ai_runs r
     where r.user_id = v_user
       and r.automatic
       and r.status in ('reserved','streaming')
       and r.reservation_expires_at > v_now
       and r.created_at >= v_month_start;

    if v_spent + v_reserved + p_reserved_cost > coalesce(v_job_budget, 0) then
      raise exception 'AI_JOB_BUDGET_EXCEEDED' using errcode = 'P0001';
    end if;
  end if;

  -- ── 10-B. O orçamento GLOBAL, inalterado desde a 18-A ──────────────────────────────
  if v_block and (v_daily_budget is not null or v_monthly_budget is not null) then
    if v_daily_budget is not null then
      select coalesce(sum(e.estimated_cost), 0) into v_spent
        from public.ai_usage_events e
        join public.ai_runs r on r.id = e.run_id and r.user_id = e.user_id
       where e.user_id = v_user
         and r.status in ('completed','cancelled','failed')
         and e.created_at >= v_day_start;

      select coalesce(sum(r.reserved_cost), 0) into v_reserved
        from public.ai_runs r
       where r.user_id = v_user
         and r.status in ('reserved','streaming')
         and r.reservation_expires_at > v_now
         and r.created_at >= v_day_start;

      if v_spent + v_reserved + p_reserved_cost > v_daily_budget then
        raise exception 'AI_BUDGET_EXCEEDED_DAILY' using errcode = 'P0001';
      end if;
    end if;

    if v_monthly_budget is not null then
      select coalesce(sum(e.estimated_cost), 0) into v_spent
        from public.ai_usage_events e
        join public.ai_runs r on r.id = e.run_id and r.user_id = e.user_id
       where e.user_id = v_user
         and r.status in ('completed','cancelled','failed')
         and e.created_at >= v_month_start;

      select coalesce(sum(r.reserved_cost), 0) into v_reserved
        from public.ai_runs r
       where r.user_id = v_user
         and r.status in ('reserved','streaming')
         and r.reservation_expires_at > v_now
         and r.created_at >= v_month_start;

      if v_spent + v_reserved + p_reserved_cost > v_monthly_budget then
        raise exception 'AI_BUDGET_EXCEEDED_MONTHLY' using errcode = 'P0001';
      end if;
    end if;
  end if;

  -- ── 11. O run. `conversation_id` NULO, `kind = 'insight'` ───────────────────────────
  insert into public.ai_runs (
    user_id, conversation_id, kind, agent_id, prompt_version, correlation_id,
    selected_provider, selected_model, status,
    last_heartbeat_at, lease_expires_at,
    reserved_cost, reservation_currency, reservation_rate_version, reservation_expires_at,
    automatic
  ) values (
    v_user, null, 'insight', v_agent, p_prompt_version, v_corr,
    p_selected_provider, p_selected_model, 'reserved',
    v_now, v_now + c_lease,
    p_reserved_cost, 'USD', p_reservation_rate_version,
    v_now + make_interval(secs => p_reservation_ttl_seconds),
    v_automatic
  )
  returning id into v_run;

  return query select v_run, v_corr;
end;
$$;

revoke all on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer, uuid) from public;
revoke all on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer, uuid) from anon;
grant execute on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer, uuid) to authenticated;

comment on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer, uuid) is
  'Fase 18-E (Bloco 2, alterada no Bloco 4). Admissão atômica de um run de INSIGHT. '
  'p_user_id é honrado SÓ quando auth.uid() é nulo (Cron com service role): a sessão sempre '
  'vence pelo coalesce, e a trava real é a RLS do security invoker — um autenticado '
  'apontando para outro dono não lê as preferências, não lê a credencial e não consegue o '
  'insert. `automatic` é DERIVADO de (auth.uid() is null), nunca recebido. O teto próprio do '
  'job (job_monthly_budget) vale JUNTO com o diário/mensal global: os dois barram.';
