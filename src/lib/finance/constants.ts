/**
 * Fonte única de verdade dos enums do módulo financeiro (Fase 02).
 * Os arrays `as const` alimentam tanto os tipos TS (src/types/database.ts)
 * quanto os schemas Zod (src/lib/validators) e os rótulos pt-BR da UI.
 * Os valores precisam casar com os CHECK constraints das migrations.
 */

export const ACCOUNT_TYPES = [
  "corrente",
  "poupanca",
  "dinheiro",
  "carteira_digital",
  "investimento",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  dinheiro: "Dinheiro",
  carteira_digital: "Carteira digital",
  investimento: "Investimento",
};

export const TRANSACTION_TYPES = [
  "despesa",
  "receita",
  "transferencia",
  "ajuste",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  despesa: "Despesa",
  receita: "Receita",
  transferencia: "Transferência",
  ajuste: "Ajuste",
};

export const PAYMENT_METHODS = [
  "debito",
  "pix",
  "dinheiro",
  "boleto",
  "transferencia",
  "conta_corrente",
  "cartao_credito",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  debito: "Débito",
  pix: "PIX",
  dinheiro: "Dinheiro",
  boleto: "Boleto",
  transferencia: "Transferência",
  conta_corrente: "Conta corrente",
  cartao_credito: "Cartão de crédito",
};

export const TRANSACTION_STATUSES = [
  "pendente",
  "pago",
  "recebido",
  "cancelado",
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  recebido: "Recebido",
  cancelado: "Cancelado",
};

export const CATEGORY_KINDS = ["despesa", "receita", "ambos"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = {
  despesa: "Despesa",
  receita: "Receita",
  ambos: "Ambos",
};

export const FREQUENCIES = ["diaria", "semanal", "mensal", "anual"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
  anual: "Anual",
};

/** Status possíveis de um lançamento gerado por recorrência. */
export const GENERATED_STATUSES = ["pendente", "pago", "recebido"] as const;
export type GeneratedStatus = (typeof GENERATED_STATUSES)[number];

/** Apenas estes status entram no cálculo de saldo (espelha account_balance no SQL). */
export const SETTLED_STATUSES: TransactionStatus[] = ["pago", "recebido"];

/* ───────────────────────────── Fase 03 — Cartões & Faturas ───────────────────────────── */

/** Bandeiras de cartão de crédito (casa com o CHECK de credit_cards.bandeira). */
export const CARD_BRANDS = [
  "visa",
  "mastercard",
  "elo",
  "amex",
  "outro",
] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  amex: "Amex",
  outro: "Outro",
};

/**
 * Status de fatura. No banco só `paga` é persistido (ação de pagamento); os demais
 * são CALCULADOS na leitura por `statusEfetivo` (src/lib/finance/invoice.ts).
 */
export const STATEMENT_STATUSES = [
  "aberta",
  "fechada",
  "paga",
  "atrasada",
] as const;
export type StatementStatus = (typeof STATEMENT_STATUSES)[number];

export const STATEMENT_STATUS_LABELS: Record<StatementStatus, string> = {
  aberta: "Aberta",
  fechada: "Fechada",
  paga: "Paga",
  atrasada: "Atrasada",
};

/* ───────────────────────────── Fase 04 — Parcelamentos ───────────────────────────── */

/**
 * Status de uma PARCELA (transaction_installments). No banco só `ativa`/`cancelada` são
 * persistidos; "paga" é DERIVADA na leitura do `pago_em` da fatura (statusEfetivo),
 * espelhando a filosofia "status na leitura" da fatura (Fase 03).
 */
export const INSTALLMENT_STATUSES = ["ativa", "paga", "cancelada"] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  ativa: "Ativa",
  paga: "Paga",
  cancelada: "Cancelada",
};

/** Status de um PARCELAMENTO (visão agregada da compra parcelada). */
export const INSTALLMENT_PURCHASE_STATUSES = [
  "ativo",
  "finalizado",
  "cancelado",
] as const;
export type InstallmentPurchaseStatus =
  (typeof INSTALLMENT_PURCHASE_STATUSES)[number];

export const INSTALLMENT_PURCHASE_STATUS_LABELS: Record<
  InstallmentPurchaseStatus,
  string
> = {
  ativo: "Ativo",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

/* ───────────────────────── Fase 05 — Gastos de Terceiros & Divisão ───────────────────────── */

/**
 * Classificação de uma despesa (casa com o CHECK de transactions.classificacao).
 * `pessoal`: 100% meu; `terceiro`: 100% de outra pessoa; `compartilhada`: dividida.
 * "Quanto eu gastei" usa SEMPRE `valor_pessoal` (não `amount`), para que valores de
 * terceiros não distorçam o gasto pessoal real — regra central da fase.
 */
export const CLASSIFICACOES = ["pessoal", "terceiro", "compartilhada"] as const;
export type Classificacao = (typeof CLASSIFICACOES)[number];

export const CLASSIFICACAO_LABELS: Record<Classificacao, string> = {
  pessoal: "Pessoal",
  terceiro: "De terceiro",
  compartilhada: "Compartilhada",
};

/** Como a parte de cada pessoa é informada (casa com shared_expenses.tipo_divisao). */
export const SPLIT_TYPES = ["valor", "percentual"] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

export const SPLIT_TYPE_LABELS: Record<SplitType, string> = {
  valor: "Valor (R$)",
  percentual: "Porcentagem (%)",
};

/** Status de um recebível (casa com o CHECK de receivables.status). */
export const RECEIVABLE_STATUSES = [
  "pendente",
  "cobrado",
  "pago",
  "ignorado",
] as const;
export type ReceivableStatus = (typeof RECEIVABLE_STATUSES)[number];

export const RECEIVABLE_STATUS_LABELS: Record<ReceivableStatus, string> = {
  pendente: "Pendente",
  cobrado: "Cobrado",
  pago: "Recebido",
  ignorado: "Ignorado",
};

/** Status que contam como "ainda a receber" (entram no total pendente). */
export const RECEIVABLE_OPEN_STATUSES: ReceivableStatus[] = [
  "pendente",
  "cobrado",
];
