-- REDESIGN-04-C · T3 — os casos dourados de `src/lib/finance/reembolso-casos.ts`, rodados contra
-- o BANCO (M1 + M2 + M3 aplicadas). Os mesmos números do Vitest: se um lado mudar, o outro quebra.
--
-- Cada caso é reproduzido pelos EVENTOS que levam ao estado do caso (criar a receita, editar,
-- apagar, mudar status, excluir a compra) — é o trigger que realoca, nunca uma chamada direta.
-- Dois casos passam pelo próprio `salvar_lancamento` (DV-3 do §11): criar, editar e dividir.
--
-- ⛔ Tudo dentro de `begin … rollback`. Nada fica gravado: pessoas, recebíveis e receitas são
--    sintéticos e somem no fim. Roda como o dono (`role authenticated` + claims), então a RLS é
--    a de verdade. Qualquer divergência levanta exceção com o nome do caso.
--
-- Uso: uma única chamada (MCP `execute_sql` ou psql). Saída esperada: nenhuma exceção.

begin;

-- O dono: o único usuário com conta. Lido como postgres, antes de trocar de papel.
select set_config('reembolso.uid', (select user_id::text from public.accounts limit 1), true);
select set_config('reembolso.conta', (select id::text from public.accounts
                                        where user_id = current_setting('reembolso.uid')::uuid
                                        order by created_at limit 1), true);
select set_config('request.jwt.claims',
                  json_build_object('sub', current_setting('reembolso.uid'), 'role', 'authenticated')::text,
                  true);

-- Ajudantes (pg_temp: somem com a sessão). Todos security invoker: rodam sob a RLS do dono.
create function pg_temp.pessoa(p_nome text) returns uuid language sql as $$
  insert into public.people (user_id, nome)
  values (current_setting('reembolso.uid')::uuid, p_nome) returning id;
$$;

-- Recebível avulso; a letra vai em `observacoes` para o caso conferir por ela.
create function pg_temp.divida(p_pessoa uuid, p_letra text, p_centavos bigint, p_data date,
                               p_status text default 'pendente') returns uuid language sql as $$
  insert into public.receivables (user_id, person_id, valor, status, data_prevista, observacoes, created_at)
  values (current_setting('reembolso.uid')::uuid, p_pessoa, p_centavos / 100.0, p_status, p_data, p_letra,
          '2026-06-01 12:00:00+00')
  returning id;
$$;

-- Receita de terceiro vinculada; `p_minha` > 0 grava compartilhada (a "receita minha" da sobra).
create function pg_temp.receita(p_pessoa uuid, p_centavos bigint, p_data date,
                                p_status text default 'recebido', p_minha bigint default 0)
returns uuid language sql as $$
  insert into public.transactions (user_id, type, payment_method, account_id, amount, purchase_date,
                                   competence_date, description, status, liquidado_em, classificacao,
                                   valor_pessoal, reembolso_pessoa_id, created_at)
  values (current_setting('reembolso.uid')::uuid, 'receita', 'pix', current_setting('reembolso.conta')::uuid,
          p_centavos / 100.0, p_data, p_data, 'Reembolso sintético 04-C', p_status,
          case when p_status = 'recebido' then p_data end,
          case when p_minha > 0 then 'compartilhada' else 'terceiro' end,
          p_minha / 100.0, p_pessoa, p_data::timestamptz)
  returning id;
$$;

-- Confere: alocado automático por letra, devido (Σ saldos abertos) e saldo a favor.
create function pg_temp.confere(p_caso text, p_pessoa uuid, p_devido bigint, p_favor bigint, p_alocado jsonb)
returns void language plpgsql as $$
declare
  v_obtido jsonb;
  v_devido bigint;
  v_favor bigint;
begin
  select coalesce(jsonb_object_agg(x.letra, x.c) filter (where x.c > 0), '{}'::jsonb) into v_obtido
    from (select r.observacoes as letra,
                 coalesce(sum(round(rr.valor * 100)) filter (where rr.transaction_id is not null), 0)::bigint as c
            from public.receivables r
            left join public.receivable_receipts rr on rr.receivable_id = r.id
           where r.person_id = p_pessoa
           group by r.observacoes) x;
  select coalesce(sum(greatest(s, 0)), 0) into v_devido
    from (select round(r.valor * 100)::bigint
                 - coalesce((select sum(round(rr.valor * 100)) from public.receivable_receipts rr
                              where rr.receivable_id = r.id), 0)::bigint as s
            from public.receivables r
           where r.person_id = p_pessoa and r.status in ('pendente', 'cobrado')) y;
  select coalesce(sum(round((t.amount - coalesce(t.valor_pessoal, 0)) * 100)), 0)::bigint
         - coalesce((select sum(round(rr.valor * 100)) from public.receivable_receipts rr
                      join public.transactions t2 on t2.id = rr.transaction_id
                     where t2.reembolso_pessoa_id = p_pessoa), 0)::bigint
    into v_favor
    from public.transactions t
   where t.reembolso_pessoa_id = p_pessoa and t.type = 'receita' and t.status = 'recebido';
  if v_obtido <> p_alocado then
    raise exception '[%] alocado: obtido %, esperado %', p_caso, v_obtido, p_alocado;
  end if;
  if v_devido <> p_devido then
    raise exception '[%] devido: obtido %, esperado %', p_caso, v_devido, p_devido;
  end if;
  if v_favor <> p_favor then
    raise exception '[%] saldo a favor: obtido %, esperado %', p_caso, v_favor, p_favor;
  end if;
  if v_devido > 0 and v_favor > 0 then
    raise exception '[%] devido e saldo a favor coexistem', p_caso;
  end if;
end;
$$;

-- Quatro dívidas de 500,00 (a–d), uma por mês.
create function pg_temp.quatro(p_pessoa uuid) returns void language sql as $$
  select pg_temp.divida(p_pessoa, 'a', 50000, '2026-07-10');
  select pg_temp.divida(p_pessoa, 'b', 50000, '2026-08-10');
  select pg_temp.divida(p_pessoa, 'c', 50000, '2026-09-10');
  select pg_temp.divida(p_pessoa, 'd', 50000, '2026-10-10');
$$;

set local role authenticated;

do $$
declare
  p uuid;
  q uuid;
  tx uuid;
  tx2 uuid;
  v_antes jsonb;
  v_depois jsonb;
begin
  -- 1 · paga 500 → a mais antiga sai, total 1.500
  p := pg_temp.pessoa('Pessoa Sintética 1');
  perform pg_temp.quatro(p);
  perform pg_temp.receita(p, 50000, '2026-11-01');
  perform pg_temp.confere('1', p, 150000, 0, '{"a": 50000}');

  -- 2 · paga 700 → a coberta, b em 200, total 1.300
  p := pg_temp.pessoa('Pessoa Sintética 2');
  perform pg_temp.quatro(p);
  perform pg_temp.receita(p, 70000, '2026-11-01');
  perform pg_temp.confere('2', p, 130000, 0, '{"a": 50000, "b": 20000}');

  -- 3 · 10 parcelas de 200 (futuras incluídas); paga 600 → as três mais antigas
  p := pg_temp.pessoa('Pessoa Sintética 3');
  for i in 1..10 loop
    perform pg_temp.divida(p, 'c' || lpad(i::text, 2, '0'), 20000,
                           (date '2026-07-10' + make_interval(months => i - 1))::date);
  end loop;
  perform pg_temp.receita(p, 60000, '2026-11-01');
  perform pg_temp.confere('3', p, 140000, 0, '{"c01": 20000, "c02": 20000, "c03": 20000}');

  -- 4 · deve 2.000, paga 2.500 com "receita minha" (compartilhada, minha parte 500) → quita, sem crédito
  p := pg_temp.pessoa('Pessoa Sintética 4');
  perform pg_temp.quatro(p);
  perform pg_temp.receita(p, 250000, '2026-11-01', 'recebido', 50000);
  perform pg_temp.confere('4 receita minha', p, 0, 0, '{"a": 50000, "b": 50000, "c": 50000, "d": 50000}');
  --   … e com "saldo a favor" (terceiro) → quita e sobram 500 de crédito
  p := pg_temp.pessoa('Pessoa Sintética 4b');
  perform pg_temp.quatro(p);
  perform pg_temp.receita(p, 250000, '2026-11-01');
  perform pg_temp.confere('4 saldo a favor', p, 0, 50000, '{"a": 50000, "b": 50000, "c": 50000, "d": 50000}');

  -- 5 · com 500 de saldo a favor entra compra nova de 300 → coberta sozinha, crédito 200,
  --     e a alocação leva a data do pagamento ORIGINAL
  p := pg_temp.pessoa('Pessoa Sintética 5');
  perform pg_temp.receita(p, 50000, '2026-10-20');
  perform pg_temp.divida(p, 'a', 30000, '2026-11-05');
  perform pg_temp.confere('5', p, 0, 20000, '{"a": 30000}');
  if (select min(rr.recebido_em) from public.receivable_receipts rr
        join public.receivables r on r.id = rr.receivable_id where r.person_id = p) <> date '2026-10-20' then
    raise exception '[5] a alocação não levou a data do pagamento';
  end if;

  -- 6 · apaga a receita do caso 2 → as duas linhas voltam a dever (2.000), status intacto
  p := pg_temp.pessoa('Pessoa Sintética 6');
  perform pg_temp.quatro(p);
  update public.receivables set status = 'cobrado' where person_id = p and observacoes = 'a';
  tx := pg_temp.receita(p, 70000, '2026-11-01');
  delete from public.transactions where id = tx;
  perform pg_temp.confere('6', p, 200000, 0, '{}');
  if (select status from public.receivables where person_id = p and observacoes = 'a') <> 'cobrado' then
    raise exception '[6] o status da linha não voltou ao que era';
  end if;

  -- 7 · edita a receita de 700 para 400 → desfaz primeiro a mais nova (b), total 1.600
  p := pg_temp.pessoa('Pessoa Sintética 7');
  perform pg_temp.quatro(p);
  tx := pg_temp.receita(p, 70000, '2026-11-01');
  update public.transactions set amount = 400 where id = tx;
  perform pg_temp.confere('7', p, 160000, 0, '{"a": 40000}');

  -- 8 · exclui a compra `a`, já coberta → não bloqueia; o valor corre para as outras
  p := pg_temp.pessoa('Pessoa Sintética 8');
  perform pg_temp.quatro(p);
  perform pg_temp.receita(p, 70000, '2026-11-01');
  delete from public.receivables where person_id = p and observacoes = 'a';
  perform pg_temp.confere('8', p, 80000, 0, '{"b": 50000, "c": 20000}');

  -- 9 · dívida já abatida à mão (recebimento manual de 300) só recebe o saldo
  p := pg_temp.pessoa('Pessoa Sintética 9');
  perform pg_temp.divida(p, 'a', 50000, '2026-07-10');
  perform pg_temp.divida(p, 'b', 50000, '2026-08-10');
  insert into public.receivable_receipts (user_id, receivable_id, valor, recebido_em)
  select current_setting('reembolso.uid')::uuid, id, 300, '2026-10-01'
    from public.receivables where person_id = p and observacoes = 'a';
  perform pg_temp.receita(p, 60000, '2026-11-01');
  perform pg_temp.confere('9', p, 10000, 0, '{"a": 20000, "b": 40000}');

  -- 10a · `ignorado` nunca recebe; o resto fica a favor
  p := pg_temp.pessoa('Pessoa Sintética 10');
  perform pg_temp.divida(p, 'a', 50000, '2026-07-10', 'ignorado');
  perform pg_temp.divida(p, 'b', 50000, '2026-08-10');
  perform pg_temp.receita(p, 80000, '2026-11-01');
  perform pg_temp.confere('10a', p, 0, 30000, '{"b": 50000}');
  -- 10b · volta a `pendente` → recebe do crédito
  update public.receivables set status = 'pendente' where person_id = p and observacoes = 'a';
  perform pg_temp.confere('10b', p, 20000, 0, '{"a": 30000, "b": 50000}');

  -- 11 · legado `pago` (K0, sem recebimento) não recebe
  p := pg_temp.pessoa('Pessoa Sintética 11');
  perform pg_temp.divida(p, 'a', 50000, '2026-07-10', 'pago');
  perform pg_temp.divida(p, 'b', 50000, '2026-08-10');
  perform pg_temp.receita(p, 50000, '2026-11-01');
  perform pg_temp.confere('11', p, 0, 0, '{"b": 50000}');

  -- 12 · receita `pendente` não abate; ao virar `recebido`, abate
  p := pg_temp.pessoa('Pessoa Sintética 12');
  perform pg_temp.quatro(p);
  tx := pg_temp.receita(p, 50000, '2026-11-01', 'pendente');
  perform pg_temp.confere('12 pendente', p, 200000, 0, '{}');
  update public.transactions set status = 'recebido', liquidado_em = '2026-11-01' where id = tx;
  perform pg_temp.confere('12 recebido', p, 150000, 0, '{"a": 50000}');

  -- 16 · dívida mais antiga aparece depois de tudo alocado → nada é redistribuído
  p := pg_temp.pessoa('Pessoa Sintética 16');
  perform pg_temp.divida(p, 'b', 50000, '2026-08-10');
  perform pg_temp.divida(p, 'c', 50000, '2026-09-10');
  perform pg_temp.receita(p, 100000, '2026-10-01');
  perform pg_temp.divida(p, 'a', 50000, '2026-07-10');
  perform pg_temp.confere('16', p, 50000, 0, '{"b": 50000, "c": 50000}');

  -- 17 · idempotência: realocar de novo e editar só a descrição não mudam nada (Review Focus 3)
  p := pg_temp.pessoa('Pessoa Sintética 17');
  perform pg_temp.divida(p, 'a', 50000, '2026-07-10');
  perform pg_temp.divida(p, 'b', 50000, '2026-08-10');
  tx := pg_temp.receita(p, 70000, '2026-11-01');
  select jsonb_agg(jsonb_build_object('id', rr.id, 'valor', rr.valor, 'rec', rr.receivable_id) order by rr.id)
    into v_antes from public.receivable_receipts rr where rr.transaction_id = tx;
  perform public.realocar_reembolsos_da_pessoa(current_setting('reembolso.uid')::uuid, p);
  update public.transactions set description = 'Reembolso sintético 04-C (editado)' where id = tx;
  select jsonb_agg(jsonb_build_object('id', rr.id, 'valor', rr.valor, 'rec', rr.receivable_id) order by rr.id)
    into v_depois from public.receivable_receipts rr where rr.transaction_id = tx;
  if v_antes is distinct from v_depois then
    raise exception '[17] realocar de novo mudou as alocações: % → %', v_antes, v_depois;
  end if;
  perform pg_temp.confere('17', p, 30000, 0, '{"a": 50000, "b": 20000}');

  -- Review Focus 4 · a receita vira `pessoal` (vínculo cai junto) → a dívida volta inteira
  p := pg_temp.pessoa('Pessoa Sintética RF4');
  perform pg_temp.quatro(p);
  tx := pg_temp.receita(p, 70000, '2026-11-01');
  update public.transactions
     set classificacao = 'pessoal', valor_pessoal = null, reembolso_pessoa_id = null
   where id = tx;
  perform pg_temp.confere('RF4', p, 200000, 0, '{}');

  -- Troca de pessoa: o dinheiro sai de uma e corre para a outra
  p := pg_temp.pessoa('Pessoa Sintética T1');
  q := pg_temp.pessoa('Pessoa Sintética T2');
  perform pg_temp.quatro(p);
  perform pg_temp.divida(q, 'x', 30000, '2026-07-10');
  tx := pg_temp.receita(p, 50000, '2026-11-01');
  update public.transactions set reembolso_pessoa_id = q where id = tx;
  perform pg_temp.confere('troca · antiga', p, 200000, 0, '{}');
  perform pg_temp.confere('troca · nova', q, 0, 20000, '{"x": 30000}');

  -- DV-3 · pelo próprio salvar_lancamento: criar, editar o valor e dividir uma despesa
  p := pg_temp.pessoa('Pessoa Sintética RPC');
  perform pg_temp.quatro(p);
  tx := public.salvar_lancamento(
    jsonb_build_object('type', 'receita', 'payment_method', 'pix',
                       'account_id', current_setting('reembolso.conta'), 'amount', 700,
                       'purchase_date', '2026-11-01', 'competence_date', '2026-11-01',
                       'description', 'Reembolso sintético 04-C (RPC)', 'status', 'recebido',
                       'liquidado_em', '2026-11-01', 'classificacao', 'terceiro', 'valor_pessoal', 0,
                       'reembolso_pessoa_id', p),
    null);
  if (select reembolso_pessoa_id from public.transactions where id = tx) is distinct from p then
    raise exception '[RPC] salvar_lancamento não gravou reembolso_pessoa_id';
  end if;
  perform pg_temp.confere('RPC criar', p, 130000, 0, '{"a": 50000, "b": 20000}');
  perform public.salvar_lancamento(jsonb_build_object('amount', 400), null, tx);
  perform pg_temp.confere('RPC editar', p, 160000, 0, '{"a": 40000}');
  -- Uma despesa de 300 dividida inteira com a pessoa, PELO RPC, cuja dívida nasce depois de um
  -- crédito: pessoa nova com 500 a favor.
  q := pg_temp.pessoa('Pessoa Sintética RPC2');
  perform pg_temp.receita(q, 50000, '2026-10-20');
  tx2 := public.salvar_lancamento(
    jsonb_build_object('type', 'despesa', 'payment_method', 'pix',
                       'account_id', current_setting('reembolso.conta'), 'amount', 300,
                       'purchase_date', '2026-11-05', 'competence_date', '2026-11-05',
                       'description', 'Despesa sintética 04-C', 'status', 'pago',
                       'liquidado_em', '2026-11-01', 'classificacao', 'terceiro', 'valor_pessoal', 0),
    jsonb_build_object('alcance', 'regra-cheia',
                       'pessoas', jsonb_build_array(jsonb_build_object('person_id', q, 'tipo_divisao', 'valor',
                                                                       'percentual', null, 'valor', 300)),
                       'recebiveis', jsonb_build_array(jsonb_build_object('person_id', q, 'valor', 300,
                                                                          'data_prevista', '2026-11-05'))));
  update public.receivables set observacoes = 'a' where transaction_id = tx2;
  perform pg_temp.confere('RPC dividir', q, 0, 20000, '{"a": 30000}');
  -- DV-2 · a despesa coberta pela alocação automática pode ter a divisão refeita (não bloqueia)…
  perform public.salvar_lancamento(null,
    jsonb_build_object('alcance', 'regra-cheia',
                       'pessoas', jsonb_build_array(jsonb_build_object('person_id', q, 'tipo_divisao', 'valor',
                                                                       'percentual', null, 'valor', 100)),
                       'recebiveis', jsonb_build_array(jsonb_build_object('person_id', q, 'valor', 100,
                                                                          'data_prevista', '2026-11-05'))),
    tx2);
  update public.receivables set observacoes = 'a' where transaction_id = tx2;
  perform pg_temp.confere('RPC refazer divisão', q, 0, 40000, '{"a": 10000}');
  -- …e o recebimento MANUAL continua bloqueando (pessoa sem crédito, recebível sem alocação).
  q := pg_temp.pessoa('Pessoa Sintética RPC3');
  tx2 := public.salvar_lancamento(
    jsonb_build_object('type', 'despesa', 'payment_method', 'pix',
                       'account_id', current_setting('reembolso.conta'), 'amount', 300,
                       'purchase_date', '2026-11-05', 'competence_date', '2026-11-05',
                       'description', 'Despesa sintética 04-C (manual)', 'status', 'pago',
                       'liquidado_em', '2026-11-01', 'classificacao', 'terceiro', 'valor_pessoal', 0),
    jsonb_build_object('alcance', 'regra-cheia',
                       'pessoas', jsonb_build_array(jsonb_build_object('person_id', q, 'tipo_divisao', 'valor',
                                                                       'percentual', null, 'valor', 300)),
                       'recebiveis', jsonb_build_array(jsonb_build_object('person_id', q, 'valor', 300,
                                                                          'data_prevista', '2026-11-05'))));
  insert into public.receivable_receipts (user_id, receivable_id, valor, recebido_em)
  select current_setting('reembolso.uid')::uuid, r.id, 100, '2026-11-02'
    from public.receivables r where r.transaction_id = tx2;
  begin
    perform public.salvar_lancamento(null,
      jsonb_build_object('alcance', 'regra-cheia', 'pessoas', '[]'::jsonb, 'recebiveis', '[]'::jsonb), tx2);
    raise exception '[DV-2] recebimento manual deveria bloquear a divisão';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'DIVISAO_PROTEGIDA' then
      raise;
    end if;
  end;

  raise notice 'verificar-reembolso: todos os casos conferem';
end;
$$;

rollback;
