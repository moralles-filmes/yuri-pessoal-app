-- Fase 18-A — Inteligência Artificial · M2: admissão ATÔMICA de um run de chat.
--
-- Exige a M1 aplicada (referencia as 7 tabelas). Ordem estritamente M1 → M2.
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ 18-B: `create or replace function public.ai_begin_chat_run` INTEIRA, copiada da 18-A. ║
-- ║ A ÚNICA mudança é a checagem do agente (item 18-A, linhas 241-244 do arquivo original) ║
-- ║ trocada pela chamada a `public.ai_agent_is_allowed(p_agent_id)`, criada em             ║
-- ║ `20260808100000_ai_tool_audit.sql`. Tudo o mais — SECURITY INVOKER, search_path,       ║
-- ║ advisory lock, REVOKE/GRANT do rodapé — é IDÊNTICO. `ai_reconcile_abandoned_runs` vai  ║
-- ║ junto, sem alteração, porque as duas funções vivem no mesmo arquivo desde a 18-A.      ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ╔══════════════════════════════════════════════════════════════════════════════════════╗
-- ║ POR QUE UMA FUNÇÃO, E NÃO QUATRO INSERTS NA APLICAÇÃO                                 ║
-- ║                                                                                       ║
-- ║ Verificar limite e inserir as linhas em chamadas independentes produz, na primeira    ║
-- ║ falha de rede: run sem mensagem, mensagem do usuário sem run, mensagem do assistente  ║
-- ║ nunca criada, conversa criada pela metade e — o pior — reserva financeira presa.      ║
-- ║ Aqui é uma transação: tudo ou nada.                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════════════════╝
--
-- ═══════════════════════ A SEGURANÇA NÃO DEPENDE DO ROUTE HANDLER ═══════════════════════
--
-- Um usuário autenticado pode chamar este RPC direto, sem passar por `/api/ia/chat`. Então a
-- função valida SOZINHA: sessão, propriedade de todos os IDs recebidos, agente permitido,
-- provedor ativo, credencial utilizável, modelo configurado, tamanho da mensagem, reserva
-- coerente, rate limit e orçamento. Nada disso é aceito do cliente.
--
-- `SECURITY INVOKER` é essencial: a função roda COMO O CHAMADOR, então a RLS se aplica de
-- verdade. Com `SECURITY DEFINER` a RLS seria contornada e `user_id` viraria parâmetro
-- confiável — exatamente o que não queremos.
--
-- ═══════════════════════ ANTI-ENUMERAÇÃO ═══════════════════════
--
-- "Conversa não existe" e "conversa não é sua" devolvem O MESMO código. Códigos distintos
-- transformariam a função num oráculo de existência de IDs.
--
-- ═══════════════════════ O QUE O LOCK COBRE, E SÓ ISSO ═══════════════════════
--
--   BEGIN
--     pg_advisory_xact_lock(...)   ← entra aqui
--     reconcilia reservas vencidas do próprio usuário
--     valida rate limit · orçamento · reserva
--     cria conversa + mensagem do usuário + run + mensagem do assistente
--   COMMIT                         ← sai aqui, automaticamente
--   ─────────────────────────────────────────────────────────────
--   (fora de qualquer transação e de qualquer lock)
--     decifra credencial → chama o provedor → streaming → heartbeat → grava tentativa
--
-- NENHUM lock e NENHUMA transação permanecem abertos durante a chamada ao provedor ou o
-- streaming. Manter transação aberta durante streaming prenderia conexão do pool por minutos
-- e é o jeito mais fácil de derrubar o banco inteiro.
--
-- O lock é `pg_advisory_xact_lock` (transacional), NUNCA `pg_advisory_lock` (de sessão): num
-- pool de conexões, lock de sessão sobrevive à requisição e vaza para a próxima que pegar
-- aquela conexão.
--
-- COLISÃO DE HASH: 64 bits. Uma colisão faria dois usuários serializarem a ADMISSÃO entre si
-- — perda de paralelismo, nunca de correção, porque o lock é mutex e não carrega dado. Em
-- sistema single-user o efeito prático é nulo.
--
-- DOIS CHATS SIMULTÂNEOS DO MESMO USUÁRIO PODEM, SIM: eles serializam apenas na admissão
-- (milissegundos); depois do commit os dois streams correm em paralelo.
--
-- Idempotente.

-- ══════════════════════════════════════════════════════════════════════════════════════
-- Reconciliação preguiçosa — do PRÓPRIO usuário, sob RLS, sem privilégio
-- ══════════════════════════════════════════════════════════════════════════════════════
--
-- Gatilhos: abrir /ia · listar conversas · ANTES de reservar novo run (dentro da própria
-- transação de admissão, sob o lock). É esta última que realmente protege: um run travado
-- não consegue bloquear a próxima conversa nem prender orçamento, porque é reconciliado na
-- mesma transação que admitiria a nova.
--
-- O UPDATE é condicional a status E heartbeat. Se o run bateu heartbeat entre a leitura e a
-- escrita, o WHERE não casa e nada acontece — é assim que a varredura nunca mata um run
-- legítimo, e é assim que `finally` e reconciliador nunca se contradizem.

create or replace function public.ai_reconcile_abandoned_runs(p_limit integer default 20)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_deadline timestamptz := now() - interval '5 minutes';
  v_ids      uuid[];
  v_count    integer := 0;
begin
  if v_user is null then
    raise exception 'AI_NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 200 then
    p_limit := 20;
  end if;

  -- Reivindica atomicamente: quem chegar primeiro leva as linhas; o segundo não casa o WHERE.
  with claimed as (
    update public.ai_runs r
       set status                  = 'failed',
           error_code              = 'ABANDONED',
           error_message_sanitized = 'Execução encerrada por inatividade (lease vencida).',
           completed_at            = now()
     where r.id in (
             select r2.id
               from public.ai_runs r2
              where r2.user_id = v_user
                and r2.status in ('reserved','streaming')
                and r2.last_heartbeat_at < v_deadline
              order by r2.last_heartbeat_at asc
              limit p_limit
              for update skip locked
           )
       and r.user_id = v_user
       and r.status in ('reserved','streaming')
       and r.last_heartbeat_at < v_deadline
    returning r.id
  )
  select array_agg(claimed.id) into v_ids from claimed;

  if v_ids is null or cardinality(v_ids) = 0 then
    return 0;
  end if;

  v_count := cardinality(v_ids);

  -- A tentativa presa vira `failed` com custo NULO: o provedor pode ter consumido algo, e
  -- inventar 0 seria mentira. `usage_availability` registra a ausência explicitamente.
  update public.ai_usage_events e
     set status             = 'failed',
         error_code         = 'ABANDONED',
         completed_at       = now(),
         usage_availability = e.usage_availability
                              || '{"reason":"run_abandonado","input_tokens":"unavailable","output_tokens":"unavailable"}'::jsonb
   where e.user_id = v_user
     and e.run_id = any(v_ids)
     and e.status = 'started';

  update public.ai_messages m
     set status = 'failed'
   where m.user_id = v_user
     and m.run_id = any(v_ids)
     and m.status = 'streaming';

  return v_count;
end;
$$;

revoke all on function public.ai_reconcile_abandoned_runs(integer) from public;
revoke all on function public.ai_reconcile_abandoned_runs(integer) from anon;
grant execute on function public.ai_reconcile_abandoned_runs(integer) to authenticated;

comment on function public.ai_reconcile_abandoned_runs(integer) is
  'Recuperação PREGUIÇOSA, escopo do próprio usuário, sob RLS. UPDATE condicional a status E heartbeat: nunca fecha run legítimo, e reexecutar é no-op.';

-- ══════════════════════════════════════════════════════════════════════════════════════
-- ai_begin_chat_run — admissão atômica
-- ══════════════════════════════════════════════════════════════════════════════════════

create or replace function public.ai_begin_chat_run(
  p_conversation_id          uuid,
  p_agent_id                 text,
  p_prompt_version           text,
  p_user_text                text,
  p_selected_provider        text,
  p_selected_model           text,
  p_reserved_cost            numeric,
  p_reservation_rate_version text,
  p_reservation_ttl_seconds  integer default 300,
  p_title                    text default null
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
-- Os nomes das colunas de saída (`conversation_id`, `run_id`, …) também são variáveis do
-- PL/pgSQL. Sem esta diretiva, uma referência ambígua num INSERT/UPDATE resolveria para a
-- VARIÁVEL — e a variável está vazia até o fim. Com `use_column`, coluna vence; as leituras
-- de valor usam os locais `v_*`, que não colidem com nada.
#variable_conflict use_column
declare
  -- Backstop do banco. O limite REAL da mensagem é aplicado no Route Handler (menor); este
  -- aqui existe para o caminho que não passa por ele.
  c_max_text_len   constant integer := 32000;
  c_lease          constant interval := interval '5 minutes';

  v_user           uuid := auth.uid();
  v_now            timestamptz := now();
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
  -- Timeout do lock vira 429 (concorrência), não 500 (falha). O rollback libera o advisory
  -- lock automaticamente, por ele ser transacional.
  set local lock_timeout = '3s';
  set local statement_timeout = '5s';

  -- ── 1. Sessão ────────────────────────────────────────────────────────────────────────
  if v_user is null then
    raise exception 'AI_NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  -- ── 2. Advisory lock por usuário (transacional) ──────────────────────────────────────
  perform pg_advisory_xact_lock(hashtextextended('ai:begin_run:' || v_user::text, 0));

  -- ── 3. Reconcilia reservas vencidas ANTES de reservar de novo ────────────────────────
  perform public.ai_reconcile_abandoned_runs(20);

  -- ── 4. Validações de entrada (nenhuma depende do Route Handler) ──────────────────────
  if p_user_text is null or btrim(p_user_text) = '' then
    raise exception 'AI_MESSAGE_EMPTY' using errcode = 'P0001';
  end if;
  if char_length(p_user_text) > c_max_text_len then
    raise exception 'AI_MESSAGE_TOO_LONG' using errcode = 'P0001';
  end if;

  -- 18-B: a lista saiu daqui e virou `public.ai_agent_is_allowed`, para as próximas
  -- subfases não precisarem reescrever esta função inteira a cada agente novo.
  if not public.ai_agent_is_allowed(p_agent_id) then
    raise exception 'AI_AGENT_NOT_ALLOWED' using errcode = 'P0001';
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

  -- ── 5. Provedor: existe, é DESTE usuário e está ativo ────────────────────────────────
  select * into v_cfg
    from public.ai_provider_configs c
   where c.user_id = v_user
     and c.provider = p_selected_provider;

  if not found or not v_cfg.enabled then
    raise exception 'AI_PROVIDER_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- ── 6. Credencial existe e está utilizável ───────────────────────────────────────────
  select cr.status into v_cred_status
    from public.ai_provider_credentials cr
   where cr.user_id = v_user
     and cr.provider = p_selected_provider;

  if not found or v_cred_status = 'invalida' then
    raise exception 'AI_CREDENTIAL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- ── 7. Modelo: só o que o usuário CONFIGUROU por um caminho já validado ──────────────
  -- O catálogo de modelos é estático e vive em `src/lib/ai/core/models.ts` — o banco não o
  -- conhece. O que o banco garante é que o modelo pedido é um dos que a action de
  -- configuração gravou, e essa action valida contra o catálogo. Assim, quem chama o RPC
  -- direto não consegue inventar um `model_id` arbitrário.
  --
  -- ⚠️ O `where m is not null` do subselect NÃO é decoração: `x not in (a, NULL)` devolve
  -- NULL quando x <> a, o `if` não dispara e o modelo passaria. Filtrar os nulos antes é o
  -- que faz esta checagem valer alguma coisa.
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

  -- ── 8. Preferências: limites LIDOS PELO BANCO ───────────────────────────────────────
  select p.rate_limit_per_minute, p.rate_limit_per_hour,
         p.daily_budget, p.monthly_budget, p.budget_block_on_limit
    into v_per_minute, v_per_hour, v_daily_budget, v_monthly_budget, v_block
    from public.ai_user_preferences p
   where p.user_id = v_user;

  if not found then
    -- Padrões conservadores quando o usuário ainda não tem linha de preferências.
    v_per_minute := 10;
    v_per_hour := 120;
    v_daily_budget := null;
    v_monthly_budget := null;
    v_block := true;
  end if;

  -- ── 9. Rate limit — contagem da janela lida AQUI, nunca recebida ────────────────────
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

  -- ── 10. Orçamento: confirmado + reservas ativas + a nova reserva ────────────────────
  --
  --   consumo = Σ custo das tentativas de runs TERMINAIS
  --           + Σ reserva dos runs NÃO-TERMINAIS com reserva não expirada
  --
  -- Todo run pertence a EXATAMENTE UM dos dois somatórios. Enquanto o run vive, só a reserva
  -- conta — mesmo que a tentativa 1 já tenha custo gravado —, e isso é seguro porque a
  -- reserva cobre o pior caso permitido (tarifa do modelo mais caro da cadeia autorizada).
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

  -- ── 11. Conversa: valida a existente ou cria ────────────────────────────────────────
  if p_conversation_id is not null then
    -- ANTI-ENUMERAÇÃO: "não existe" e "não é sua" caem no MESMO ramo, com o mesmo código.
    -- A RLS já esconde a linha alheia; o `user_id` explícito garante isso mesmo se a policy
    -- for afrouxada um dia por engano.
    select c.id into v_conv
      from public.ai_conversations c
     where c.id = p_conversation_id
       and c.user_id = v_user
       and c.status = 'ativa';

    if not found then
      raise exception 'AI_CONVERSATION_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
  else
    insert into public.ai_conversations (user_id, agent_id, title, last_message_at)
    values (v_user, p_agent_id, nullif(btrim(coalesce(p_title, '')), ''), v_now)
    returning ai_conversations.id into v_conv;
  end if;

  -- ── 12. Mensagem do usuário ────────────────────────────────────────────────────────
  insert into public.ai_messages (conversation_id, user_id, role, content, status)
  values (v_conv, v_user, 'user', p_user_text, 'complete')
  returning ai_messages.id into v_user_msg;

  -- ── 13. O run, já com a reserva financeira e a lease começando AGORA ────────────────
  insert into public.ai_runs (
    user_id, conversation_id, user_message_id,
    agent_id, prompt_version,
    selected_provider, selected_model,
    status, started_at,
    last_heartbeat_at, lease_expires_at,
    reserved_cost, reservation_currency, reservation_rate_version, reservation_expires_at
  ) values (
    v_user, v_conv, v_user_msg,
    p_agent_id, p_prompt_version,
    p_selected_provider, p_selected_model,
    'reserved', v_now,
    v_now, v_now + c_lease,
    p_reserved_cost, 'USD', p_reservation_rate_version,
    v_now + make_interval(secs => p_reservation_ttl_seconds)
  )
  returning ai_runs.id, ai_runs.correlation_id into v_run, v_corr;

  -- ── 14. Mensagem do assistente, já em `streaming` ──────────────────────────────────
  insert into public.ai_messages (conversation_id, user_id, run_id, role, content, status)
  values (v_conv, v_user, v_run, 'assistant', '', 'streaming')
  returning ai_messages.id into v_assist_msg;

  update public.ai_runs r
     set assistant_message_id = v_assist_msg
   where r.id = v_run and r.user_id = v_user;

  update public.ai_conversations c
     set last_message_at = v_now
   where c.id = v_conv and c.user_id = v_user;

  -- ── 15. Devolve os quatro IDs ──────────────────────────────────────────────────────
  return query select v_conv, v_user_msg, v_run, v_assist_msg, v_corr;
end;
$$;

revoke all on function public.ai_begin_chat_run(uuid, text, text, text, text, text, numeric, text, integer, text) from public;
revoke all on function public.ai_begin_chat_run(uuid, text, text, text, text, text, numeric, text, integer, text) from anon;
grant execute on function public.ai_begin_chat_run(uuid, text, text, text, text, text, numeric, text, integer, text) to authenticated;

comment on function public.ai_begin_chat_run(uuid, text, text, text, text, text, numeric, text, integer, text) is
  'Admissão ATÔMICA de um run de chat (18-A). SECURITY INVOKER: roda como o chamador, então a RLS vale de verdade e user_id NUNCA é parâmetro. Advisory lock TRANSACIONAL por usuário serializa só a admissão — o commit acontece ANTES de qualquer chamada externa.';
