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
 *
 * Desde a REDESIGN-07-A um alvo pode ser um OBJETO com `tambem`: as rotas que ele representa
 * além do próprio href. Continua uma decisão só, com no máximo um vencedor.
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
 * Um alvo de navegação: o href que ele abre e, opcionalmente, outras rotas que ele
 * REPRESENTA (07-A). "Rotinas e tarefas" abre `/rotinas` e acende também em `/tarefas`;
 * a 05 vai fazer o mesmo com `/cartoes` representando `/faturas` e `/parcelamentos`.
 */
export type AlvoDeNavegacao =
  | string
  | { readonly href: string; readonly tambem?: readonly string[] };

/** Todas as rotas que um alvo reivindica: o href e as que ele representa. */
export function rotasDeclaradas(alvo: AlvoDeNavegacao): readonly string[] {
  return typeof alvo === "string" ? [alvo] : [alvo.href, ...(alvo.tambem ?? [])];
}

/**
 * O `href` do alvo que cobre esta rota com a rota declarada mais funda, ou `null`.
 * Continua UMA decisão com no máximo um vencedor: cada rota declarada de cada alvo disputa,
 * e a comparação por comprimento segue exata (todas as que casam são ancestrais-ou-iguais
 * do mesmo pathname).
 */
export function hrefAtivo(pathname: string, alvos: readonly AlvoDeNavegacao[]): string | null {
  let vencedor: string | null = null;
  let profundidade = -1;
  for (const alvo of alvos) {
    for (const rota of rotasDeclaradas(alvo)) {
      if (casa(pathname, rota) && rota.length > profundidade) {
        profundidade = rota.length;
        vencedor = typeof alvo === "string" ? alvo : alvo.href;
      }
    }
  }
  return vencedor;
}
