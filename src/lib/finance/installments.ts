/**
 * Fase 04 — Cálculo de parcelas (lógica PURA, testada em installments.test.ts).
 *
 * DECISÃO DE MODELAGEM
 * --------------------
 * Uma compra parcelada é representada por:
 *  - 1 linha em `transactions` (a compra ORIGINAL) que guarda o TOTAL (`valor_total`) e os
 *    metadados (`parcelado`, `qtd_parcelas`). Ela fica com `statement_id` NULL e NÃO entra
 *    em fatura nenhuma — é a âncora/registro do gasto e o "pai" das parcelas.
 *  - N linhas em `transaction_installments` (as parcelas), cada uma com seu `valor`, `numero`
 *    e `statement_id` (a fatura onde a parcela cai).
 * A FATURA soma as PARCELAS (não o valor cheio da compra) — ver a view
 * `card_statements_with_total`, atualizada na Fase 04 para somar transações à vista + parcelas.
 *
 * PRECISÃO
 * --------
 * Toda a aritmética de dinheiro é feita em CENTAVOS (inteiros) para evitar erro de ponto
 * flutuante. A soma das parcelas é SEMPRE exatamente igual ao total — o resto de centavos
 * é concentrado na ÚLTIMA parcela. A distribuição em faturas REUSA a regra da Fase 03
 * (`invoice.ts`: `resolverFatura`/`montarFatura`); não reimplementa o cálculo de fatura.
 */
import { addMonths } from "date-fns";
import {
  montarFatura,
  resolverFatura,
  type FaturaAlvo,
} from "@/lib/finance/invoice";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";

/** Plano de uma parcela: número (1..N), valor e a fatura-alvo onde ela cai. */
export type ParcelaPlano = {
  numero: number;
  valorCentavos: number;
  valor: number; // reais (numeric(14,2))
  fatura: FaturaAlvo;
};

/**
 * Divide `valorTotalCentavos` em `qtd` parcelas inteiras (centavos). As `qtd-1` primeiras
 * recebem `floor(total/qtd)`; a ÚLTIMA recebe o resto — garante soma exata = total.
 */
export function dividirParcelas(
  valorTotalCentavos: number,
  qtd: number,
): number[] {
  if (!Number.isInteger(valorTotalCentavos) || valorTotalCentavos < 0) {
    throw new Error("valorTotalCentavos deve ser um inteiro >= 0.");
  }
  if (!Number.isInteger(qtd) || qtd < 1) {
    throw new Error("qtd deve ser um inteiro >= 1.");
  }
  const base = Math.floor(valorTotalCentavos / qtd);
  const parcelas = new Array<number>(qtd).fill(base);
  parcelas[qtd - 1] = valorTotalCentavos - base * (qtd - 1);
  return parcelas;
}

/** Soma de um array de centavos. */
export function somaCentavos(valores: number[]): number {
  return valores.reduce((acc, v) => acc + v, 0);
}

/**
 * Aplica um override manual do valor (centavos) da ÚLTIMA parcela, mantendo as demais no
 * valor base. Só retorna o array se a soma continuar EXATAMENTE igual ao total; senão lança
 * ("a soma não fecha"). Deve ser validado no servidor antes de gravar.
 */
export function aplicarOverrideUltima(
  valorTotalCentavos: number,
  qtd: number,
  overrideUltimaCentavos: number,
): number[] {
  if (!Number.isInteger(overrideUltimaCentavos) || overrideUltimaCentavos < 0) {
    throw new Error("Override inválido.");
  }
  const parcelas = dividirParcelas(valorTotalCentavos, qtd);
  parcelas[qtd - 1] = overrideUltimaCentavos;
  if (somaCentavos(parcelas) !== valorTotalCentavos) {
    throw new Error("A soma das parcelas não bate com o total.");
  }
  return parcelas;
}

/** True se um override da última parcela mantém a soma exatamente igual ao total. */
export function overrideUltimaValido(
  valorTotalCentavos: number,
  qtd: number,
  overrideUltimaCentavos: number,
): boolean {
  try {
    aplicarOverrideUltima(valorTotalCentavos, qtd, overrideUltimaCentavos);
    return true;
  } catch {
    return false;
  }
}

/**
 * Faturas-alvo das `qtd` parcelas: a 1ª sai de `resolverFatura(dataCompra)`; a parcela i
 * cai na competência da 1ª + (i-1) meses (REUSA `montarFatura`). Cobre virada de ano.
 */
export function distribuirFaturas(
  dataCompra: string | Date,
  qtd: number,
  diaFechamento: number,
  diaVencimento: number,
): FaturaAlvo[] {
  if (!Number.isInteger(qtd) || qtd < 1) {
    throw new Error("qtd deve ser um inteiro >= 1.");
  }
  const primeira = resolverFatura(dataCompra, diaFechamento, diaVencimento);
  const [fy, fm] = primeira.competencia.split("-").map(Number); // 'yyyy-MM-01'
  const faturas: FaturaAlvo[] = [];
  for (let i = 0; i < qtd; i++) {
    const mes = addMonths(new Date(fy, fm - 1, 1), i);
    faturas.push(
      montarFatura(
        mes.getFullYear(),
        mes.getMonth(),
        diaFechamento,
        diaVencimento,
      ),
    );
  }
  return faturas;
}

/**
 * Plano completo do parcelamento: junta o valor de cada parcela (ajuste de centavos na
 * última, ou override validado) com a fatura-alvo de cada uma. Puro — usado tanto no preview
 * (UI) quanto na criação (servidor), garantindo que mostram exatamente a mesma coisa.
 */
export function planejarParcelamento(params: {
  valorTotalReais: number;
  qtd: number;
  dataCompra: string | Date;
  diaFechamento: number;
  diaVencimento: number;
  overrideUltimaCentavos?: number | null;
}): ParcelaPlano[] {
  const totalCentavos = reaisParaCentavos(params.valorTotalReais);
  const valores =
    params.overrideUltimaCentavos != null
      ? aplicarOverrideUltima(
          totalCentavos,
          params.qtd,
          params.overrideUltimaCentavos,
        )
      : dividirParcelas(totalCentavos, params.qtd);
  const faturas = distribuirFaturas(
    params.dataCompra,
    params.qtd,
    params.diaFechamento,
    params.diaVencimento,
  );
  return valores.map((c, idx) => ({
    numero: idx + 1,
    valorCentavos: c,
    valor: centavosParaReais(c),
    fatura: faturas[idx],
  }));
}
