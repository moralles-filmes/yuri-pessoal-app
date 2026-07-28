-- Fase 15 — Módulo TO-DO · Filtros salvos
-- Filtro personalizado nomeado (ex.: "Urgentes de hoje", "Trabalho atrasado").
-- `filter_definition` (jsonb) guarda as regras de forma ESTRUTURADA — um construtor
-- visual, não uma linguagem textual de consulta. O jsonb permite evoluir para
-- expressões mais ricas depois sem migration. RLS + FORCE RLS. Idempotente.

create table if not exists public.todo_saved_filters (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  description       text,
  icon              text,
  color             text not null default 'gold',
  -- Shape validado na aplicação por Zod (todoFilterDefinitionSchema).
  filter_definition jsonb not null default '{}'::jsonb,
  is_favorite       boolean not null default false,
  -- Aparece na navegação lateral do módulo.
  show_in_nav       boolean not null default true,
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.todo_saved_filters enable row level security;
alter table public.todo_saved_filters force row level security;

drop policy if exists "own rows" on public.todo_saved_filters;
create policy "own rows" on public.todo_saved_filters
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists todo_saved_filters_user_pos_idx
  on public.todo_saved_filters (user_id, position);

drop trigger if exists set_todo_saved_filters_updated_at on public.todo_saved_filters;
create trigger set_todo_saved_filters_updated_at
  before update on public.todo_saved_filters
  for each row execute function public.set_updated_at();
