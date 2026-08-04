-- Fase 16-E — Módulo central de medidas corporais · METAS
--
-- Meta corporal é DECISÃO DO USUÁRIO. O sistema não sugere alvo, não classifica IMC, não fala
-- em "peso ideal" e não recomenda direção — a coluna `direction` existe porque só o usuário
-- sabe se quer reduzir, aumentar ou manter aquela medida (invariante "sem prescrição").
--
-- ══ O QUE É GRAVADO E O QUE É DERIVADO ══
-- GRAVADO: 'ativa', 'pausada', 'concluida', 'cancelada' — os quatro são decisão explícita.
-- DERIVADO na leitura (`src/lib/body/measurements.ts`): "atingida" e "prazo vencido" saem de
-- valor atual × alvo × prazo, com `hoje` injetado. Mesma regra de `nutrition_diary_meals`
-- (o 'pendente' nem existe no CHECK) e de `training_scheduled_workouts`.
--
-- `start_value` NULO significa "use a primeira medida a partir de `starts_on`" — e não zero.
-- Um alvo de 0 e a ausência de valor inicial são coisas diferentes (regra 1 do módulo Dieta,
-- aplicada aqui).
--
-- NÃO existe unique de "uma meta ativa por tipo": querer uma meta de curto e outra de longo
-- prazo para a mesma medida é legítimo. Qual vale numa data é derivado com desempate
-- determinístico, como `goalPeriodForDate` faz com as metas nutricionais (16-B).
--
-- Idempotente. RLS + FORCE RLS, índice em user_id e trigger de updated_at.

create table if not exists public.body_measurement_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Cascade (e não restrict como em body_measurements): meta sem tipo não significa nada,
  -- enquanto medição sem tipo seria perda de histórico.
  type_id      uuid not null references public.body_measurement_types(id) on delete cascade,
  -- Escolha do usuário. O sistema NUNCA a define nem a sugere.
  direction    text not null check (direction in ('reduzir', 'aumentar', 'manter')),
  -- NULO = "use a primeira medida do período". Nunca zero. Ver cabeçalho.
  start_value  numeric(10,3),
  target_value numeric(10,3) not null check (target_value >= 0),
  unit         text not null,
  starts_on    date not null,
  -- Prazo opcional: meta sem data não vence, só acompanha.
  target_date  date,
  status       text not null default 'ativa'
                 check (status in ('ativa', 'pausada', 'concluida', 'cancelada')),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint body_measurement_goals_period_ck
    check (target_date is null or target_date >= starts_on)
);

comment on table public.body_measurement_goals is
  'Metas corporais DO USUARIO. O sistema nunca sugere alvo nem direcao. "Atingida" e "prazo vencido" sao DERIVADOS na leitura; so ativa/pausada/concluida/cancelada sao gravados.';
comment on column public.body_measurement_goals.start_value is
  'NULO = usar a primeira medida a partir de starts_on. Nunca zero.';

alter table public.body_measurement_goals enable row level security;
alter table public.body_measurement_goals force row level security;

drop policy if exists "own rows" on public.body_measurement_goals;
create policy "own rows" on public.body_measurement_goals
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists body_measurement_goals_user_idx
  on public.body_measurement_goals (user_id);
create index if not exists body_measurement_goals_user_type_idx
  on public.body_measurement_goals (user_id, type_id, starts_on desc);

drop trigger if exists set_body_measurement_goals_updated_at on public.body_measurement_goals;
create trigger set_body_measurement_goals_updated_at
  before update on public.body_measurement_goals
  for each row execute function public.set_updated_at();