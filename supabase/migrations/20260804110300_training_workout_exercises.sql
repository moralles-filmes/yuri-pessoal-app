-- Fase 17-B — Treinos · Exercício dentro do treino-modelo
--
-- Esta é a linha que a sessão (17-C) vai CONGELAR. Tudo que está aqui é INTENÇÃO planejada:
-- quantas séries, que faixa de repetições, que carga, quanto descanso, que dificuldade alvo.
-- Nada aqui é execução.
--
-- A CARGA PLANEJADA TEM TRÊS COLUNAS, E ISSO NÃO É REDUNDÂNCIA:
--
--   planned_weight_kg              → carga na barra/máquina        (peso_reps, isometria…)
--   planned_additional_weight_kg   → carga EXTRA sobre o corpo     (paralelas com cinto)  → SOMA
--   planned_assistance_weight_kg   → peso de ASSISTÊNCIA           (barra assistida)      → SUBTRAI
--
-- Guardar os três num campo só obrigaria cada tela a reinterpretar o sinal a partir do
-- `tracking_type`, e uma delas erraria — fazendo "progresso" aparecer justamente quando o
-- usuário está regredindo. Qual campo é pedido continua saindo de `src/lib/training/tracking.ts`,
-- a ÚNICA matriz de medição do módulo.
--
-- `exercise_id` é `on delete restrict` DE PROPÓSITO: excluir um exercício que está em um
-- treino não pode remover o exercício do treino em silêncio. A action confere antes e devolve
-- em pt-BR quais treinos usam aquele exercício.
--
-- `superset_group` (A, B, C…) agrupa exercícios que compartilham o bloco. A CONTIGUIDADE é
-- validada em `src/lib/training/workout.ts` (função pura, testada) e bloqueada na interface —
-- um superset furado geraria uma ordem impossível na sessão ao vivo.

create table if not exists public.training_workout_exercises (
  id                            uuid primary key default gen_random_uuid(),
  user_id                       uuid not null references auth.users(id) on delete cascade,

  workout_id                    uuid not null references public.training_workouts(id) on delete cascade,
  exercise_id                   uuid not null references public.training_exercises(id) on delete restrict,

  position                      integer not null default 0,

  -- Caso comum: séries uniformes. Quando o usuário precisa de séries diferentes entre si,
  -- cada série ganha uma linha em training_workout_sets e ESTA coluna vira só exibição.
  default_sets                  smallint not null default 3 check (default_sets >= 1 and default_sets <= 30),

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

  set_type                      text not null default 'trabalho'
                                  check (set_type in ('aquecimento','preparatoria','trabalho','top_set','back_off',
                                                      'drop_set','falha','amrap','isometrica','assistida','personalizada')),
  technique                     text
                                  check (technique is null or technique in ('superset','bi_set','tri_set','circuito','drop_set',
                                                                            'rest_pause','cluster','piramide_crescente',
                                                                            'piramide_decrescente','serie_unilateral','personalizada')),

  superset_group                text check (superset_group is null or superset_group ~ '^[A-Z]$'),

  is_warmup                     boolean not null default false,
  counts_in_volume              boolean not null default true,

  increment_kg                  numeric(6,3) check (increment_kg is null or increment_kg > 0),
  tempo                         text,
  notes                         text,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  constraint training_workout_exercises_reps_range
    check (target_reps_min is null or target_reps_max is null or target_reps_max >= target_reps_min)
);

alter table public.training_workout_exercises enable row level security;
alter table public.training_workout_exercises force row level security;

drop policy if exists "own rows" on public.training_workout_exercises;
create policy "own rows" on public.training_workout_exercises
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_workout_exercises_user_idx
  on public.training_workout_exercises (user_id);
create index if not exists training_workout_exercises_workout_idx
  on public.training_workout_exercises (workout_id, position);
create index if not exists training_workout_exercises_exercise_idx
  on public.training_workout_exercises (exercise_id);

drop trigger if exists set_training_workout_exercises_updated_at on public.training_workout_exercises;
create trigger set_training_workout_exercises_updated_at
  before update on public.training_workout_exercises
  for each row execute function public.set_updated_at();

comment on table public.training_workout_exercises is
  'Exercício do treino-modelo: INTENÇÃO planejada. A sessão (17-C) congela isto em snapshot e nunca lê esta tabela para renderizar o passado.';
comment on column public.training_workout_exercises.planned_assistance_weight_kg is
  'Peso de ASSISTÊNCIA — SUBTRAI carga (barra assistida). Nunca somar: inverteria o sinal do progresso.';
comment on column public.training_workout_exercises.planned_additional_weight_kg is
  'Carga ADICIONAL sobre o peso corporal — SOMA (paralelas com cinto).';
comment on column public.training_workout_exercises.default_sets is
  'Séries uniformes. Se existir ao menos uma linha em training_workout_sets, ela é a verdade e isto vira só exibição.';
comment on column public.training_workout_exercises.superset_group is
  'Bloco de superset (A, B, C…). A contiguidade é validada em src/lib/training/workout.ts e bloqueada na interface.';
