"use client";

import { TrendingUp } from "lucide-react";
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
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import type { ProjecaoPonto } from "@/lib/finance/dashboard";
import {
  axisTick,
  brlCompact,
  CHART_COLORS,
  GRID_COLOR,
  monthLabel,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "./chart-theme";

/** Projeção dos próximos meses: faturas + recorrências + contas fixas (barras empilhadas). */
export function ProjecaoChart({ data }: { data: ProjecaoPonto[] }) {
  const temDados = data.some((p) => p.total > 0);
  if (!temDados) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Sem projeção"
        description="Cadastre faturas, recorrências ou contas fixas para projetar os próximos meses."
        className="py-8"
      />
    );
  }

  const chartData = data.map((p) => ({ ...p, label: monthLabel(p.mes) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} width={78} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        <Bar dataKey="faturas" name="Faturas" stackId="p" fill={CHART_COLORS[0]} maxBarSize={48} />
        <Bar dataKey="recorrencias" name="Recorrências" stackId="p" fill={CHART_COLORS[2]} maxBarSize={48} />
        <Bar dataKey="contasFixas" name="Contas fixas" stackId="p" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
