"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `mes-a-mes-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

import { useMemo } from "react";
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
import { formatCurrency } from "@/lib/format";
import type { MesAMesDados } from "@/lib/finance/dashboard";
import {
  axisTick,
  brlCompact,
  CHART_COLORS,
  GRID_COLOR,
  larguraDaBarra,
  opacidadeDoGrupo,
  raioDaPonta,
  VAO_ENTRE_BARRAS,
} from "./chart-theme";
import { DicaDoGrafico, LegendaDoGrafico } from "./dica-do-grafico";
import { linhasDaDica } from "./linhas-da-dica";
import { ObservadorDeFoco, useFocoDoGrafico } from "./use-foco-do-grafico";

/**
 * "Meu mês a mês": as MINHAS entradas e saídas do mês contra o anterior (barras agrupadas).
 * A fonte decide a base — competência (`paresDoMesAMes`) ou caixa (`mesAMesDoCaixa`).
 */
export function MesAMesChart({ dados }: { dados: MesAMesDados }) {
  // Memorizado: o observador acha o índice por IDENTIDADE (ver `ObservadorDeFoco`).
  const data = useMemo(
    () => [
      { nome: "Minhas entradas", anterior: dados.anterior.entradas, atual: dados.atual.entradas },
      { nome: "Minhas saídas", anterior: dados.anterior.saidas, atual: dados.atual.saidas },
    ],
    [dados],
  );
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();

  return (
    <div ref={refDoGrafico} className="grafico-barras grafico-dinheiro">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }} barGap={VAO_ENTRE_BARRAS}>
          <ObservadorDeFoco dados={data} aoMudar={foco.aoMudar} />
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="nome" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} width="auto" />
          <Tooltip
            cursor={false}
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
          <Bar
            dataKey="anterior"
            name="Mês anterior"
            fill={CHART_COLORS[3]}
            radius={raioDaPonta("horizontal")}
            maxBarSize={larguraDaBarra(data.length)}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={d.nome} opacity={opacidadeDoGrupo(i, foco.foco)} />
            ))}
          </Bar>
          <Bar
            dataKey="atual"
            name="Mês atual"
            fill={CHART_COLORS[0]}
            radius={raioDaPonta("horizontal")}
            maxBarSize={larguraDaBarra(data.length)}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={d.nome} opacity={opacidadeDoGrupo(i, foco.foco)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
