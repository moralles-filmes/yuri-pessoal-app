-- Fase 09 — Demandas, Tarefas & Rotinas
-- Tabela `routine_logs` (check-in diário de uma rotina). RLS por user_id = auth.uid().
-- ÚNICO por (user_id, routine_id, log_date) → o check-in do dia nunca duplica.
-- `completed_items` guarda os ids de `routine_items` marcados no dia (uuid[]).
-- Idempotente.

create table if not exists public.routine_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  routine_id      uuid not null references public.routines(id) on delete cascade,
  log_date        date not null,
  is_done         boolean not null default false,
  completed_items uuid[] not null default '{}',
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, routine_id, log_date)
);

alter table public.routine_logs enable row level security;
alter table public.routine_logs force row level security;

drop policy if exists "own rows" on public.routine_logs;
create policy "own rows" on public.routine_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists routine_logs_user_date_idx
  on public.routine_logs (user_id, log_date);
create index if not exists routine_logs_user_routine_idx
  on public.routine_logs (user_id, routine_id);

drop trigger if exists set_routine_logs_updated_at on public.routine_logs;
create trigger set_routine_logs_updated_at
  before update on public.routine_logs
  for each row execute function public.set_updated_at();
