"use client";

/**
 * Fachada de carregamento sob demanda de `categoria-chart-impl` (P3 da auditoria de performance, F-003).
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

type Props = React.ComponentProps<typeof import("./categoria-chart-impl").CategoriaChart>;

// ⛔ O segundo argumento de `next/dynamic` tem de ser objeto literal escrito ali mesmo — o
// compilador o lê estaticamente e recusa uma constante compartilhada.
const LazyCategoriaChart = dynamic(() => import("./categoria-chart-impl").then((m) => m.CategoriaChart), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

export function CategoriaChart(props: Props) {
  return (
    <div style={chartSkeletonHeightVar(260)}>
      <LazyCategoriaChart {...props} />
    </div>
  );
}
