"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `evolucao-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

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
  MIRA_DA_LINHA,
  monthLabel,
} from "./chart-theme";
import { DicaDoGrafico, LegendaDoGrafico } from "./dica-do-grafico";
import { linhasDaDica } from "./linhas-da-dica";
import { useFocoDoGrafico } from "./use-foco-do-grafico";

/** Evolução mensal das MINHAS entradas, saídas e resultado (série histórica; desenho 2026-10-18). */
export function EvolucaoChart({ data }: { data: EvolucaoPonto[] }) {
  // O gancho vem ANTES do retorno do vazio. `ref` sai do objeto: um `ref={x.ref}` faz o lint do
  // React tratar `x` inteiro como ref e recusar `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();
  const temDados = data.some((p) => p.entradas > 0 || p.saidas > 0);
  if (!temDados) {
    return (
      <EmptyState
        nivel={3}
        icon={LineChartIcon}
        title="Sem histórico ainda"
        description="A evolução aparece conforme você registra entradas e saídas."
        className="py-8"
      />
    );
  }

  const chartData = data.map((p) => ({ ...p, label: monthLabel(p.mes) }));

  return (
    <div ref={refDoGrafico} className="grafico-dinheiro">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} width="auto" />
          <Tooltip
            cursor={MIRA_DA_LINHA}
            active={foco.dicaAtiva}
            isAnimationActive={false}
            content={({ payload, label }) => (
              <DicaDoGrafico
                titulo={String(label)}
                linhas={linhasDaDica(payload ?? [], (e) =>
                  typeof e.value === "number"
                    ? { valor: formatCurrency(e.value), dinheiro: true }
                    : null,
                )}
              />
            )}
          />
          <Legend content={<LegendaDoGrafico />} />
          <Line type="monotone" dataKey="entradas" name="Minhas entradas" stroke={CHART_COLORS[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="saidas" name="Minhas saídas" stroke="var(--destructive)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="saldo" name="Meu resultado" stroke={CHART_COLORS[1]} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
