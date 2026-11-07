-- REDESIGN-04-C · M2 — a realocação automática do reembolso, disparada pelo banco.
--
-- Desenho: docs/superpowers/specs/2026-10-25-reembolso-de-terceiros-design.md (§5.2, §5.3, §10).
-- A regra é a de `src/lib/finance/reembolso.ts` (`realocar`), passo a passo, com os MESMOS
-- desempates; os casos dourados de `reembolso-casos.ts` rodam iguais contra esta função em
-- `scripts/finance/verificar-reembolso.sql`.
--
--  1. alocação automática que não sai de um pagamento válido DESTA pessoa → removida;
--  2. pagamento com mais alocado do que a parte dele → apara das alocações mais novas;
--  3. dinheiro livre por pagamento, na ordem recebido_em, created_at, id;
--  4. dívidas abertas = recebíveis `pendente`/`cobrado` com saldo > 0, na ordem da dívida;
--  5. guloso: cada pedaço leva a data e a conta DO PAGAMENTO;
--  6. alocação existente nunca é movida para abrir espaço (só o dinheiro livre corre).
--
-- ⛔ Nenhum `update public.receivables`: o `pago` de uma linha coberta é DERIVADO da soma
--    (estadoDoRecebivel). Apagar a receita apaga as alocações (cascade da M1) e a linha volta
--    ao status que tinha, sem passo extra.
-- ⛔ Triggers de INSTRUÇÃO (transition tables), seis porque o Postgres não aceita tabela de
--    transição em trigger de mais de um evento. Todo caminho que mexe em receita ou recebível
--    passa por um deles — nenhum chamador para esquecer.
--
-- Reversão (primeiro reverter o app):
--   drop trigger if exists reembolso_tx_ins on public.transactions; (idem _upd, _del)
--   drop trigger if exists reembolso_rec_ins on public.receivables; (idem _upd, _del)
--   drop function if exists public.reembolso_realocar_tx();
--   drop function if exists public.reembolso_realocar_rec();
--   drop function if exists public.realocar_reembolsos_da_pessoa(uuid, uuid);
--   delete from public.receivable_receipts where transaction_id is not null;  -- só se reverter a fase

create or replace function public.realocar_reembolsos_da_pessoa(p_user uuid, p_person uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pag record;
  v_div record;
  v_al record;
  v_livre bigint;
  v_excesso bigint;
  v_pedaco bigint;
  v_saldo bigint;
begin
  if p_user is null or p_person is null then
    return;
  end if;
  -- Defesa em profundidade (achado 004): com sessão, só o próprio dono. A RLS já barraria (as
  -- leituras voltariam vazias e o insert cairia no with check); sem sessão (service role) vale a
  -- linha que disparou o trigger.
  if auth.uid() is not null and p_user is distinct from auth.uid() then
    return;
  end if;
  -- Achado 002: trava os recebíveis da pessoa em ORDEM de id ANTES do advisory. O trigger
  -- `receivable_receipts_nao_excede` trava a linha do recebível a cada alocação; sem esta ordem,
  -- uma sessão com a linha e outra com o advisory se esperariam (deadlock, 40P01).
  perform 1 from public.receivables
   where user_id = p_user and person_id = p_person
   order by id
     for update;
  -- Serializa a realocação da MESMA pessoa: duas gravações concorrentes leriam o mesmo dinheiro
  -- livre e alocariam duas vezes.
  perform pg_advisory_xact_lock(hashtext('reembolso:' || p_user::text || ':' || p_person::text));

  -- (1) Alocação automática que não sai de um pagamento válido desta pessoa, ou que está num
  --     recebível que não é dela → removida.
  delete from public.receivable_receipts rr
   where rr.user_id = p_user
     and rr.transaction_id is not null
     and (
       rr.receivable_id in (select r.id from public.receivables r
                             where r.user_id = p_user and r.person_id = p_person)
       or rr.transaction_id in (select t.id from public.transactions t
                                 where t.user_id = p_user and t.reembolso_pessoa_id = p_person)
     )
     and (
       rr.transaction_id not in (select transaction_id from (select t.id as transaction_id, t.account_id as conta_id,
                   round((t.amount - coalesce(t.valor_pessoal, 0)) * 100)::bigint as parte,
                   coalesce(t.liquidado_em, t.competence_date) as recebido_em,
                   t.created_at as criado_em
              from public.transactions t
             where t.user_id = p_user
               and t.reembolso_pessoa_id = p_person
               and t.type = 'receita'
               and t.status = 'recebido'
               and round((t.amount - coalesce(t.valor_pessoal, 0)) * 100) > 0))
       or rr.receivable_id not in (select r.id from public.receivables r
                                    where r.user_id = p_user and r.person_id = p_person)
     );

  -- (2) Pagamento com mais alocado do que a parte dele: apara das mais novas.
  for v_pag in
    select p.transaction_id, p.parte,
           coalesce((select sum(round(rr.valor * 100))::bigint from public.receivable_receipts rr
                      where rr.user_id = p_user and rr.transaction_id = p.transaction_id), 0) as alocado
      from (select t.id as transaction_id, t.account_id as conta_id,
                   round((t.amount - coalesce(t.valor_pessoal, 0)) * 100)::bigint as parte,
                   coalesce(t.liquidado_em, t.competence_date) as recebido_em,
                   t.created_at as criado_em
              from public.transactions t
             where t.user_id = p_user
               and t.reembolso_pessoa_id = p_person
               and t.type = 'receita'
               and t.status = 'recebido'
               and round((t.amount - coalesce(t.valor_pessoal, 0)) * 100) > 0) p
  loop
    v_excesso := v_pag.alocado - v_pag.parte;
    if v_excesso <= 0 then
      continue;
    end if;
    for v_al in
      select rr.id, round(rr.valor * 100)::bigint as valor
        from public.receivable_receipts rr
       where rr.user_id = p_user and rr.transaction_id = v_pag.transaction_id
       order by rr.created_at desc, rr.id desc
    loop
      exit when v_excesso <= 0;
      if v_al.valor <= v_excesso then
        delete from public.receivable_receipts where id = v_al.id;
        v_excesso := v_excesso - v_al.valor;
      else
        update public.receivable_receipts
           set valor = (v_al.valor - v_excesso) / 100.0
         where id = v_al.id;
        v_excesso := 0;
      end if;
    end loop;
  end loop;

  -- (3–5) O dinheiro livre de cada pagamento, na ordem, preenche as dívidas abertas na ordem.
  for v_pag in
    select p.transaction_id, p.conta_id, p.recebido_em,
           p.parte - coalesce((select sum(round(rr.valor * 100))::bigint from public.receivable_receipts rr
                                where rr.user_id = p_user and rr.transaction_id = p.transaction_id), 0) as livre
      from (select t.id as transaction_id, t.account_id as conta_id,
                   round((t.amount - coalesce(t.valor_pessoal, 0)) * 100)::bigint as parte,
                   coalesce(t.liquidado_em, t.competence_date) as recebido_em,
                   t.created_at as criado_em
              from public.transactions t
             where t.user_id = p_user
               and t.reembolso_pessoa_id = p_person
               and t.type = 'receita'
               and t.status = 'recebido'
               and round((t.amount - coalesce(t.valor_pessoal, 0)) * 100) > 0) p
     order by p.recebido_em, p.criado_em, p.transaction_id
  loop
    v_livre := v_pag.livre;
    continue when v_livre <= 0;
    for v_div in
      select r.id
        from public.receivables r
        left join public.card_statements s on s.id = r.statement_id
        left join public.transactions o on o.id = r.transaction_id
       where r.user_id = p_user
         and r.person_id = p_person
         and r.status in ('pendente', 'cobrado')
       order by coalesce(s.data_vencimento, o.competence_date, r.data_prevista,
                         (r.created_at at time zone 'America/Sao_Paulo')::date),
                r.created_at, r.id
    loop
      exit when v_livre <= 0;
      -- O saldo é relido a cada dívida: o pedaço que acabou de entrar já conta.
      select round(r.valor * 100)::bigint
             - coalesce((select sum(round(rr.valor * 100))::bigint from public.receivable_receipts rr
                          where rr.receivable_id = r.id), 0)
        into v_saldo
        from public.receivables r
       where r.id = v_div.id;
      continue when v_saldo <= 0;
      v_pedaco := least(v_saldo, v_livre);
      -- `clock_timestamp()`, não `now()`: dentro de uma transação o `now()` é o mesmo para todas as
      -- alocações, e o "aparar a mais nova primeiro" (passo 2) desempataria por um id aleatório.
      insert into public.receivable_receipts
        (user_id, receivable_id, valor, recebido_em, conta_id, transaction_id, observacoes, created_at)
      values
        (p_user, v_div.id, v_pedaco / 100.0, v_pag.recebido_em, v_pag.conta_id, v_pag.transaction_id, null,
         clock_timestamp());
      v_livre := v_livre - v_pedaco;
    end loop;
  end loop;
end;
$$;

comment on function public.realocar_reembolsos_da_pessoa(uuid, uuid) is
  '04-C: mantém as alocações automáticas (receivable_receipts com transaction_id) de uma pessoa a partir das receitas vinculadas a ela. Idempotente. Nunca grava receivables.status. Chamada pelos triggers de instrução de transactions e receivables.';

-- Os pares (dono, pessoa) tocados por uma instrução. Um ramo por evento: num INSERT a tabela
-- `velhas` não existe (nem `novas` num DELETE), e o PL/pgSQL só planeja a consulta do ramo que roda.
create or replace function public.reembolso_realocar_tx()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_par record;
begin
  -- `salvar_lancamento` pausa a realocação enquanto substitui a divisão e realoca uma vez no fim
  -- (achado 001): realocar entre o apagar e o recriar mandaria o dinheiro para a dívida errada.
  if coalesce(current_setting('reembolso.pausa', true), '') = '1' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    for v_par in select distinct n.user_id, n.reembolso_pessoa_id as person_id from novas n
                  where n.reembolso_pessoa_id is not null order by 1, 2 loop
      perform public.realocar_reembolsos_da_pessoa(v_par.user_id, v_par.person_id);
    end loop;
  elsif tg_op = 'UPDATE' then
    for v_par in select distinct x.user_id, x.person_id
                   from (select n.user_id, n.reembolso_pessoa_id as person_id from novas n
                         union all
                         select v.user_id, v.reembolso_pessoa_id from velhas v) x
                  where x.person_id is not null order by 1, 2 loop
      perform public.realocar_reembolsos_da_pessoa(v_par.user_id, v_par.person_id);
    end loop;
  else
    for v_par in select distinct v.user_id, v.reembolso_pessoa_id as person_id from velhas v
                  where v.reembolso_pessoa_id is not null order by 1, 2 loop
      perform public.realocar_reembolsos_da_pessoa(v_par.user_id, v_par.person_id);
    end loop;
  end if;
  return null;
end;
$$;

-- Recebível: só quem tem receita vinculada tem o que realocar. O caminho comum (divisão sem
-- reembolso nenhum) sai sem tocar em receivable_receipts.
create or replace function public.reembolso_realocar_rec()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_par record;
begin
  -- `salvar_lancamento` pausa a realocação enquanto substitui a divisão e realoca uma vez no fim
  -- (achado 001): realocar entre o apagar e o recriar mandaria o dinheiro para a dívida errada.
  if coalesce(current_setting('reembolso.pausa', true), '') = '1' then
    return null;
  end if;
  if tg_op = 'INSERT' then
    for v_par in select distinct n.user_id, n.person_id from novas n
                  where n.person_id is not null
                    and exists (select 1 from public.transactions t
                                 where t.user_id = n.user_id and t.reembolso_pessoa_id = n.person_id) order by 1, 2 loop
      perform public.realocar_reembolsos_da_pessoa(v_par.user_id, v_par.person_id);
    end loop;
  elsif tg_op = 'UPDATE' then
    for v_par in select distinct x.user_id, x.person_id
                   from (select n.user_id, n.person_id from novas n
                         union all
                         select v.user_id, v.person_id from velhas v) x
                  where x.person_id is not null
                    and exists (select 1 from public.transactions t
                                 where t.user_id = x.user_id and t.reembolso_pessoa_id = x.person_id) order by 1, 2 loop
      perform public.realocar_reembolsos_da_pessoa(v_par.user_id, v_par.person_id);
    end loop;
  else
    for v_par in select distinct v.user_id, v.person_id from velhas v
                  where v.person_id is not null
                    and exists (select 1 from public.transactions t
                                 where t.user_id = v.user_id and t.reembolso_pessoa_id = v.person_id) order by 1, 2 loop
      perform public.realocar_reembolsos_da_pessoa(v_par.user_id, v_par.person_id);
    end loop;
  end if;
  return null;
end;
$$;

drop trigger if exists reembolso_tx_ins on public.transactions;
create trigger reembolso_tx_ins after insert on public.transactions
  referencing new table as novas
  for each statement execute function public.reembolso_realocar_tx();
drop trigger if exists reembolso_tx_upd on public.transactions;
create trigger reembolso_tx_upd after update on public.transactions
  referencing old table as velhas new table as novas
  for each statement execute function public.reembolso_realocar_tx();
drop trigger if exists reembolso_tx_del on public.transactions;
create trigger reembolso_tx_del after delete on public.transactions
  referencing old table as velhas
  for each statement execute function public.reembolso_realocar_tx();

drop trigger if exists reembolso_rec_ins on public.receivables;
create trigger reembolso_rec_ins after insert on public.receivables
  referencing new table as novas
  for each statement execute function public.reembolso_realocar_rec();
drop trigger if exists reembolso_rec_upd on public.receivables;
create trigger reembolso_rec_upd after update on public.receivables
  referencing old table as velhas new table as novas
  for each statement execute function public.reembolso_realocar_rec();
drop trigger if exists reembolso_rec_del on public.receivables;
create trigger reembolso_rec_del after delete on public.receivables
  referencing old table as velhas
  for each statement execute function public.reembolso_realocar_rec();

revoke all on function public.realocar_reembolsos_da_pessoa(uuid, uuid) from public;
revoke all on function public.realocar_reembolsos_da_pessoa(uuid, uuid) from anon;
grant execute on function public.realocar_reembolsos_da_pessoa(uuid, uuid) to authenticated;
