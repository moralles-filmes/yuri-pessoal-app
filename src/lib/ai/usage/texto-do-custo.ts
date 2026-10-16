/**
 * REDESIGN-07-D · Z — o texto da célula "Custo" de `/ia/consumo`, por modelo.
 *
 * `getUsageByModel` começa `custoUsd: 0` e só soma o custo PRESENTE (invariante 11: provedor que
 * não informa tokens deixa `estimated_cost` nulo). Uma linha em que nenhuma tentativa teve custo
 * aparecia como "US$ 0,000000" — ausência virando zero. Aqui:
 *  • nenhuma com custo → "não medido";
 *  • parte sem custo → o valor somado + "(parcial)" (o mesmo vocabulário do total da tela);
 *  • todas com custo → o valor.
 *
 * Puro: a página é Server Component, e isto não vai ao navegador.
 */
import { formatUsd } from "@/lib/ai/constants";
import type { ProviderUsageRow } from "@/lib/ai/types";

export function textoDoCusto(
  linha: Pick<ProviderUsageRow, "execucoes" | "custoUsd" | "semCusto">,
): string {
  if (linha.semCusto >= linha.execucoes) return "não medido";
  if (linha.semCusto > 0) return `${formatUsd(linha.custoUsd)} (parcial)`;
  return formatUsd(linha.custoUsd);
}
