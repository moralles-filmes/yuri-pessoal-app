-- Fase 05 — Gastos de Terceiros & Divisão
-- Tabela `shared_expenses`: divisão de UMA despesa (transactions) entre pessoas (people).
-- Uma linha por (transação, pessoa) com a parte daquela pessoa SEMPRE resolvida em `valor`
-- (mesmo quando informada por %). A minha parte NÃO fica aqui — é derivada
-- (transactions.valor_pessoal = valor total − soma das partes de terceiros).
-- O FK de person_id NÃO tem cascade: excluir uma pessoa referenciada é bloqueado pelo banco
-- (a action orienta inativar). Idempotente. RLS + FORCE RLS (padrão Fases 02–04).

create table if not exists public.shared_expenses (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  transaction_id  uuid not null references public.transactions(id) on delete cascade,
  person_id       uuid not null references public.people(id),
  tipo_divisao    text not null check (tipo_divisao in ('valor','percentual')),
  percentual      numeric(5,2) check (percentual is null or (percentual >= 0 and percentual <= 100)),
  valor           numeric(14,2) not null check (valor >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, transaction_id, person_id)
);

alter table public.shared_expenses enable row level security;
alter table public.shared_expenses force row level security;

drop policy if exists "own rows" on public.shared_expenses;
create policy "own rows" on public.shared_expenses
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists shared_expenses_user_tx_idx
  on public.shared_expenses (user_id, transaction_id);
create index if not exists shared_expenses_user_person_idx
  on public.shared_expenses (user_id, person_id);

drop trigger if exists set_shared_expenses_updated_at on public.shared_expenses;
create trigger set_shared_expenses_updated_at
  before update on public.shared_expenses
  for each row execute function public.set_updated_at();
