-- Iteração (manutenção) — Estornos/créditos de cartão reduzem a fatura.
-- A importação de fatura passa a reconhecer valores NEGATIVOS como estorno e a criá-los como
-- RECEITA vinculada à fatura (statement_id). Para que isso reduza o total da fatura, a view de
-- leitura passa a SUBTRAIR as receitas vinculadas, além de somar despesas e parcelas ativas.
--   total_atual = soma(despesas) - soma(receitas/estornos) + soma(parcelas ativas)
-- Sem regressão: hoje não há transação 'receita' com statement_id, então as faturas existentes
-- não mudam. Mantém security_invoker (respeita a RLS de quem consulta) e as subconsultas
-- agregadas (evitam fan-out cartesiano). Idempotente via create or replace.

create or replace view public.card_statements_with_total
  with (security_invoker = true)
as
  select
    s.*,
    (coalesce(tx.total, 0) - coalesce(cr.total, 0) + coalesce(inst.total, 0))::numeric(14,2) as total_atual,
    (coalesce(tx.itens, 0) + coalesce(cr.itens, 0) + coalesce(inst.itens, 0))                as itens
  from public.card_statements s
  left join (
    select statement_id, sum(amount) as total, count(*) as itens
    from public.transactions
    where type = 'despesa' and statement_id is not null
    group by statement_id
  ) tx on tx.statement_id = s.id
  left join (
    select statement_id, sum(amount) as total, count(*) as itens
    from public.transactions
    where type = 'receita' and statement_id is not null
    group by statement_id
  ) cr on cr.statement_id = s.id
  left join (
    select statement_id, sum(valor) as total, count(*) as itens
    from public.transaction_installments
    where status <> 'cancelada' and statement_id is not null
    group by statement_id
  ) inst on inst.statement_id = s.id;
