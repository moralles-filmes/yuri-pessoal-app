/**
 * Lógica PURA do pagamento de fatura (testada em statement-payment.test.ts).
 *
 * O pagamento de uma fatura de cartão é modelado como uma TRANSFERÊNCIA: o dinheiro sai da
 * conta escolhida para quitar o cartão. Por ser `transferencia` (não `despesa`), fica FORA de
 * entradas/saídas dos relatórios (ver dashboard.ts) e a view `card_statements_with_total` não o
 * soma — então NÃO duplica os gastos do cartão, que já entram via total da fatura.
 *
 * Sem efeitos colaterais e sem Date.now(): `hoje` ('yyyy-MM-dd') é sempre injetado.
 */

export type PagamentoFaturaPayload = {
  type: "transferencia";
  payment_method: "transferencia";
  status: "pago";
  account_id: string;
  transfer_account_id: null;
  transfer_group_id: null;
  card_id: null;
  statement_id: null;
  category_id: null;
  subcategory_id: null;
  amount: number;
  purchase_date: string;
  competence_date: string;
  description: string;
};

/** "Pagamento fatura {mês/ano} — {cartão}" (mês por extenso, pt-BR). */
export function descricaoPagamentoFatura(
  cartaoNome: string,
  competencia: string,
): string {
  const [y, m] = competencia.split("-").map(Number);
  const mesAno = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m - 1, 1));
  return `Pagamento fatura ${mesAno} — ${cartaoNome}`;
}

export function montarPagamentoFatura(params: {
  contaId: string;
  total: number;
  cartaoNome: string;
  /** Competência da fatura ('yyyy-MM-01'). */
  competencia: string;
  /** Data do pagamento ('yyyy-MM-dd'), injetada. */
  hoje: string;
}): PagamentoFaturaPayload {
  const { contaId, total, cartaoNome, competencia, hoje } = params;
  return {
    type: "transferencia",
    payment_method: "transferencia",
    status: "pago",
    account_id: contaId,
    transfer_account_id: null,
    transfer_group_id: null,
    card_id: null,
    statement_id: null,
    category_id: null,
    subcategory_id: null,
    amount: total,
    purchase_date: hoje,
    competence_date: hoje,
    description: descricaoPagamentoFatura(cartaoNome, competencia),
  };
}
