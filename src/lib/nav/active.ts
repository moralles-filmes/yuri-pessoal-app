/**
 * Qual item de navegação está ativo — UMA decisão, num lugar só.
 *
 * Até a REDESIGN-02-C isto estava escrito SEIS vezes no repositório, cada uma um
 * pouco diferente: a sidebar sem guarda nenhuma, três navs de módulo com uma
 * exceção escrita à mão para a rota-índice, as abas do Financeiro com um campo
 * `exact: true` nos dados, e `findNavItem` em `config/nav.ts` — a única correta,
 * e sem um único consumidor.
 *
 * ⛔ O QUE MUDA NÃO É O ALGORITMO, É A FORMA DA RESPOSTA. A pergunta antiga era
 * feita item a item ("este aqui está ativo?"), e uma resposta por item torna
 * REPRESENTÁVEL o estado "dois itens ativos" — que era o que acontecia em
 * `/dashboard/financeiro`, com `/dashboard` e `/dashboard/financeiro` acesos ao
 * mesmo tempo. Aqui a pergunta é feita uma vez sobre a lista inteira e devolve
 * NO MÁXIMO UM vencedor. Dois itens acesos deixa de ser um bug a evitar e passa
 * a ser um estado que não existe.
 *
 * A exceção da rota-índice cai fora de graça: `/nutricao` só vence quando nada
 * mais fundo casou. Não escreva `if (href === "/x") return pathname === "/x"` de
 * novo — é essa regra, redescoberta um módulo por vez.
 *
 * Módulo puro e SEM IMPORTS: ele é lido pela casca do app, e o que a casca
 * importa entra nas 67 rotas.
 */

/**
 * Um href casa com a rota quando é a própria rota ou um ancestral **de segmento**
 * dela. A barra em `${href}/` é o que separa ancestral de homônimo: sem ela,
 * `/financeiro` casaria com `/financeiros`.
 */
function casa(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * O href mais específico da lista que cobre esta rota, ou `null` se nenhum cobre.
 *
 * Comparar por comprimento aqui é exato, não heurística: todo href que casa é
 * ancestral-ou-igual da MESMA rota, então dois quaisquer deles são prefixos um do
 * outro — o mais longo é o mais fundo, e empate só aconteceria entre hrefs
 * idênticos.
 */
export function hrefAtivo(pathname: string, hrefs: readonly string[]): string | null {
  let vencedor: string | null = null;
  for (const href of hrefs) {
    if (casa(pathname, href) && (vencedor === null || href.length > vencedor.length)) {
      vencedor = href;
    }
  }
  return vencedor;
}
