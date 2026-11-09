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
  Cell,
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
  larguraDaBarra,
  opacidadeDoGrupo,
  MIRA_DA_LINHA,
  raioDaPonta,
  VAO_ENTRE_BARRAS,
} from "@/components/dashboard/chart-theme";
import { DicaDoGrafico } from "@/components/dashboard/dica-do-grafico";
import { linhasDaDica } from "@/components/dashboard/linhas-da-dica";
import { ObservadorDeFoco, useFocoDoGrafico } from "@/components/dashboard/use-foco-do-grafico";

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
  className,
  refDoGrafico,
}: {
  points: ChartPoint[];
  valueLabel: string;
  children: React.ReactElement;
  height?: number;
  /** Classes do gráfico (crescimento das barras). */
  className?: string;
  /** O `ref` do foco (09-E): a dica fecha ao tocar fora e ao rolar. */
  refDoGrafico?: (elemento: HTMLDivElement | null) => void;
}) {
  return (
    <div aria-hidden="true" ref={refDoGrafico} className={className}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}

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
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();
  return (
    <ChartFrame
      points={points}
      valueLabel={valueLabel}
      height={height}
      className="grafico-barras"
      refDoGrafico={refDoGrafico}
    >
      <BarChart data={points} margin={{ left: 4, right: 8, top: 8 }} barGap={VAO_ENTRE_BARRAS}>
        <ObservadorDeFoco dados={points} aoMudar={foco.aoMudar} />
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width="auto" />
        <Tooltip
          cursor={false}
          active={foco.dicaAtiva}
          isAnimationActive={false}
          content={({ payload, label }) => (
            <DicaDoGrafico
              titulo={String(label)}
              linhas={linhasDaDica(payload ?? [], (e) => ({
                nome: valueLabel,
                valor: (e.payload as ChartPoint).display,
                dinheiro: false,
              }))}
            />
          )}
        />
        <Bar
          dataKey="value"
          name={valueLabel}
          fill="var(--chart-1)"
          radius={raioDaPonta("horizontal")}
          maxBarSize={larguraDaBarra(points.length)}
          isAnimationActive={false}
        >
          {points.map((p, i) => (
            <Cell key={p.label} opacity={opacidadeDoGrupo(i, foco.foco)} />
          ))}
        </Bar>
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
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();
  return (
    <ChartFrame points={points} valueLabel={valueLabel} height={height} refDoGrafico={refDoGrafico}>
      <LineChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width="auto" domain={["auto", "auto"]} />
        <Tooltip
          cursor={MIRA_DA_LINHA}
          active={foco.dicaAtiva}
          isAnimationActive={false}
          content={({ payload, label }) => (
            <DicaDoGrafico
              titulo={String(label)}
              linhas={linhasDaDica(payload ?? [], (e) => ({
                nome: valueLabel,
                valor: (e.payload as ChartPoint).display,
                dinheiro: false,
              }))}
            />
          )}
        />
        <Line
          type="monotone"
          dataKey="value"
          name={valueLabel}
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--chart-1)" }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
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
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();
  return (
    <ChartFrame points={points} valueLabel={valueLabel} height={height} refDoGrafico={refDoGrafico}>
      <AreaChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width="auto" allowDecimals={false} />
        <Tooltip
          cursor={MIRA_DA_LINHA}
          active={foco.dicaAtiva}
          isAnimationActive={false}
          content={({ payload, label }) => (
            <DicaDoGrafico
              titulo={String(label)}
              linhas={linhasDaDica(payload ?? [], (e) => ({
                nome: valueLabel,
                valor: (e.payload as ChartPoint).display,
                dinheiro: false,
              }))}
            />
          )}
        />
        <Area
          type="monotone"
          dataKey="value"
          name={valueLabel}
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="var(--chart-1)"
          fillOpacity={0.14}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartFrame>
  );
}
