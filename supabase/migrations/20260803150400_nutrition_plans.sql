-- Fase 16-B — Dieta e Alimentação · Planos alimentares (modelos de semana)
--
-- Um plano é um MODELO reutilizável: "minha semana padrão", "semana de treino pesado".
-- Ele descreve dias (nutrition_plan_days) com refeições (nutrition_planned_meals), sem data.
--
-- APLICAR um modelo a um período MATERIALIZA refeições planejadas com data concreta — não
-- cria vínculo vivo. É deliberado: se o modelo mudasse retroativamente o que já foi
-- planejado (e possivelmente consumido), o histórico deixaria de ser confiável, que é
-- exatamente o problema que esta subfase existe para evitar.
--
-- A recorrência é o `cycle_weeks`: um modelo de 1 semana repete toda semana; um de 2 semanas
-- alterna semana A / semana B. A aritmética é pura e testada
-- (src/lib/nutrition/plan-recurrence.ts), no mesmo estilo de `src/lib/todo/recurrence.ts`.

create table if not exists public.nutrition_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  name          text not null,
  description   text,

  -- Quantas semanas o ciclo tem antes de repetir. 1 = toda semana igual.
  cycle_weeks   smallint not null default 1 check (cycle_weeks between 1 and 8),
  -- Dia em que a semana do ciclo começa (0=domingo..6=sábado). Segunda por padrão, como no
  -- resto do app (a Agenda e os relatórios usam semana começando na segunda).
  week_start_day smallint not null default 1 check (week_start_day between 0 and 6),

  -- Data-âncora do ciclo: a partir dela se calcula em qual semana do ciclo uma data cai.
  -- NULO = o modelo ainda não foi ancorado (só existe como modelo).
  anchor_date   date,

  is_active     boolean not null default true,
  -- O modelo sugerido por padrão ao planejar. No máximo um por usuário (índice parcial).
  is_default    boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.nutrition_plans enable row level security;
alter table public.nutrition_plans force row level security;

drop policy if exists "own rows" on public.nutrition_plans;
create policy "own rows" on public.nutrition_plans
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists nutrition_plans_user_idx
  on public.nutrition_plans (user_id);
create index if not exists nutrition_plans_user_active_idx
  on public.nutrition_plans (user_id, is_active);
create unique index if not exists nutrition_plans_user_default_idx
  on public.nutrition_plans (user_id) where is_default;
create unique index if not exists nutrition_plans_user_name_idx
  on public.nutrition_plans (user_id, lower(name));

drop trigger if exists set_nutrition_plans_updated_at on public.nutrition_plans;
create trigger set_nutrition_plans_updated_at
  before update on public.nutrition_plans
  for each row execute function public.set_updated_at();

comment on table public.nutrition_plans is
  'Modelo de semana reutilizável. Aplicar a um período MATERIALIZA refeições com data — sem vínculo vivo, para o modelo nunca reescrever o passado.';
comment on column public.nutrition_plans.cycle_weeks is
  'Semanas do ciclo antes de repetir. 1 = toda semana igual; 2 = alterna A/B. Cálculo puro em src/lib/nutrition/plan-recurrence.ts.';
