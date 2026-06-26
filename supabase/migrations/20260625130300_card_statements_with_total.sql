-- Fase 03 — Cartões de Crédito & Faturas
-- View de leitura: fatura + total calculado (soma das despesas vinculadas) e nº de itens.
-- Espelha accounts_with_balance: security_invoker respeita a RLS de quem consulta.
-- O status efetivo (aberta/fechada/atrasada) NÃO entra aqui — é calculado em TS com
-- a data injetada, para manter a regra pura/testável e sem ruído de timezone.

create or replace view public.card_statements_with_total
  with (security_invoker = true)
as
  select
    s.*,
    coalesce(
      sum(t.amount) filter (where t.type = 'despesa'),
      0
    )::numeric(14,2) as total_atual,
    count(t.id) filter (where t.id is not null) as itens
  from public.card_statements s
  left join public.transactions t on t.statement_id = s.id
  group by s.id;
