"use client";

/**
 * Fase 17-D — Treinos · Gráficos do módulo (fachada).
 *
 * ═══════════ POR QUE ESTE ARQUIVO EXISTE ═══════════
 *
 * A API pública é EXATAMENTE a de antes (`PeriodBarChart`, `EvolutionLineChart`,
 * `PeriodAreaChart`, `DistributionBars`, `ChartPoint`) — nenhuma tela precisou mudar. O que
 * mudou é quando o código chega: os três gráficos de `recharts` moraram em
 * `training-charts-impl.tsx` e são baixados sob demanda.
 *
 * `recharts` custa 109 KB gz e entrava no primeiro byte de QUATRO rotas de Treinos
 * (`evolucao`, `relatorios`, `historico`, `exercicios/[id]`), mesmo quando o gráfico estava
 * numa aba fechada. Medição em `.turbo/BASELINE.md`.
 *
 * ⚠️ **`DistributionBars` fica AQUI, e isso é deliberado.** Ela não usa `recharts` — são
 * barras de CSS. Deixá-la no arquivo de implementação faria importá-la arrastar o `recharts`
 * inteiro junto, que é o oposto do objetivo.
 *
 * `ssr: false` porque `ResponsiveContainer` já não renderiza nada no servidor (ele depende de
 * medir a largura do elemento): não há conteúdo de servidor a preservar. A tabela textual
 * equivalente continua a um clique de distância, como antes — ela sempre foi client-side.
 */
import dynamic from "next/dynamic";
import {
  ChartSkeletonWithToggle,
  chartSkeletonHeightVar,
} from "@/components/shared/chart-skeleton";
import { cn } from "@/lib/utils";

export type { ChartPoint } from "./training-charts-impl";
import type { ChartPoint } from "./training-charts-impl";

/** Altura padrão do `ChartFrame` — repetida aqui para o esqueleto reservar o espaço certo. */
const DEFAULT_CHART_HEIGHT = 240;

type ChartProps = {
  points: ChartPoint[];
  valueLabel: string;
  height?: number;
};

// ⛔ O segundo argumento de `next/dynamic` TEM de ser um objeto literal escrito ali mesmo: o
// compilador o lê estaticamente e recusa uma constante compartilhada
// ("next/dynamic options must be an object literal"). Daí a repetição abaixo — ela é exigida.
const LazyPeriodBarChart = dynamic(
  () => import("./training-charts-impl").then((m) => m.PeriodBarChart),
  { ssr: false, loading: () => <ChartSkeletonWithToggle /> },
);

const LazyEvolutionLineChart = dynamic(
  () => import("./training-charts-impl").then((m) => m.EvolutionLineChart),
  { ssr: false, loading: () => <ChartSkeletonWithToggle /> },
);

const LazyPeriodAreaChart = dynamic(
  () => import("./training-charts-impl").then((m) => m.PeriodAreaChart),
  { ssr: false, loading: () => <ChartSkeletonWithToggle /> },
);

/** Volume (ou qualquer total) por período, em barras. */
export function PeriodBarChart(props: ChartProps) {
  return (
    <div style={chartSkeletonHeightVar(props.height ?? DEFAULT_CHART_HEIGHT)}>
      <LazyPeriodBarChart {...props} />
    </div>
  );
}

/** Evolução de uma métrica ao longo das sessões, em linha. */
export function EvolutionLineChart(props: ChartProps) {
  return (
    <div style={chartSkeletonHeightVar(props.height ?? DEFAULT_CHART_HEIGHT)}>
      <LazyEvolutionLineChart {...props} />
    </div>
  );
}

/** Área acumulada — usada na frequência (treinos por semana). */
export function PeriodAreaChart(props: ChartProps) {
  return (
    <div style={chartSkeletonHeightVar(props.height ?? DEFAULT_CHART_HEIGHT)}>
      <LazyPeriodAreaChart {...props} />
    </div>
  );
}

/** Barra horizontal simples para distribuição (séries por grupo muscular). Sem `recharts`. */
export function DistributionBars({
  items,
  className,
}: {
  items: { label: string; value: number; display: string }[];
  className?: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));

  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((item) => (
        <li key={item.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{item.display}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.round((item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
