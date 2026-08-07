-- Saldo diário na lista de lançamentos (extrato).
-- Devolve o saldo de ABERTURA de um escopo: saldo inicial + tudo que foi liquidado ANTES
-- de uma data. A acumulação dia a dia acontece em TS (src/lib/finance/daily-balance.ts);
-- aqui resolvemos só o "tudo que veio antes", que seria caro trazer linha a linha.
--
-- p_account_id NULL = todas as contas do usuário somadas.
--
-- A tabela de sinais é a MESMA de public.account_balance (20260625120600_account_balance.sql)
-- e de `efeitoNoSaldo` no TS. Ao mexer numa, mexa nas outras.
--
-- security invoker + RLS: a função enxerga apenas as contas e lançamentos de quem consulta.

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
    -- Saldo inicial das contas do escopo.
    coalesce((
      select sum(a.initial_balance)
      from public.accounts a
      where p_account_id is null or a.id = p_account_id
    ), 0)
    -- Movimento liquidado anterior a p_date. O join por conta é o que exclui os
    -- lançamentos de cartão (account_id nulo): compra no cartão não move saldo de conta.
    -- Transferência entre contas próprias casa DUAS vezes quando p_account_id é nulo
    -- (-amount na origem, +amount no destino) e se anula, como deve ser.
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
          and t.competence_date < p_date
      ), 0);
$$;

comment on function public.account_balance_before(uuid, date) is
  'Saldo de abertura de uma conta (ou de todas, com NULL) imediatamente antes de p_date. Só lançamentos pago/recebido entram; lançamento de cartão não move saldo de conta.';
