"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por
 * `barras-entradas-saidas-chart.tsx`, que é a fachada pública — é ali que o `recharts` (109 KB gz)
 * deixa de entrar no primeiro byte da rota.
 */

import { BarChart3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import type { EvolucaoPonto } from "@/lib/finance/dashboard";
import { temDadosNasBarras } from "./barras-dados";
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

const COR_ENTRADAS = CHART_COLORS[0];
const COR_SAIDAS = "var(--muted-foreground)";

/** Listras diagonais na cor da série: o que é parcial NÃO se confunde com o realizado (D-A-10). */
function Hachura({ id, cor }: { id: string; cor: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={cor} fillOpacity={0.15} />
      <line x1="0" y1="0" x2="0" y2="6" stroke={cor} strokeWidth={2.5} />
    </pattern>
  );
}

/**
 * Minhas entradas × minhas saídas por mês, barras agrupadas. O mês em andamento (`parcial`) sai
 * hachurado e com a borda tracejada, e a legenda abaixo diz por quê.
 */
export function BarrasEntradasSaidasChart({
  dados,
  series = "ambas",
  nomes = { entradas: "Minhas entradas", saidas: "Minhas saídas" },
}: {
  dados: (EvolucaoPonto & { parcial: boolean })[];
  /** `saidas`: só a barra de saídas (o recorte por cartão não segue as entradas — 04-A2). */
  series?: "ambas" | "saidas";
  /** Os rótulos dependem da responsabilidade (Meu · Terceiros · Consolidado): quem chama os dá. */
  nomes?: { entradas: string; saidas: string };
}) {
  if (!temDadosNasBarras(dados)) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Sem histórico ainda"
        description="Os meses aparecem conforme você registra entradas e saídas."
        className="py-8"
      />
    );
  }

  const chartData = dados.map((p) => ({ ...p, label: monthLabel(p.mes) }));

  return (
    <div>
      {/* A legenda do mês parcial mora na FACHADA (altura reservada exata, sem salto). */}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
          <defs>
            <Hachura id="hachura-entradas" cor={COR_ENTRADAS} />
            <Hachura id="hachura-saidas" cor={COR_SAIDAS} />
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} width="auto" />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            formatter={(value) => formatCurrency(Number(value))}
            contentStyle={tooltipStyle}
            labelStyle={tooltipLabelStyle}
            itemStyle={tooltipItemStyle}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
          {series !== "saidas" && (
            <Bar
              dataKey="entradas"
              name={nomes.entradas}
              fill={COR_ENTRADAS}
              radius={[4, 4, 0, 0]}
              maxBarSize={32}
            >
              {chartData.map((p) => (
                <Cell
                  key={p.mes}
                  fill={p.parcial ? "url(#hachura-entradas)" : COR_ENTRADAS}
                  stroke={p.parcial ? COR_ENTRADAS : undefined}
                  strokeWidth={p.parcial ? 1.5 : undefined}
                  strokeDasharray={p.parcial ? "4 3" : undefined}
                />
              ))}
            </Bar>
          )}
          <Bar
            dataKey="saidas"
            name={nomes.saidas}
            fill={COR_SAIDAS}
            fillOpacity={0.6}
            radius={[4, 4, 0, 0]}
            maxBarSize={32}
          >
            {chartData.map((p) => (
              <Cell
                key={p.mes}
                fill={p.parcial ? "url(#hachura-saidas)" : COR_SAIDAS}
                stroke={p.parcial ? COR_SAIDAS : undefined}
                strokeWidth={p.parcial ? 1.5 : undefined}
                strokeDasharray={p.parcial ? "4 3" : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
