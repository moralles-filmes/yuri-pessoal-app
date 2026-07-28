-- Fase 15 — Módulo TO-DO · Tarefa ↔ Etiqueta (N:N)
-- Tabela de junção. Excluir a etiqueta apaga só as linhas daqui (a tarefa permanece);
-- excluir a tarefa idem. RLS + FORCE RLS. Idempotente.

create table if not exists public.todo_task_labels (
  task_id    uuid not null references public.todo_tasks(id) on delete cascade,
  label_id   uuid not null references public.todo_labels(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, label_id)
);

alter table public.todo_task_labels enable row level security;
alter table public.todo_task_labels force row level security;

drop policy if exists "own rows" on public.todo_task_labels;
create policy "own rows" on public.todo_task_labels
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists todo_task_labels_user_idx
  on public.todo_task_labels (user_id);
create index if not exists todo_task_labels_label_idx
  on public.todo_task_labels (label_id);
