-- Manutenção — Recorrência em Cartão de Crédito
-- Permite que uma recorrência caia na FATURA do cartão (em vez de abater conta).
-- Aditivo (coluna nullable) — sem perda de dados. Espelha 20260625130200_transactions_card_columns.sql.

alter table public.recurring_transactions
  add column if not exists card_id uuid references public.credit_cards(id) on delete set null;

-- Atualiza o CHECK de payment_method para incluir 'cartao_credito'.
-- O nome convencional do constraint inline no Postgres é "<tabela>_<coluna>_check".
alter table public.recurring_transactions
  drop constraint if exists recurring_transactions_payment_method_check;

alter table public.recurring_transactions
  add constraint recurring_transactions_payment_method_check
  check (payment_method in
    ('debito','pix','dinheiro','boleto','transferencia','conta_corrente','cartao_credito'));

create index if not exists recurring_user_card_idx
  on public.recurring_transactions (user_id, card_id);
