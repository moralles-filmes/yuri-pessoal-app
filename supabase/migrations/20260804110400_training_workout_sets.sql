-- Fase 17-B — Treinos · Configuração POR SÉRIE (quando as séries não são uniformes)
--
-- 4×8-12 com 90s de descanso é o caso comum e cabe inteiro em
-- `training_workout_exercises.default_sets`. Mas "top set pesado + duas back-off", pirâmide e
-- drop set planejado exigem séries DIFERENTES ENTRE SI — e é para isso que esta tabela existe.
--
-- REGRA: se existir AO MENOS UMA linha aqui para o exercício, ela é a verdade e `default_sets`
-- passa a ser só metadado de exibição. Sem linha nenhuma, as séries são uniformes.
--
-- Os dois casos são resolvidos por UMA função pura — `expandPlannedSets`, em
-- `src/lib/training/workout.ts` — que devolve SEMPRE o mesmo formato. A sessão ao vivo (17-C)
-- consome só esse formato e não precisa saber que existem dois jeitos de configurar.
--
-- Os campos repetem os do exercício de propósito: `null` aqui significa "herda do exercício",
-- e é `expandPlannedSets` que resolve a herança num lugar só.

create table if not exists public.training_workout_sets (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid not null references auth.users(id) on delete cascade,

  workout_exercise_id           uuid not null references public.training_workout_exercises(id) on delete cascade,
  set_number                    smallint not null check (set_number >= 1 and set_number <= 30),

  set_type                      text not null default 'trabalho'
                                  check (set_type in ('aquecimento','preparatoria','trabalho','top_set','back_off',
                                                      'drop_set','falha','amrap','isometrica','assistida','personalizada')),

  target_reps_min               smallint check (target_reps_min is null or (target_reps_min >= 0 and target_reps_min <= 1000)),
  target_reps_max               smallint check (target_reps_max is null or (target_reps_max >= 0 and target_reps_max <= 1000)),
  target_duration_seconds       integer  check (target_duration_seconds is null or (target_duration_seconds >= 0 and target_duration_seconds <= 86400)),
  target_distance_m             numeric(10,2) check (target_distance_m is null or target_distance_m >= 0),

  planned_weight_kg             numeric(7,3) check (planned_weight_kg is null or planned_weight_kg >= 0),
  planned_additional_weight_kg  numeric(7,3) check (planned_additional_weight_kg is null or planned_additional_weight_kg >= 0),
  planned_assistance_weight_kg  numeric(7,3) check (planned_assistance_weight_kg is null or planned_assistance_weight_kg >= 0),

  rest_seconds                  integer check (rest_seconds is null or (rest_seconds >= 0 and rest_seconds <= 3600)),
  target_rir                    smallint check (target_rir is null or (target_rir >= 0 and target_rir <= 10)),
  target_rpe                    numeric(3,1) check (target_rpe is null or (target_rpe >= 1 and target_rpe <= 10)),

  is_warmup                     boolean not null default false,
  counts_in_volume              boolean not null default true,
  notes                         text,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  constraint training_workout_sets_reps_range
    check (target_reps_min is null or target_reps_max is null or target_reps_max >= target_reps_min)
);

alter table public.training_workout_sets enable row level security;
alter table public.training_workout_sets force row level security;

drop policy if exists "own rows" on public.training_workout_sets;
create policy "own rows" on public.training_workout_sets
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Duas séries com o mesmo número no mesmo exercício não existem.
create unique index if not exists training_workout_sets_number_idx
  on public.training_workout_sets (workout_exercise_id, set_number);
create index if not exists training_workout_sets_user_idx
  on public.training_workout_sets (user_id);

drop trigger if exists set_training_workout_sets_updated_at on public.training_workout_sets;
create trigger set_training_workout_sets_updated_at
  before update on public.training_workout_sets
  for each row execute function public.set_updated_at();

comment on table public.training_workout_sets is
  'Configuração por série (top set + back-off, pirâmide, drop set). Se existir ao menos uma linha, ela é a verdade e default_sets vira exibição.';
comment on column public.training_workout_sets.rest_seconds is
  'null = herda do exercício. A herança é resolvida em expandPlannedSets (src/lib/training/workout.ts), num lugar só.';
