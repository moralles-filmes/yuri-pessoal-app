-- Fase 09 — Demandas, Tarefas & Rotinas
-- Tabela `routine_items` (passos de uma rotina — ex.: "beber água", "alongar").
-- RLS por user_id = auth.uid(). Excluir a rotina apaga seus itens (cascade). Idempotente.

create table if not exists public.routine_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  routine_id uuid not null references public.routines(id) on delete cascade,
  label      text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.routine_items enable row level security;
alter table public.routine_items force row level security;

drop policy if exists "own rows" on public.routine_items;
create policy "own rows" on public.routine_items
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists routine_items_user_routine_idx
  on public.routine_items (user_id, routine_id);

drop trigger if exists set_routine_items_updated_at on public.routine_items;
create trigger set_routine_items_updated_at
  before update on public.routine_items
  for each row execute function public.set_updated_at();
