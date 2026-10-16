"use client";

/**
 * Fachada de carregamento sob demanda de `consistency-chart-impl` (P3 da auditoria de performance, F-003).
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

type Props = React.ComponentProps<typeof import("./consistency-chart-impl").ConsistencyChart>;

// ⛔ O segundo argumento de `next/dynamic` tem de ser objeto literal escrito ali mesmo — o
// compilador o lê estaticamente e recusa uma constante compartilhada.
const LazyConsistencyChart = dynamic(() => import("./consistency-chart-impl").then((m) => m.ConsistencyChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function ConsistencyChart(props: Props) {
  return (
    <>
      <div style={chartSkeletonHeightVar(240)}>
        <LazyConsistencyChart {...props} />
      </div>
      {/* 07-B — a leitura textual do gráfico mora AQUI, não no -impl: atrás do carregamento sob
          demanda ela sairia do HTML do servidor (regra 1). Só apresenta o que já veio calculado. */}
      <table className="sr-only">
        <caption>Consistência por semana</caption>
        <thead>
          <tr>
            <th scope="col">Semana</th>
            <th scope="col">Concluídos</th>
          </tr>
        </thead>
        <tbody>
          {props.weekly.map((w) => (
            <tr key={w.weekStart}>
              <th scope="row">{w.label}</th>
              <td>
                {w.done} de {w.scheduled} ({Math.round(w.rate * 100)}%)
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
