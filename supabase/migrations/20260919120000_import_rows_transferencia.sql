-- Iteração (manutenção) — TRANSFERÊNCIA na importação de EXTRATO DE CONTA (Fase 06).
--
-- ══ POR QUE ESTA MIGRATION EXISTE ══
-- Um extrato bancário não traz só despesa e receita. Traz dinheiro que MUDA DE LUGAR sem ser
-- nenhuma das duas: pagamento de fatura de cartão, aplicação, resgate, conta para conta.
--
-- Sem isso, toda linha dessas entrava como gasto ou entrada. A pior delas é o pagamento da
-- fatura: o cartão já entrou pela fatura importada, e a mesma quantia entraria DE NOVO como
-- despesa da conta — o maior gasto do mês contado duas vezes. É o mesmo defeito que a fatura
-- resolve auto-ignorando a sua própria linha de pagamento (`ehPagamentoFatura`, mapping.ts);
-- o extrato não tinha equivalente.
--
-- ⛔ ══ A PRESENÇA DA CONTA DE DESTINO É O QUE FAZ A LINHA SER TRANSFERÊNCIA ══
-- Não existe `tipo = 'transferencia'`, e a ausência é deliberada. `tipo` guarda o SENTIDO que
-- veio do sinal do arquivo — `despesa` = saiu da conta do lote, `receita` = entrou nela — e é
-- ele que decide qual ponta é a origem:
--
--     tipo='despesa'  ⇒  origem = conta do lote,     destino = transfer_account_id
--     tipo='receita'  ⇒  origem = transfer_account_id, destino = conta do lote
--
-- Sobrescrever `tipo` com um terceiro valor apagaria esse sentido, e uma aplicação (dinheiro
-- saindo) viraria indistinguível de um resgate (dinheiro entrando). O saldo das duas contas
-- sairia invertido, sem nada na tela para denunciar.
--
-- O ganho vem de graça: "transferência sem destino" deixa de ser REPRESENTÁVEL. Não há estado
-- intermediário a validar, nem commit a recusar — escolher a conta de destino é o próprio ato
-- de transformar a linha em transferência. Irrepresentável vence recusado.
--
-- ── FK COMPOSTA (invariante da 17-F) ──
-- A RLS confere o `user_id` da PRÓPRIA linha e não alcança a conta apontada. Sem a FK composta
-- dava para gravar `import_rows(user_id = B, transfer_account_id = <conta de A>)`. Com ela, o
-- par (transfer_account_id, user_id) precisa existir em `accounts`.
--
-- `on delete set null (transfer_account_id)` (lista de colunas, PG 15+): excluir a conta de
-- destino limpa SÓ esse campo — a linha volta a ser um lançamento comum. Sem a lista, o
-- Postgres zeraria `user_id` junto, que é NOT NULL, e o delete da conta falharia.
--
-- Idempotente.

-- 1) `tipo` segue com DOIS valores. O `drop`+`add` está aqui de propósito: uma versão
--    intermediária desta mesma iteração chegou a aceitar 'transferencia', e a afirmação
--    precisa convergir tanto num banco novo quanto num que passou por ela.
alter table public.import_rows
  drop constraint if exists import_rows_tipo_check;
alter table public.import_rows
  add constraint import_rows_tipo_check
  check (tipo in ('despesa', 'receita'));

-- 2) Conta de destino. Nula = lançamento comum; preenchida = transferência.
alter table public.import_rows
  add column if not exists transfer_account_id uuid;

-- 3) Chave que a FK composta precisa alcançar em `accounts`.
alter table public.accounts
  drop constraint if exists accounts_id_user_uk;
alter table public.accounts
  add constraint accounts_id_user_uk unique (id, user_id);

-- 4) FK composta: a conta de destino é do MESMO dono da linha.
alter table public.import_rows
  drop constraint if exists import_rows_transfer_account_owner_fkey;
alter table public.import_rows
  add constraint import_rows_transfer_account_owner_fkey
  foreign key (transfer_account_id, user_id)
  references public.accounts (id, user_id)
  on delete set null (transfer_account_id);

create index if not exists import_rows_transfer_account_idx
  on public.import_rows (transfer_account_id)
  where transfer_account_id is not null;

comment on column public.import_rows.transfer_account_id is
  'A OUTRA ponta da transferencia. Nula = lancamento comum. O sentido vem de tipo: despesa = saiu da conta do lote (destino aqui), receita = entrou nela (origem aqui).';

comment on constraint import_rows_transfer_account_owner_fkey on public.import_rows is
  'A linha de importacao e a conta apontada sao do MESMO usuario. A RLS so confere o user_id da propria linha.';
