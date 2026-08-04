/**
 * Sincronização entre um campo de texto e o parâmetro de URL que ele alimenta (PURO).
 *
 * ⛔ O BUG QUE ISTO CORRIGE: o campo de busca era controlado pelo valor da URL. Cada tecla
 * chamava `router.replace`, e como as páginas de módulo são `force-dynamic`, o `searchParams`
 * — e portanto o `value` do input — só voltava depois da ida ao servidor. Digitando rápido,
 * a letra sumia e o cursor pulava.
 *
 * A correção é ter DOIS valores: o local (que o usuário vê, instantâneo) e o da URL (que
 * preserva link, voltar e recarregar). Estas funções decidem quando um alcança o outro, sem
 * React e sem timers — por isso são testáveis direto.
 */

/**
 * O que o campo deve passar a mostrar quando a URL muda.
 *
 * `null` = não mexa no campo. Só adota o valor da URL quando a mudança veio **de fora**
 * (limpar filtros, botão voltar, link colado) — nunca quando é o eco da própria digitação.
 *
 * A comparação é com o texto **aparado** porque a URL só guarda o texto sem espaços nas
 * pontas: sem isso, digitar "supino " teria o espaço arrancado no meio da palavra seguinte.
 */
export function nextLocalText(input: {
  /** Texto que está no campo agora. */
  localText: string;
  /** Valor da URL no render anterior. */
  previousUrlText: string;
  /** Valor da URL agora. */
  urlText: string;
  /** Último texto que NÓS mandamos gravar (pode ainda estar em voo). */
  lastCommittedText?: string | null;
}): string | null {
  const { localText, previousUrlText, urlText, lastCommittedText } = input;
  if (urlText === previousUrlText) return null;
  if (urlText === localText.trim()) return null;
  // Eco atrasado de uma gravação nossa: a resposta do servidor demorou e o usuário já digitou
  // mais. Adotar aqui devolveria o texto antigo ao campo — o bug que este módulo existe para
  // evitar. Mudança vinda de fora nunca coincide com o que acabamos de gravar.
  if (lastCommittedText != null && urlText === lastCommittedText) return null;
  return urlText;
}

/** Se ainda falta gravar o texto digitado na URL. */
export function shouldCommitText(localText: string, urlText: string): boolean {
  return localText.trim() !== urlText;
}
