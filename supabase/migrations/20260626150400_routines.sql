-- Fase 09 — Demandas, Tarefas & Rotinas
-- Tabela `routines` (rotinas recorrentes: manhã/noite/trabalho/estudos/exercícios).
-- RLS por user_id = auth.uid(). Idempotente.

create table if not exists public.routines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  type        text not null default 'outro'
                check (type in ('manha','noite','trabalho','estudos','exercicios','outro')),
  description text,
  color       text,
  icon        text,
  frequency   text not null default 'diaria'
                check (frequency in ('diaria','semanal','dias_especificos')),
  -- 0=domingo..6=sábado (usado em 'semanal'/'dias_especificos').
  weekdays    integer[] not null default '{}',
  time_of_day time,
  is_active   boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.routines enable row level security;
alter table public.routines force row level security;

drop policy if exists "own rows" on public.routines;
create policy "own rows" on public.routines
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists routines_user_id_idx on public.routines (user_id);
create index if not exists routines_user_active_idx on public.routines (user_id, is_active);

drop trigger if exists set_routines_updated_at on public.routines;
create trigger set_routines_updated_at
  before update on public.routines
  for each row execute function public.set_updated_at();
