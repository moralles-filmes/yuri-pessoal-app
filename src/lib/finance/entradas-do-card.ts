/**
 * REDESIGN-03-C · B1 — o que o card de "Entradas" mostra.
 * Fonte ÚNICA dos três cards: dashboard financeiro, relatório e dashboard geral.
 * Decisão do dono: espelhar o card de Saídas — o número principal continua sendo
 * `entradas` (bruto) e a separação aparece na DICA, porque pôr renda pessoal ao
 * lado de Saídas bruta convidaria à subtração renda pessoal − despesa bruta
 * que o §13.3 proíbe. Os gráficos (evolução, mês a mês) continuam brutos até a 04-A/06.
 */
export type EntradasDoResumo = {
  entradas: number;
  entradasMeu: number;
  entradasTerceiros: number;
};

export type EntradasNoCard = { valor: number; detalhe: string | null };

export function apresentarEntradas(r: EntradasDoResumo): EntradasNoCard {
  // B1 commit 1 — CARACTERIZA o hoje: bruto no número e nenhuma linha de terceiros,
  // mesmo quando há terceiros; o commit seguinte acende o detalhe.
  return { valor: r.entradas, detalhe: null };
}
