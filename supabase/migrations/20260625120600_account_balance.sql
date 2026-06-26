-- Fase 02 — Financeiro Base
-- Saldo calculado na leitura (não há coluna current_balance).
-- Apenas lançamentos liquidados (status pago/recebido) afetam o saldo.
-- Transferência: sai da conta de origem (account_id), entra na de destino (transfer_account_id).

create or replace function public.account_balance(p_account_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select a.initial_balance
    + coalesce((
        select sum(
          case
            when t.status not in ('pago','recebido') then 0
            when t.type = 'receita' then t.amount
            when t.type = 'despesa' then -t.amount
            when t.type = 'ajuste'  then t.amount
            when t.type = 'transferencia' and t.account_id = a.id then -t.amount
            when t.type = 'transferencia' and t.transfer_account_id = a.id then t.amount
            else 0
          end)
        from public.transactions t
        where t.user_id = a.user_id
          and (t.account_id = a.id or t.transfer_account_id = a.id)
      ), 0)
  from public.accounts a
  where a.id = p_account_id;
$$;

-- View de leitura: contas + saldo atual. security_invoker respeita a RLS de quem consulta.
create or replace view public.accounts_with_balance
  with (security_invoker = true)
as
  select
    a.*,
    public.account_balance(a.id) as current_balance
  from public.accounts a;
