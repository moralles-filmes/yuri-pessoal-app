"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `evolution-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { axisTick, GRID_COLOR, MIRA_DA_LINHA } from "@/components/dashboard/chart-theme";
import { DicaDoGrafico } from "@/components/dashboard/dica-do-grafico";
import { linhasDaDica } from "@/components/dashboard/linhas-da-dica";
import { useFocoDoGrafico } from "@/components/dashboard/use-foco-do-grafico";
import { formatMinutes, minutesToHours } from "@/lib/studies/constants";
import type { StudyWeekPoint } from "@/types/database";

/** Evolução do tempo estudado por semana (últimas 8). Eixo em horas, tooltip amigável. */
export function EvolutionChart({ weekly }: { weekly: StudyWeekPoint[] }) {
  const data = weekly.map((w) => ({
    label: w.label,
    hours: minutesToHours(w.minutes),
    minutes: w.minutes,
  }));

  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();

  return (
    <div ref={refDoGrafico}>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width="auto"
            tickFormatter={(v) => `${v}h`}
            allowDecimals
          />
          <Tooltip
            cursor={MIRA_DA_LINHA}
            active={foco.dicaAtiva}
            isAnimationActive={false}
            content={({ payload, label }) => (
              <DicaDoGrafico
                titulo={`Semana de ${label}`}
                linhas={linhasDaDica(payload ?? [], (e) => {
                  if (typeof e.value !== "number") return null;
                  const p = e.payload as { minutes: number };
                  return { nome: "Estudado", valor: formatMinutes(p.minutes), dinheiro: false };
                })}
              />
            )}
          />
          <Area
            type="monotone"
            dataKey="hours"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="var(--chart-1)"
            fillOpacity={0.14}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
