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
 * enxergar uma curva.
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
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
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

/** Tabela equivalente ao gráfico. Sempre presente, dobrável para não competir com o visual. */
function EquivalentTable({
  points,
  valueLabel,
  open,
  onToggle,
}: {
  points: ChartPoint[];
  valueLabel: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        onClick={onToggle}
        aria-expanded={open}
      >
        {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        {open ? "Esconder os números" : "Ver os números em tabela"}
      </Button>

      {open && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[280px] text-sm">
            <caption className="sr-only">Valores exibidos no gráfico</caption>
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Período
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {valueLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.label} className="border-t border-border/60">
                  <td className="px-3 py-1.5">{point.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {point.display}
                    {point.isPartial && (
                      <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                        (parcial)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ChartFrame({
  points,
  valueLabel,
  children,
  height = 240,
}: {
  points: ChartPoint[];
  valueLabel: string;
  children: React.ReactElement;
  height?: number;
}) {
  const [tableOpen, setTableOpen] = React.useState(false);

  return (
    <div>
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          {children}
        </ResponsiveContainer>
      </div>
      <EquivalentTable
        points={points}
        valueLabel={valueLabel}
        open={tableOpen}
        onToggle={() => setTableOpen((value) => !value)}
      />
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
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={48} />
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
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={48} domain={["auto", "auto"]} />
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
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
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
