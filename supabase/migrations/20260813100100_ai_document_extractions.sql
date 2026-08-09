-- Fase 18-D · Bloco 3 — A EXTRAÇÃO: um run SEM conversa, e a terceira forma de proposta.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ AFROUXAR NA COLUNA, MANTER OBRIGATÓRIA NO CHECK — o padrão do Bloco 5 da 18-C.        ║
-- ║                                                                                       ║
-- ║ `ai_runs.conversation_id` é `not null` desde a 18-A, e um run de extração NÃO TEM     ║
-- ║ conversa: ele nasce de um clique em /ia/comprovantes, não de uma mensagem. A saída é  ║
-- ║ exatamente a que `ai_action_proposals` já usou para o desfazer: a coluna passa a       ║
-- ║ aceitar NULL, e um CHECK discriminado por `kind` exige cada forma POR INTEIRO.         ║
-- ║                                                                                       ║
-- ║ Sem o CHECK isto seria um afrouxamento. Com ele, é uma SEGUNDA FORMA DECLARADA — e    ║
-- ║ "todo run de chat tem conversa" continua provado pelo banco.                           ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- Idempotente. RLS + FORCE RLS, índice em user_id, trigger updated_at, FK COMPOSTA.

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 1. `ai_runs` ganha uma segunda forma
-- ══════════════════════════════════════════════════════════════════════════════════════

alter table public.ai_runs
  add column if not exists kind text not null default 'chat';

alter table public.ai_runs drop constraint if exists ai_runs_kind_check;
alter table public.ai_runs
  add constraint ai_runs_kind_check check (kind in ('chat', 'extracao'));

alter table public.ai_runs alter column conversation_id drop not null;

alter table public.ai_runs drop constraint if exists ai_runs_kind_coerente;
alter table public.ai_runs
  add constraint ai_runs_kind_coerente
  check (
    (kind = 'chat'     and conversation_id is not null)
    or
    (kind = 'extracao' and conversation_id is null)
  );

comment on column public.ai_runs.kind is
  'Fase 18-D. `chat` = nasceu de uma mensagem e TEM conversa. `extracao` = nasceu de um '
  'clique em /ia/comprovantes e NÃO tem conversa. O CHECK ai_runs_kind_coerente exige cada '
  'forma por inteiro — a coluna aceitar NULL não afrouxou o chat.';

-- A consulta da tela e do orçamento por espécie de run.
create index if not exists ai_runs_user_kind_idx
  on public.ai_runs (user_id, kind, created_at desc);

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 2. `ai_document_extractions` — o que o modelo leu, e o que o dono corrigiu
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ⚠️ FK COMPOSTA EXIGE UNIQUE COMPOSTA NO ALVO. A PK de `ai_documents` é só `id`, e uma FK
-- `(document_id, user_id)` referenciando `(id, user_id)` falha com `42830` — "there is no
-- unique constraint matching given keys". É exatamente o que a 16-E teve de fazer para as
-- fotos de evolução, numa migration de correção (`20260805100400_body_progress_photos_owner_fk`).
-- Aqui a constraint entra ANTES da tabela que a usa, no mesmo arquivo.
alter table public.ai_documents drop constraint if exists ai_documents_id_user_uk;
alter table public.ai_documents add constraint ai_documents_id_user_uk unique (id, user_id);

create table if not exists public.ai_document_extractions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  -- FK COMPOSTA nas duas pontas. A RLS confere o user_id da PRÓPRIA linha e não alcança a
  -- linha apontada (16-E, 17-F, 18-C — a mesma correção, pela quarta vez).
  document_id    uuid not null,
  run_id         uuid not null,

  schema_version text not null,

  status         text not null default 'extraida'
                   check (status in ('extraida', 'falhou')),

  -- ⛔ O QUE O MODELO LEU, JÁ REBAIXADO PELO SERVIDOR (`vision/confidence.ts`).
  -- jsonb porque a forma é versionada em código (`schema_version`) e muda por subfase; uma
  -- coluna por campo obrigaria migration a cada campo novo do comprovante.
  --
  -- ⚠️ Isto NÃO é uma segunda cópia de registro do usuário (invariante 20 da 18-B): não é
  -- resultado de ferramenta sobre dado do sistema, é o conteúdo de um documento que o
  -- PRÓPRIO dono enviou, e sem ele a tela de revisão não tem o que revisar.
  campos         jsonb not null,

  -- O que o dono corrigiu na revisão. Separado de `campos` de propósito: a auditoria
  -- precisa distinguir "o modelo leu" de "o dono digitou", e sobrescrever `campos`
  -- apagaria a leitura original — que é justamente o que se quer poder conferir depois.
  correcoes      jsonb,
  revisada_em    timestamptz,

  -- Erro sanitizado quando `status = 'falhou'`. NUNCA corpo de resposta do provedor.
  erro_codigo    text,
  erro_mensagem  text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint ai_document_extractions_document_fk
    foreign key (document_id, user_id)
    references public.ai_documents (id, user_id)
    on delete cascade,

  constraint ai_document_extractions_run_fk
    foreign key (run_id, user_id)
    references public.ai_runs (id, user_id)
    on delete cascade,

  -- Falha tem de dizer por quê; sucesso não carrega erro. Estado impossível recusado no
  -- banco, não num `if` que alguém esquece.
  constraint ai_document_extractions_erro_coerente
    check (
      (status = 'extraida' and erro_codigo is null)
      or
      (status = 'falhou' and erro_codigo is not null)
    ),

  -- Revisão tem data; sem data não houve revisão.
  constraint ai_document_extractions_revisao_coerente
    check ((correcoes is null) = (revisada_em is null))
);

create index if not exists ai_document_extractions_user_idx
  on public.ai_document_extractions (user_id);

create index if not exists ai_document_extractions_document_idx
  on public.ai_document_extractions (document_id, created_at desc);

create index if not exists ai_document_extractions_user_created_idx
  on public.ai_document_extractions (user_id, created_at desc);

-- Alvo da FK composta que `ai_action_proposals` usa abaixo.
alter table public.ai_document_extractions
  drop constraint if exists ai_document_extractions_id_user_uk;
alter table public.ai_document_extractions
  add constraint ai_document_extractions_id_user_uk unique (id, user_id);

alter table public.ai_document_extractions enable row level security;
alter table public.ai_document_extractions force row level security;

drop policy if exists "own rows" on public.ai_document_extractions;
create policy "own rows" on public.ai_document_extractions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists set_ai_document_extractions_updated_at on public.ai_document_extractions;
create trigger set_ai_document_extractions_updated_at
  before update on public.ai_document_extractions
  for each row execute function public.set_updated_at();

comment on table public.ai_document_extractions is
  'Fase 18-D. Uma tentativa de leitura de um documento por IA. `campos` guarda o que o '
  'modelo leu JÁ REBAIXADO pelo servidor; `correcoes` guarda o que o dono mudou, separado, '
  'para a leitura original continuar conferível.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 3. `ai_action_proposals` — A TERCEIRA FORMA DECLARADA
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- Bloco 5 da 18-C criou a segunda (`desfazer`). Esta é a terceira: uma proposta que nasce
-- de um DOCUMENTO, não de uma tool call nem de um botão sobre uma execução.
--
-- ⚠️ `document_extraction_id` NÃO ENTRA NO HASH, pela mesma razão de `undoes_execution_id`:
-- o hash cobre o EFEITO, e o payload já carrega o que vai ser lançado. O vínculo é
-- escrituração, e quem o protege é a FK composta.

alter table public.ai_action_proposals
  add column if not exists document_extraction_id uuid;

alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_extraction_fk;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_extraction_fk
  foreign key (document_extraction_id, user_id)
  references public.ai_document_extractions (id, user_id)
  on delete cascade;

alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_origem_check;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_origem_check
  check (origem in ('ferramenta', 'desfazer', 'documento'));

alter table public.ai_action_proposals
  drop constraint if exists ai_action_proposals_origem_coerente;
alter table public.ai_action_proposals
  add constraint ai_action_proposals_origem_coerente
  check (
    (origem = 'ferramenta'
      and conversation_id is not null
      and run_id is not null
      and tool_call_id is not null
      and undoes_execution_id is null
      and document_extraction_id is null)
    or
    (origem = 'desfazer'
      and conversation_id is null
      and run_id is null
      and tool_call_id is null
      and undoes_execution_id is not null
      and document_extraction_id is null)
    or
    (origem = 'documento'
      and conversation_id is null
      and run_id is null
      and tool_call_id is null
      and undoes_execution_id is null
      and document_extraction_id is not null)
  );

comment on column public.ai_action_proposals.document_extraction_id is
  'Fase 18-D. A extração que originou esta proposta. Obrigatório quando origem = '
  'documento, e proibido nas outras duas formas — o CHECK exige cada forma por inteiro. '
  'NÃO entra no hash do efeito: o payload já carrega o que vai ser lançado.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 4. `ai_begin_extraction_run` — admissão atômica, sem conversa
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- Irmã de `ai_begin_chat_run`, com as MESMAS garantias de segurança e SEM as partes que só
-- existem para o chat (conversa, mensagens, agente escolhido pelo cliente):
--
--   SECURITY INVOKER · SET search_path = '' · advisory lock TRANSACIONAL por usuário
--   auth.uid() lido DENTRO da função e NULL rejeitado
--   reconciliação de runs abandonados ANTES de reservar
--   rate limit e orçamento LIDOS PELO BANCO — o cliente nunca informa limite nem contagem
--
-- ⚠️ `agent_id` é FIXO aqui, não é parâmetro. Uma extração não tem agente escolhível, e
-- recebê-lo do cliente seria dar a ele um campo que não usa para nada — mas que apareceria
-- na auditoria como se fosse uma escolha.

create or replace function public.ai_begin_extraction_run(
  p_document_id              uuid,
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
  c_agent          constant text := 'documento.comprovante';
  c_lease          constant interval := interval '5 minutes';

  v_user           uuid := auth.uid();
  v_now            timestamptz := now();
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

  -- ── 2. Lock TRANSACIONAL por usuário — não sobrevive ao commit ──────────────────────
  --
  -- ⛔ A CHAVE É **IDÊNTICA** À DE `ai_begin_chat_run`, e isso não é reaproveitamento
  -- preguiçoso: é o ponto inteiro do lock. Com um namespace próprio (`ai:begin_extraction:`),
  -- uma extração e uma mensagem de chat simultâneas pegariam locks DIFERENTES, as duas
  -- leriam o mesmo consumo confirmado e as duas passariam no orçamento — que é exatamente
  -- a corrida que este lock existe para impedir. O recurso disputado é o orçamento do
  -- usuário, não a espécie do run.
  perform pg_advisory_xact_lock(hashtextextended('ai:begin_run:' || v_user::text, 0));

  -- ── 3. Recuperação preguiçosa ANTES de reservar ─────────────────────────────────────
  perform public.ai_reconcile_abandoned_runs(20);

  -- ── 4. O documento é DESTE usuário ──────────────────────────────────────────────────
  -- ANTI-ENUMERAÇÃO: "não existe" e "não é seu" caem no mesmo ramo, com o mesmo código.
  if not exists (
    select 1 from public.ai_documents d
     where d.id = p_document_id and d.user_id = v_user
  ) then
    raise exception 'AI_DOCUMENT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- ── 5. A CHAVE. Ler o documento é uma coisa; MANDÁ-LO PARA FORA é outra ─────────────
  --
  -- Conferida AQUI, no banco, além de na Server Action — pelo mesmo motivo que
  -- `ai_begin_chat_run` revalida tudo: um usuário autenticado pode chamar o RPC direto.
  if not exists (
    select 1 from public.ai_user_preferences p
     where p.user_id = v_user
       and p.allow_vision = true
       and p.allow_finance = true
       and p.allow_write_finance = true
  ) then
    raise exception 'AI_VISION_NOT_ALLOWED' using errcode = 'P0001';
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
  -- x <> a, o `if` não dispara e o modelo passaria. (Mesma nota de `ai_begin_chat_run`.)
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
  -- Extração e chat disputam o mesmo limite de propósito: é o mesmo usuário gastando na
  -- mesma conta do mesmo provedor.
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

  -- ── 11. O run. `conversation_id` NULO, `kind = 'extracao'` ──────────────────────────
  insert into public.ai_runs (
    user_id, conversation_id, kind, agent_id, prompt_version, correlation_id,
    selected_provider, selected_model, status,
    last_heartbeat_at, lease_expires_at,
    reserved_cost, reservation_currency, reservation_rate_version, reservation_expires_at
  ) values (
    v_user, null, 'extracao', c_agent, p_prompt_version, v_corr,
    p_selected_provider, p_selected_model, 'reserved',
    v_now, v_now + c_lease,
    p_reserved_cost, 'USD', p_reservation_rate_version,
    v_now + make_interval(secs => p_reservation_ttl_seconds)
  )
  returning id into v_run;

  return query select v_run, v_corr;
end;
$$;

revoke all on function public.ai_begin_extraction_run(uuid, text, text, text, numeric, text, integer) from public;
revoke all on function public.ai_begin_extraction_run(uuid, text, text, text, numeric, text, integer) from anon;
grant execute on function public.ai_begin_extraction_run(uuid, text, text, text, numeric, text, integer) to authenticated;

comment on function public.ai_begin_extraction_run(uuid, text, text, text, numeric, text, integer) is
  'Fase 18-D. Admissão atômica de um run de EXTRAÇÃO (sem conversa). Mesmas garantias de '
  'ai_begin_chat_run: SECURITY INVOKER, search_path vazio, advisory lock transacional, '
  'reconciliação antes de reservar, rate limit e orçamento lidos pelo banco. Confere '
  'allow_vision + allow_finance + allow_write_finance AQUI também, porque um usuário '
  'autenticado pode chamar o RPC direto.';
