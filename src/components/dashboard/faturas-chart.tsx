"use client";

/**
 * Fachada de carregamento sob demanda de `faturas-chart-impl` (mesmo padrão dos outros gráficos
 * do dashboard): o `recharts` chega quando o gráfico aparece, não no primeiro byte da rota.
 */
import type * as React from "react";
import dynamic from "next/dynamic";
import { ChartSkeleton, chartSkeletonHeightVar } from "@/components/shared/chart-skeleton";
import { TabelaDoGrafico } from "@/components/shared/painel/tabela-do-grafico";
import { leituraDasFaturas } from "@/lib/painel/leitura-dos-graficos";
import { monthLabel } from "./chart-theme";

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
      <TabelaDoGrafico
        titulo="Faturas por mês"
        leitura={leituraDasFaturas({
          data: props.data,
          vazio: props.vazio,
          rotuloDoMes: monthLabel,
        })}
      />
    </div>
  );
}
