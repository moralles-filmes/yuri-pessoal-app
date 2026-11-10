/**
 * REDESIGN-09-G — as duas ações que a barra do celular pede à casca. `QuickAdd` e
 * `SearchCommand` são donos do próprio `open`; em vez de subir o estado, a barra dispara um
 * evento de `window` e cada um deles o ouve. O acoplamento é invisível ao `tsc`: o teste de
 * fonte exige emissor e ouvinte com a MESMA constante.
 *
 * Zero imports, de propósito: a barra mora na casca, e o que ela importa entra em todas as rotas.
 */
export const EVENTO_ABRIR_BUSCA = "yuri:abrir-busca";
export const EVENTO_ABRIR_LANCAMENTO = "yuri:abrir-lancamento";

export function pedirAcaoDaCasca(
  evento: typeof EVENTO_ABRIR_BUSCA | typeof EVENTO_ABRIR_LANCAMENTO,
): void {
  window.dispatchEvent(new Event(evento));
}
