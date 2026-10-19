"use client";

/**
 * Fachada de carregamento sob demanda de `faturas-chart-impl` (mesmo padrão dos outros gráficos
 * do dashboard): o `recharts` chega quando o gráfico aparece, não no primeiro byte da rota.
 */
import type * as React from "react";
import dynamic from "next/dynamic";
import { ChartSkeleton, chartSkeletonHeightVar } from "@/components/shared/chart-skeleton";

type Props = React.ComponentProps<typeof import("./faturas-chart-impl").FaturasChart>;

// ⛔ O segundo argumento de `next/dynamic` tem de ser objeto literal escrito ali mesmo — o
// compilador o lê estaticamente e recusa uma constante compartilhada.
const LazyFaturasChart = dynamic(() => import("./faturas-chart-impl").then((m) => m.FaturasChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function FaturasChart(props: Props) {
  return (
    <div style={chartSkeletonHeightVar(280)}>
      <LazyFaturasChart {...props} />
    </div>
  );
}
