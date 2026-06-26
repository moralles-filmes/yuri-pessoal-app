-- Fase 03 — Cartões de Crédito & Faturas
-- Tabela `card_statements`: faturas (uma por cartão por ciclo/competência).
-- A competência é o dia 1 do mês de referência (mês em que a fatura fecha).
-- A coluna `status` só é escrita como 'paga' (ação de pagamento); aberta/fechada/
-- atrasada são CALCULADOS na leitura (statusEfetivo), espelhando "saldo na leitura".

create table if not exists public.card_statements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  card_id         uuid not null references public.credit_cards(id) on delete cascade,
  competencia     date not null,
  data_fechamento date not null,
  data_vencimento date not null,
  status          text not null default 'aberta'
                    check (status in ('aberta','fechada','paga','atrasada')),
  pago_em         timestamptz,
  total_calculado numeric(14,2) not null default 0,
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, card_id, competencia)
);

alter table public.card_statements enable row level security;
alter table public.card_statements force row level security;

drop policy if exists "own rows" on public.card_statements;
create policy "own rows" on public.card_statements
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists card_statements_user_card_idx on public.card_statements (user_id, card_id);
create index if not exists card_statements_user_status_idx on public.card_statements (user_id, status);

drop trigger if exists set_card_statements_updated_at on public.card_statements;
create trigger set_card_statements_updated_at
  before update on public.card_statements
  for each row execute function public.set_updated_at();
