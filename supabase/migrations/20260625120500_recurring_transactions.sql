-- Fase 02 — Financeiro Base
-- Tabela `recurring_transactions` (recorrências que GERAM lançamentos).
-- Adiciona também a FK transactions.recurring_id -> recurring_transactions.id.

create table if not exists public.recurring_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  bill_id           uuid references public.bills(id) on delete cascade,
  -- Campos-template copiados em cada lançamento gerado:
  type              text not null
                      check (type in ('despesa','receita','transferencia','ajuste')),
  payment_method    text
                      check (payment_method in
                        ('debito','pix','dinheiro','boleto','transferencia','conta_corrente')),
  account_id        uuid references public.accounts(id) on delete set null,
  category_id       uuid references public.categories(id) on delete set null,
  subcategory_id    uuid references public.subcategories(id) on delete set null,
  amount            numeric(14,2) not null check (amount >= 0),
  description       text,
  tags              text[] not null default '{}',
  -- Agenda:
  frequency         text not null
                      check (frequency in ('diaria','semanal','mensal','anual')),
  interval_count    integer not null default 1 check (interval_count >= 1),
  anchor_date       date not null,
  next_due_date     date not null,
  end_date          date,
  generated_status  text not null default 'pago'
                      check (generated_status in ('pendente','pago','recebido')),
  is_active         boolean not null default true,
  last_generated_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- FK postergada de transactions.recurring_id (a tabela transactions já existe).
alter table public.transactions
  drop constraint if exists transactions_recurring_id_fkey;
alter table public.transactions
  add constraint transactions_recurring_id_fkey
  foreign key (recurring_id) references public.recurring_transactions(id) on delete set null;

alter table public.recurring_transactions enable row level security;
alter table public.recurring_transactions force row level security;

drop policy if exists "own rows" on public.recurring_transactions;
create policy "own rows" on public.recurring_transactions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists recurring_user_id_idx on public.recurring_transactions (user_id);
create index if not exists recurring_user_active_due_idx
  on public.recurring_transactions (user_id, is_active, next_due_date);
create index if not exists recurring_bill_idx on public.recurring_transactions (bill_id);

drop trigger if exists set_recurring_updated_at on public.recurring_transactions;
create trigger set_recurring_updated_at
  before update on public.recurring_transactions
  for each row execute function public.set_updated_at();
