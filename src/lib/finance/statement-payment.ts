/**
 * Lógica PURA do pagamento de fatura (testada em statement-payment.test.ts).
 *
 * O pagamento de uma fatura de cartão é modelado como uma TRANSFERÊNCIA: o dinheiro sai da
 * conta escolhida para quitar o cartão. Por ser `transferencia` (não `despesa`), fica FORA de
 * entradas/saídas dos relatórios (ver dashboard.ts) e a view `card_statements_with_total` não o
 * soma — então NÃO duplica os gastos do cartão, que já entram via total da fatura.
 *
 * Sem efeitos colaterais e sem Date.now(): `dataPagamento` ('yyyy-MM-dd') é sempre injetada —
 * quem paga escolhe a data para bater com o extrato do banco (o padrão é hoje).
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
  liquidado_em: string;
  description: string;
};

/**
 * Marca de "pago em" gravado em `card_statements.pago_em` (timestamptz) a partir da data
 * escolhida. Meio-dia UTC = 09h em São Paulo: cai no MESMO dia do calendário em qualquer
 * leitura no fuso BR (meia-noite UTC voltaria um dia).
 */
export function pagoEmTimestamp(data: string): string {
  return `${data}T12:00:00Z`;
}

/** Argumentos da RPC `pagar_fatura`: a fatura, o instante do pagamento e o lançamento pronto. */
export function argumentosDoPagamento(p: {
  statementId: string;
  dataPagamento: string;
  lancamento: PagamentoFaturaPayload;
}): {
  p_statement_id: string;
  p_pago_em: string;
  p_lancamento: PagamentoFaturaPayload;
} {
  return {
    p_statement_id: p.statementId,
    p_pago_em: pagoEmTimestamp(p.dataPagamento),
    p_lancamento: p.lancamento,
  };
}

export const MSG_FATURA_JA_PAGA = "Esta fatura já está paga.";
export const MSG_FATURA_NAO_ENCONTRADA = "Fatura não encontrada.";
export const MSG_FATURA_SEM_SESSAO = "Sessão expirada. Faça login novamente.";
export const MSG_PAGAMENTO_INVALIDO = "Não foi possível registrar o pagamento.";
export const MSG_PAGAMENTO_INCERTO =
  "Não foi possível confirmar o pagamento. Recarregue a página para ver se ele foi registrado.";

/**
 * Traduz o erro da RPC `pagar_fatura` (o texto exato do `raise`, em `error.message`) para a
 * mensagem da tela. Só igualdade exata: um erro desconhecido (rede, timeout) NÃO afirma que o
 * pagamento falhou — ele pode ter sido gravado antes da resposta se perder.
 */
export function mensagemDoErroDoPagamento(
  error: { message?: string } | null,
): string {
  switch (error?.message) {
    case "FATURA_JA_PAGA":
      return MSG_FATURA_JA_PAGA;
    case "FATURA_NAO_ENCONTRADA":
      return MSG_FATURA_NAO_ENCONTRADA;
    case "FATURA_SEM_SESSAO":
      return MSG_FATURA_SEM_SESSAO;
    case "FATURA_PAGAMENTO_INVALIDO":
      return MSG_PAGAMENTO_INVALIDO;
    default:
      return MSG_PAGAMENTO_INCERTO;
  }
}

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
  /** Data em que o pagamento saiu da conta ('yyyy-MM-dd'), injetada. */
  dataPagamento: string;
}): PagamentoFaturaPayload {
  const { contaId, total, cartaoNome, competencia, dataPagamento } = params;
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
    purchase_date: dataPagamento,
    competence_date: dataPagamento,
    // K0.2 — o pagamento de fatura é o dinheiro saindo da conta naquele dia: data de caixa exata.
    liquidado_em: dataPagamento,
    description: descricaoPagamentoFatura(cartaoNome, competencia),
  };
}
