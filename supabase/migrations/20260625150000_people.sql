-- Fase 05 — Gastos de Terceiros & Divisão
-- Tabela `people`: pessoas (terceiros) com quem o usuário divide despesas.
-- Idempotente. RLS + FORCE RLS (padrão Fases 02–04): cada usuário só vê as próprias pessoas.

create table if not exists public.people (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  nome         text not null,
  telefone     text,
  email        text,
  observacoes  text,
  ativo        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.people enable row level security;
alter table public.people force row level security;

drop policy if exists "own rows" on public.people;
create policy "own rows" on public.people
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists people_user_id_idx on public.people (user_id);
create index if not exists people_user_active_idx on public.people (user_id, ativo);

drop trigger if exists set_people_updated_at on public.people;
create trigger set_people_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();
