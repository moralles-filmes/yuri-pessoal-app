/**
 * REDESIGN-06 (§6) — o estado de um limite de erro por bloco do dashboard. Puro.
 *
 * `erro` é o que o error boundary capturou; `null` é "nada falhou". Qualquer valor não nulo
 * (inclusive um `throw` de string) conta como falha — o limite não decide pelo tipo do erro.
 */
export function estadoDoLimite(s: { erro: unknown | null }): "conteudo" | "falha" {
  return s.erro === null ? "conteudo" : "falha";
}
