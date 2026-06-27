/**
 * Soma dos valores de uma importação na revisão (lógica PURA, testada em totals.test.ts).
 * Usado para mostrar ao usuário o total que será criado e permitir conferir contra a fatura.
 *
 * `import_rows.valor` é gravado em REAIS (ver imports.ts/toRowInserts) e sempre como magnitude
 * positiva (mapping.ts deriva o `tipo`). Para evitar drift de ponto flutuante na soma, somamos
 * em CENTAVOS (inteiros) e convertemos de volta no fim — mesmo espírito de installments.ts/split.ts.
 */
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";
import type { ImportRowStatus } from "@/lib/import/constants";

/** Forma mínima de uma linha para o cálculo (subconjunto de ImportRowWithRelations). */
export type ImportRowTotalInput = {
  status: ImportRowStatus;
  valor: number | null;
  tipo: "despesa" | "receita" | null;
};

export type ImportTotals = {
  /** Quantidade de linhas no status pedido (inclui as sem valor). */
  count: number;
  /** Soma das despesas, em reais. */
  despesas: number;
  /** Soma das receitas, em reais. */
  receitas: number;
  /** Despesas − receitas, em reais (total líquido a comparar com a fatura). */
  liquido: number;
};

/**
 * Soma os valores das linhas em um dado status (default 'para_importar' — exatamente o que o
 * commit cria; ignoradas, duplicadas e erros ficam de fora). Linhas sem valor entram na contagem
 * mas não somam. Em fatura de cartão toda linha é despesa, então `liquido === despesas`.
 */
export function totaisPorStatus(
  rows: ImportRowTotalInput[],
  status: ImportRowStatus = "para_importar",
): ImportTotals {
  let despesasC = 0;
  let receitasC = 0;
  let count = 0;
  for (const r of rows) {
    if (r.status !== status) continue;
    count++;
    if (r.valor == null) continue;
    const c = reaisParaCentavos(r.valor);
    if (r.tipo === "receita") receitasC += c;
    else despesasC += c;
  }
  return {
    count,
    despesas: centavosParaReais(despesasC),
    receitas: centavosParaReais(receitasC),
    liquido: centavosParaReais(despesasC - receitasC),
  };
}
