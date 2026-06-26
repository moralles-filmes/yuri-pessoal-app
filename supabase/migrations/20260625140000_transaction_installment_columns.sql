-- Fase 04 — Parcelamentos
-- Marca a compra ORIGINAL parcelada em `transactions`. Aditivo (colunas nullable) —
-- sem perda de dados e sem mudança destrutiva. A compra original guarda o TOTAL e os
-- metadados de parcelamento; as N parcelas vivem em `transaction_installments` (com seu
-- próprio statement_id). Por isso a compra original fica com `statement_id` NULL: ela NÃO
-- entra em nenhuma fatura sozinha (quem entra nas faturas são as parcelas).

alter table public.transactions
  add column if not exists parcelado boolean not null default false;

alter table public.transactions
  add column if not exists qtd_parcelas smallint;

alter table public.transactions
  add column if not exists valor_total numeric(14,2);

-- Índice parcial para listar rapidamente as compras parceladas do usuário.
create index if not exists transactions_user_parcelado_idx
  on public.transactions (user_id)
  where parcelado;
