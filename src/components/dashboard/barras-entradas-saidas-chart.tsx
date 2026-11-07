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
import { TabelaDoGrafico } from "@/components/shared/painel/tabela-do-grafico";
import { leituraDasBarras } from "@/lib/painel/leitura-dos-graficos";
import { temDadosNasBarras } from "./barras-dados";
import { monthLabel } from "./chart-theme";

type Props = React.ComponentProps<
  typeof import("./barras-entradas-saidas-chart-impl").BarrasEntradasSaidasChart
> & {
  /** Só a leitura textual o usa: depois deste mês ('AAAA-MM') o zero não é fato (K1). */
  ultimoMesLido?: string;
};

// ⛔ O segundo argumento de `next/dynamic` tem de ser objeto literal escrito ali mesmo — o
// compilador o lê estaticamente e recusa uma constante compartilhada.
const LazyBarrasEntradasSaidasChart = dynamic(
  () => import("./barras-entradas-saidas-chart-impl").then((m) => m.BarrasEntradasSaidasChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);

export function BarrasEntradasSaidasChart({ ultimoMesLido, ...props }: Props) {
  return (
    <div>
      {/* A altura reservada é a do gráfico; a legenda do mês parcial fica aqui, fora do
          carregamento sob demanda, para a reserva ser exata e o gráfico não dar salto. */}
      <div style={chartSkeletonHeightVar(280)}>
        <LazyBarrasEntradasSaidasChart {...props} />
      </div>
      <TabelaDoGrafico
        titulo="Entradas e saídas por mês"
        leitura={leituraDasBarras({
          dados: props.dados,
          series: props.series,
          nomes: props.nomes,
          rotuloDoMes: monthLabel,
          ultimoMesLido,
        })}
      />
      {temDadosNasBarras(props.dados) && props.dados.some((p) => p.parcial) && (
        <p className="mt-1 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <svg width="16" height="12" aria-hidden="true" className="shrink-0">
            <defs>
              <pattern
                id="hachura-amostra"
                patternUnits="userSpaceOnUse"
                width="6"
                height="6"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="var(--muted-foreground)" fillOpacity={0.15} />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--muted-foreground)" strokeWidth={2.5} />
              </pattern>
            </defs>
            <rect
              x="0.75"
              y="0.75"
              width="14.5"
              height="10.5"
              rx="2"
              fill="url(#hachura-amostra)"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          </svg>
          <span>mês em andamento · parcial</span>
        </p>
      )}
    </div>
  );
}
