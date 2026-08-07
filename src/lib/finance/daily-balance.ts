/**
 * Saldo por dia da lista de lançamentos (extrato). Lógica pura, sem I/O e sem `Date.now()`
 * — o saldo de abertura e os dias vêm injetados por quem lê o banco (`getDailyBalances`).
 *
 * O contrato do saldo é o MESMO da função `public.account_balance` (migration
 * 20260625120600_account_balance.sql): saldo do dia D = saldo inicial da(s) conta(s) +
 * soma dos lançamentos LIQUIDADOS (`pago`/`recebido`) com `competence_date <= D`.
 * A tabela de sinais vive aqui e lá — `efeitoNoSaldo` é a versão testável dela, e o teste
 * co-localizado a fixa. Ao mexer numa das duas, mexa na outra.
 *
 * Três regras que o módulo carrega:
 *  - **Cartão não move saldo.** Compra de cartão não tem `account_id`; quem tira dinheiro da
 *    conta é o pagamento da fatura (gravado como `transferencia` com destino nulo).
 *  - **Ausência de liquidação não é zero à toa:** `pendente` e `cancelado` simplesmente não
 *    entram, como no resto do sistema (SETTLED_STATUSES).
 *  - **A conta é feita em centavos inteiros.** `amount` é `numeric(14,2)`; somar centenas de
 *    reais em ponto flutuante acumula erro de centavo no total exibido.
 */
import { SETTLED_STATUSES } from "@/lib/finance/constants";
import type { TransactionStatus, TransactionType } from "@/lib/finance/constants";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";

/** O mínimo de um lançamento para decidir seu efeito no saldo. */
export type MovimentoDeSaldo = {
  /** Data pura 'yyyy-MM-dd' (coluna `date`) — comparada como TEXTO, nunca como `Date`. */
  competence_date: string;
  type: TransactionType;
  status: TransactionStatus;
  /** Sempre positivo no banco (`check (amount >= 0)`); o sinal vem de `type`. */
  amount: number;
  account_id: string | null;
  transfer_account_id: string | null;
};

/**
 * Escopo do saldo: o id da conta filtrada, ou `null` para "todas as contas somadas".
 * Filtro de cartão não produz escopo — a página nem chama o cálculo nesse caso.
 */
export type EscopoDeSaldo = string | null;

/** O lançamento pertence ao escopo pelo lado "dono" (`account_id`)? */
function noEscopo(accountId: string | null, escopo: EscopoDeSaldo): boolean {
  if (accountId == null) return false; // cartão (ou conta apagada): não move saldo
  return escopo === null || accountId === escopo;
}

/**
 * Quanto este lançamento move o saldo do escopo, em REAIS (positivo entra, negativo sai).
 * Espelha a tabela de sinais de `public.account_balance`.
 */
export function efeitoNoSaldo(
  mov: MovimentoDeSaldo,
  escopo: EscopoDeSaldo,
): number {
  return centavosParaReais(efeitoEmCentavos(mov, escopo));
}

function efeitoEmCentavos(
  mov: MovimentoDeSaldo,
  escopo: EscopoDeSaldo,
): number {
  if (!SETTLED_STATUSES.includes(mov.status)) return 0;

  const valor = reaisParaCentavos(mov.amount);

  if (mov.type === "transferencia") {
    // Duas pernas na mesma linha. Entre contas próprias com escopo "todas", uma anula a
    // outra; no pagamento de fatura o destino é nulo, então só a saída conta.
    let efeito = 0;
    if (noEscopo(mov.account_id, escopo)) efeito -= valor;
    if (noEscopo(mov.transfer_account_id, escopo)) efeito += valor;
    return efeito;
  }

  if (!noEscopo(mov.account_id, escopo)) return 0;

  switch (mov.type) {
    case "receita":
    case "ajuste":
      return valor;
    case "despesa":
      return -valor;
    default:
      return 0;
  }
}

export type SaldosPorDiaParams = {
  /** Saldo em reais no fim do dia ANTERIOR ao primeiro dia pedido (vem do banco). */
  abertura: number;
  escopo: EscopoDeSaldo;
  /** Dias que precisam de saldo ('yyyy-MM-dd'), em qualquer ordem. */
  dias: string[];
  /** Lançamentos da janela, em qualquer ordem. */
  movimentos: MovimentoDeSaldo[];
};

/**
 * Saldo do FIM de cada dia pedido — todos os lançamentos daquele dia já entraram.
 *
 * Devolve um saldo para CADA dia pedido, inclusive dias sem movimento na conta (um dia que
 * na lista só tem compra de cartão tem saldo: o mesmo do dia anterior). Comparar as datas
 * como texto funciona porque 'yyyy-MM-dd' ordena lexicograficamente igual a cronologicamente.
 */
export function saldosPorDia({
  abertura,
  escopo,
  dias,
  movimentos,
}: SaldosPorDiaParams): Map<string, number> {
  const saldos = new Map<string, number>();
  const pedidos = [...new Set(dias)].sort();
  if (pedidos.length === 0) return saldos;

  const ordenados = [...movimentos].sort((a, b) =>
    a.competence_date < b.competence_date
      ? -1
      : a.competence_date > b.competence_date
        ? 1
        : 0,
  );

  let saldo = reaisParaCentavos(abertura);
  let i = 0;
  for (const dia of pedidos) {
    while (i < ordenados.length && ordenados[i].competence_date <= dia) {
      saldo += efeitoEmCentavos(ordenados[i], escopo);
      i += 1;
    }
    saldos.set(dia, centavosParaReais(saldo));
  }
  return saldos;
}
