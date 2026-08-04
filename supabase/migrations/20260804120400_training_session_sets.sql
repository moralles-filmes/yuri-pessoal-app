-- Fase 17-C — Treinos · A SÉRIE executada
--
-- ═════════════════ IDEMPOTÊNCIA POR `client_mutation_id` ═════════════════
--
-- Toda gravação de série carrega um uuid gerado NO DISPOSITIVO, único por sessão. Clique duplo
-- no botão grande com a mão suada, retry da fila local depois de a conexão voltar e duas abas
-- abertas convergem para UMA linha. É o mesmo princípio do `dedupe_key` das notificações (F13)
-- e do unique de `todo_completions` (F15).
--
-- ═════════════════ NUNCA DUAS SÉRIES COM O MESMO NÚMERO ═════════════════
--
-- Unique (session_exercise_id, set_number). Série extra sempre ANEXA (max + 1) — renumerar
-- séries já registradas mudaria o significado do que o usuário anotou.
--
-- ═════════════════ TRÊS COLUNAS DE CARGA, COMO NA 17-B ═════════════════
--
--   weight_kg              → carga na barra/máquina
--   additional_weight_kg   → carga EXTRA sobre o corpo   → SOMA
--   assistance_weight_kg   → peso de ASSISTÊNCIA          → SUBTRAI
--
-- Num campo só, alguma tela erraria o sinal e mostraria progresso justamente na regressão.
-- A conta continua saindo de `effectiveLoadKg` (tracking.ts), a ÚNICA matriz de medição.
--
-- Os campos `planned_*` são o congelamento do que estava previsto para ESTA série — é o que
-- permite a 17-D comparar planejado × executado sem voltar ao modelo.

create table if not exists public.training_session_sets (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  session_id                uuid not null references public.training_sessions(id) on delete cascade,
  session_exercise_id       uuid not null references public.training_session_exercises(id) on delete cascade,

  set_number                smallint not null check (set_number >= 1 and set_number <= 100),

  set_type                  text not null default 'trabalho'
                              check (set_type in ('aquecimento','preparatoria','trabalho','top_set','back_off',
                                                  'drop_set','falha','amrap','isometrica','assistida','personalizada')),

  status                    text not null default 'pendente'
                              check (status in ('pendente','ativa','concluida','pulada','falhou','cancelada')),

  -- ═══════════ Planejado (congelado) ═══════════
  planned_reps_min          smallint check (planned_reps_min is null or (planned_reps_min >= 0 and planned_reps_min <= 1000)),
  planned_reps_max          smallint check (planned_reps_max is null or (planned_reps_max >= 0 and planned_reps_max <= 1000)),
  planned_weight_kg         numeric(7,3) check (planned_weight_kg is null or planned_weight_kg >= 0),
  planned_additional_weight_kg numeric(7,3) check (planned_additional_weight_kg is null or planned_additional_weight_kg >= 0),
  planned_assistance_weight_kg numeric(7,3) check (planned_assistance_weight_kg is null or planned_assistance_weight_kg >= 0),
  planned_duration_seconds  integer check (planned_duration_seconds is null or (planned_duration_seconds >= 0 and planned_duration_seconds <= 86400)),
  planned_distance_m        numeric(10,2) check (planned_distance_m is null or planned_distance_m >= 0),
  planned_rest_seconds      integer check (planned_rest_seconds is null or (planned_rest_seconds >= 0 and planned_rest_seconds <= 3600)),
  planned_rir               smallint check (planned_rir is null or (planned_rir >= 0 and planned_rir <= 10)),
  planned_rpe               numeric(3,1) check (planned_rpe is null or (planned_rpe >= 1 and planned_rpe <= 10)),

  -- ═══════════ Executado ═══════════
  reps                      smallint check (reps is null or (reps >= 0 and reps <= 1000)),
  weight_kg                 numeric(7,3) check (weight_kg is null or weight_kg >= 0),
  additional_weight_kg      numeric(7,3) check (additional_weight_kg is null or additional_weight_kg >= 0),
  assistance_weight_kg      numeric(7,3) check (assistance_weight_kg is null or assistance_weight_kg >= 0),
  duration_seconds          integer check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 86400)),
  distance_m                numeric(10,2) check (distance_m is null or distance_m >= 0),
  /* Calorias vêm do painel do aparelho e são SEMPRE rotuladas como estimativa na interface. */
  calories                  integer check (calories is null or (calories >= 0 and calories <= 20000)),
  incline_percent           numeric(5,2) check (incline_percent is null or incline_percent >= 0),
  resistance_level          numeric(5,2) check (resistance_level is null or resistance_level >= 0),

  -- Série unilateral com valores diferentes por lado.
  reps_left                 smallint check (reps_left is null or (reps_left >= 0 and reps_left <= 1000)),
  reps_right                smallint check (reps_right is null or (reps_right >= 0 and reps_right <= 1000)),
  weight_left_kg            numeric(7,3) check (weight_left_kg is null or weight_left_kg >= 0),
  weight_right_kg           numeric(7,3) check (weight_right_kg is null or weight_right_kg >= 0),

  rir                       smallint check (rir is null or (rir >= 0 and rir <= 10)),
  rpe                       numeric(3,1) check (rpe is null or (rpe >= 1 and rpe <= 10)),
  difficulty                text check (difficulty is null or difficulty in ('facil','adequada','dificil','muito_dificil','falha')),

  is_warmup                 boolean not null default false,
  counts_in_volume          boolean not null default true,

  /* MARCADOR de candidato a recorde, gravado no calor da sessão. A consolidação, a
     desduplicação e o histórico de recordes são trabalho da 17-D — aqui é só uma pista. */
  is_personal_record        boolean not null default false,

  notes                     text,
  completed_at              timestamptz,

  /* Idempotência: uuid gerado no dispositivo, único por sessão. */
  client_mutation_id        uuid not null,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint training_session_sets_reps_range
    check (planned_reps_min is null or planned_reps_max is null or planned_reps_max >= planned_reps_min)
);

alter table public.training_session_sets enable row level security;
alter table public.training_session_sets force row level security;

drop policy if exists "own rows" on public.training_session_sets;
create policy "own rows" on public.training_session_sets
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists training_session_sets_user_idx
  on public.training_session_sets (user_id);
create index if not exists training_session_sets_session_idx
  on public.training_session_sets (session_id);
create index if not exists training_session_sets_exercise_idx
  on public.training_session_sets (session_exercise_id, set_number);

-- Clique duplo, retry da fila e duas abas convergem para uma linha só.
create unique index if not exists training_session_sets_mutation_idx
  on public.training_session_sets (session_id, client_mutation_id);

-- Nunca duas séries com o mesmo número no mesmo exercício da sessão.
create unique index if not exists training_session_sets_number_idx
  on public.training_session_sets (session_exercise_id, set_number);

drop trigger if exists set_training_session_sets_updated_at on public.training_session_sets;
create trigger set_training_session_sets_updated_at
  before update on public.training_session_sets
  for each row execute function public.set_updated_at();

comment on table public.training_session_sets is
  'A série executada. Idempotente por (session_id, client_mutation_id); nunca dois set_number iguais no mesmo exercício.';
comment on column public.training_session_sets.client_mutation_id is
  'uuid gerado NO DISPOSITIVO. Clique duplo, retry da fila local e duas abas convergem para uma linha.';
comment on column public.training_session_sets.assistance_weight_kg is
  'Peso de ASSISTÊNCIA — SUBTRAI carga. Nunca somar: inverteria o sinal do progresso.';
comment on column public.training_session_sets.is_personal_record is
  'MARCADOR de candidato a recorde gravado na hora. A consolidação é da 17-D.';
comment on column public.training_session_sets.calories is
  'Estimativa do painel do aparelho. A interface é obrigada a rotular como estimativa.';
