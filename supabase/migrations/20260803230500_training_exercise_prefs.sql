-- Fase 17-A — Treinos · Preferências do usuário sobre um exercício
--
-- PREFERÊNCIA ≠ EXERCÍCIO. Esta tabela é o que permite favoritar, arquivar, apelidar e
-- ajustar descanso/incremento de um exercício da BASE DO SISTEMA sem nunca editá-lo — a
-- mesma solução de `nutrition_food_prefs` (Fase 16-A), e pela mesma razão: reescrever a base
-- seria perder a referência compartilhada.
--
-- Funciona também sobre exercício próprio: aí é redundante com as colunas do exercício, mas
-- manter um único caminho de leitura ("preferência sobrepõe exercício") evita que a UI tenha
-- de tratar dois casos.

create table if not exists public.training_exercise_prefs (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  exercise_id          uuid not null references public.training_exercises(id) on delete cascade,

  is_favorite          boolean not null default false,
  archived_at          timestamptz,

  custom_name          text,
  custom_rest_seconds  integer check (custom_rest_seconds is null or (custom_rest_seconds >= 0 and custom_rest_seconds <= 3600)),
  custom_increment_kg  numeric(6,3) check (custom_increment_kg is null or custom_increment_kg > 0),
  notes                text,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.training_exercise_prefs enable row level security;
alter table public.training_exercise_prefs force row level security;

drop policy if exists "own rows" on public.training_exercise_prefs;
create policy "own rows" on public.training_exercise_prefs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create unique index if not exists training_exercise_prefs_unique_idx
  on public.training_exercise_prefs (user_id, exercise_id);
create index if not exists training_exercise_prefs_user_idx
  on public.training_exercise_prefs (user_id);
create index if not exists training_exercise_prefs_favorite_idx
  on public.training_exercise_prefs (user_id) where is_favorite;

drop trigger if exists set_training_exercise_prefs_updated_at on public.training_exercise_prefs;
create trigger set_training_exercise_prefs_updated_at
  before update on public.training_exercise_prefs
  for each row execute function public.set_updated_at();

comment on table public.training_exercise_prefs is
  'Favorito/arquivado/apelido/ajustes do usuário sobre um exercício — inclusive da base global, que nunca é editada.';
