/**
 * REDESIGN-07-D · D5 — a URL de `/notificacoes`, num construtor só.
 *
 * Os filtros vivem na URL (padrão do projeto), e a URL era montada à mão dentro do `setFilter`
 * da tela. Aqui ela tem um lugar, e o "Limpar filtros" do vazio chama o construtor sem
 * argumento. `notificacoes-links.test.ts` confere que a página lê cada chave escrita.
 *
 * "todas" é o valor de "sem filtro" nos três seletores, e não vai para a URL. Puro, sem import.
 */

export type FiltrosDeNotificacao = {
  readonly status?: string;
  readonly tipo?: string;
  readonly prioridade?: string;
};

export function notificacoesLink(filtros: FiltrosDeNotificacao = {}): string {
  const params = new URLSearchParams();
  for (const chave of ["status", "tipo", "prioridade"] as const) {
    const valor = filtros[chave];
    if (valor && valor !== "todas") params.set(chave, valor);
  }
  const qs = params.toString();
  return qs ? `/notificacoes?${qs}` : "/notificacoes";
}
