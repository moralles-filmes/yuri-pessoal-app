-- REDESIGN-03-F · M-F (K0) — pagar e desfazer o pagamento de fatura viram UMA transação cada.
--
-- Até aqui, pagar era três requisições do servidor: ler a fatura, inserir o lançamento de
-- pagamento e marcar a fatura. Duas chamadas ao mesmo tempo passavam ambas pela leitura e
-- inseriam dois lançamentos (P0-4); e uma queda entre inserir e marcar deixava uma
-- transferência debitando a conta sem fatura apontando para ela. Nenhuma ordem de requisições
-- fecha essa janela — só uma transação fecha.
--
-- O lançamento é montado em TS por montarPagamentoFatura e chega pronto em p_lancamento:
-- aqui só se ORDENA e torna ATÔMICO. As colunas listadas no insert são espelhadas por teste
-- (src/lib/finance/m-f-pagamento-fatura.test.ts) contra as chaves do payload.
--
-- Aditiva: duas funções. Nenhuma tabela, coluna, policy, índice ou dado.
--
-- Reversão (primeiro reverter o app, que passa a chamar estas funções; depois):
--   drop function if exists public.pagar_fatura(uuid, timestamptz, jsonb);
--   drop function if exists public.desfazer_pagamento_fatura(uuid, uuid);

create or replace function public.pagar_fatura(
  p_statement_id uuid,
  p_pago_em timestamptz,
  p_lancamento jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_conta uuid;
  v_lancamento uuid;
begin
  -- Sem sessão é a primeira recusa: nada do payload é lido antes.
  if v_user is null then
    raise exception 'FATURA_SEM_SESSAO' using errcode = 'P0001';
  end if;
  v_conta := (p_lancamento ->> 'account_id')::uuid;
  if v_conta is null or p_pago_em is null then
    raise exception 'FATURA_PAGAMENTO_INVALIDO' using errcode = 'P0001';
  end if;
  -- Só cria o que desfazer_pagamento_fatura aceita apagar: as mesmas quatro condições de
  -- forma. Os VALORES continuam vindo de montarPagamentoFatura; aqui só se confere.
  if (p_lancamento ->> 'type') is distinct from 'transferencia'
     or (p_lancamento ->> 'status') is distinct from 'pago'
     or (p_lancamento ->> 'transfer_account_id') is not null
     or (p_lancamento ->> 'transfer_group_id') is not null then
    raise exception 'FATURA_PAGAMENTO_INVALIDO' using errcode = 'P0001';
  end if;
  -- A FK de account_id não confere o dono; sob security invoker, a RLS de accounts confere.
  if not exists (select 1 from public.accounts where id = v_conta) then
    raise exception 'FATURA_PAGAMENTO_INVALIDO' using errcode = 'P0001';
  end if;

  -- 1. A reserva. Uma chamada concorrente espera o lock da linha, reavalia pago_em e afeta
  --    0 linhas: é esta condição que faz o pagamento acontecer uma vez só.
  update public.card_statements
     set status = 'paga', pago_em = p_pago_em, pago_conta_id = v_conta
   where id = p_statement_id
     and pago_em is null;
  if not found then
    if exists (select 1 from public.card_statements where id = p_statement_id) then
      raise exception 'FATURA_JA_PAGA' using errcode = 'P0001';
    end if;
    raise exception 'FATURA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;

  -- 2. O lançamento: nomes daqui, valores de montarPagamentoFatura; user_id da sessão.
  insert into public.transactions (
    user_id, type, payment_method, status, account_id, transfer_account_id,
    transfer_group_id, card_id, statement_id, category_id, subcategory_id,
    amount, purchase_date, competence_date, liquidado_em, description
  )
  select v_user, r.type, r.payment_method, r.status, r.account_id, r.transfer_account_id,
         r.transfer_group_id, r.card_id, r.statement_id, r.category_id, r.subcategory_id,
         r.amount, r.purchase_date, r.competence_date, r.liquidado_em, r.description
    from jsonb_populate_record(null::public.transactions, p_lancamento) r
  returning id into v_lancamento;

  -- 3. O ponteiro. Se qualquer passo falhar, a transação inteira volta: não existe estado
  --    intermediário visível.
  update public.card_statements
     set pago_transacao_id = v_lancamento
   where id = p_statement_id;

  return v_lancamento;
end;
$$;

create or replace function public.desfazer_pagamento_fatura(
  p_statement_id uuid,
  p_lancamento_id uuid
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pago_em timestamptz;
  v_atual uuid;
  v_forma public.transactions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'FATURA_SEM_SESSAO' using errcode = 'P0001';
  end if;

  -- 0. Trava a linha e confere que o pagamento é O MESMO que o dono leu na confirmação.
  select pago_em, pago_transacao_id into v_pago_em, v_atual
    from public.card_statements
   where id = p_statement_id
     for update;
  if not found then
    raise exception 'FATURA_NAO_ENCONTRADA' using errcode = 'P0001';
  end if;
  if v_pago_em is null then
    raise exception 'FATURA_NAO_PAGA' using errcode = 'P0001';
  end if;
  if v_atual is distinct from p_lancamento_id then
    raise exception 'PAGAMENTO_MUDOU' using errcode = 'P0001';
  end if;

  -- Só apaga o que ainda tem a forma do pagamento que pagar_fatura criou (D-F7). Um
  -- lançamento editado em Lançamentos (virou despesa, mudou de status, ganhou destino) sai
  -- por Lançamentos -> excluir, que confere os recebíveis.
  if p_lancamento_id is not null then
    select * into v_forma
      from public.transactions
     where id = p_lancamento_id
       for update;
    if not found
       or v_forma.type <> 'transferencia'
       or v_forma.status <> 'pago'
       or v_forma.transfer_account_id is not null
       or v_forma.transfer_group_id is not null then
      raise exception 'PAGAMENTO_EDITADO' using errcode = 'P0001';
    end if;
  end if;

  -- 1. Solta a fatura. 2. Apaga o lançamento (o saldo da conta volta junto).
  update public.card_statements
     set status = 'aberta', pago_em = null, pago_conta_id = null, pago_transacao_id = null
   where id = p_statement_id;
  if p_lancamento_id is not null then
    delete from public.transactions where id = p_lancamento_id;
  end if;
end;
$$;

revoke all on function public.pagar_fatura(uuid, timestamptz, jsonb) from public;
revoke all on function public.pagar_fatura(uuid, timestamptz, jsonb) from anon;
grant execute on function public.pagar_fatura(uuid, timestamptz, jsonb) to authenticated;
revoke all on function public.desfazer_pagamento_fatura(uuid, uuid) from public;
revoke all on function public.desfazer_pagamento_fatura(uuid, uuid) from anon;
grant execute on function public.desfazer_pagamento_fatura(uuid, uuid) to authenticated;

comment on function public.pagar_fatura(uuid, timestamptz, jsonb) is
  'REDESIGN-03-F: paga a fatura uma vez só (reserva condicional + lançamento + ponteiro numa transação). O lançamento vem montado pelo chamador (montarPagamentoFatura); security invoker, então a RLS é a mesma de um insert direto pelo PostgREST: nenhum privilégio novo. user_id vem de auth.uid(). Recusa (FATURA_PAGAMENTO_INVALIDO) lançamento sem a forma de pagamento de fatura e conta que a RLS não deixa ver. Erros: FATURA_SEM_SESSAO, FATURA_PAGAMENTO_INVALIDO, FATURA_JA_PAGA, FATURA_NAO_ENCONTRADA.';
comment on function public.desfazer_pagamento_fatura(uuid, uuid) is
  'REDESIGN-03-F: desfaz o pagamento lido na confirmação (p_lancamento_id). Recusa se a fatura já não está paga, se o pagamento mudou ou se o lançamento perdeu a forma de pagamento de fatura. Erros: FATURA_SEM_SESSAO, FATURA_NAO_ENCONTRADA, FATURA_NAO_PAGA, PAGAMENTO_MUDOU, PAGAMENTO_EDITADO.';
