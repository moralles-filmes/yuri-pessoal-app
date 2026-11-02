/**
 * REDESIGN-04-A — saudação e frase do banner do painel. PURO: `hoje` e a hora chegam de fora, nada
 * aqui lê o relógio.
 */

/**
 * "Bom dia" de 05:00 a 11:59, "Boa tarde" de 12:00 a 17:59, "Boa noite" no resto (18:00 a 04:59).
 * Recebe a hora de parede de Brasília como 'HH:mm'.
 */
export function saudacaoPara(horaHHmm: string): "Bom dia" | "Boa tarde" | "Boa noite" {
  const hora = Number.parseInt(horaHHmm.slice(0, 2), 10);
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Frases curtas do banner. Nem prescrevem nem cobram: não mandam o dono fazer nada, não apontam o
 * que ele deixou de fazer. O teste varre cada uma por `termosProibidosEm`.
 */
export const FRASES_DO_BANNER: readonly string[] = [
  "Um passo de cada vez.",
  "Seu dinheiro, do seu jeito.",
  "Clareza antes de qualquer decisão.",
  "Cada registro conta uma parte da história.",
  "Tudo o que importa, num só lugar.",
  "Os números estão aqui quando você quiser olhar.",
  "Sem pressa: o mês tem o tempo dele.",
  "Organização também é descanso.",
  "Cada lançamento deixa o quadro mais nítido.",
  "Hoje é um bom dia para olhar com calma.",
];

const MS_POR_DIA = 86_400_000;

/**
 * A frase do dia: a mesma para o mesmo `hoje` e uma diferente a cada dia, dando a volta na lista.
 * O índice é o número de dias desde 1970-01-01 (`Date.UTC`, sem fuso) módulo o tamanho da lista.
 */
export function fraseDoDia(hoje: string, lista: readonly string[]): string {
  const [ano, mes, dia] = hoje.split("-").map(Number);
  const dias = Math.floor(Date.UTC(ano, mes - 1, dia) / MS_POR_DIA);
  const indice = ((dias % lista.length) + lista.length) % lista.length;
  return lista[indice];
}
