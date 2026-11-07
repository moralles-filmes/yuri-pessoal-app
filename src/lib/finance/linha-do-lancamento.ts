/**
 * REDESIGN-03-G2 · E1 — A LINHA DO LANÇAMENTO, MONTADA NUM LUGAR SÓ (D-G2-15, D-G2-20).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Puro: sem I/O, sem `user_id` (vem da sessão, no SQL) e sem as colunas de parcelado. ║
 * ║ É o objeto de colunas de `transactions` que `criarTransacao` e a edição escrevem —   ║
 * ║ o mesmo para os dois caminhos, para uma coluna nova não entrar só em um deles.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Ramificado por TIPO-ALVO:
 *  - transferência força `payment_method: "transferencia"` e zera categoria/subcategoria/
 *    cartão/fatura (o que `criarTransacao` já força);
 *  - estorno de cartão (D-G2-1) força `payment_method` e `account_id` nulos e PRESERVA
 *    cartão e fatura — o estorno não muda de fatura ao ser editado;
 *  - despesa/receita: como sempre.
 *
 * `transactions.amount` é `numeric(14,2)` EM REAIS (invariante 63): nada aqui converte.
 */
import { dataDeLiquidacaoAGravar } from "@/lib/finance/caixa";
import type { Classificacao } from "@/lib/finance/constants";
import type { InstallmentPurchaseInput } from "@/lib/validators/installment";
import type { TransactionInput } from "@/lib/validators/transaction";

/**
 * As 19 colunas, NA ORDEM do SQL (§5.2 do desenho) — o teste da migration as espelha. Fora
 * daqui, de propósito: `user_id`, `id`, `parcelado`, `qtd_parcelas`, `valor_total`.
 */
export const COLUNAS_DA_LINHA = [
  "type",
  "payment_method",
  "account_id",
  "transfer_account_id",
  "transfer_group_id",
  "card_id",
  "statement_id",
  "category_id",
  "subcategory_id",
  "amount",
  "purchase_date",
  "competence_date",
  "description",
  "notes",
  "tags",
  "status",
  "liquidado_em",
  "classificacao",
  "valor_pessoal",
  "reembolso_pessoa_id",
] as const;

export type LinhaDoLancamento = {
  type: TransactionInput["type"];
  payment_method: TransactionInput["payment_method"];
  account_id: string | null;
  transfer_account_id: string | null;
  transfer_group_id: string | null;
  card_id: string | null;
  statement_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  amount: number;
  purchase_date: string;
  competence_date: string;
  description: TransactionInput["description"];
  notes: TransactionInput["notes"];
  tags: TransactionInput["tags"];
  status: TransactionInput["status"];
  liquidado_em: string | null;
  /** Só existem quando o chamador passou `colunas` — chave AUSENTE, nunca `undefined`. */
  classificacao?: Classificacao;
  valor_pessoal?: number | null;
  /**
   * 04-C: a pessoa de quem é o reembolso. SEMPRE presente (nula por padrão): a edição que tira a
   * pessoa, ou que deixa de ser receita, tem de limpar o vínculo — o RPC só escreve a chave que veio.
   */
  reembolso_pessoa_id: string | null;
};

export type OpcoesDaLinha = {
  cardId: string | null;
  statementId: string | null;
  transferGroupId: string | null;
  /** Estorno de cartão (receita com cartão): preserva cartão/fatura, zera conta e meio. */
  estorno?: boolean;
  /** As duas colunas de responsabilidade. Sem isto, elas NÃO entram na linha. */
  colunas?: { classificacao: Classificacao; valor_pessoal: number | null };
  /** 04-C: só numa receita cujo reembolso `decidirReembolso` vinculou. Ausente = sem vínculo. */
  reembolsoPessoaId?: string | null;
};

export function montarLinhaDoLancamento(
  d: TransactionInput,
  o: OpcoesDaLinha,
): LinhaDoLancamento {
  let destino: Pick<
    LinhaDoLancamento,
    | "payment_method"
    | "account_id"
    | "transfer_account_id"
    | "transfer_group_id"
    | "card_id"
    | "statement_id"
    | "category_id"
    | "subcategory_id"
  >;

  if (d.type === "transferencia") {
    destino = {
      payment_method: "transferencia",
      account_id: d.account_id,
      transfer_account_id: d.transfer_account_id,
      transfer_group_id: o.transferGroupId,
      card_id: null,
      statement_id: null,
      category_id: null,
      subcategory_id: null,
    };
  } else if (o.estorno) {
    destino = {
      payment_method: null,
      account_id: null,
      transfer_account_id: null,
      transfer_group_id: null,
      card_id: o.cardId,
      statement_id: o.statementId,
      category_id: d.category_id,
      subcategory_id: d.subcategory_id,
    };
  } else {
    destino = {
      payment_method: d.payment_method,
      account_id: d.account_id,
      transfer_account_id: null,
      transfer_group_id: null,
      card_id: o.cardId,
      statement_id: o.statementId,
      category_id: d.category_id,
      subcategory_id: d.subcategory_id,
    };
  }

  const linha: LinhaDoLancamento = {
    type: d.type,
    payment_method: destino.payment_method,
    account_id: destino.account_id,
    transfer_account_id: destino.transfer_account_id,
    transfer_group_id: destino.transfer_group_id,
    card_id: destino.card_id,
    statement_id: destino.statement_id,
    category_id: destino.category_id,
    subcategory_id: destino.subcategory_id,
    amount: d.amount,
    purchase_date: d.purchase_date,
    competence_date: d.competence_date,
    description: d.description,
    notes: d.notes,
    tags: d.tags,
    status: d.status,
    // K0: cartão nunca guarda a data; fora de pago/recebido também é nulo.
    liquidado_em: dataDeLiquidacaoAGravar({
      status: d.status,
      card_id: destino.card_id,
      liquidado_em: d.liquidado_em,
    }),
    reembolso_pessoa_id: d.type === "receita" ? (o.reembolsoPessoaId ?? null) : null,
  };

  if (o.colunas) {
    linha.classificacao = o.colunas.classificacao;
    linha.valor_pessoal = o.colunas.valor_pessoal;
  }
  return linha;
}

/* ───────────────────────── A compra-pai de um parcelamento (D-G2-20) ───────────────────────── */

/**
 * As colunas da compra ORIGINAL de um parcelamento (o TOTAL, sem fatura). Espelhada pelo teste
 * da migration como `COLUNAS_DA_LINHA`.
 */
export const COLUNAS_DA_COMPRA_PAI = [
  "type",
  "payment_method",
  "card_id",
  "category_id",
  "subcategory_id",
  "amount",
  "purchase_date",
  "competence_date",
  "description",
  "notes",
  "status",
  "qtd_parcelas",
  "valor_total",
  "classificacao",
  "valor_pessoal",
] as const;

export type CompraPai = {
  type: "despesa";
  payment_method: "cartao_credito";
  card_id: string;
  category_id: string | null;
  subcategory_id: string | null;
  amount: number;
  purchase_date: string;
  competence_date: string;
  description: InstallmentPurchaseInput["description"];
  notes: InstallmentPurchaseInput["notes"];
  status: "pago";
  qtd_parcelas: number;
  valor_total: number;
  classificacao: Classificacao;
  valor_pessoal: number | null;
};

/** Espelha o insert de `createInstallmentPurchase`: despesa de cartão, `amount` = total. */
export function montarCompraPai(
  d: InstallmentPurchaseInput,
  o: { classificacao: Classificacao; valor_pessoal: number | null },
): CompraPai {
  return {
    type: "despesa",
    payment_method: "cartao_credito",
    card_id: d.card_id,
    category_id: d.category_id,
    subcategory_id: d.subcategory_id,
    amount: d.valor_total,
    purchase_date: d.purchase_date,
    competence_date: d.competence_date,
    description: d.description,
    notes: d.notes,
    status: "pago",
    qtd_parcelas: d.qtd_parcelas,
    valor_total: d.valor_total,
    classificacao: o.classificacao,
    valor_pessoal: o.valor_pessoal,
  };
}
