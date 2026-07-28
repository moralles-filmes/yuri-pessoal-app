-- Fase 15 — Módulo TO-DO · Etiquetas
-- Etiqueta reutilizável (ex.: casa, trabalho, rápido, aguardando). Uma tarefa pode ter
-- várias (N:N via todo_task_labels). Excluir a etiqueta remove só a ASSOCIAÇÃO —
-- nunca a tarefa. RLS + FORCE RLS. Idempotente.

create table if not exists public.todo_labels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  color       text not null default 'gold',
  position    integer not null default 0,
  status      text not null default 'ativo'
                check (status in ('ativo','arquivado')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.todo_labels enable row level security;
alter table public.todo_labels force row level security;

drop policy if exists "own rows" on public.todo_labels;
create policy "own rows" on public.todo_labels
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists todo_labels_user_idx
  on public.todo_labels (user_id);
create index if not exists todo_labels_user_pos_idx
  on public.todo_labels (user_id, position);
-- Nome único por usuário (case-insensitive) — evita etiqueta duplicada e habilita
-- "criar etiqueta durante a edição" sem gerar dupla.
create unique index if not exists todo_labels_user_name_uidx
  on public.todo_labels (user_id, lower(name));

drop trigger if exists set_todo_labels_updated_at on public.todo_labels;
create trigger set_todo_labels_updated_at
  before update on public.todo_labels
  for each row execute function public.set_updated_at();
