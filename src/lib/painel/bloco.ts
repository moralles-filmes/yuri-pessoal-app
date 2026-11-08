/**
 * REDESIGN-04-A — o estado de um bloco do painel. PURO.
 *
 * ⛔ Três estados, três desenhos: leitura que FALHOU não é leitura que veio VAZIA. Mostrar "nada
 * por aqui" quando a consulta quebrou diz ao dono que não há registro onde pode haver — a mesma
 * mentira que "ausência não é zero" combate no resto do sistema.
 */
export type EstadoDoBloco = "conteudo" | "vazio" | "falha" | "nao-segue";
// `nao-segue` é o quarto estado, do relatório (04-A2 L1): o bloco não obedece ao filtro ativo e diz
// por quê. Não deriva de leitura — quem chama o decide pela matriz de recorte —, então
// `estadoDoBloco` não o devolve.

export function estadoDoBloco<T>(
  leitura: { ok: true; itens: readonly T[] } | { ok: false },
): EstadoDoBloco {
  if (!leitura.ok) return "falha";
  return leitura.itens.length === 0 ? "vazio" : "conteudo";
}
