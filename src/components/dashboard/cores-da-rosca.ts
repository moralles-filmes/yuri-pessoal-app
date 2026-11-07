/**
 * Cor e percentual das fatias da rosca de categorias (04-A).
 *
 * Módulo PURO, sem `recharts` e sem `"use client"`: a legenda (na fachada) e as fatias (no `-impl`)
 * leem daqui, e é isso que faz a bolinha da legenda ter a MESMA cor da fatia. Duas cópias da regra
 * divergiriam na primeira edição.
 *
 * A ordem das fatias é a de `dadosDaRosca` ordenada por `meu` decrescente — quem chama ordena.
 */
import type { CategoriaSlice } from "@/lib/finance/dashboard";
import { reaisParaCentavos } from "@/lib/format";
import { CHART_COLORS } from "./chart-theme";

/** A cor da categoria vence; sem ela, o slot da paleta pelo índice da fatia. */
export function corDaFatia(f: CategoriaSlice, indice: number): string {
  return f.color ?? CHART_COLORS[indice % CHART_COLORS.length];
}

/** "12,3%" — uma casa, vírgula, comparando em centavos; total zero devolve "0,0%", nunca NaN. */
export function percentualDaFatia(meu: number, total: number): string {
  const totalCent = reaisParaCentavos(total);
  const pct = totalCent > 0 ? (reaisParaCentavos(meu) / totalCent) * 100 : 0;
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(pct)}%`;
}
