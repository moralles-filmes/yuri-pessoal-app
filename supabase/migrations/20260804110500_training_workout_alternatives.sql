-- Fase 17-B — Treinos · Alternativas DAQUELE exercício NAQUELE treino
--
-- A 17-A já tem `training_exercise_alternatives`: alternativa GLOBAL do usuário ("sempre que a
-- barra estiver ocupada, uso halteres"). Esta tabela é mais específica: "no Treino A, se a
-- máquina estiver ocupada, troco por esta" — a escolha pode ser diferente em outro treino,
-- porque o contexto (fadiga acumulada, ordem, equipamento disponível) é diferente.
--
-- As duas convivem: a sessão (17-C) oferece primeiro a alternativa do treino, depois a global,
-- depois as do mesmo padrão de movimento. E, como na 17-A, isto é ORGANIZAÇÃO DO USUÁRIO —
-- o sistema NÃO afirma equivalência biomecânica, e a interface diz isso.

create table if not exists public.training_workout_alternatives (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,

  workout_exercise_id     uuid not null references public.training_workout_exercises(id) on delete cascade,
  alternative_exercise_id uuid not null references public.training_exercises(id) on delete cascade,

  note                    text,
  position                integer not null default 0,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.training_workout_alternatives enable row level security;
alter table public.training_workout_alternatives force row level security;

drop policy if exists "own rows" on public.training_workout_alternatives;
create policy "own rows" on public.training_workout_alternatives
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists training_workout_alternatives_pair_idx
  on public.training_workout_alternatives (workout_exercise_id, alternative_exercise_id);
create index if not exists training_workout_alternatives_user_idx
  on public.training_workout_alternatives (user_id);
create index if not exists training_workout_alternatives_exercise_idx
  on public.training_workout_alternatives (alternative_exercise_id);

drop trigger if exists set_training_workout_alternatives_updated_at on public.training_workout_alternatives;
create trigger set_training_workout_alternatives_updated_at
  before update on public.training_workout_alternatives
  for each row execute function public.set_updated_at();

comment on table public.training_workout_alternatives is
  'Alternativa daquele exercício NAQUELE treino (mais específica que a global da 17-A). Organização do usuário; NÃO afirma equivalência biomecânica.';
