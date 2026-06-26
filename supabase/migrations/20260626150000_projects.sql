-- Fase 09 — Demandas, Tarefas & Rotinas
-- Tabela `projects` (projetos/listas de tarefas). RLS por user_id = auth.uid().
-- Idempotente: pode ser reaplicada com segurança.

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  color       text,
  icon        text,
  is_archived boolean not null default false,
  -- Ordenação manual (drag) das listas na UI.
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.projects enable row level security;
alter table public.projects force row level security;

drop policy if exists "own rows" on public.projects;
create policy "own rows" on public.projects
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_user_archived_idx
  on public.projects (user_id, is_archived, position);

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();
