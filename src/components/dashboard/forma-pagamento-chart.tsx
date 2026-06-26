"use client";

import { CreditCard } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import type { FormaSlice } from "@/lib/finance/dashboard";
import {
  axisTick,
  brlCompact,
  CHART_COLORS,
  tooltipItemStyle,
  tooltipLabelStyle,
  tooltipStyle,
} from "./chart-theme";

const LABELS: Record<string, string> = { ...PAYMENT_METHOD_LABELS, outro: "Outro" };

/** Gastos por forma de pagamento (barras horizontais). */
export function FormaPagamentoChart({ data }: { data: FormaSlice[] }) {
  const positivos = data.filter((d) => d.movimentado > 0);
  if (positivos.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Sem gastos no período"
        description="Os gastos aparecem aqui agrupados por forma de pagamento."
        className="py-8"
      />
    );
  }

  const chartData = positivos.map((d) => ({
    nome: LABELS[d.paymentMethod] ?? d.paymentMethod,
    valor: d.movimentado,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 46)}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="nome"
          width={104}
          tick={axisTick}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value) => [formatCurrency(Number(value)), "Movimentado"]}
          contentStyle={tooltipStyle}
          labelStyle={tooltipLabelStyle}
          itemStyle={tooltipItemStyle}
        />
        <Bar dataKey="valor" radius={[0, 6, 6, 0]} maxBarSize={28}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
