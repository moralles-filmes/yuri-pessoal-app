"use client";

import { PieChart as PieIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import type { CategoriaSlice } from "@/lib/finance/dashboard";
import {
  CHART_COLORS,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "./chart-theme";

/** Distribuição dos gastos por categoria (donut). Mostra as 6 maiores + "Outros". */
export function CategoriaChart({ data }: { data: CategoriaSlice[] }) {
  const positivos = data.filter((d) => d.movimentado > 0);
  if (positivos.length === 0) {
    return (
      <EmptyState
        icon={PieIcon}
        title="Sem gastos no período"
        description="Lance despesas para ver a distribuição por categoria."
        className="py-8"
      />
    );
  }

  const top = positivos.slice(0, 6);
  const resto = positivos.slice(6);
  const chartData =
    resto.length > 0
      ? [
          ...top,
          {
            categoryId: "__outros__",
            name: "Outros",
            color: null,
            movimentado: resto.reduce((s, d) => s + d.movimentado, 0),
            meu: resto.reduce((s, d) => s + d.meu, 0),
          },
        ]
      : top;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="movimentado"
          nameKey="name"
          innerRadius={58}
          outerRadius={92}
          paddingAngle={2}
          strokeWidth={1}
        >
          {chartData.map((d, i) => (
            <Cell
              key={d.categoryId ?? i}
              fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]}
              stroke="var(--card)"
            />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [formatCurrency(Number(value)), name]}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
