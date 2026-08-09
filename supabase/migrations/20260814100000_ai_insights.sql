-- Fase 18-E · Bloco 2 — INSIGHTS: a terceira espécie de run, e as três tabelas.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ O QUE MUDA DE NATUREZA AQUI                                                           ║
-- ║                                                                                       ║
-- ║ Até a 18-D a IA RELATOU números que outro alguém calculou. A 18-E cria a primeira     ║
-- ║ grandeza DERIVADA do projeto — média de janela, comparação entre períodos, variação   ║
-- ║ percentual — e a grava. Daí as duas decisões estruturais deste arquivo:               ║
-- ║                                                                                       ║
-- ║  1. `ai_insights.explicacao` guarda os TOKENS `{{ind:…}}`, NUNCA o número resolvido.  ║
-- ║     Enquanto o texto guardar tokens, é IMPOSSÍVEL o banco conter um insight que cite  ║
-- ║     um número fora das fontes. A regra deixa de depender de o validador ter rodado e  ║
-- ║     vira propriedade do dado — o mesmo movimento que pôs uso único num `unique` e     ║
-- ║     prazo num `default`, em vez de num `if`.                                           ║
-- ║                                                                                       ║
-- ║  2. `ai_insight_sources` guarda o VALOR do indicador. É uma exceção DECLARADA à       ║
-- ║     invariante 20 (a auditoria guarda o pedido, nunca o resultado), e por outro       ║
-- ║     motivo: é SNAPSHOT, como `efeito_previsto` na proposta e `nutrients_snapshot` na  ║
-- ║     Dieta. Sem ele, reler um insight de julho recalcularia os números com os dados de ║
-- ║     hoje, e o insight mudaria de conteúdo depois de escrito.                           ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Idempotente. RLS + FORCE RLS, índice em user_id, trigger updated_at, FK COMPOSTA.

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 1. `ai_runs` ganha a TERCEIRA forma
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- Pelo MESMO padrão da segunda (18-D): afrouxa na coluna, exige a forma inteira no CHECK.
-- "Todo run de chat tem conversa" continua provado pelo banco.

alter table public.ai_runs drop constraint if exists ai_runs_kind_check;
alter table public.ai_runs
  add constraint ai_runs_kind_check check (kind in ('chat', 'extracao', 'insight'));

alter table public.ai_runs drop constraint if exists ai_runs_kind_coerente;
alter table public.ai_runs
  add constraint ai_runs_kind_coerente
  check (
    (kind = 'chat'     and conversation_id is not null)
    or
    (kind = 'extracao' and conversation_id is null)
    or
    (kind = 'insight'  and conversation_id is null)
  );

comment on column public.ai_runs.kind is
  'Fase 18-D/18-E. `chat` = nasceu de uma mensagem e TEM conversa. `extracao` = nasceu de '
  'um clique em /ia/comprovantes. `insight` = nasceu de um clique em /ia/insights ou do job '
  'automático. As duas últimas NÃO têm conversa. O CHECK ai_runs_kind_coerente exige cada '
  'forma por inteiro — a coluna aceitar NULL não afrouxou o chat.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 2. `ai_insights` — o que foi escrito, com os tokens no lugar dos números
-- ══════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.ai_insights (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- FK COMPOSTA: a RLS confere o user_id da PRÓPRIA linha e não alcança a linha apontada
  -- (16-E, 17-F, 18-C, 18-D — a mesma correção, pela quinta vez).
  run_id          uuid not null,

  modulo          text not null check (modulo in ('financeiro', 'treinos', 'dieta')),

  -- Escolha do MODELO: nem `tipo` nem `prioridade` são afirmação factual sobre os registros
  -- do dono, então ele pode escolhê-los. `confianca` NÃO é escolha dele — ver abaixo.
  tipo            text not null
                    check (tipo in ('observacao', 'comparacao', 'tendencia', 'lembrete')),
  prioridade      text not null check (prioridade in ('baixa', 'media', 'alta')),

  -- ⛔ DERIVADA PELO SERVIDOR, E ELE SÓ REBAIXA (`insights/confidence.ts`). O campo não
  -- existe no schema de saída do modelo: irrepresentável, não recusado. Invariante 57 da
  -- 18-D — um modelo que declara a própria confiança declara `alta` quase sempre, e o dono
  -- leria como aval o que é só fluência.
  confianca       text not null check (confianca in ('alta', 'media', 'baixa')),

  titulo          text not null,
  resumo          text not null,

  -- ⛔ COM OS TOKENS `{{ind:…}}`. `render.ts` resolve a cada leitura, a partir de
  -- `ai_insight_sources`. Gravar o número resolvido tornaria a garantia "não cita número
  -- fora das fontes" dependente de o validador ter rodado.
  explicacao      text not null,

  -- `date`, não `timestamptz`: período é DATA PURA e não tem fuso.
  periodo_de      date not null,
  periodo_ate     date not null,

  -- Calculada sobre os INDICADORES, antes de falar com o modelo. Rodar o job três vezes com
  -- os mesmos dados não gera três insights — e não gasta dinheiro para descobrir isso.
  dedupe_key      text not null,

  -- De `insights/expiry.ts`, enviado pelo servidor. Expirar NÃO apaga: o insight sai da
  -- lista de vigentes e continua legível com os números que tinha.
  expires_at      timestamptz not null,

  provider        text not null,
  model           text not null,
  prompt_version  text not null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint ai_insights_run_fk
    foreign key (run_id, user_id)
    references public.ai_runs (id, user_id)
    on delete cascade,

  constraint ai_insights_periodo_coerente check (periodo_de <= periodo_ate),

  -- Um insight já nascido vencido não teria como ser lido nem uma vez.
  constraint ai_insights_expira_no_futuro check (expires_at > created_at)
);

-- ⚠️ A CHAVE ÚNICA ALCANÇA O INSIGHT EXPIRADO, DE PROPÓSITO — e isso é mais forte do que o
-- desenho previa. O desenho dizia "existindo insight NÃO EXPIRADO com essa chave, devolva o
-- existente"; com uma unique que ignora o prazo, regenerar depois do vencimento bateria em
-- `23505`. A saída não é afrouxar a chave: é a leitura prévia devolver o existente SEJA QUAL
-- FOR o estado dele. `dedupe_key` cobre módulo, período e os indicadores — se ela repete, os
-- dados não mudaram, e um segundo texto sobre os mesmos números não é informação nova, é
-- gasto. Quem quer números novos tem dados novos, e aí a chave é outra.
create unique index if not exists ai_insights_user_dedupe_uidx
  on public.ai_insights (user_id, dedupe_key);

create index if not exists ai_insights_user_idx on public.ai_insights (user_id);

-- A consulta da tela e a do card: vigentes, do mais recente para o mais antigo.
create index if not exists ai_insights_user_vigentes_idx
  on public.ai_insights (user_id, expires_at desc, created_at desc);

create index if not exists ai_insights_user_modulo_idx
  on public.ai_insights (user_id, modulo, created_at desc);

-- Alvo das FKs compostas das duas filhas (e, no Bloco 3, de `ai_action_proposals`).
-- ⚠️ SEM ISTO A FK COMPOSTA FALHA COM `42830` — o tropeço da 16-E e o da 18-D. Entra ANTES
-- das tabelas que a usam, no mesmo arquivo.
alter table public.ai_insights drop constraint if exists ai_insights_id_user_uk;
alter table public.ai_insights add constraint ai_insights_id_user_uk unique (id, user_id);

alter table public.ai_insights enable row level security;
alter table public.ai_insights force row level security;

drop policy if exists "own rows" on public.ai_insights;
create policy "own rows" on public.ai_insights
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_ai_insights_updated_at on public.ai_insights;
create trigger set_ai_insights_updated_at
  before update on public.ai_insights
  for each row execute function public.set_updated_at();

comment on table public.ai_insights is
  'Fase 18-E. Um insight gerado sobre indicadores MEDIDOS. `explicacao` guarda os tokens '
  '{{ind:…}}, nunca o número resolvido. NENHUM estado é gravado: vigente/expirado/'
  'dispensado/adiado saem de expires_at + ai_insight_feedback, em insights/state.ts.';

comment on column public.ai_insights.explicacao is
  'Fase 18-E. O texto COM os tokens {{ind:<id>}}. Enquanto ele guardar tokens, é impossível '
  'o banco conter um insight que cite um número fora de ai_insight_sources — a garantia é '
  'propriedade do dado, não consequência de o validador ter rodado.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 3. `ai_insight_sources` — o SNAPSHOT de cada número citado
-- ══════════════════════════════════════════════════════════════════════════════════════

create table if not exists public.ai_insight_sources (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  insight_id           uuid not null,

  -- O id do `Indicador` — é ele que o token `{{ind:<id>}}` cita.
  indicador_id         text not null,
  rotulo               text not null,

  -- ⛔ `null` = NÃO MEDIDO, e o motivo é OBRIGATÓRIO. Zero é fato medido. É a invariante 1
  -- da Dieta chegando à coluna: sem o CHECK abaixo, um coletor com defeito gravaria `null`
  -- sem motivo e a tela escreveria "—", que não distingue os dois casos.
  valor                numeric,
  indisponivel_porque  text,

  unidade              text not null,
  qualidade            text not null check (qualidade in ('exato', 'parcial')),
  motivo_incompleto    text,

  periodo_de           date not null,
  periodo_ate          date not null,

  -- Quantos períodos/registros entraram. Viaja COM o número — sem ele não é verificável.
  n                    integer not null check (n >= 0),

  -- Invariante 12 dos Treinos: o mesmo registro dá totais diferentes sob regras diferentes.
  regra_de_contagem    text,

  -- Deep link interno. Validado por `rotaInternaAceita` antes de gravar.
  rota                 text not null,

  -- A ordem em que os indicadores foram apresentados ao modelo.
  ordem                integer not null default 0,

  created_at           timestamptz not null default now(),

  constraint ai_insight_sources_insight_fk
    foreign key (insight_id, user_id)
    references public.ai_insights (id, user_id)
    on delete cascade,

  constraint ai_insight_sources_ausencia_coerente
    check ((valor is null) = (indisponivel_porque is not null)),

  constraint ai_insight_sources_parcial_coerente
    check ((qualidade = 'parcial') = (motivo_incompleto is not null)),

  constraint ai_insight_sources_periodo_coerente check (periodo_de <= periodo_ate)
);

-- Um indicador aparece uma vez por insight: o token `{{ind:x}}` tem de resolver para UMA
-- linha, e duas linhas com o mesmo id fariam a resolução depender da ordem da consulta.
create unique index if not exists ai_insight_sources_insight_indicador_uidx
  on public.ai_insight_sources (insight_id, indicador_id);

create index if not exists ai_insight_sources_user_idx
  on public.ai_insight_sources (user_id);

create index if not exists ai_insight_sources_insight_idx
  on public.ai_insight_sources (insight_id, ordem);

alter table public.ai_insight_sources enable row level security;
alter table public.ai_insight_sources force row level security;

drop policy if exists "own rows" on public.ai_insight_sources;
create policy "own rows" on public.ai_insight_sources
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.ai_insight_sources is
  'Fase 18-E. Uma linha por indicador que entrou no insight — o SNAPSHOT que render.ts usa '
  'para resolver os tokens. Exceção DECLARADA à invariante 20 (a auditoria guarda o pedido, '
  'nunca o resultado): aqui a cópia é snapshot, como nutrients_snapshot na Dieta. Sem ela, '
  'reler um insight de julho recalcularia os números com os dados de hoje.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 4. `ai_insight_feedback` — append-only, e é dela que sai o estado
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- ⛔ NENHUM ESTADO É GRAVADO EM `ai_insights` — invariante 35 da 18-C aplicada aqui.
-- `vigente`, `expirado`, `dispensado` e `adiado` saem de `expires_at` + estas linhas, em
-- `insights/state.ts` (puro, `agora` injetado), com precedência DECISÃO DO DONO > PRAZO.
--
-- Append-only por POLICY, não por convenção: há `select` e `insert`, e NÃO há `update` nem
-- `delete`. Mudar de ideia grava uma linha nova; a anterior fica.

create table if not exists public.ai_insight_feedback (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  insight_id  uuid not null,

  decisao     text not null
                check (decisao in ('util', 'inutil', 'dispensado', 'adiado', 'nao_mostrar')),

  -- Só para `adiado`, e obrigatório nele: adiar sem data seria dispensar com outro nome.
  adiado_ate  date,

  created_at  timestamptz not null default now(),

  constraint ai_insight_feedback_insight_fk
    foreign key (insight_id, user_id)
    references public.ai_insights (id, user_id)
    on delete cascade,

  constraint ai_insight_feedback_adiado_coerente
    check ((decisao = 'adiado') = (adiado_ate is not null))
);

create index if not exists ai_insight_feedback_user_idx
  on public.ai_insight_feedback (user_id);

create index if not exists ai_insight_feedback_insight_idx
  on public.ai_insight_feedback (insight_id, created_at desc);

alter table public.ai_insight_feedback enable row level security;
alter table public.ai_insight_feedback force row level security;

drop policy if exists "own rows" on public.ai_insight_feedback;
drop policy if exists "read own" on public.ai_insight_feedback;
drop policy if exists "append own" on public.ai_insight_feedback;

create policy "read own" on public.ai_insight_feedback
  for select using (user_id = auth.uid());

create policy "append own" on public.ai_insight_feedback
  for insert with check (user_id = auth.uid());

comment on table public.ai_insight_feedback is
  'Fase 18-E. Append-only: policies de SELECT e INSERT, sem UPDATE e sem DELETE. Mudar de '
  'ideia grava linha nova. É daqui, com expires_at, que insights/state.ts deriva o estado — '
  'ai_insights NÃO tem coluna de status (invariante 35 da 18-C).';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 5. `ai_begin_insight_run` — admissão atômica, sem conversa, com a chave do MÓDULO
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- Irmã de `ai_begin_chat_run` e de `ai_begin_extraction_run`, com as MESMAS garantias:
--
--   SECURITY INVOKER · SET search_path = '' · advisory lock TRANSACIONAL por usuário
--   auth.uid() lido DENTRO da função e NULL rejeitado
--   reconciliação de runs abandonados ANTES de reservar
--   rate limit e orçamento LIDOS PELO BANCO — o cliente nunca informa limite nem contagem
--
-- ⛔ A CHAVE DO ADVISORY LOCK É A MESMA DAS OUTRAS DUAS. Com namespace próprio, um insight e
-- uma mensagem de chat simultâneos pegariam locks diferentes, leriam o mesmo consumo
-- confirmado e passariam os dois — a corrida que o lock existe para impedir. O recurso
-- disputado é o orçamento do dono, não a espécie do run.
--
-- ⚠️ A PERMISSÃO É DO MÓDULO PEDIDO (invariante 26 da 18-C), conferida AQUI além de na
-- Server Action — um usuário autenticado pode chamar o RPC direto.

create or replace function public.ai_begin_insight_run(
  p_modulo                   text,
  p_prompt_version           text,
  p_selected_provider        text,
  p_selected_model           text,
  p_reserved_cost            numeric,
  p_reservation_rate_version text,
  p_reservation_ttl_seconds  integer default 300
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

  v_user           uuid := auth.uid();
  v_now            timestamptz := now();
  v_agent          text;
  v_allowed        boolean;
  v_cfg            public.ai_provider_configs%rowtype;
  v_cred_status    text;
  v_per_minute     integer;
  v_per_hour       integer;
  v_daily_budget   numeric;
  v_monthly_budget numeric;
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
  -- ── 1. Sessão ────────────────────────────────────────────────────────────────────────
  if v_user is null then
    raise exception 'AI_NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  -- ── 2. O módulo é um dos três da fatia — allowlist, nunca lista de proibidos ─────────
  if p_modulo is null or p_modulo not in ('financeiro', 'treinos', 'dieta') then
    raise exception 'AI_MODULE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  v_agent := 'insights.' || p_modulo;

  -- ── 3. Lock TRANSACIONAL por usuário — MESMA chave das outras duas espécies ─────────
  perform pg_advisory_xact_lock(hashtextextended('ai:begin_run:' || v_user::text, 0));

  -- ── 4. Recuperação preguiçosa ANTES de reservar ─────────────────────────────────────
  perform public.ai_reconcile_abandoned_runs(20);

  -- ── 5. A CHAVE DO MÓDULO PEDIDO ─────────────────────────────────────────────────────
  select case p_modulo
           when 'financeiro' then p.allow_finance
           when 'treinos'    then p.allow_training
           when 'dieta'      then p.allow_nutrition
         end
    into v_allowed
    from public.ai_user_preferences p
   where p.user_id = v_user;

  if not found or not coalesce(v_allowed, false) then
    raise exception 'AI_MODULE_NOT_ALLOWED' using errcode = 'P0001';
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
         p.daily_budget, p.monthly_budget, p.budget_block_on_limit
    into v_per_minute, v_per_hour, v_daily_budget, v_monthly_budget, v_block
    from public.ai_user_preferences p
   where p.user_id = v_user;

  if not found then
    v_per_minute := 10; v_per_hour := 120;
    v_daily_budget := null; v_monthly_budget := null; v_block := true;
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
    reserved_cost, reservation_currency, reservation_rate_version, reservation_expires_at
  ) values (
    v_user, null, 'insight', v_agent, p_prompt_version, v_corr,
    p_selected_provider, p_selected_model, 'reserved',
    v_now, v_now + c_lease,
    p_reserved_cost, 'USD', p_reservation_rate_version,
    v_now + make_interval(secs => p_reservation_ttl_seconds)
  )
  returning id into v_run;

  return query select v_run, v_corr;
end;
$$;

revoke all on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer) from public;
revoke all on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer) from anon;
grant execute on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer) to authenticated;

comment on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer) is
  'Fase 18-E. Admissão atômica de um run de INSIGHT (sem conversa). Mesmas garantias de '
  'ai_begin_chat_run e ai_begin_extraction_run, com o MESMO advisory lock — o recurso '
  'disputado é o orçamento do dono, não a espécie do run. Confere a chave allow_* do MÓDULO '
  'PEDIDO aqui também, porque um usuário autenticado pode chamar o RPC direto.';
