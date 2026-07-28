-- Fase 15 — Módulo TO-DO · Seções
-- Seção dentro de um projeto (ex.: "A fazer", "Em andamento", "Aguardando").
-- No Kanban, cada seção é uma coluna. RLS + FORCE RLS. Idempotente.

create table if not exists public.todo_sections (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- Seção pertence a um projeto. Excluir o projeto leva as seções junto; as TAREFAS
  -- não são apagadas (todo_tasks.section_id é ON DELETE SET NULL).
  project_id  uuid not null references public.todo_projects(id) on delete cascade,
  name        text not null,
  description text,
  position    integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.todo_sections enable row level security;
alter table public.todo_sections force row level security;

drop policy if exists "own rows" on public.todo_sections;
create policy "own rows" on public.todo_sections
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists todo_sections_user_idx
  on public.todo_sections (user_id);
create index if not exists todo_sections_project_pos_idx
  on public.todo_sections (project_id, position);

drop trigger if exists set_todo_sections_updated_at on public.todo_sections;
create trigger set_todo_sections_updated_at
  before update on public.todo_sections
  for each row execute function public.set_updated_at();
