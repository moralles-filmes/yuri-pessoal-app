-- Fase 04 — Parcelamentos
-- Tabela `transaction_installments`: as N parcelas de uma compra parcelada.
-- Cada parcela cai na sua fatura (`statement_id`), calculada pela regra da Fase 03
-- (invoice.ts) — a competência da parcela i é a da 1ª + (i-1) meses.
-- Idempotente. RLS + FORCE RLS (padrão Fases 02–03): o usuário só vê as próprias parcelas.
-- `status`: só 'ativa'/'cancelada' são persistidos; "paga" é DERIVADA na leitura do
-- `pago_em` da fatura (statusEfetivo), espelhando a filosofia "status na leitura".

create table if not exists public.transaction_installments (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  parent_transaction_id uuid not null references public.transactions(id) on delete cascade,
  card_id               uuid references public.credit_cards(id) on delete set null,
  statement_id          uuid references public.card_statements(id) on delete set null,
  numero                smallint not null check (numero >= 1),
  total_parcelas        smallint not null check (total_parcelas >= 1),
  valor                 numeric(14,2) not null check (valor >= 0),
  data_competencia      date,
  status                text not null default 'ativa'
                          check (status in ('ativa','paga','cancelada')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (user_id, parent_transaction_id, numero)
);

alter table public.transaction_installments enable row level security;
alter table public.transaction_installments force row level security;

drop policy if exists "own rows" on public.transaction_installments;
create policy "own rows" on public.transaction_installments
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists transaction_installments_user_id_idx
  on public.transaction_installments (user_id);
create index if not exists transaction_installments_user_parent_idx
  on public.transaction_installments (user_id, parent_transaction_id);
create index if not exists transaction_installments_user_statement_idx
  on public.transaction_installments (user_id, statement_id);
create index if not exists transaction_installments_user_card_status_idx
  on public.transaction_installments (user_id, card_id, status);

drop trigger if exists set_transaction_installments_updated_at on public.transaction_installments;
create trigger set_transaction_installments_updated_at
  before update on public.transaction_installments
  for each row execute function public.set_updated_at();
