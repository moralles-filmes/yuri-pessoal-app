-- Fase 17-A — Treinos · Alternativas entre exercícios
--
-- "Quando a barra estiver ocupada, faço supino com halteres." Isso é ORGANIZAÇÃO DO USUÁRIO,
-- não equivalência biomecânica — e a interface diz isso com todas as letras. Por isso a
-- tabela é sempre do usuário (`user_id not null`), mesmo quando os dois exercícios são da
-- base do sistema: a base é vocabulário compartilhado, a relação é escolha pessoal.
--
-- A relação é DIRIGIDA de propósito: "A pode ser trocado por B" não implica o contrário
-- (barra fixa → barra assistida faz sentido; o inverso, quase nunca). A UI oferece criar o
-- par inverso, mas não o cria sozinha.

create table if not exists public.training_exercise_alternatives (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,

  exercise_id             uuid not null references public.training_exercises(id) on delete cascade,
  alternative_exercise_id uuid not null references public.training_exercises(id) on delete cascade,

  note                    text,
  position                integer not null default 0,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint training_exercise_alternatives_not_self
    check (exercise_id <> alternative_exercise_id)
);

alter table public.training_exercise_alternatives enable row level security;
alter table public.training_exercise_alternatives force row level security;

drop policy if exists "own rows" on public.training_exercise_alternatives;
create policy "own rows" on public.training_exercise_alternatives
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists training_exercise_alternatives_pair_idx
  on public.training_exercise_alternatives (user_id, exercise_id, alternative_exercise_id);
create index if not exists training_exercise_alternatives_user_idx
  on public.training_exercise_alternatives (user_id);
create index if not exists training_exercise_alternatives_exercise_idx
  on public.training_exercise_alternatives (exercise_id);

drop trigger if exists set_training_exercise_alternatives_updated_at on public.training_exercise_alternatives;
create trigger set_training_exercise_alternatives_updated_at
  before update on public.training_exercise_alternatives
  for each row execute function public.set_updated_at();

comment on table public.training_exercise_alternatives is
  'Alternativas escolhidas pelo usuário. Relação dirigida; NÃO afirma equivalência biomecânica.';
