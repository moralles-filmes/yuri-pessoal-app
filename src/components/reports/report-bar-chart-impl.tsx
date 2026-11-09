"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `report-bar-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  axisTick,
  CHART_COLORS,
  GRID_COLOR,
  larguraDaBarra,
  opacidadeDoGrupo,
  raioDaPonta,
  VAO_ENTRE_BARRAS,
} from "@/components/dashboard/chart-theme";
import { DicaDoGrafico } from "@/components/dashboard/dica-do-grafico";
import { linhasDaDica } from "@/components/dashboard/linhas-da-dica";
import { ObservadorDeFoco, useFocoDoGrafico } from "@/components/dashboard/use-foco-do-grafico";

export type BarPoint = { label: string; value: number };

/**
 * Gráfico de barras genérico dos relatórios (Fase 14). Reaproveita os tokens do
 * design system (preto/branco/dourado, legível em dark/light). `formatValue` permite
 * BRL, minutos, porcentagem ou contagem. `dinheiro` diz que o valor é BRL: só então o olho dos
 * valores o esconde (dica e eixo) — contagem, minutos e porcentagem não são dinheiro.
 */
export function ReportBarChart({
  data,
  name,
  color = CHART_COLORS[0],
  formatValue,
  height = 240,
  dinheiro = false,
}: {
  data: BarPoint[];
  name: string;
  color?: string;
  formatValue?: (v: number) => string;
  height?: number;
  dinheiro?: boolean;
}) {
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();

  return (
    <div
      ref={refDoGrafico}
      className={dinheiro ? "grafico-barras grafico-dinheiro" : "grafico-barras"}
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ left: 4, right: 12, top: 8 }} barGap={VAO_ENTRE_BARRAS}>
          <ObservadorDeFoco dados={data} aoMudar={foco.aoMudar} />
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width="auto"
            allowDecimals={false}
            tickFormatter={formatValue}
          />
          <Tooltip
            cursor={false}
            active={foco.dicaAtiva}
            isAnimationActive={false}
            content={({ payload, label }) => (
              <DicaDoGrafico
                titulo={String(label)}
                linhas={linhasDaDica(payload ?? [], (e) =>
                  typeof e.value === "number"
                    ? {
                        nome: name,
                        valor: formatValue ? formatValue(Number(e.value)) : String(e.value),
                        dinheiro,
                      }
                    : null,
                )}
              />
            )}
          />
          <Bar
            dataKey="value"
            name={name}
            fill={color}
            radius={raioDaPonta("horizontal")}
            maxBarSize={larguraDaBarra(data.length)}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={d.label} opacity={opacidadeDoGrupo(i, foco.foco)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
