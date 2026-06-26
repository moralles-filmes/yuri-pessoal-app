"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/format";
import type { Comparativo } from "@/lib/finance/dashboard";
import {
  axisTick,
  brlCompact,
  CHART_COLORS,
  GRID_COLOR,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "./chart-theme";

/** Comparativo do mês atual com o anterior (barras agrupadas: entradas e saídas). */
export function MesAMesChart({ comparativo }: { comparativo: Comparativo }) {
  const data = [
    {
      nome: "Entradas",
      anterior: comparativo.anterior.entradas,
      atual: comparativo.atual.entradas,
    },
    {
      nome: "Saídas",
      anterior: comparativo.anterior.saidas,
      atual: comparativo.atual.saidas,
    },
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: 4, right: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="nome" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} width={64} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        <Bar dataKey="anterior" name="Mês anterior" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} maxBarSize={48} />
        <Bar dataKey="atual" name="Mês atual" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
