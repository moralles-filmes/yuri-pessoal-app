-- Fase 09 — Demandas, Tarefas & Rotinas
-- Tabela `task_attachments` (metadados de anexos de uma tarefa). O arquivo em si
-- vive no Supabase Storage (bucket privado, ver migration seguinte); aqui guardamos
-- apenas o caminho + metadados. RLS por user_id = auth.uid(). Idempotente.

create table if not exists public.task_attachments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  task_id    uuid not null references public.tasks(id) on delete cascade,
  bucket_id  text not null default 'task-attachments',
  -- Caminho no Storage: '{user_id}/{task_id}/{arquivo}'.
  path       text not null,
  file_name  text not null,
  mime_type  text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

alter table public.task_attachments enable row level security;
alter table public.task_attachments force row level security;

drop policy if exists "own rows" on public.task_attachments;
create policy "own rows" on public.task_attachments
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists task_attachments_user_task_idx
  on public.task_attachments (user_id, task_id);
create unique index if not exists task_attachments_path_uidx
  on public.task_attachments (bucket_id, path);
