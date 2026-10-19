"use client";

/**
 * Fase 17-D — Treinos · Gráficos do módulo (implementação).
 *
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é carregado sob demanda por
 * `training-charts.tsx`, que é a fachada pública do módulo — é ali que o `recharts` (109 KB gz)
 * deixa de entrar no primeiro byte das quatro rotas de Treinos que mostram gráfico. Importar
 * daqui reintroduz o peso que a fachada existe para evitar.
 *
 * ═══════════ O GRÁFICO NUNCA É A ÚNICA LEITURA DO DADO ═══════════
 *
 * Toda série exibida aqui vem acompanhada de uma **tabela equivalente** (dobrável), pelo mesmo
 * motivo de acessibilidade que vale no resto do sistema: quem usa leitor de tela, quem tem
 * baixa visão e quem simplesmente quer conferir o número precisa chegar ao dado sem depender de
 * enxergar uma curva. Desde a 07-C ela mora na FACHADA, que a renderiza no HTML do servidor.
 *
 * Cores saem das variáveis do design system (dourado + neutros), então dark e light funcionam
 * sem nenhum condicional de tema aqui dentro.
 */
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
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

export type ChartPoint = {
  label: string;
  value: number;
  /** Texto exibido na tabela e no tooltip (já formatado na unidade certa). */
  display: string;
  /** Marca o ponto cujo agregado é parcial — a tabela avisa. */
  isPartial?: boolean;
};

/** Só o gráfico: a tabela equivalente é da fachada (`training-charts.tsx`), fora do `recharts`. */
function ChartFrame({
  children,
  height = 240,
}: {
  points: ChartPoint[];
  valueLabel: string;
  children: React.ReactElement;
  height?: number;
}) {
  return (
    <div aria-hidden="true">
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

const tooltipProps = {
  contentStyle: tooltipStyle,
  labelStyle: tooltipLabelStyle,
  itemStyle: tooltipItemStyle,
  cursor: { stroke: "var(--muted-foreground)", strokeOpacity: 0.3 },
} as const;

/** Volume (ou qualquer total) por período, em barras. */
export function PeriodBarChart({
  points,
  valueLabel,
  height,
}: {
  points: ChartPoint[];
  valueLabel: string;
  height?: number;
}) {
  return (
    <ChartFrame points={points} valueLabel={valueLabel} height={height}>
      <BarChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width="auto" />
        <Tooltip
          {...tooltipProps}
          formatter={(_value, _name, item) => [
            (item?.payload as ChartPoint).display,
            valueLabel,
          ]}
        />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

/** Evolução de uma métrica ao longo das sessões, em linha. */
export function EvolutionLineChart({
  points,
  valueLabel,
  height,
}: {
  points: ChartPoint[];
  valueLabel: string;
  height?: number;
}) {
  return (
    <ChartFrame points={points} valueLabel={valueLabel} height={height}>
      <LineChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width="auto" domain={["auto", "auto"]} />
        <Tooltip
          {...tooltipProps}
          formatter={(_value, _name, item) => [
            (item?.payload as ChartPoint).display,
            valueLabel,
          ]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--chart-1)" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartFrame>
  );
}

/** Área acumulada — usada na frequência (treinos por semana). */
export function PeriodAreaChart({
  points,
  valueLabel,
  height,
}: {
  points: ChartPoint[];
  valueLabel: string;
  height?: number;
}) {
  return (
    <ChartFrame points={points} valueLabel={valueLabel} height={height}>
      <AreaChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="trainingArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width="auto" allowDecimals={false} />
        <Tooltip
          {...tooltipProps}
          formatter={(_value, _name, item) => [
            (item?.payload as ChartPoint).display,
            valueLabel,
          ]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#trainingArea)"
        />
      </AreaChart>
    </ChartFrame>
  );
}
