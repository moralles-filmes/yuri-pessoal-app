-- Fase 02 — Financeiro Base
-- Tabela `transactions` (lançamentos à vista: despesa/receita/transferência/ajuste).
-- Transferência é registrada como DUAS linhas que compartilham `transfer_group_id`.
-- `amount` sempre positivo; o sinal por conta é derivado de `type` no cálculo de saldo.
-- `recurring_id` ganha FK na migration de recurring_transactions.

create table if not exists public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  type                text not null
                        check (type in ('despesa','receita','transferencia','ajuste')),
  payment_method      text
                        check (payment_method in
                          ('debito','pix','dinheiro','boleto','transferencia','conta_corrente')),
  account_id          uuid references public.accounts(id) on delete set null,
  transfer_account_id uuid references public.accounts(id) on delete set null,
  transfer_group_id   uuid,
  category_id         uuid references public.categories(id) on delete set null,
  subcategory_id      uuid references public.subcategories(id) on delete set null,
  amount              numeric(14,2) not null check (amount >= 0),
  purchase_date       date not null default current_date,
  competence_date     date not null default current_date,
  description         text,
  notes               text,
  tags                text[] not null default '{}',
  status              text not null default 'pago'
                        check (status in ('pendente','pago','recebido','cancelado')),
  recurring_id        uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.transactions enable row level security;
alter table public.transactions force row level security;

drop policy if exists "own rows" on public.transactions;
create policy "own rows" on public.transactions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists transactions_user_account_idx on public.transactions (user_id, account_id);
create index if not exists transactions_user_competence_idx on public.transactions (user_id, competence_date);
create index if not exists transactions_user_status_idx on public.transactions (user_id, status);
create index if not exists transactions_user_category_idx on public.transactions (user_id, category_id);
create index if not exists transactions_transfer_group_idx on public.transactions (transfer_group_id);
create index if not exists transactions_recurring_idx on public.transactions (recurring_id);

drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();
