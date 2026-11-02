"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por
 * `rosca-categorias-chart.tsx`, que é a fachada pública — é ali que o `recharts` (109 KB gz)
 * deixa de entrar no primeiro byte da rota. A legenda e a nota do que ficou de fora moram na
 * fachada, porque não usam `recharts`.
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/format";
import type { CategoriaSlice } from "@/lib/finance/dashboard";
import { tooltipItemStyle, tooltipLabelStyle, tooltipStyle } from "./chart-theme";
import { corDaFatia, percentualDaFatia } from "./cores-da-rosca";

/**
 * Rosca das MINHAS saídas por categoria. As fatias já chegam positivas e ordenadas pela fachada
 * (a mesma ordem da legenda, para a cor ser a mesma); o vazio também é decidido lá. Todas as
 * categorias aparecem — dobrar em "Outros" fica para a 06 (D15). O total fica no centro.
 */
export function RoscaCategoriasChart({ fatias, total }: { fatias: CategoriaSlice[]; total: number }) {
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={fatias}
            dataKey="meu"
            nameKey="name"
            innerRadius={62}
            outerRadius={96}
            paddingAngle={2}
            strokeWidth={1}
          >
            {fatias.map((f, i) => (
              <Cell key={f.categoryId ?? i} fill={corDaFatia(f, i)} stroke="var(--card)" />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [
              `${formatCurrency(Number(value))} · ${percentualDaFatia(Number(value), total)}`,
              name,
            ]}
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="max-w-26 text-center text-base leading-tight font-semibold tabular-nums">
          {formatCurrency(total)}
        </span>
        <span className="text-xs text-muted-foreground">minhas saídas</span>
      </div>
    </div>
  );
}
