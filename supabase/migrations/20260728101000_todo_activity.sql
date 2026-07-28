-- Fase 15 — Módulo TO-DO · Histórico de atividades
-- Trilha de auditoria por tarefa (criada, título alterado, concluída, reaberta…).
--
-- PRIVACIDADE: `previous_data`/`new_data` guardam APENAS os campos relevantes do evento
-- (ex.: { "priority": 3 }), nunca a linha inteira, nunca segredos/tokens e nunca conteúdo
-- financeiro — regra explícita do doc da fase. Quem grava é a camada de actions
-- (src/lib/todo/activity.ts), que faz o recorte.
-- RLS + FORCE RLS. Idempotente.

create table if not exists public.todo_activity (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  task_id       uuid not null references public.todo_tasks(id) on delete cascade,
  event_type    text not null,
  previous_data jsonb,
  new_data      jsonb,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

alter table public.todo_activity enable row level security;
alter table public.todo_activity force row level security;

drop policy if exists "own rows" on public.todo_activity;
create policy "own rows" on public.todo_activity
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists todo_activity_task_created_idx
  on public.todo_activity (task_id, created_at desc);
create index if not exists todo_activity_user_idx
  on public.todo_activity (user_id);
