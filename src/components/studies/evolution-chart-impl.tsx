"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `evolution-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

import {
  Area,
  AreaChart,
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
import { formatMinutes, minutesToHours } from "@/lib/studies/constants";
import type { StudyWeekPoint } from "@/types/database";

/** Evolução do tempo estudado por semana (últimas 8). Eixo em horas, tooltip amigável. */
export function EvolutionChart({ weekly }: { weekly: StudyWeekPoint[] }) {
  const data = weekly.map((w) => ({
    label: w.label,
    hours: minutesToHours(w.minutes),
    minutes: w.minutes,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="studyEvolution" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={(v) => `${v}h`}
          allowDecimals
        />
        <Tooltip
          cursor={{ stroke: "var(--muted-foreground)", strokeOpacity: 0.3 }}
          formatter={(_value, _name, item) => {
            const p = item?.payload as { minutes: number };
            return [formatMinutes(p.minutes), "Estudado"];
          }}
          labelFormatter={(label) => `Semana de ${label}`}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Area
          type="monotone"
          dataKey="hours"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#studyEvolution)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
