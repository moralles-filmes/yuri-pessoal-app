"use client";

/**
 * Fachada de carregamento sob demanda de `barras-entradas-saidas-chart-impl` (04-A).
 *
 * Mesmo molde de `evolucao-chart.tsx`: o `recharts` (109 KB gz) só é baixado quando o gráfico
 * aparece, e a altura é reservada para a chegada dele não empurrar o conteúdo seguinte.
 *
 * `ssr: false` porque `ResponsiveContainer` depende de medir a largura do elemento. O estado
 * vazio e a legenda do mês parcial ficam DENTRO da implementação: a fachada não sabe o que é
 * "vazio" para este gráfico, e duplicar a regra seria criar uma segunda verdade.
 */
import type * as React from "react";
import dynamic from "next/dynamic";
import { ChartSkeleton, chartSkeletonHeightVar } from "@/components/shared/chart-skeleton";

type Props = React.ComponentProps<
  typeof import("./barras-entradas-saidas-chart-impl").BarrasEntradasSaidasChart
>;

// ⛔ O segundo argumento de `next/dynamic` tem de ser objeto literal escrito ali mesmo — o
// compilador o lê estaticamente e recusa uma constante compartilhada.
const LazyBarrasEntradasSaidasChart = dynamic(
  () => import("./barras-entradas-saidas-chart-impl").then((m) => m.BarrasEntradasSaidasChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);

export function BarrasEntradasSaidasChart(props: Props) {
  return (
    <div style={chartSkeletonHeightVar(280)}>
      <LazyBarrasEntradasSaidasChart {...props} />
    </div>
  );
}
