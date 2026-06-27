"use client";

import { LineChartIcon } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import type { EvolucaoPonto } from "@/lib/finance/dashboard";
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

/** Evolução mensal de entradas, saídas e saldo (série histórica). */
export function EvolucaoChart({ data }: { data: EvolucaoPonto[] }) {
  const temDados = data.some((p) => p.entradas > 0 || p.saidas > 0);
  if (!temDados) {
    return (
      <EmptyState
        icon={LineChartIcon}
        title="Sem histórico ainda"
        description="A evolução aparece conforme você registra entradas e saídas."
        className="py-8"
      />
    );
  }

  const chartData = data.map((p) => ({ ...p, label: monthLabel(p.mes) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} width={78} />
        <Tooltip
          formatter={(value) => formatCurrency(Number(value))}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        <Line type="monotone" dataKey="entradas" name="Entradas" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="saidas" name="Saídas" stroke="var(--destructive)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="saldo" name="Saldo" stroke={CHART_COLORS[1]} strokeWidth={2} strokeDasharray="4 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
