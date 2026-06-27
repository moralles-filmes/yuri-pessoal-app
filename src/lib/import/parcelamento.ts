/**
 * Importar uma linha "k/N" de fatura COMO PARCELAMENTO (lógica PURA, testada em
 * parcelamento.test.ts).
 *
 * Regra de negócio (decidida com o usuário): numa fatura de cartão, o valor da linha "k/N" é o
 * valor de UMA parcela — NÃO o total da compra. Então, ao importar como parcelamento, geramos
 * apenas as parcelas RESTANTES (da atual `k` até a última `N`), cada uma no valor da linha,
 * preservando a numeração original (a 1ª gerada é a `k`, exibida como "k/N").
 *
 * Exemplo: linha "5/12" de R$105 → 8 parcelas (5..12) de R$105 cada; total gerado = R$840.
 * (O antigo comportamento dividia o valor da linha por N — R$105/12 — e gerava N parcelas.)
 *
 * Aritmética em CENTAVOS (inteiros), no mesmo espírito de installments.ts/normalize.ts.
 */
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";

export type PlanoImportParcelado = {
  /** Nº de parcelas a gerar = N − k + 1 (a atual + as futuras). */
  qtd: number;
  /** Número da 1ª parcela gerada (a atual `k`) — para preservar "k/N" na exibição. */
  numeroInicial: number;
  /** Total de parcelas da compra original `N` — vai em `total_parcelas` de cada parcela. */
  totalLabel: number;
  /** Total a parcelar = valor da linha × qtd (em centavos). */
  valorTotalCentavos: number;
};

/**
 * Planeja a importação de uma linha parcelada. `valorParcelaCentavos` é o valor de UMA parcela
 * (o valor da linha). Lança em entradas inválidas (numeração fora de 1..N, não-inteiros).
 */
export function planejarImportParcelado(params: {
  valorParcelaCentavos: number;
  parcela: number;
  parcelasTotal: number;
}): PlanoImportParcelado {
  const { valorParcelaCentavos, parcela, parcelasTotal } = params;

  if (!Number.isInteger(valorParcelaCentavos) || valorParcelaCentavos < 0) {
    throw new Error("valorParcelaCentavos deve ser um inteiro >= 0.");
  }
  if (!Number.isInteger(parcela) || !Number.isInteger(parcelasTotal)) {
    throw new Error("parcela e parcelasTotal devem ser inteiros.");
  }
  if (parcelasTotal < 1 || parcela < 1 || parcela > parcelasTotal) {
    throw new Error("Numeração de parcela inválida (exige 1 <= parcela <= total).");
  }

  const qtd = parcelasTotal - parcela + 1;
  return {
    qtd,
    numeroInicial: parcela,
    totalLabel: parcelasTotal,
    valorTotalCentavos: valorParcelaCentavos * qtd,
  };
}

/** Parte mínima da divisão (espelha SplitPartInput; `valor` em reais quando tipo='valor'). */
type ParteEscalavel = {
  tipo: "valor" | "percentual";
  valor?: number | null;
  percentual?: number | null;
};

/**
 * Ajusta as partes de divisão de uma linha PARCELADA importada do valor PER-PARCELA (o que o
 * usuário digita e o diálogo prevê — o valor da linha é UMA parcela) para o valor da COMPRA
 * INTEIRA que `createInstallmentPurchase`/`applySplitParcelado` esperam: lá a parte de cada
 * pessoa é dividida pelo total = parcela × `qtd` e espalhada nas `qtd` parcelas.
 *
 * Partes por VALOR são multiplicadas por `qtd` (R$X por parcela → R$X×qtd no total → volta a R$X
 * por parcela ao distribuir). Partes por PERCENTUAL não mudam (P% da parcela = P% do total). Sem
 * isso, o recebível de cada terceiro fica dividido por `qtd` — o bug das faturas de terceiros.
 * Multiplica em CENTAVOS para não arrastar erro de ponto flutuante.
 */
export function escalarPartesParcelado<T extends ParteEscalavel>(
  parts: T[],
  qtd: number,
): T[] {
  if (!Number.isInteger(qtd) || qtd < 1) {
    throw new Error("qtd deve ser um inteiro >= 1.");
  }
  return parts.map((p) =>
    p.tipo === "valor" && p.valor != null
      ? { ...p, valor: centavosParaReais(reaisParaCentavos(p.valor) * qtd) }
      : p,
  );
}
