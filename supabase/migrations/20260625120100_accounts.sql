-- Fase 02 — Financeiro Base
-- Tabela `accounts` (contas / carteiras). RLS por user_id = auth.uid().
-- Saldo atual NÃO é coluna: é calculado na leitura (ver migration de account_balance).

create table if not exists public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  bank            text,
  type            text not null default 'corrente'
                    check (type in ('corrente','poupanca','dinheiro','carteira_digital','investimento')),
  initial_balance numeric(14,2) not null default 0,
  is_active       boolean not null default true,
  color           text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.accounts enable row level security;
alter table public.accounts force row level security;

drop policy if exists "own rows" on public.accounts;
create policy "own rows" on public.accounts
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists accounts_user_id_idx on public.accounts (user_id);
create index if not exists accounts_user_active_idx on public.accounts (user_id, is_active);

drop trigger if exists set_accounts_updated_at on public.accounts;
create trigger set_accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();
