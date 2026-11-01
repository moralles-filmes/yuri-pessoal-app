/**
 * 03-G2 (S10, D-G2-11, K1) — as frases do commit da importação, num módulo PURO.
 *
 * `imports.ts` é `"use server"` e só pode exportar funções async; por isso as constantes e a
 * função de frase moram aqui, onde a action e os testes as leem pela mesma fonte.
 */

/**
 * Motivo gravado na linha ao RESERVÁ-LA, antes de criar o lançamento. Se o processo cair no meio,
 * a linha fica fora de `para_importar` dizendo a verdade: pode ter sido lançada.
 */
export const MOTIVO_IMPORTACAO_INTERROMPIDA =
  "A importação desta linha foi interrompida e ela pode ter sido lançada. Confira em Lançamentos antes de marcar para importar de novo.";

/** Frase de lote quando o commit para por uma escrita que falhou, depois de `n` linhas reservadas. */
export function fraseDoCommitInterrompido(n: number): string {
  return `A importação parou depois de ${n} linha(s). As que faltam continuam marcadas para importar; confira as marcadas com erro em Lançamentos antes de importar de novo.`;
}

/**
 * As linhas entraram, mas o lote não foi marcado. ⚠️ A frase NÃO manda importar de novo (o texto da
 * §5.7 mandava): sem linha `para_importar`, `commitImport` recusa antes da recontagem, e os totais
 * não seriam atualizados. Ela diz o que é verdade — os lançamentos existem, só os totais do lote
 * ficaram para trás (03-G2 E7, revisão no principal).
 */
export const FRASE_DO_LOTE_NAO_MARCADO =
  "As linhas foram importadas e os lançamentos já estão em Lançamentos, mas o lote não foi marcado como importado e os totais dele ficaram desatualizados. Não importe de novo.";
