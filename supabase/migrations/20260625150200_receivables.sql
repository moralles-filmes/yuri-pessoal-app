-- Fase 05 — Gastos de Terceiros & Divisão
-- Tabela `receivables`: o "a receber" por pessoa, derivado da parte de terceiros de uma despesa.
-- Rastreabilidade compra → fatura → pessoa: aponta para a transação de origem, a divisão
-- (shared_expense), o cartão e a fatura (statement) onde o gasto entrou. Em compras parceladas
-- e compartilhadas, há UM receivable por (pessoa × parcela), cada um na statement_id da parcela
-- (e em installment_id, coluna adicional para rastrear a parcela exata).
-- `status`: pendente/cobrado/pago/ignorado. Marcar recebido grava status='pago' + pago_em,
-- sem apagar histórico. O FK de person_id NÃO tem cascade (excluir pessoa referenciada é
-- bloqueado). Idempotente. RLS + FORCE RLS (padrão Fases 02–04).

create table if not exists public.receivables (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  person_id          uuid not null references public.people(id),
  transaction_id     uuid references public.transactions(id) on delete set null,
  shared_expense_id  uuid references public.shared_expenses(id) on delete cascade,
  installment_id     uuid references public.transaction_installments(id) on delete cascade,
  statement_id       uuid references public.card_statements(id) on delete set null,
  card_id            uuid references public.credit_cards(id) on delete set null,
  valor              numeric(14,2) not null check (valor >= 0),
  status             text not null default 'pendente'
                       check (status in ('pendente','cobrado','pago','ignorado')),
  data_prevista      date,
  pago_em            date,
  observacoes        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.receivables enable row level security;
alter table public.receivables force row level security;

drop policy if exists "own rows" on public.receivables;
create policy "own rows" on public.receivables
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists receivables_user_person_status_idx
  on public.receivables (user_id, person_id, status);
create index if not exists receivables_user_statement_idx
  on public.receivables (user_id, statement_id);
create index if not exists receivables_user_status_idx
  on public.receivables (user_id, status);

drop trigger if exists set_receivables_updated_at on public.receivables;
create trigger set_receivables_updated_at
  before update on public.receivables
  for each row execute function public.set_updated_at();
