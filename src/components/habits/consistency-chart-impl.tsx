"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `consistency-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

import { useMemo } from "react";
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
  GRID_COLOR,
  larguraDaBarra,
  opacidadeDoGrupo,
  raioDaPonta,
  VAO_ENTRE_BARRAS,
} from "@/components/dashboard/chart-theme";
import { DicaDoGrafico } from "@/components/dashboard/dica-do-grafico";
import { linhasDaDica } from "@/components/dashboard/linhas-da-dica";
import { ObservadorDeFoco, useFocoDoGrafico } from "@/components/dashboard/use-foco-do-grafico";
import type { HabitWeekPoint } from "@/types/database";

const pct = (v: number | string) => `${Math.round(Number(v) * 100)}%`;

/** Gráfico de consistência semanal (taxa de conclusão por semana, últimas 8). */
export function ConsistencyChart({ weekly }: { weekly: HabitWeekPoint[] }) {
  // Memorizado: o observador acha o índice por IDENTIDADE (ver `ObservadorDeFoco`).
  const data = useMemo(
    () =>
      weekly.map((w) => ({
        label: w.label,
        rate: w.rate,
        done: w.done,
        scheduled: w.scheduled,
      })),
    [weekly],
  );
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();

  return (
    <div ref={refDoGrafico} className="grafico-barras">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }} barGap={VAO_ENTRE_BARRAS}>
          <ObservadorDeFoco dados={data} aoMudar={foco.aoMudar} />
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            domain={[0, 1]}
            tickFormatter={pct}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width="auto"
          />
          <Tooltip
            cursor={false}
            active={foco.dicaAtiva}
            isAnimationActive={false}
            content={({ payload, label }) => (
              <DicaDoGrafico
                titulo={`Semana de ${label}`}
                linhas={linhasDaDica(payload ?? [], (e) => {
                  if (typeof e.value !== "number") return null;
                  const p = e.payload as { done: number; scheduled: number };
                  return {
                    nome: "Conclusão",
                    valor: `${pct(e.value)} (${p.done}/${p.scheduled})`,
                    dinheiro: false,
                  };
                })}
              />
            )}
          />
          <Bar
            dataKey="rate"
            name="Conclusão"
            fill="var(--chart-1)"
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
