-- REDESIGN-03-E · B1 (K1): o saldo de abertura passa a cortar pela DATA DE CAIXA.
-- Única mudança de regra: `t.competence_date < p_date` vira
-- `coalesce(t.liquidado_em, t.competence_date) < p_date`. Com `liquidado_em` nulo em tudo,
-- o resultado é idêntico — e isso é provado pela comparação do saldo antes e depois.
-- A tabela de sinais é a MESMA de public.account_balance (20260625120600) e de `efeitoNoSaldo`
-- em src/lib/finance/daily-balance.ts. Ao mexer numa, mexa nas outras.

create or replace function public.account_balance_before(
  p_account_id uuid,
  p_date date
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce((
      select sum(a.initial_balance)
      from public.accounts a
      where p_account_id is null or a.id = p_account_id
    ), 0)
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
        join public.accounts a
          on (t.account_id = a.id or t.transfer_account_id = a.id)
         and a.user_id = t.user_id
        where (p_account_id is null or a.id = p_account_id)
          and coalesce(t.liquidado_em, t.competence_date) < p_date
      ), 0);
$$;

comment on function public.account_balance_before(uuid, date) is
  'Saldo de abertura de uma conta (ou de todas, com NULL) imediatamente antes de p_date, pela data de caixa (liquidado_em ?? competence_date). Só lançamentos pago/recebido entram; lançamento de cartão não move saldo de conta.';
