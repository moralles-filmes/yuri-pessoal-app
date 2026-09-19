/**
 * Soma dos valores de uma importação na revisão (lógica PURA, testada em totals.test.ts).
 * Usado para mostrar ao usuário o total que será criado e permitir conferir contra a fatura.
 *
 * `import_rows.valor` é gravado em REAIS (ver imports.ts/toRowInserts) e sempre como magnitude
 * positiva (mapping.ts deriva o `tipo`). Para evitar drift de ponto flutuante na soma, somamos
 * em CENTAVOS (inteiros) e convertemos de volta no fim — mesmo espírito de installments.ts/split.ts.
 */
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";
import type { ImportRowStatus, ImportRowTipo } from "@/lib/import/constants";

/** Forma mínima de uma linha para o cálculo (subconjunto de ImportRowWithRelations). */
export type ImportRowTotalInput = {
  status: ImportRowStatus;
  valor: number | null;
  tipo: ImportRowTipo | null;
  /** Preenchida = a linha é uma transferência entre contas do dono (ver `transferencia.ts`). */
  transfer_account_id: string | null;
};

export type ImportTotals = {
  /** Quantidade de linhas no status pedido (inclui as sem valor). */
  count: number;
  /** Soma das despesas, em reais. */
  despesas: number;
  /** Soma das receitas, em reais. */
  receitas: number;
  /** Soma das transferências, em reais. FORA do líquido (ver abaixo). */
  transferencias: number;
  /** Despesas − receitas, em reais (total líquido a comparar com a fatura). */
  liquido: number;
};

/**
 * Soma os valores das linhas em um dado status (default 'para_importar' — exatamente o que o
 * commit cria; ignoradas, duplicadas e erros ficam de fora). Linhas sem valor entram na contagem
 * mas não somam. Em fatura de cartão toda linha é despesa, então `liquido === despesas`.
 *
 * ⚠️ **Transferência tem soma própria e NÃO entra no líquido.** Ela não é gasto nem entrada —
 * é dinheiro mudando de lugar, e o resto do sistema já a trata assim (`public.account_balance`
 * deriva as duas pernas da mesma linha; os relatórios a deixam fora de entradas/saídas).
 * Somá-la como despesa, que era o efeito do `else` anterior, faria o total do extrato mentir
 * exatamente no valor das maiores linhas do mês.
 *
 * Quem decide é `transfer_account_id`, não `tipo`: `tipo` continua guardando o SENTIDO da
 * transferência (saiu × entrou), que é o que o commit usa para saber qual conta é a origem.
 */
export function totaisPorStatus(
  rows: ImportRowTotalInput[],
  status: ImportRowStatus = "para_importar",
): ImportTotals {
  let despesasC = 0;
  let receitasC = 0;
  let transferenciasC = 0;
  let count = 0;
  for (const r of rows) {
    if (r.status !== status) continue;
    count++;
    if (r.valor == null) continue;
    const c = reaisParaCentavos(r.valor);
    if (r.transfer_account_id) transferenciasC += c;
    else if (r.tipo === "receita") receitasC += c;
    else despesasC += c;
  }
  return {
    count,
    despesas: centavosParaReais(despesasC),
    receitas: centavosParaReais(receitasC),
    transferencias: centavosParaReais(transferenciasC),
    liquido: centavosParaReais(despesasC - receitasC),
  };
}
