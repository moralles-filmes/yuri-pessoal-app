-- Fase 17-A — Treinos · Músculos secundários de um exercício
--
-- O grupo PRINCIPAL é coluna de `training_exercises` (é sempre um só). Os secundários e os
-- estabilizadores vivem aqui, porque são vários e variam.
--
-- `user_id` acompanha o do exercício (nulo para a base do sistema) — mesma convenção de
-- `nutrition_food_nutrients`. Denormalizar assim mantém a policy simples e sem subconsulta
-- por linha; o vínculo real continua sendo o FK com `on delete cascade`.
--
-- A trigger abaixo impede a duplicidade inconsistente que o briefing pede para evitar: o
-- grupo principal NÃO pode aparecer também como secundário do mesmo exercício. Uma CHECK não
-- resolveria isso — a informação está em outra tabela.

create table if not exists public.training_exercise_muscles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,

  exercise_id     uuid not null references public.training_exercises(id) on delete cascade,
  muscle_group_id uuid not null references public.training_muscle_groups(id) on delete cascade,

  role            text not null default 'secundario'
                    check (role in ('secundario','estabilizador')),
  position        integer not null default 0,

  created_at      timestamptz not null default now()
);

alter table public.training_exercise_muscles enable row level security;
alter table public.training_exercise_muscles force row level security;

drop policy if exists "select own or global" on public.training_exercise_muscles;
create policy "select own or global" on public.training_exercise_muscles
  for select using (user_id = auth.uid() or user_id is null);

drop policy if exists "insert own" on public.training_exercise_muscles;
create policy "insert own" on public.training_exercise_muscles
  for insert with check (user_id = auth.uid());

drop policy if exists "update own" on public.training_exercise_muscles;
create policy "update own" on public.training_exercise_muscles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own" on public.training_exercise_muscles;
create policy "delete own" on public.training_exercise_muscles
  for delete using (user_id = auth.uid());

create unique index if not exists training_exercise_muscles_pair_idx
  on public.training_exercise_muscles (exercise_id, muscle_group_id);
create index if not exists training_exercise_muscles_user_idx
  on public.training_exercise_muscles (user_id);
create index if not exists training_exercise_muscles_group_idx
  on public.training_exercise_muscles (muscle_group_id);

-- O principal nunca é também secundário.
create or replace function public.training_exercise_muscles_not_primary()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1 from public.training_exercises e
     where e.id = new.exercise_id
       and e.primary_muscle_group_id = new.muscle_group_id
  ) then
    raise exception 'O grupo muscular principal não pode ser cadastrado também como secundário.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists training_exercise_muscles_not_primary_trg on public.training_exercise_muscles;
create trigger training_exercise_muscles_not_primary_trg
  before insert or update on public.training_exercise_muscles
  for each row execute function public.training_exercise_muscles_not_primary();

comment on table public.training_exercise_muscles is
  'Músculos secundários/estabilizadores. O principal é coluna do exercício e não pode se repetir aqui (trigger).';
