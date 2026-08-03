-- Fase 16-B — Dieta e Alimentação · Dias de um modelo de semana
--
-- Um dia do MODELO, identificado por (semana do ciclo, dia da semana) — nunca por data.
-- Data concreta só existe em `nutrition_planned_meals.planned_date`, quando o modelo é
-- aplicado a um período.
--
-- `day_kind` ('treino' | 'descanso') é o elo com a meta: um período de meta do tipo
-- `treino_descanso` usa exatamente esta classificação para saber qual alvo vale no dia.
-- NULO = o dia não declara tipo, e a meta cai no escopo genérico.

create table if not exists public.nutrition_plan_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  plan_id     uuid not null references public.nutrition_plans(id) on delete cascade,

  -- Qual semana do ciclo (0 = primeira). Sempre < plans.cycle_weeks; a action valida.
  week_index  smallint not null default 0 check (week_index between 0 and 7),
  -- 0 = domingo … 6 = sábado. Mesma convenção de `habits.weekdays` (Fase 10).
  weekday     smallint not null check (weekday between 0 and 6),

  label       text,
  day_kind    text check (day_kind is null or day_kind in ('treino','descanso')),
  notes       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.nutrition_plan_days enable row level security;
alter table public.nutrition_plan_days force row level security;

drop policy if exists "own rows" on public.nutrition_plan_days;
create policy "own rows" on public.nutrition_plan_days
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists nutrition_plan_days_slot_idx
  on public.nutrition_plan_days (plan_id, week_index, weekday);
create index if not exists nutrition_plan_days_user_idx
  on public.nutrition_plan_days (user_id);

drop trigger if exists set_nutrition_plan_days_updated_at on public.nutrition_plan_days;
create trigger set_nutrition_plan_days_updated_at
  before update on public.nutrition_plan_days
  for each row execute function public.set_updated_at();

comment on table public.nutrition_plan_days is
  'Dia de um modelo de semana, por (week_index, weekday). Nunca tem data — data só existe na refeição materializada.';
comment on column public.nutrition_plan_days.day_kind is
  'Elo com a meta do tipo treino_descanso. NULO = sem classificação, meta cai no escopo genérico.';
