-- REDESIGN-04-C · M1 — o vínculo do reembolso: a RECEITA é o pagamento da pessoa.
--
-- Desenho: docs/superpowers/specs/2026-10-25-reembolso-de-terceiros-design.md (§5, §10, §11).
-- `transactions.reembolso_pessoa_id` é o único fato novo: uma receita de terceiro (ou
-- compartilhada) com pessoa abate o que ela deve. As alocações continuam em
-- `receivable_receipts`, agora com `transaction_id` apontando para a receita (K2 da 03-D).
--
-- Aditiva: duas unique, uma coluna, um CHECK, FKs compostas, três colunas em `import_rows`.
-- Nenhum dado é alterado: lido em 2026-11-02, `receivable_receipts` não tinha nenhuma linha com
-- `transaction_id` (nem linha nenhuma), e nenhuma receita era de terceiro.
--
-- Reversão (primeiro reverter o app e a M3/M2; depois):
--   alter table public.import_rows drop constraint if exists import_rows_reembolso_pessoa_fk,
--     drop column if exists reembolso_sobra, drop column if exists reembolso_pessoa_id,
--     drop column if exists receita_classificacao;
--   alter table public.receivable_receipts drop constraint if exists receivable_receipts_conta_fk,
--     drop constraint if exists receivable_receipts_transaction_fk;
--   alter table public.receivable_receipts add constraint receivable_receipts_conta_id_fkey
--     foreign key (conta_id) references public.accounts(id) on delete set null;
--   alter table public.receivable_receipts add constraint receivable_receipts_transaction_id_fkey
--     foreign key (transaction_id) references public.transactions(id) on delete set null;
--   drop index if exists public.receivable_receipts_transaction_idx;
--   drop index if exists public.transactions_reembolso_pessoa_idx;
--   alter table public.transactions drop constraint if exists transactions_reembolso_forma,
--     drop constraint if exists transactions_reembolso_pessoa_fk,
--     drop column if exists reembolso_pessoa_id;
--   alter table public.people drop constraint if exists people_id_user_uk;
--   alter table public.transactions drop constraint if exists transactions_id_user_uk;

-- (1) Habilita as FKs COMPOSTAS (invariante 23 da 17-F): a RLS confere o user_id da PRÓPRIA
--     linha e não alcança a linha apontada.
alter table public.transactions drop constraint if exists transactions_id_user_uk;
alter table public.transactions add constraint transactions_id_user_uk unique (id, user_id);
alter table public.people drop constraint if exists people_id_user_uk;
alter table public.people add constraint people_id_user_uk unique (id, user_id);

-- (2) De quem é o reembolso. Sem cascade: pessoa com reembolso não é excluída (é inativada),
--     como a que tem recebível.
alter table public.transactions add column if not exists reembolso_pessoa_id uuid;
alter table public.transactions drop constraint if exists transactions_reembolso_pessoa_fk;
alter table public.transactions add constraint transactions_reembolso_pessoa_fk
  foreign key (reembolso_pessoa_id, user_id) references public.people (id, user_id);

-- Só uma ENTRADA de terceiro (ou compartilhada) abate o que alguém deve.
alter table public.transactions drop constraint if exists transactions_reembolso_forma;
alter table public.transactions add constraint transactions_reembolso_forma check (
  reembolso_pessoa_id is null
  or (type = 'receita' and classificacao in ('terceiro', 'compartilhada'))
);

create index if not exists transactions_reembolso_pessoa_idx
  on public.transactions (user_id, reembolso_pessoa_id)
  where reembolso_pessoa_id is not null;

comment on column public.transactions.reembolso_pessoa_id is
  '04-C: a pessoa que mandou este dinheiro. A receita com status recebido É o pagamento; a parte da pessoa é amount − coalesce(valor_pessoal, 0). As alocações vivem em receivable_receipts (transaction_id).';

-- (3) A alocação aponta para a receita de onde saiu. Apagar a receita apaga as alocações dela
--     (cascade) — e a dívida volta sozinha, porque o status do recebível nunca foi tocado.
alter table public.receivable_receipts drop constraint if exists receivable_receipts_transaction_id_fkey;
alter table public.receivable_receipts drop constraint if exists receivable_receipts_transaction_fk;
alter table public.receivable_receipts add constraint receivable_receipts_transaction_fk
  foreign key (transaction_id, user_id) references public.transactions (id, user_id)
  on delete cascade;

alter table public.receivable_receipts drop constraint if exists receivable_receipts_conta_id_fkey;
alter table public.receivable_receipts drop constraint if exists receivable_receipts_conta_fk;
alter table public.receivable_receipts add constraint receivable_receipts_conta_fk
  foreign key (conta_id, user_id) references public.accounts (id, user_id)
  on delete set null (conta_id);

create index if not exists receivable_receipts_transaction_idx
  on public.receivable_receipts (transaction_id)
  where transaction_id is not null;

-- (4) A revisão da importação: a linha de receita pode ser de terceiro, de uma pessoa, e com a
--     escolha da sobra. Quem grava continua sendo o commit, pelo caminho do formulário.
alter table public.import_rows add column if not exists receita_classificacao text;
alter table public.import_rows drop constraint if exists import_rows_receita_classificacao_check;
alter table public.import_rows add constraint import_rows_receita_classificacao_check
  check (receita_classificacao is null or receita_classificacao in ('pessoal', 'terceiro'));

alter table public.import_rows add column if not exists reembolso_pessoa_id uuid;
alter table public.import_rows drop constraint if exists import_rows_reembolso_pessoa_fk;
alter table public.import_rows add constraint import_rows_reembolso_pessoa_fk
  foreign key (reembolso_pessoa_id, user_id) references public.people (id, user_id)
  on delete set null (reembolso_pessoa_id);

alter table public.import_rows add column if not exists reembolso_sobra text;
alter table public.import_rows drop constraint if exists import_rows_reembolso_sobra_check;
alter table public.import_rows add constraint import_rows_reembolso_sobra_check
  check (reembolso_sobra is null or reembolso_sobra in ('receita', 'saldo'));
