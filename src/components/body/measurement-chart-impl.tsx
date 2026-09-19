"use client";

/**
 * Fase 16-E — Módulo central de medidas corporais · Gráfico de evolução (implementação).
 *
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por
 * `measurement-chart.tsx`, que é a fachada pública — é ali que o `recharts` (109 KB gz) deixa
 * de entrar no primeiro byte de `/nutricao/medidas`, `/nutricao/relatorios` e
 * `/treinos/evolucao`. A tabela textual (`MeasurementTable`) ficou NA FACHADA justamente por
 * isso: ela é a leitura obrigatória do dado (regra 6 desta subfase) e não pode depender de o
 * código do gráfico ter chegado.
 *
 * ══ AS TRÊS COISAS QUE ESTE GRÁFICO NÃO PODE FAZER ══
 *
 * 1. LIGAR OS PONTOS POR CIMA DE UM BURACO. Dia sem medição tem `value: null`, e a linha é
 *    INTERROMPIDA (`connectNulls={false}`). Ligar dois pontos distantes desenharia uma
 *    variação suave que nunca foi medida.
 *
 * 2. COMEÇAR O EIXO EM ZERO. Uma variação de 2 kg num eixo de 0 a 80 vira uma linha reta, e o
 *    usuário conclui que "não mudou nada". O domínio acompanha os dados, com folga.
 *    (Em compensação, o eixo é rotulado e a tabela textual está sempre disponível.)
 *
 * 3. SER A ÚNICA FORMA DE LER O DADO. Regra 6 da subfase: quem chama este componente é
 *    obrigado a renderizar também a leitura textual. `MeasurementTable` está logo abaixo.
 *
 * Reusa os tokens de `chart-theme` (Fase 07) — dark/light sem cor fixa, sem segundo conjunto
 * de gráficos.
 */
import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisTick,
  GRID_COLOR,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/components/dashboard/chart-theme";
import { shortDateLabel } from "@/lib/nutrition/calendar";
import { formatMeasurement, measuredPoints, type SeriesPoint } from "@/lib/body/measurements";

export function MeasurementChart({
  series,
  unit,
  decimals,
  target,
  showAverage,
  height = 260,
}: {
  series: SeriesPoint[];
  unit: string;
  decimals: number;
  /** Linha do alvo da meta, quando existe. */
  target?: number | null;
  /** Só passe `true` quando `hasEnoughForMovingAverage` autorizar. */
  showAverage?: boolean;
  height?: number;
}) {
  const data = React.useMemo(
    () =>
      series.map((point) => ({
        date: point.date,
        label: shortDateLabel(point.date),
        value: point.value,
        average: point.average,
      })),
    [series],
  );

  const values = React.useMemo(
    () => measuredPoints(series).map((point) => point.value as number),
    [series],
  );

  /**
   * Domínio do eixo Y com 10% de folga — e nunca começando em zero.
   * Sem medição nenhuma, devolve `auto` e o recharts não desenha nada, que é o correto.
   */
  const domain = React.useMemo((): [number | "auto", number | "auto"] => {
    if (values.length === 0) return ["auto", "auto"];
    const candidates = target !== null && target !== undefined ? [...values, target] : values;
    const min = Math.min(...candidates);
    const max = Math.max(...candidates);
    // Todos os valores iguais: abre uma faixa artificial para a linha não colar na borda.
    const padding = max === min ? Math.max(1, Math.abs(max) * 0.05) : (max - min) * 0.1;
    return [min - padding, max + padding];
  }, [values, target]);

  // O caso "nenhuma medição no período" é resolvido na FACHADA, antes de baixar este arquivo:
  // a mensagem aparece de imediato e o código do gráfico nem chega a ser pedido.

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis
          dataKey="label"
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={56}
          domain={domain}
          tickFormatter={(v) => formatMeasurement(Number(v), unit, decimals)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.3 }}
          formatter={(value, name) => [
            formatMeasurement(Number(value), unit, decimals),
            name === "average" ? "Média móvel" : "Medição",
          ]}
        />

        {target !== null && target !== undefined && (
          <ReferenceLine
            y={target}
            stroke="var(--chart-2)"
            strokeDasharray="4 4"
            label={{
              value: `Alvo: ${formatMeasurement(target, unit, decimals)}`,
              position: "insideTopRight",
              fill: "var(--muted-foreground)",
              fontSize: 11,
            }}
          />
        )}

        {/* ⛔ connectNulls={false}: o buraco fica visível, como deve. */}
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--chart-1)" }}
          activeDot={{ r: 5 }}
          connectNulls={false}
          isAnimationActive={false}
        />

        {showAverage && (
          <Line
            type="monotone"
            dataKey="average"
            stroke="var(--chart-3)"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
