-- Pagamento de fatura com débito em conta (manutenção).
-- Ao pagar, o sistema cria UM lançamento tipo 'transferencia' (debita a conta escolhida, fica
-- fora de despesas/relatórios e fora do total da fatura) e guarda aqui qual conta pagou e qual
-- lançamento representa o pagamento — para "Desfazer" deletar esse lançamento e estornar o saldo.
-- Idempotente (add column if not exists). A RLS da tabela já cobre as novas colunas.
-- ON DELETE SET NULL: apagar a conta ou o lançamento não apaga a fatura.

alter table public.card_statements
  add column if not exists pago_conta_id uuid
    references public.accounts(id) on delete set null,
  add column if not exists pago_transacao_id uuid
    references public.transactions(id) on delete set null;
