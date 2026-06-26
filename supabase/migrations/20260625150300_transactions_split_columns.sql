-- Fase 05 — Gastos de Terceiros & Divisão
-- Marca a despesa quanto à divisão. Aditivo (colunas com default/nullable) — sem perda de dados.
--   classificacao: pessoal | terceiro | compartilhada (default 'pessoal').
--   valor_pessoal: minha parte (derivada no servidor via split.ts quando há divisão).
-- Lançamentos antigos seguem classificacao='pessoal' e valor_pessoal NULL — lido como
-- "= amount" (todo o gasto é meu). REGRA CENTRAL DA FASE: "quanto eu gastei" usa valor_pessoal,
-- nunca amount, para que valores de terceiros não distorçam o gasto pessoal real.

alter table public.transactions
  add column if not exists classificacao text not null default 'pessoal';

alter table public.transactions
  drop constraint if exists transactions_classificacao_check;

alter table public.transactions
  add constraint transactions_classificacao_check
  check (classificacao in ('pessoal','terceiro','compartilhada'));

alter table public.transactions
  add column if not exists valor_pessoal numeric(14,2);

create index if not exists transactions_user_classificacao_idx
  on public.transactions (user_id, classificacao);
