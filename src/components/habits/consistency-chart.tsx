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
  GRID_COLOR,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "@/components/dashboard/chart-theme";
import type { HabitWeekPoint } from "@/types/database";

const pct = (v: number | string) => `${Math.round(Number(v) * 100)}%`;

/** Gráfico de consistência semanal (taxa de conclusão por semana, últimas 8). */
export function ConsistencyChart({ weekly }: { weekly: HabitWeekPoint[] }) {
  const data = weekly.map((w) => ({
    label: w.label,
    rate: w.rate,
    done: w.done,
    scheduled: w.scheduled,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis
          dataKey="label"
          tick={axisTick}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 1]}
          tickFormatter={pct}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value, _name, item) => {
            const p = item?.payload as { done: number; scheduled: number };
            return [`${pct(value as number)} (${p.done}/${p.scheduled})`, "Conclusão"];
          }}
          labelFormatter={(label) => `Semana de ${label}`}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Bar
          dataKey="rate"
          name="Conclusão"
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={44}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
