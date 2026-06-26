"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisTick,
  CHART_COLORS,
  GRID_COLOR,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/components/dashboard/chart-theme";

export type BarPoint = { label: string; value: number };

/**
 * Gráfico de barras genérico dos relatórios (Fase 14). Reaproveita os tokens do
 * design system (preto/branco/dourado, legível em dark/light). `formatValue` permite
 * BRL, minutos, porcentagem ou contagem.
 */
export function ReportBarChart({
  data,
  name,
  color = CHART_COLORS[0],
  formatValue,
  height = 240,
}: {
  data: BarPoint[];
  name: string;
  color?: string;
  formatValue?: (v: number) => string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ left: 4, right: 12 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={56}
          allowDecimals={false}
          tickFormatter={formatValue}
        />
        <Tooltip
          formatter={(v) => [formatValue ? formatValue(Number(v)) : String(v), name]}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
          cursor={{ fill: "var(--muted)", opacity: 0.35 }}
        />
        <Bar dataKey="value" name={name} fill={color} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
