import type { TooltipPayloadEntry } from "recharts";

/**
 * Uma linha da dica em vidro, já formatada. Puro e sem runtime: só o TIPO da entrada vem da
 * recharts, então este arquivo cabe em teste de unidade e em qualquer fachada sem arrastá-la.
 */
export type EntradaDaDica = TooltipPayloadEntry;

export type LinhaDaDica = {
  chave: string;
  nome: string;
  cor: string;
  valor: string;
  /** Dinheiro obedece ao olho dos valores (`ValorComOlho`); contagem e porcentagem, não. */
  dinheiro: boolean;
};

/**
 * Monta as linhas da dica. `formatar` devolve `null` para a entrada que NÃO entra (série sem
 * dado naquele ponto) — descartar é a única coisa que ela faz com o vazio: zero medido continua
 * sendo uma linha com o zero escrito, e valor ausente nunca vira zero aqui.
 */
export function linhasDaDica(
  payload: readonly EntradaDaDica[],
  formatar: (e: EntradaDaDica) => { nome?: string; valor: string; dinheiro: boolean } | null,
): LinhaDaDica[] {
  const usadas = new Set<string>();
  const linhas: LinhaDaDica[] = [];
  payload.forEach((entrada, i) => {
    const f = formatar(entrada);
    if (f === null) return;
    const base = String(entrada.dataKey ?? entrada.name ?? i);
    const chave = usadas.has(base) ? `${base}-${i}` : base;
    usadas.add(chave);
    linhas.push({
      chave,
      nome: f.nome ?? (entrada.name === undefined ? "" : String(entrada.name)),
      cor: entrada.color ?? entrada.fill ?? entrada.stroke ?? "var(--muted-foreground)",
      valor: f.valor,
      dinheiro: f.dinheiro,
    });
  });
  return linhas;
}
