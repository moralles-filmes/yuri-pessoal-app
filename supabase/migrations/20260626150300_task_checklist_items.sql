-- Fase 09 — Demandas, Tarefas & Rotinas
-- Tabela `task_checklist_items` (itens de checklist de uma tarefa).
-- RLS por user_id = auth.uid(). Excluir a tarefa apaga seus itens (cascade).
-- Idempotente.

create table if not exists public.task_checklist_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  task_id    uuid not null references public.tasks(id) on delete cascade,
  label      text not null,
  is_done    boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task_checklist_items enable row level security;
alter table public.task_checklist_items force row level security;

drop policy if exists "own rows" on public.task_checklist_items;
create policy "own rows" on public.task_checklist_items
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists task_checklist_items_user_task_idx
  on public.task_checklist_items (user_id, task_id);

drop trigger if exists set_task_checklist_items_updated_at on public.task_checklist_items;
create trigger set_task_checklist_items_updated_at
  before update on public.task_checklist_items
  for each row execute function public.set_updated_at();
