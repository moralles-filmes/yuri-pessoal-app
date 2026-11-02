/**
 * REDESIGN-04-A2 · T8 — a URL do relatório financeiro, pura (a tela e a página a leem).
 *
 * Só `import type`: nenhum runtime. A ordem dos parâmetros é FIXA (mes, base, resp, conta, cartao,
 * pessoa, categoria) e o padrão é OMITIDO — `base=competencia` e `resp=meu` nunca aparecem —, para
 * que o mesmo estado produza sempre a mesma URL (link, voltar e recarregar).
 */
import type { BaseFinanceira } from "@/lib/finance/base";
import type { Recorte, TipoDeRecorte } from "@/lib/finance/recorte";
import type { Responsabilidade } from "@/lib/finance/responsabilidade";

export function urlDoRelatorio(p: {
  mes: string;
  base: BaseFinanceira;
  resp: Responsabilidade;
  recorte: Recorte;
}): string {
  const partes: [string, string][] = [["mes", p.mes]];
  if (p.base === "caixa") partes.push(["base", "caixa"]);
  if (p.resp !== "meu") partes.push(["resp", p.resp]);
  if (p.recorte.conta !== null) partes.push(["conta", p.recorte.conta]);
  if (p.recorte.cartao !== null) partes.push(["cartao", p.recorte.cartao]);
  if (p.recorte.pessoa !== null) partes.push(["pessoa", p.recorte.pessoa]);
  if (p.recorte.categoria !== null) partes.push(["categoria", p.recorte.categoria]);
  return `/relatorios?${partes.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

/**
 * Troca UM recorte (`id` nulo o limpa). Conta e cartão se excluem (D-A2-1): escolher um zera o outro;
 * pessoa e categoria não mexem em nenhum dos dois. Devolve objeto novo.
 */
export function comRecorte(atual: Recorte, tipo: TipoDeRecorte, id: string | null): Recorte {
  const novo: Recorte = { ...atual, [tipo]: id };
  if (id !== null && tipo === "conta") novo.cartao = null;
  if (id !== null && tipo === "cartao") novo.conta = null;
  return novo;
}

/** O relatório do mês sem nenhum filtro (a base e a responsabilidade voltam ao padrão). */
export function semFiltros(mes: string): string {
  return `/relatorios?mes=${encodeURIComponent(mes)}`;
}
