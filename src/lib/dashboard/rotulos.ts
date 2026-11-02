/**
 * Rótulos pt-BR de "hoje" para a página do Dashboard Geral (lógica PURA).
 *
 * O dia da semana é calculado com `Date.UTC` sobre o TEXTO 'yyyy-MM-dd', nunca com o
 * fuso do processo: a data de Brasília não pode mudar de dia da semana conforme o
 * servidor roda em UTC ou em São Paulo.
 */

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const;

/** 'yyyy-MM-dd' → { dia, mes, diaSemana } sem tocar em Date local. */
function partesDaData(hojeIso: string): { dd: string; mm: string; diaSemana: string } {
  const [y, m, d] = hojeIso.split("-").map(Number);
  const diaSemana = DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return {
    dd: hojeIso.slice(8, 10),
    mm: hojeIso.slice(5, 7),
    diaSemana,
  };
}

/** 'yyyy-MM-dd' → "hoje, qua 18/11" (dia da semana abreviado, minúsculo, sem ponto). */
export function rotuloDeHoje(hojeIso: string): string {
  const { dd, mm, diaSemana } = partesDaData(hojeIso);
  return `hoje, ${diaSemana} ${dd}/${mm}`;
}

/** 'yyyy-MM-dd' → "18/11". */
export function rotuloDoDia(hojeIso: string): string {
  const { dd, mm } = partesDaData(hojeIso);
  return `${dd}/${mm}`;
}
