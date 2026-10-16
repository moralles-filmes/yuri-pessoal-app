"use client";

/**
 * Fachada de carregamento sob demanda de `evolution-chart-impl` (P3 da auditoria de performance, F-003).
 *
 * A API pública é EXATAMENTE a de antes — nenhuma tela mudou. O que mudou é quando o código
 * chega: o `recharts` custa 109 KB gz e entrava no primeiro byte desta rota mesmo quando o
 * gráfico estava fora da tela. Agora ele é baixado quando o gráfico aparece.
 *
 * `ssr: false` porque `ResponsiveContainer` depende de medir a largura do elemento e já não
 * renderizava nada no servidor — não há conteúdo de servidor a preservar.
 *
 * O estado vazio continua DENTRO da implementação: aqui a fachada não sabe o que é "vazio"
 * para cada gráfico, e duplicar a regra seria criar uma segunda verdade.
 */
import type * as React from "react";
import dynamic from "next/dynamic";
import { ChartSkeleton, chartSkeletonHeightVar } from "@/components/shared/chart-skeleton";
import { formatMinutes } from "@/lib/studies/constants";

type Props = React.ComponentProps<typeof import("./evolution-chart-impl").EvolutionChart>;

// ⛔ O segundo argumento de `next/dynamic` tem de ser objeto literal escrito ali mesmo — o
// compilador o lê estaticamente e recusa uma constante compartilhada.
const LazyEvolutionChart = dynamic(() => import("./evolution-chart-impl").then((m) => m.EvolutionChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function EvolutionChart(props: Props) {
  return (
    <>
      <div style={chartSkeletonHeightVar(240)}>
        <LazyEvolutionChart {...props} />
      </div>
      {/* 07-B — a leitura textual do gráfico mora AQUI, não no -impl: atrás do carregamento sob
          demanda ela sairia do HTML do servidor (regra 1). Os minutos chegam somados; só se formata. */}
      <table className="sr-only">
        <caption>Tempo estudado por semana</caption>
        <thead>
          <tr>
            <th scope="col">Semana</th>
            <th scope="col">Tempo</th>
          </tr>
        </thead>
        <tbody>
          {props.weekly.map((w) => (
            <tr key={w.weekStart}>
              <th scope="row">{w.label}</th>
              <td>{formatMinutes(w.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
