-- REDESIGN-03-E · A2 — a M2 (docs/redesign/MIGRATIONS.md).
-- D9: data em que o dinheiro efetivamente entrou ou saiu da conta.
-- NULA em todas as linhas existentes: a leitura cai para `competence_date`
-- e a tela DECLARA a aproximação. Nada é inventado e nada é reescrito.

alter table public.transactions
  add column if not exists liquidado_em date;

comment on column public.transactions.liquidado_em is
  'Dia em que o dinheiro entrou/saiu da conta. NULO = desconhecido; a leitura de caixa cai para competence_date e a tela declara a aproximação. Nunca preencher por dedução.';

-- Só faz sentido num lançamento liquidado. As linhas atuais têm a coluna nula,
-- então o CHECK entra sem validar nada retroativamente.
alter table public.transactions
  drop constraint if exists transactions_liquidado_em_coerente;
alter table public.transactions
  add constraint transactions_liquidado_em_coerente
  check (liquidado_em is null or status in ('pago', 'recebido'));

-- A visão de caixa filtra por esta data.
create index if not exists transactions_user_liquidado_idx
  on public.transactions (user_id, liquidado_em)
  where liquidado_em is not null;
