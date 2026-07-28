-- Fase 15 — Módulo TO-DO · Histórico de conclusões
-- Uma linha por OCORRÊNCIA concluída. É o histórico da série recorrente e, sobretudo,
-- a CHAVE DE IDEMPOTÊNCIA que impede duplicar ocorrência ao concluir → reabrir →
-- concluir de novo: o unique (user_id, task_id, scheduled_for) rejeita a segunda
-- conclusão da MESMA data programada. RLS + FORCE RLS. Idempotente.

create table if not exists public.todo_completions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  task_id           uuid not null references public.todo_tasks(id) on delete cascade,
  -- Data programada da ocorrência concluída ('yyyy-MM-dd'). Para tarefa sem data,
  -- grava-se a data local da conclusão — mantém o unique útil.
  scheduled_for     date not null,
  completed_at      timestamptz not null default now(),
  completion_source text not null default 'manual'
                      check (completion_source in ('manual','rapido','massa','notificacao','cron')),
  created_at        timestamptz not null default now()
);

alter table public.todo_completions enable row level security;
alter table public.todo_completions force row level security;

drop policy if exists "own rows" on public.todo_completions;
create policy "own rows" on public.todo_completions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Proteção contra ocorrência duplicada (regra crítica da fase).
create unique index if not exists todo_completions_task_date_uidx
  on public.todo_completions (user_id, task_id, scheduled_for);
create index if not exists todo_completions_user_completed_idx
  on public.todo_completions (user_id, completed_at);
