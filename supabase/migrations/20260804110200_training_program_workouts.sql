-- Fase 17-B — Treinos · Quais treinos compõem um programa, em que ordem
--
-- POR QUE UMA TABELA DE JUNÇÃO E NÃO UMA FK `workout.program_id`:
--
--  1. Um treino pode existir SEM programa (treino avulso).
--  2. Um mesmo treino pode ser reaproveitado por mais de um programa ("Treino de costas" no
--     ABC e no Upper/Lower).
--
-- Uma FK direta obrigaria a duplicar o treino em cada programa — e duplicar modelo é
-- exatamente o que faz a intenção do usuário divergir entre duas telas.
--
-- `suggested_weekdays` é SUGESTÃO do programa, não planejamento. O planejamento real, com
-- data, mora em `training_scheduled_workouts` — planejado ≠ modelo, mesma disciplina de
-- "planejado ≠ consumido" da Dieta.

create table if not exists public.training_program_workouts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,

  program_id          uuid not null references public.training_programs(id) on delete cascade,
  workout_id          uuid not null references public.training_workouts(id) on delete cascade,

  position            integer not null default 0,
  label               text,

  -- 0 = domingo … 6 = sábado (mesma convenção de habits.weekdays e Date.getUTCDay()).
  suggested_weekdays  smallint[],

  notes               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint training_program_workouts_weekdays_range
    check (suggested_weekdays is null or suggested_weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

alter table public.training_program_workouts enable row level security;
alter table public.training_program_workouts force row level security;

drop policy if exists "own rows" on public.training_program_workouts;
create policy "own rows" on public.training_program_workouts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists training_program_workouts_pair_idx
  on public.training_program_workouts (program_id, workout_id);
create index if not exists training_program_workouts_user_idx
  on public.training_program_workouts (user_id);
create index if not exists training_program_workouts_program_idx
  on public.training_program_workouts (program_id, position);
create index if not exists training_program_workouts_workout_idx
  on public.training_program_workouts (workout_id);

drop trigger if exists set_training_program_workouts_updated_at on public.training_program_workouts;
create trigger set_training_program_workouts_updated_at
  before update on public.training_program_workouts
  for each row execute function public.set_updated_at();

comment on table public.training_program_workouts is
  'Composição do programa. Junção (e não FK direta) porque um treino pode ser avulso ou pertencer a mais de um programa.';
comment on column public.training_program_workouts.suggested_weekdays is
  'Sugestão do programa (0=domingo…6=sábado). O planejamento com DATA vive em training_scheduled_workouts.';
