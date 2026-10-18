"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `mes-a-mes-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

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
import type { MesAMesDados } from "@/lib/finance/dashboard";
import {
  axisTick,
  brlCompact,
  CHART_COLORS,
  GRID_COLOR,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "./chart-theme";

/**
 * "Meu mês a mês": as MINHAS entradas e saídas do mês contra o anterior (barras agrupadas).
 * A fonte decide a base — competência (`paresDoMesAMes`) ou caixa (`mesAMesDoCaixa`).
 */
export function MesAMesChart({ dados }: { dados: MesAMesDados }) {
  const data = [
    { nome: "Minhas entradas", anterior: dados.anterior.entradas, atual: dados.atual.entradas },
    { nome: "Minhas saídas", anterior: dados.anterior.saidas, atual: dados.atual.saidas },
  ];

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="nome" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} width="auto" />
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
