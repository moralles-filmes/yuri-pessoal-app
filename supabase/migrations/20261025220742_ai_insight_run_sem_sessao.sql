-- Task 22: preservar a admissão vigente; reconciliação por sessão só no caminho autenticado.
-- Sem alteração de tabelas, assinatura, orçamento, RLS ou marcadores de execução automática.
-- Reversão: restaurar a definição anterior da função, sem alterar dados.
CREATE OR REPLACE FUNCTION public.ai_begin_insight_run(p_modulo text, p_prompt_version text, p_selected_provider text, p_selected_model text, p_reserved_cost numeric, p_reservation_rate_version text, p_reservation_ttl_seconds integer DEFAULT 300, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(run_id uuid, correlation_id uuid)
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
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
  -- ⛔ A SESSÃO SEMPRE VENCE, e a trava real é a RLS do security invoker, não este coalesce.
  v_user      := coalesce(v_session, p_user_id);
  v_automatic := (v_session is null);

  if v_user is null then
    raise exception 'AI_NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;

  if p_modulo is null or p_modulo not in ('financeiro', 'treinos', 'dieta') then
    raise exception 'AI_MODULE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  v_agent := 'insights.' || p_modulo;

  perform pg_advisory_xact_lock(hashtextextended('ai:begin_run:' || v_user::text, 0));

  if auth.uid() is not null then
    perform public.ai_reconcile_abandoned_runs(20);
  end if;

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

  if v_automatic and not coalesce(v_jobs_allowed, false) then
    raise exception 'AI_JOBS_NOT_ALLOWED' using errcode = 'P0001';
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

  if p_selected_model is null or p_selected_model not in (
       select m from unnest(array[
                v_cfg.default_model, v_cfg.economy_model,
                v_cfg.advanced_model, v_cfg.vision_model
              ]) as m
        where m is not null
     ) then
    raise exception 'AI_MODEL_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

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

  select count(*) into v_count_minute
    from public.ai_runs r
   where r.user_id = v_user and r.created_at > v_now - interval '1 minute';

  select count(*) into v_count_hour
    from public.ai_runs r
   where r.user_id = v_user and r.created_at > v_now - interval '1 hour';

  if v_count_minute >= v_per_minute or v_count_hour >= v_per_hour then
    raise exception 'AI_RATE_LIMITED' using errcode = 'P0001';
  end if;

  v_day_start   := date_trunc('day',   v_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_month_start := date_trunc('month', v_now at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';

  -- ⛔ TETO PRÓPRIO DO JOB. Os dois valem: este e o global.
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
$function$;

revoke all on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer, uuid) from public, anon;
grant execute on function public.ai_begin_insight_run(text, text, text, text, numeric, text, integer, uuid) to authenticated, service_role;
