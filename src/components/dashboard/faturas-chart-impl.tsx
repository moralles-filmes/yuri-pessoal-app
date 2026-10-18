"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `faturas-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

import { ReceiptText } from "lucide-react";
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
import type { FaturaDoMes } from "@/lib/finance/dashboard";
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

/**
 * Faturas dos próximos meses com o VALOR CHEIO (desenho 2026-10-18): a pilha é o total real da
 * fatura, com a minha parte e a de terceiros empilhadas — o único gráfico financeiro que inclui
 * terceiros, e a descrição do card diz isso.
 */
export function FaturasChart({ data }: { data: FaturaDoMes[] }) {
  if (!data.some((f) => f.total !== 0)) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="Sem faturas nos próximos meses"
        description="As faturas dos cartões aparecem aqui pelo mês de vencimento."
        className="py-8"
      />
    );
  }

  const chartData = data.map((f) => ({ ...f, label: monthLabel(f.mes) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} width={78} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value) => formatCurrency(Number(value))}
          labelFormatter={(label, payload) => {
            const total = (payload?.[0]?.payload as FaturaDoMes | undefined)?.total;
            return total === undefined ? String(label) : `${label} · total ${formatCurrency(total)}`;
          }}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
        <Bar dataKey="meu" name="Minha parte" stackId="f" fill={CHART_COLORS[0]} maxBarSize={48} />
        <Bar
          dataKey="terceiros"
          name="Parte de terceiros"
          stackId="f"
          fill={CHART_COLORS[3]}
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
