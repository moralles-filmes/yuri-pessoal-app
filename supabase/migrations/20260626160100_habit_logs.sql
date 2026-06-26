-- Fase 10 — Hábitos
-- Tabela `habit_logs` (check-in/registro por dia). RLS por user_id = auth.uid().
-- ÚNICO por (user_id, habit_id, log_date) → o check-in do dia nunca duplica
-- (o registro é sempre UPSERT, não insert cego). `value` = quanto foi feito no dia
-- (ex.: copos de água, páginas lidas, minutos); `is_done` = atingiu a meta?.
-- Idempotente.

create table if not exists public.habit_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  habit_id   uuid not null references public.habits(id) on delete cascade,
  log_date   date not null,
  value      numeric(12,2) not null default 0,
  is_done    boolean not null default false,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, habit_id, log_date)
);

alter table public.habit_logs enable row level security;
alter table public.habit_logs force row level security;

drop policy if exists "own rows" on public.habit_logs;
create policy "own rows" on public.habit_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists habit_logs_user_date_idx
  on public.habit_logs (user_id, log_date);
create index if not exists habit_logs_user_habit_idx
  on public.habit_logs (user_id, habit_id);

drop trigger if exists set_habit_logs_updated_at on public.habit_logs;
create trigger set_habit_logs_updated_at
  before update on public.habit_logs
  for each row execute function public.set_updated_at();
