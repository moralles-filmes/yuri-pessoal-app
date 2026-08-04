-- Fase 17-C — Treinos · Exercício DAQUELA sessão (cópia histórica)
--
-- Cada linha é uma CÓPIA do exercício no momento em que a sessão começou (ou em que o usuário
-- acrescentou o exercício durante o treino). O nome, o tipo de acompanhamento, a lateralidade,
-- o grupo muscular e as séries planejadas ficam gravados AQUI — não são lidos do catálogo.
--
-- `exercise_id` e `workout_exercise_id` são `on delete set null`: referência informativa. Se o
-- exercício for excluído do catálogo, esta linha continua legível, com o nome congelado.
--
-- ═════════════════ ORDEM PLANEJADA × ORDEM EXECUTADA ═════════════════
--
-- `planned_position` NUNCA muda — é a ordem com que o treino foi planejado.
-- `executed_position` é reescrita quando o usuário reordena durante a sessão.
--
-- As séries pertencem ao EXERCÍCIO (`session_exercise_id`), não à posição. É isso que garante
-- que reordenar, pular, voltar depois ou mandar para o fim não perca nenhuma série registrada.
--
-- ═════════════════ STATUS: FATO GRAVADO × DERIVAÇÃO ═════════════════
--
-- Aqui só entra DECISÃO do usuário: `pendente`, `ativo`, `pulado`, `substituido`.
-- **`parcial` e `concluido` NÃO são graváveis** — nascem da contagem das séries, em
-- `deriveExerciseStatus` (session-machine.ts). Gravá-los criaria uma segunda verdade que
-- discordaria das séries no primeiro "desfazer".

create table if not exists public.training_session_exercises (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  session_id                  uuid not null references public.training_sessions(id) on delete cascade,

  -- Referências INFORMATIVAS.
  exercise_id                 uuid references public.training_exercises(id) on delete set null,
  workout_exercise_id         uuid references public.training_workout_exercises(id) on delete set null,

  planned_position            smallint not null default 0,
  executed_position           smallint not null default 0,

  status                      text not null default 'pendente'
                                check (status in ('pendente','ativo','pulado','substituido')),

  -- ═══════════ SNAPSHOT ═══════════
  exercise_name_snapshot      text not null,
  tracking_type               text not null
                                check (tracking_type in ('peso_reps','peso_corporal_reps','peso_corporal_adicional',
                                                         'peso_corporal_assistido','duracao','distancia_duracao',
                                                         'calorias','reps_sem_carga','isometria','lado_a_lado',
                                                         'personalizado')),
  laterality                  text not null default 'bilateral'
                                check (laterality in ('bilateral','unilateral_alternado','unilateral_simultaneo')),
  muscle_group_snapshot       text,
  equipment_snapshot          text,
  movement_pattern_snapshot   text,

  superset_group              text check (superset_group is null or superset_group ~ '^[A-Z]$'),
  technique                   text
                                check (technique is null or technique in ('superset','bi_set','tri_set','circuito','drop_set',
                                                                          'rest_pause','cluster','piramide_crescente',
                                                                          'piramide_decrescente','serie_unilateral','personalizada')),

  is_warmup                   boolean not null default false,
  counts_in_volume            boolean not null default true,

  rest_seconds                integer check (rest_seconds is null or (rest_seconds >= 0 and rest_seconds <= 3600)),
  increment_kg                numeric(6,3) check (increment_kg is null or increment_kg > 0),

  notes                       text,
  skip_reason                 text,

  -- Quando este exercício ENTROU no lugar de outro (o substituído continua na sessão).
  replaced_session_exercise_id uuid references public.training_session_exercises(id) on delete set null,
  /* Exercício acrescentado durante a sessão (não estava no modelo). Marcado para a 17-D
     saber que a execução divergiu do planejado sem precisar comparar listas. */
  is_extra                    boolean not null default false,

  started_at                  timestamptz,
  ended_at                    timestamptz,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.training_session_exercises enable row level security;
alter table public.training_session_exercises force row level security;

drop policy if exists "own rows" on public.training_session_exercises;
create policy "own rows" on public.training_session_exercises
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_session_exercises_user_idx
  on public.training_session_exercises (user_id);
create index if not exists training_session_exercises_session_idx
  on public.training_session_exercises (session_id, executed_position);
create index if not exists training_session_exercises_exercise_idx
  on public.training_session_exercises (exercise_id) where exercise_id is not null;

drop trigger if exists set_training_session_exercises_updated_at on public.training_session_exercises;
create trigger set_training_session_exercises_updated_at
  before update on public.training_session_exercises
  for each row execute function public.set_updated_at();

comment on table public.training_session_exercises is
  'Exercício DAQUELA sessão: cópia histórica. Nome e tracking_type ficam congelados aqui, nunca lidos do catálogo.';
comment on column public.training_session_exercises.planned_position is
  'Ordem com que o treino foi PLANEJADO. Nunca muda — reordenar durante a sessão mexe só em executed_position.';
comment on column public.training_session_exercises.status is
  'Só DECISÃO do usuário. "parcial" e "concluido" são derivados das séries em deriveExerciseStatus (session-machine.ts).';
