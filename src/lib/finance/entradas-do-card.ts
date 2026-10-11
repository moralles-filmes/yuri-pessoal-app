/**
 * REDESIGN-03-C · B1 — o que o card de "Entradas" mostra.
 * Fonte ÚNICA dos três cards: dashboard financeiro, relatório e dashboard geral.
 * Decisão do dono: espelhar o card de Saídas — o número principal continua sendo
 * `entradas` (bruto) e a separação aparece na DICA, porque pôr renda pessoal ao
 * lado de Saídas bruta convidaria à subtração renda pessoal − despesa bruta
 * que o §13.3 proíbe. Os gráficos (evolução, mês a mês) continuam brutos até a 04-A/06.
 */
import { formatCurrency, reaisParaCentavos } from "@/lib/format";

export type EntradasDoResumo = {
  entradas: number;
  entradasMeu: number;
  entradasTerceiros: number;
};

export type EntradasNoCard = { valor: number; detalhe: string | null };

export function apresentarEntradas(r: EntradasDoResumo): EntradasNoCard {
  // B1 — conserto aprovado pelo dono: a dica aparece só quando há entrada de terceiros
  // (comparada em centavos); o número principal continua o bruto.
  const detalhe = reaisParaCentavos(r.entradasTerceiros) === 0
    ? null
    : `minha ${formatCurrency(r.entradasMeu)} · de terceiros ${formatCurrency(r.entradasTerceiros)}`;
  return { valor: r.entradas, detalhe };
}
