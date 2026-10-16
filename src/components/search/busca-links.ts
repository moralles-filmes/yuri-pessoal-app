/**
 * REDESIGN-07-D · D6 — a URL de `/busca`, num construtor só.
 *
 * A página de busca (ao digitar) e a paleta Ctrl+K ("Ver todos os resultados") escrevem a mesma
 * URL. Abaixo de 2 caracteres a busca não roda, e a URL fica sem `q` — a mesma regra que a tela
 * aplicava à mão. `busca-links.test.ts` confere que a página lê a chave. Puro, sem import.
 */
export function buscaLink(termo = ""): string {
  const t = termo.trim();
  return t.length >= 2 ? `/busca?q=${encodeURIComponent(t)}` : "/busca";
}
