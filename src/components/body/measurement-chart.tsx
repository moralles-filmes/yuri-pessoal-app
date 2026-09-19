"use client";

/**
 * Fase 16-E — Módulo central de medidas corporais · Gráfico de evolução (fachada).
 *
 * ═══════════ POR QUE ESTE ARQUIVO EXISTE ═══════════
 *
 * A API pública é EXATAMENTE a de antes (`MeasurementChart` e `MeasurementTable`) — nenhuma
 * tela mudou. O que mudou é quando o `recharts` (109 KB gz) chega: ele deixou de entrar no
 * primeiro byte de `/nutricao/medidas`, `/nutricao/relatorios` e `/treinos/evolucao` e passou
 * a ser baixado quando há gráfico para desenhar. Medição em `.turbo/BASELINE.md`.
 *
 * ⛔ **`MeasurementTable` FICA AQUI, e isso não é organização — é a regra 6 da subfase.**
 * "O gráfico nunca é a única leitura do dado": a tabela textual é o caminho de quem usa leitor
 * de tela. Deixá-la atrás do carregamento sob demanda a tiraria do HTML do servidor e a faria
 * depender de o código do gráfico ter baixado. Ela não usa `recharts`.
 *
 * ⛔ **O caso "nenhuma medição no período" também é decidido aqui**, antes de pedir o gráfico:
 * a mensagem aparece de imediato e o navegador não baixa 109 KB para não desenhar nada.
 *
 * `ssr: false` porque `ResponsiveContainer` depende de medir a largura do elemento e já não
 * renderizava nada no servidor — não há conteúdo de servidor a preservar.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import { ChartSkeleton, chartSkeletonHeightVar } from "@/components/shared/chart-skeleton";
import { shortDateLabel } from "@/lib/nutrition/calendar";
import { formatMeasurement, measuredPoints, type SeriesPoint } from "@/lib/body/measurements";

/** Altura padrão do gráfico — repetida aqui para o esqueleto reservar o espaço certo. */
const DEFAULT_CHART_HEIGHT = 260;

type MeasurementChartProps = {
  series: SeriesPoint[];
  unit: string;
  decimals: number;
  /** Linha do alvo da meta, quando existe. */
  target?: number | null;
  /** Só passe `true` quando `hasEnoughForMovingAverage` autorizar. */
  showAverage?: boolean;
  height?: number;
};

// ⛔ O segundo argumento de `next/dynamic` tem de ser objeto literal escrito ali mesmo — o
// compilador o lê estaticamente e recusa uma constante compartilhada.
const LazyMeasurementChart = dynamic(
  () => import("./measurement-chart-impl").then((m) => m.MeasurementChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export function MeasurementChart(props: MeasurementChartProps) {
  if (measuredPoints(props.series).length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Ainda não há medições neste período para desenhar o gráfico.
      </p>
    );
  }

  return (
    <div style={chartSkeletonHeightVar(props.height ?? DEFAULT_CHART_HEIGHT)}>
      <LazyMeasurementChart {...props} />
    </div>
  );
}

/**
 * Leitura textual equivalente ao gráfico (regra 6 da subfase).
 *
 * Mostra só os dias MEDIDOS: listar os dias vazios encheria a tabela de linhas sem
 * informação. O "quantos dias sem medição" aparece no resumo, que é onde a pergunta faz
 * sentido.
 */
export function MeasurementTable({
  series,
  unit,
  decimals,
  caption,
}: {
  series: SeriesPoint[];
  unit: string;
  decimals: number;
  caption: string;
}) {
  const points = measuredPoints(series);
  if (points.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="py-1.5 pe-3 font-medium">
              Data
            </th>
            <th scope="col" className="py-1.5 pe-3 text-right font-medium">
              Valor
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Variação
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => {
            const previous = index > 0 ? (points[index - 1].value as number) : null;
            const diff = previous === null ? null : (point.value as number) - previous;
            return (
              <tr key={point.date} className="border-b last:border-0">
                <td className="py-1.5 pe-3">{shortDateLabel(point.date)}</td>
                <td className="py-1.5 pe-3 text-right tabular-nums">
                  {formatMeasurement(point.value as number, unit, decimals)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {/* Primeira linha não tem variação — e um "0" ali afirmaria "não mudou". */}
                  {diff === null
                    ? "—"
                    : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${formatMeasurement(
                        Math.abs(diff),
                        unit,
                        decimals,
                      )}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}