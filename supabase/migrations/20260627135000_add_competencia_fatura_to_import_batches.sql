-- Competência da fatura sendo importada (cartão): âncora para distribuir as parcelas
-- "k/N" e as últimas parcelas na fatura correta, em vez de usar a data da compra original.
-- Detectada no parse a partir das linhas à vista; confirmável na revisão. Nula em conta.
alter table public.import_batches
  add column if not exists competencia_fatura date;

comment on column public.import_batches.competencia_fatura is
  'Competência (dia 1 do mês de fechamento) da fatura de cartão importada. Âncora para parcelas k/N e últimas parcelas. Detectada no parse, confirmável na revisão.';
