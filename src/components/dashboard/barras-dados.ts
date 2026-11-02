/**
 * Regra do gráfico de barras de entradas × saídas, PURA e sem imports de runtime: a fachada
 * (`barras-entradas-saidas-chart.tsx`) e o `-impl` precisam concordar sobre o que é "ter dado", e
 * duas cópias da regra divergiriam. A legenda do mês parcial só se justifica com barra na tela.
 */
export function temDadosNasBarras(
  dados: readonly { entradas: number; saidas: number }[],
): boolean {
  return dados.some((p) => p.entradas > 0 || p.saidas > 0);
}
