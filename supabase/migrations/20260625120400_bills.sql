-- Fase 02 — Financeiro Base
-- Tabela `bills` (contas fixas). Pode ter uma recorrência ligada (recurring_transactions.bill_id).

create table if not exists public.bills (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  amount              numeric(14,2) not null check (amount >= 0),
  category_id         uuid references public.categories(id) on delete set null,
  account_id          uuid references public.accounts(id) on delete set null,
  due_day             integer not null check (due_day between 1 and 31),
  frequency           text not null default 'mensal'
                        check (frequency in ('diaria','semanal','mensal','anual')),
  notify_days_before  integer not null default 3 check (notify_days_before >= 0),
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.bills enable row level security;
alter table public.bills force row level security;

drop policy if exists "own rows" on public.bills;
create policy "own rows" on public.bills
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists bills_user_id_idx on public.bills (user_id);
create index if not exists bills_user_active_idx on public.bills (user_id, is_active);

drop trigger if exists set_bills_updated_at on public.bills;
create trigger set_bills_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();
