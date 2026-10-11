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
import * as React from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChartSkeleton, chartSkeletonHeightVar } from "@/components/shared/chart-skeleton";
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
// O esqueleto é só do gráfico: o botão "Ver os números" é da fachada e já está na tela.
const LazyPeriodBarChart = dynamic(
  () => import("./training-charts-impl").then((m) => m.PeriodBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

const LazyEvolutionLineChart = dynamic(
  () => import("./training-charts-impl").then((m) => m.EvolutionLineChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

const LazyPeriodAreaChart = dynamic(
  () => import("./training-charts-impl").then((m) => m.PeriodAreaChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

/**
 * Tabela equivalente ao gráfico. Sempre presente, dobrável para não competir com o visual.
 *
 * Mora na FACHADA (REDESIGN-07-C, G): ela não usa `recharts`, e dentro do `-impl` só existia
 * depois que o gráfico carregava (`ssr: false`) — fora do HTML do servidor, que é justamente
 * onde o leitor de tela e a conexão lenta a encontrariam primeiro (regra 1 do carregamento sob
 * demanda, a mesma de `MeasurementTable`).
 */
function EquivalentTable({ points, valueLabel }: { points: ChartPoint[]; valueLabel: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {open ? "Esconder os números" : "Ver os números em tabela"}
      </Button>

      {open && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[280px] text-sm">
            <caption className="sr-only">Valores exibidos no gráfico</caption>
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Período
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {valueLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.label} className="border-t border-border/60">
                  <td className="px-3 py-1.5">{point.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {point.display}
                    {point.isPartial && (
                      <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                        (parcial)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Volume (ou qualquer total) por período, em barras. */
export function PeriodBarChart(props: ChartProps) {
  return (
    <div>
      <div style={chartSkeletonHeightVar(props.height ?? DEFAULT_CHART_HEIGHT)}>
        <LazyPeriodBarChart {...props} />
      </div>
      <EquivalentTable points={props.points} valueLabel={props.valueLabel} />
    </div>
  );
}

/** Evolução de uma métrica ao longo das sessões, em linha. */
export function EvolutionLineChart(props: ChartProps) {
  return (
    <div>
      <div style={chartSkeletonHeightVar(props.height ?? DEFAULT_CHART_HEIGHT)}>
        <LazyEvolutionLineChart {...props} />
      </div>
      <EquivalentTable points={props.points} valueLabel={props.valueLabel} />
    </div>
  );
}

/** Área acumulada — usada na frequência (treinos por semana). */
export function PeriodAreaChart(props: ChartProps) {
  return (
    <div>
      <div style={chartSkeletonHeightVar(props.height ?? DEFAULT_CHART_HEIGHT)}>
        <LazyPeriodAreaChart {...props} />
      </div>
      <EquivalentTable points={props.points} valueLabel={props.valueLabel} />
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
          {/* V (REDESIGN-07-C): distribuição, não progresso — o rótulo e o valor acima são a
              leitura; um progressbar com máximo = maior item anunciaria "100%" de nada. */}
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
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
