/**
 * REDESIGN-04-A — o "olho" dos valores do painel (ocultar/mostrar). PURO: só o nome do cookie e a
 * decisão sobre o valor lido dele.
 *
 * ⛔ Só o valor exato "1" oculta. Cookie ausente, vazio, "0", "true" ou qualquer outra coisa deixa os
 * valores VISÍVEIS: um valor inesperado nunca pode esconder o dinheiro do dono sem ele ter pedido.
 * É discrição, não segurança — os valores reais continuam no payload.
 */
export const COOKIE_DO_OLHO = "fin_ocultar_valores";

export function valoresOcultos(valor: string | undefined): boolean {
  return valor === "1";
}
