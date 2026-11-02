-- REDESIGN-04-C · M3 — `salvar_lancamento` passa a gravar `reembolso_pessoa_id` (DV-1 do §11) e
-- a proteção que ele reconfere no SQL passa a contar só o recebimento MANUAL (DV-2).
--
-- Esta é a função da M-G2 (20261025120000_salvar_lancamento_atomico.sql) com quatro mudanças, e
-- nenhuma outra:
--   1. `reembolso_pessoa_id` entra no insert e no update (só quando a chave veio, D-G2-5);
--   2. a pessoa do reembolso entra na conferência de referência (LANCAMENTO_REFERENCIA_INVALIDA);
--   3. a alocação automática (`receivable_receipts.transaction_id` preenchido) NÃO protege o
--      recebível (§5.6): quando a compra muda, a alocação some com ele e o dinheiro volta a ser
--      saldo a favor, que a M2 realoca. O recebimento manual continua protegendo.
--   4. a substituição da divisão pausa a realocação (`reembolso.pausa`) e realoca uma vez no fim,
--      para cada pessoa da divisão velha e da nova (achado 001 da validação). Por isso a M3 só
--      pode ser aplicada JUNTO com a M2 ou depois dela (chama `realocar_reembolsos_da_pessoa`).
-- O teste de espelho (m-g2-salvar-lancamento.test.ts) lê a versão MAIS NOVA da função.
--
-- Só função e grants: nenhuma tabela, coluna, policy, índice ou dado.
--
-- Reversão: reaplicar o corpo de salvar_lancamento da 20261025120000 (create or replace).

-- p_id por último e com default (D-G2-18): o gerador de tipos o declara opcional, e criar é
-- simplesmente não mandá-lo.
create or replace function public.salvar_lancamento(
  p_lancamento jsonb,
  p_divisao jsonb,
  p_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid := p_id;
  v_atual public.transactions%rowtype;
  v_alcance text;
  v_pessoas uuid[];
  v_pessoa uuid;
begin
  -- Sem sessão é a primeira recusa: nada do payload é lido antes.
  if v_user is null then
    raise exception 'LANCAMENTO_SEM_SESSAO' using errcode = 'P0001';
  end if;
  if (p_id is null and p_lancamento is null) or (p_lancamento is null and p_divisao is null) then
    raise exception 'LANCAMENTO_INVALIDO' using errcode = 'P0001';
  end if;

  -- D-G2-7: toda referência que a FK não confere precisa ser visível pela RLS do chamador.
  if p_lancamento is not null and (
       ((p_lancamento ->> 'account_id') is not null
         and not exists (select 1 from public.accounts where id = (p_lancamento ->> 'account_id')::uuid))
    or ((p_lancamento ->> 'transfer_account_id') is not null
         and not exists (select 1 from public.accounts where id = (p_lancamento ->> 'transfer_account_id')::uuid))
    or ((p_lancamento ->> 'card_id') is not null
         and not exists (select 1 from public.credit_cards where id = (p_lancamento ->> 'card_id')::uuid))
    or ((p_lancamento ->> 'statement_id') is not null
         and not exists (select 1 from public.card_statements where id = (p_lancamento ->> 'statement_id')::uuid))
    or ((p_lancamento ->> 'category_id') is not null
         and not exists (select 1 from public.categories where id = (p_lancamento ->> 'category_id')::uuid))
    or ((p_lancamento ->> 'subcategory_id') is not null
         and not exists (select 1 from public.subcategories where id = (p_lancamento ->> 'subcategory_id')::uuid))
    -- 04-C: a pessoa do reembolso, como as outras referências que a FK não confere pela RLS.
    or ((p_lancamento ->> 'reembolso_pessoa_id') is not null
         and not exists (select 1 from public.people where id = (p_lancamento ->> 'reembolso_pessoa_id')::uuid))
  ) then
    raise exception 'LANCAMENTO_REFERENCIA_INVALIDA' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into public.transactions (
      user_id, type, payment_method, account_id, transfer_account_id, transfer_group_id,
      card_id, statement_id, category_id, subcategory_id, amount, purchase_date,
      competence_date, description, notes, tags, status, liquidado_em, classificacao,
      valor_pessoal, reembolso_pessoa_id
    )
    select v_user, r.type, r.payment_method, r.account_id, r.transfer_account_id,
           r.transfer_group_id, r.card_id, r.statement_id, r.category_id, r.subcategory_id,
           r.amount, r.purchase_date, r.competence_date, r.description, r.notes,
           coalesce(r.tags, '{}'), r.status, r.liquidado_em, coalesce(r.classificacao, 'pessoal'),
           r.valor_pessoal, r.reembolso_pessoa_id
      from jsonb_populate_record(null::public.transactions, p_lancamento) r
    returning id into v_id;
  else
    select * into v_atual from public.transactions where id = p_id for update;
    if not found then
      raise exception 'LANCAMENTO_NAO_ENCONTRADO' using errcode = 'P0001';
    end if;
    -- D-G2-6 (RR12): compra parcelada não muda de tipo por aqui.
    if v_atual.parcelado and p_lancamento ? 'type'
       and (p_lancamento ->> 'type') is distinct from v_atual.type then
      raise exception 'PARCELADO_NAO_MUDA_DE_TIPO' using errcode = 'P0001';
    end if;

    if p_lancamento is not null then
      -- D-G2-5: só a coluna cuja chave veio no payload é escrita.
      update public.transactions t set
        type                = case when p_lancamento ? 'type' then r.type else t.type end,
        payment_method      = case when p_lancamento ? 'payment_method' then r.payment_method else t.payment_method end,
        account_id          = case when p_lancamento ? 'account_id' then r.account_id else t.account_id end,
        transfer_account_id = case when p_lancamento ? 'transfer_account_id' then r.transfer_account_id else t.transfer_account_id end,
        transfer_group_id   = case when p_lancamento ? 'transfer_group_id' then r.transfer_group_id else t.transfer_group_id end,
        card_id             = case when p_lancamento ? 'card_id' then r.card_id else t.card_id end,
        statement_id        = case when p_lancamento ? 'statement_id' then r.statement_id else t.statement_id end,
        category_id         = case when p_lancamento ? 'category_id' then r.category_id else t.category_id end,
        subcategory_id      = case when p_lancamento ? 'subcategory_id' then r.subcategory_id else t.subcategory_id end,
        amount              = case when p_lancamento ? 'amount' then r.amount else t.amount end,
        purchase_date       = case when p_lancamento ? 'purchase_date' then r.purchase_date else t.purchase_date end,
        competence_date     = case when p_lancamento ? 'competence_date' then r.competence_date else t.competence_date end,
        description         = case when p_lancamento ? 'description' then r.description else t.description end,
        notes               = case when p_lancamento ? 'notes' then r.notes else t.notes end,
        tags                = case when p_lancamento ? 'tags' then coalesce(r.tags, '{}') else t.tags end,
        status              = case when p_lancamento ? 'status' then r.status else t.status end,
        liquidado_em        = case when p_lancamento ? 'liquidado_em' then r.liquidado_em else t.liquidado_em end,
        classificacao       = case when p_lancamento ? 'classificacao' then r.classificacao else t.classificacao end,
        valor_pessoal       = case when p_lancamento ? 'valor_pessoal' then r.valor_pessoal else t.valor_pessoal end,
        reembolso_pessoa_id = case when p_lancamento ? 'reembolso_pessoa_id' then r.reembolso_pessoa_id else t.reembolso_pessoa_id end
        from jsonb_populate_record(null::public.transactions, p_lancamento) r
       where t.id = p_id;
    end if;
  end if;

  if p_divisao is not null then
    v_alcance := p_divisao ->> 'alcance';
    if v_alcance is null or v_alcance not in ('regra-cheia', 'so-dinheiro-registrado') then
      raise exception 'DIVISAO_INVALIDA' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(coalesce(p_divisao -> 'pessoas', '[]')) x(person_id uuid)
       where not exists (select 1 from public.people p where p.id = x.person_id)
    ) or exists (
      select 1 from jsonb_to_recordset(coalesce(p_divisao -> 'recebiveis', '[]')) x(person_id uuid, statement_id uuid, card_id uuid)
       where not exists (select 1 from public.people p where p.id = x.person_id)
          or (x.statement_id is not null and not exists (select 1 from public.card_statements s where s.id = x.statement_id))
          or (x.card_id is not null and not exists (select 1 from public.credit_cards c where c.id = x.card_id))
    ) then
      raise exception 'LANCAMENTO_REFERENCIA_INVALIDA' using errcode = 'P0001';
    end if;
    -- D-G2-3: parcela_numero resolve o installment_id pela parcela ATIVA do MESMO pai — e a
    -- recusa vem ANTES de travar e apagar (achado 1 do migration-validator).
    if exists (
      select 1 from jsonb_to_recordset(coalesce(p_divisao -> 'recebiveis', '[]')) x(parcela_numero int)
       where x.parcela_numero is not null
         and not exists (select 1 from public.transaction_installments i
                          where i.parent_transaction_id = v_id and i.numero = x.parcela_numero
                            and i.status = 'ativa')
    ) then
      raise exception 'DIVISAO_INVALIDA' using errcode = 'P0001';
    end if;

    -- D-G2-4: trava os recebíveis da divisão atual e reconfere a proteção DENTRO da transação.
    perform 1 from public.receivables rc
      where rc.transaction_id = v_id
         or rc.shared_expense_id in (select id from public.shared_expenses where transaction_id = v_id)
      for update;
    if exists (
      select 1 from public.receivables rc
       where (rc.transaction_id = v_id
              or rc.shared_expense_id in (select id from public.shared_expenses where transaction_id = v_id))
         -- 04-C (§5.6): só o recebimento MANUAL protege; a alocação automática some com o
         -- recebível e o dinheiro volta a ser saldo a favor, que a realocação reusa.
         and (exists (select 1 from public.receivable_receipts rr
                       where rr.receivable_id = rc.id and rr.transaction_id is null)
              or (v_alcance = 'regra-cheia' and rc.status in ('cobrado', 'pago', 'ignorado')))
    ) then
      raise exception 'DIVISAO_PROTEGIDA' using errcode = 'P0001';
    end if;

    -- 04-C (achado 001 do migration-validator): o apagar e o recriar são DUAS instruções, e o
    -- trigger da M2 realocaria entre elas — o dinheiro da dívida apagada iria para a seguinte e a
    -- regra 6 (nunca mover alocação) o prenderia lá quando a dívida recriada voltasse. Os
    -- triggers ficam em pausa durante a substituição e a realocação roda UMA vez no fim, para
    -- cada pessoa da divisão velha e da nova.
    v_pessoas := array(
      select rc.person_id from public.receivables rc
       where rc.transaction_id = v_id
          or rc.shared_expense_id in (select id from public.shared_expenses where transaction_id = v_id)
      union
      select x.person_id from jsonb_to_recordset(coalesce(p_divisao -> 'recebiveis', '[]')) x(person_id uuid)
    );
    perform set_config('reembolso.pausa', '1', true);

    -- Substitui: recebíveis primeiro (pela FK), depois a divisão.
    delete from public.receivables rc
     where rc.transaction_id = v_id
        or rc.shared_expense_id in (select id from public.shared_expenses where transaction_id = v_id);
    delete from public.shared_expenses where transaction_id = v_id;

    insert into public.shared_expenses (user_id, transaction_id, person_id, tipo_divisao, percentual, valor)
    select v_user, v_id, x.person_id, x.tipo_divisao, x.percentual, x.valor
      from jsonb_to_recordset(coalesce(p_divisao -> 'pessoas', '[]'))
           x(person_id uuid, tipo_divisao text, percentual numeric, valor numeric);

    insert into public.receivables (
      user_id, person_id, transaction_id, shared_expense_id, installment_id, statement_id,
      card_id, valor, status, data_prevista
    )
    select v_user, x.person_id, v_id,
           (select s.id from public.shared_expenses s where s.transaction_id = v_id and s.person_id = x.person_id),
           (select i.id from public.transaction_installments i
             where i.parent_transaction_id = v_id and i.numero = x.parcela_numero),
           x.statement_id, x.card_id, x.valor, 'pendente', x.data_prevista
      from jsonb_to_recordset(coalesce(p_divisao -> 'recebiveis', '[]'))
           x(person_id uuid, parcela_numero int, statement_id uuid, card_id uuid, valor numeric, data_prevista date);

    perform set_config('reembolso.pausa', '', true);
    foreach v_pessoa in array v_pessoas loop
      perform public.realocar_reembolsos_da_pessoa(v_user, v_pessoa);
    end loop;
  end if;

  return v_id;
end;
$$;

revoke all on function public.salvar_lancamento(jsonb, jsonb, uuid) from public;
revoke all on function public.salvar_lancamento(jsonb, jsonb, uuid) from anon;
grant execute on function public.salvar_lancamento(jsonb, jsonb, uuid) to authenticated;

comment on function public.salvar_lancamento(jsonb, jsonb, uuid) is
  'REDESIGN-03-G2 + 04-C: cria (p_id ausente) ou atualiza um lançamento (inclusive reembolso_pessoa_id) e, se p_divisao vier, substitui a divisão (shared_expenses + receivables) na MESMA transação. Só o recebimento manual (transaction_id nulo) protege a divisão. Valores montados pelo chamador; security invoker, então a RLS é a de um insert direto pelo PostgREST: nenhum privilégio novo. user_id vem de auth.uid(). Erros: LANCAMENTO_SEM_SESSAO, LANCAMENTO_INVALIDO, LANCAMENTO_REFERENCIA_INVALIDA, LANCAMENTO_NAO_ENCONTRADO, PARCELADO_NAO_MUDA_DE_TIPO, DIVISAO_INVALIDA, DIVISAO_PROTEGIDA.';
