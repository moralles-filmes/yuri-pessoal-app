-- Fase 04 — Parcelamentos
-- Atualiza a view de leitura da fatura para somar DUAS fontes:
--   (1) lançamentos à vista no cartão (transactions.type='despesa') e
--   (2) parcelas ATIVAS de compras parceladas (transaction_installments).
-- A compra original (transactions com parcelado=true) tem statement_id NULL e NÃO é
-- contada aqui — quem entra na fatura são as parcelas, evitando inflar a fatura com o
-- valor cheio. As somas vêm de SUBCONSULTAS agregadas (não de joins diretos) para evitar
-- fan-out cartesiano entre transactions e transaction_installments.
-- Mantém security_invoker (respeita a RLS de quem consulta), como na Fase 03.

create or replace view public.card_statements_with_total
  with (security_invoker = true)
as
  select
    s.*,
    (coalesce(tx.total, 0) + coalesce(inst.total, 0))::numeric(14,2) as total_atual,
    (coalesce(tx.itens, 0) + coalesce(inst.itens, 0))               as itens
  from public.card_statements s
  left join (
    select statement_id, sum(amount) as total, count(*) as itens
    from public.transactions
    where type = 'despesa' and statement_id is not null
    group by statement_id
  ) tx on tx.statement_id = s.id
  left join (
    select statement_id, sum(valor) as total, count(*) as itens
    from public.transaction_installments
    where status <> 'cancelada' and statement_id is not null
    group by statement_id
  ) inst on inst.statement_id = s.id;
