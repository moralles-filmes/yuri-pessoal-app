-- Fase 15 — Módulo TO-DO · Comentários
-- Diário da tarefa: registro de decisões e acompanhamento. Estruturado para suportar
-- MAIS DE UM AUTOR no futuro (author_id separado de user_id, que é o dono do dado),
-- sem implementar colaboração agora — o sistema é single-user.
-- Soft delete (deleted_at) preserva o histórico. RLS + FORCE RLS. Idempotente.

create table if not exists public.todo_comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- Autor do comentário. Hoje sempre = user_id; separado para colaboração futura.
  author_id  uuid not null references auth.users(id) on delete cascade,
  task_id    uuid not null references public.todo_tasks(id) on delete cascade,
  content    text not null,
  -- Preenchido na primeira edição → a UI mostra o indicador "editado".
  edited_at  timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.todo_comments enable row level security;
alter table public.todo_comments force row level security;

drop policy if exists "own rows" on public.todo_comments;
create policy "own rows" on public.todo_comments
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists todo_comments_user_idx
  on public.todo_comments (user_id);
create index if not exists todo_comments_task_created_idx
  on public.todo_comments (task_id, created_at);

drop trigger if exists set_todo_comments_updated_at on public.todo_comments;
create trigger set_todo_comments_updated_at
  before update on public.todo_comments
  for each row execute function public.set_updated_at();
