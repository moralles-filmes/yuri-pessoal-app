-- Fase 03 — Cartões de Crédito & Faturas
-- Liga `transactions` ao cartão/fatura. Aditivo (colunas nullable) — sem perda de dados.
-- Compras à vista (Fase 02) seguem com card_id/statement_id NULL.
-- Adiciona 'cartao_credito' à forma de pagamento (recria o CHECK inline).

alter table public.transactions
  add column if not exists card_id uuid references public.credit_cards(id) on delete set null;

alter table public.transactions
  add column if not exists statement_id uuid references public.card_statements(id) on delete set null;

-- Atualiza o CHECK de payment_method para incluir 'cartao_credito'.
-- O nome convencional do constraint inline no Postgres é "<tabela>_<coluna>_check".
alter table public.transactions
  drop constraint if exists transactions_payment_method_check;

alter table public.transactions
  add constraint transactions_payment_method_check
  check (payment_method in
    ('debito','pix','dinheiro','boleto','transferencia','conta_corrente','cartao_credito'));

create index if not exists transactions_user_card_idx on public.transactions (user_id, card_id);
create index if not exists transactions_user_statement_idx on public.transactions (user_id, statement_id);
