-- ══════════════════════════════════════════════════════════════════════════════════════
-- Fase 18-F · Bloco 4 — EXPERIÊNCIAS
--
-- ⛔ NENHUMA TABELA NOVA. Um valor de CHECK e uma função. O panorama não é um registro
-- próprio: ele é a primeira mensagem de uma CONVERSA (§7.3), e conversa já existe desde a
-- 18-A — com busca, com histórico, com exclusão em massa e com o Approval Engine.
--
-- Idempotente.
-- ══════════════════════════════════════════════════════════════════════════════════════

-- ── 1. A QUARTA ESPÉCIE ────────────────────────────────────────────────────────────────
alter table public.ai_runs drop constraint if exists ai_runs_kind_check;
alter table public.ai_runs
  add constraint ai_runs_kind_check
  check (kind in ('chat', 'extracao', 'insight', 'experience'));

-- ⛔ E O CHECK DE COERÊNCIA, QUE É ONDE ESTÁ A ARMADILHA.
--
-- `experience` é a SEGUNDA espécie com conversa (a primeira é `chat`): o panorama nasce como
-- a primeira mensagem de uma conversa normal. Esquecer esta metade faria todo run de
-- experiência falhar no INSERT, DENTRO da transação de admissão — depois de a reserva ter
-- sido calculada — e o erro chegaria à tela como `AI_UNKNOWN`.
alter table public.ai_runs drop constraint if exists ai_runs_kind_coerente;
alter table public.ai_runs
  add constraint ai_runs_kind_coerente
  check (
    (kind = 'chat'       and conversation_id is not null)
    or
    (kind = 'experience' and conversation_id is not null)
    or
    (kind = 'extracao'   and conversation_id is null)
    or
    (kind = 'insight'    and conversation_id is null)
  );

comment on column public.ai_runs.kind is
  'Fase 18-D/18-E/18-F. `chat` = nasceu de uma mensagem. `extracao` = nasceu de um clique em '
  '/ia/comprovantes. `insight` = nasceu de um clique em /ia/insights ou do job automático. '
  '`experience` = nasceu de um atalho de panorama (18-F Bloco 4). `chat` e `experience` TÊM '
  'conversa; `extracao` e `insight` não. O CHECK ai_runs_kind_coerente exige cada forma por '
  'inteiro.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- 2. ai_begin_experience_run — admissão atômica de um run de EXPERIÊNCIA
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- Cópia de `public.ai_begin_chat_run` (20260808100100), com estas trocas e só estas:
--
--   nome                   → ai_begin_experience_run
--   p_agent_id             → p_experiencia (allowlist própria; o agente é derivado dela)
--   p_user_text            → REMOVIDO. O texto sai do CATÁLOGO, no servidor.
--   p_conversation_id      → REMOVIDO. A experiência SEMPRE abre conversa.
--   validação de agente    → allowlist das três experiências
--   chave conferida        → allow_cross_module
--   kind do insert         → 'experience'
--
-- Tudo o mais — SECURITY INVOKER, `set search_path = ''`, o MESMO advisory lock,
-- reconciliação preguiçosa, provedor, credencial, modelo, rate limit, orçamento do dia e do
-- mês, REVOKE/GRANT do rodapé — é IDÊNTICO.
--
-- ⛔ O ADVISORY LOCK É O MESMO DAS OUTRAS TRÊS ESPÉCIES, e não é preguiça: o recurso
-- disputado é o ORÇAMENTO DO DONO, não a espécie do run. Com namespace próprio, um panorama e
-- uma mensagem simultâneos pegariam locks diferentes, leriam o mesmo consumo confirmado e
-- passariam os dois — a corrida que o lock existe para impedir. Foi a lição da 18-D, repetida
-- pela 18-E.

create or replace function public.ai_begin_experience_run(
  p_experiencia              text,
  p_title                    text,
  p_prompt_version           text,
  p_selected_provider        text,
  p_selected_model           text,
  p_reserved_cost            numeric,
  p_reservation_rate_version text,
  p_reservation_ttl_seconds  integer default 300
)
returns table (
  conversation_id      uuid,
  user_message_id      uuid,
  run_id               uuid,
  assistant_message_id uuid,
  correlation_id       uuid
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  c_max_text_len   constant integer := 32000;
  c_lease          constant interval := interval '5 minutes';

  v_user           uuid := auth.uid();
  v_now            timestamptz := now();
  v_agent          text;
  v_allowed        boolean;
  v_conv           uuid;
  v_user_msg       uuid;
  v_run            uuid;
  v_assist_msg     uuid;
  v_corr           uuid;

  v_cfg            public.ai_provider_configs%rowtype;
  v_cred_status    text;

  v_per_minute     integer;
  v_per_hour       integer;
  v_daily_budget   numeric;
  v_monthly_budget numeric;
  v_block          boolean;

  v_count_minute   integer;
  v_count_hour     integer;

  v_day_start      timestamptz;
  v_month_start    timestamptz;
  v_spent          numeric;
  v_reserved       numeric;
begin
  -- ── 0. Endurecimento da própria chamada ──────────────────────────────────────────────
  set local lock_timeout = '3s';
  set local statement_timeout = '5s';

  -- ── 1. Sessão ────────────────────────────────────────────────────────────────────────
  if v_user is null then
    raise exception 'AI_NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  -- ── 2. A experiência é uma das TRÊS — allowlist, nunca lista de proibidos ────────────
  if p_experiencia is null
     or p_experiencia not in ('planejar-dia', 'encerrar-dia', 'planejar-semana') then
    raise exception 'AI_EXPERIENCE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  v_agent := 'experiencias.' || p_experiencia;

  -- ── 3. Advisory lock por usuário (transacional) — A MESMA CHAVE das outras três ──────
  perform pg_advisory_xact_lock(hashtextextended('ai:begin_run:' || v_user::text, 0));

  -- ── 4. Reconcilia reservas vencidas ANTES de reservar de novo ───────────────────────
  perform public.ai_reconcile_abandoned_runs(20);

  -- ── 5. A CHAVE DO MECANISMO, CONFERIDA AQUI TAMBÉM ──────────────────────────────────
  --
  -- Um usuário autenticado pode chamar este RPC direto, sem passar pelo Route Handler.
  --
  -- ⛔ E o que este ponto NÃO confere: as chaves `allow_*` de cada módulo lido. Ele não tem
  -- como — a lista de ferramentas mora no catálogo, em TypeScript. Quem as confere é
  -- `guard.ts`, ferramenta a ferramenta, na execução. Chamar o RPC direto não dá acesso a
  -- leitura nenhuma: dá um run vazio que custa uma chamada ao modelo sem dado algum.
  select p.allow_cross_module into v_allowed
    from public.ai_user_preferences p
   where p.user_id = v_user;

  if not found or not coalesce(v_allowed, false) then
    raise exception 'AI_CROSS_MODULE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  -- ── 6. Validações de entrada ────────────────────────────────────────────────────────
  --
  -- O título vem do CATÁLOGO do servidor, não do cliente — mas o teto continua valendo, pela
  -- mesma razão do item 5.
  if p_title is null or btrim(p_title) = '' then
    raise exception 'AI_MESSAGE_EMPTY' using errcode = 'P0001';
  end if;
  if char_length(p_title) > c_max_text_len then
    raise exception 'AI_MESSAGE_TOO_LONG' using errcode = 'P0001';
  end if;

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

  -- ── 7. Provedor: existe, é DESTE usuário e está ativo ───────────────────────────────
  select * into v_cfg
    from public.ai_provider_configs c
   where c.user_id = v_user
     and c.provider = p_selected_provider;

  if not found or not v_cfg.enabled then
    raise exception 'AI_PROVIDER_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- ── 8. Credencial existe e está utilizável ─────────────────────────────────────────
  select cr.status into v_cred_status
    from public.ai_provider_credentials cr
   where cr.user_id = v_user
     and cr.provider = p_selected_provider;

  if not found or v_cred_status = 'invalida' then
    raise exception 'AI_CREDENTIAL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- ── 9. Modelo: só o que o usuário CONFIGUROU por um caminho já validado ────────────
  --
  -- ⚠️ O `where m is not null` do subselect NÃO é decoração: `x not in (a, NULL)` devolve
  -- NULL quando x <> a, o `if` não dispara e o modelo passaria.
  if p_selected_model is null or p_selected_model not in (
       select m
         from unnest(array[
                v_cfg.default_model, v_cfg.economy_model,
                v_cfg.advanced_model, v_cfg.vision_model
              ]) as m
        where m is not null
     ) then
    raise exception 'AI_MODEL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- ── 10. Preferências: limites LIDOS PELO BANCO ─────────────────────────────────────
  select p.rate_limit_per_minute, p.rate_limit_per_hour,
         p.daily_budget, p.monthly_budget, p.budget_block_on_limit
    into v_per_minute, v_per_hour, v_daily_budget, v_monthly_budget, v_block
    from public.ai_user_preferences p
   where p.user_id = v_user;

  if not found then
    v_per_minute := 10;
    v_per_hour := 120;
    v_daily_budget := null;
    v_monthly_budget := null;
    v_block := true;
  end if;

  -- ── 11. Rate limit — contagem da janela lida AQUI, nunca recebida ──────────────────
  select count(*) into v_count_minute
    from public.ai_runs r
   where r.user_id = v_user
     and r.created_at > v_now - interval '1 minute';

  select count(*) into v_count_hour
    from public.ai_runs r
   where r.user_id = v_user
     and r.created_at > v_now - interval '1 hour';

  if v_count_minute >= v_per_minute or v_count_hour >= v_per_hour then
    raise exception 'AI_RATE_LIMITED' using errcode = 'P0001';
  end if;

  -- ── 12. Orçamento: confirmado + reservas ativas + a nova reserva ──────────────────
  --
  -- O dia e o mês são os de BRASÍLIA, não de UTC: senão o orçamento "vira" às 21h.
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

  -- ── 13. A conversa NOVA. A experiência nunca continua uma conversa existente ──────
  insert into public.ai_conversations (user_id, agent_id, title, last_message_at)
  values (v_user, v_agent, nullif(btrim(p_title), ''), v_now)
  returning ai_conversations.id into v_conv;

  -- ── 14. Mensagem do usuário — o TÍTULO do catálogo, nunca texto do cliente ────────
  insert into public.ai_messages (conversation_id, user_id, role, content, status)
  values (v_conv, v_user, 'user', p_title, 'complete')
  returning ai_messages.id into v_user_msg;

  -- ── 15. O run, já com a reserva financeira e a lease começando AGORA ──────────────
  insert into public.ai_runs (
    user_id, conversation_id, user_message_id,
    kind, agent_id, prompt_version,
    selected_provider, selected_model,
    status, started_at,
    last_heartbeat_at, lease_expires_at,
    reserved_cost, reservation_currency, reservation_rate_version, reservation_expires_at
  ) values (
    v_user, v_conv, v_user_msg,
    'experience', v_agent, p_prompt_version,
    p_selected_provider, p_selected_model,
    'reserved', v_now,
    v_now, v_now + c_lease,
    p_reserved_cost, 'USD', p_reservation_rate_version,
    v_now + make_interval(secs => p_reservation_ttl_seconds)
  )
  returning ai_runs.id, ai_runs.correlation_id into v_run, v_corr;

  -- ── 16. Mensagem do assistente, já em `streaming` ────────────────────────────────
  insert into public.ai_messages (conversation_id, user_id, run_id, role, content, status)
  values (v_conv, v_user, v_run, 'assistant', '', 'streaming')
  returning ai_messages.id into v_assist_msg;

  update public.ai_runs r
     set assistant_message_id = v_assist_msg
   where r.id = v_run and r.user_id = v_user;

  update public.ai_conversations c
     set last_message_at = v_now
   where c.id = v_conv and c.user_id = v_user;

  -- ── 17. Devolve os quatro IDs ────────────────────────────────────────────────────
  return query select v_conv, v_user_msg, v_run, v_assist_msg, v_corr;
end;
$$;

revoke all on function public.ai_begin_experience_run(text, text, text, text, text, numeric, text, integer) from public;
revoke all on function public.ai_begin_experience_run(text, text, text, text, text, numeric, text, integer) from anon;
grant execute on function public.ai_begin_experience_run(text, text, text, text, text, numeric, text, integer) to authenticated;

comment on function public.ai_begin_experience_run(text, text, text, text, text, numeric, text, integer) is
  'Fase 18-F Bloco 4. Admissão atômica de um run de EXPERIÊNCIA — com conversa, como o chat. '
  'Mesmas garantias de ai_begin_chat_run, com o MESMO advisory lock (o recurso disputado é o '
  'orçamento do dono, não a espécie do run). Confere allow_cross_module aqui também, porque um '
  'usuário autenticado pode chamar o RPC direto. O texto da primeira mensagem é o TÍTULO do '
  'catálogo, nunca texto do cliente.';
