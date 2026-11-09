"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `forma-pagamento-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

import { CreditCard } from "lucide-react";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import type { FormaSlice } from "@/lib/finance/dashboard";
import {
  axisTick,
  brlCompact,
  CHART_COLORS,
  larguraDaBarra,
  opacidadeDoGrupo,
  raioDaPonta,
  VAO_ENTRE_BARRAS,
} from "./chart-theme";
import { DicaDoGrafico } from "./dica-do-grafico";
import { linhasDaDica } from "./linhas-da-dica";
import { ObservadorDeFoco, useFocoDoGrafico } from "./use-foco-do-grafico";

const LABELS: Record<string, string> = { ...PAYMENT_METHOD_LABELS, outro: "Outro" };

/** MEUS gastos por forma de pagamento (barras horizontais) — desenha `meu` (desenho 2026-10-18). */
export function FormaPagamentoChart({
  data,
  rotuloDaSerie = "Minha parte",
}: {
  data: FormaSlice[];
  /** Nome da série na dica; o default é o texto do painel. */
  rotuloDaSerie?: string;
}) {
  // Os ganchos vêm ANTES do retorno do vazio. `chartData` é memorizado: o observador acha o
  // índice por IDENTIDADE, e um array novo a cada render o faria errar.
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();
  const positivos = useMemo(
    () => data.filter((d) => d.meu > 0).sort((a, b) => b.meu - a.meu),
    [data],
  );
  const chartData = useMemo(
    () =>
      positivos.map((d, i) => ({
        nome: LABELS[d.paymentMethod] ?? d.paymentMethod,
        valor: d.meu,
        cor: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [positivos],
  );
  if (positivos.length === 0) {
    return (
      <EmptyState
        nivel={3}
        icon={CreditCard}
        title="Sem gastos no período"
        description="Os gastos aparecem aqui agrupados por forma de pagamento."
        className="py-8"
      />
    );
  }

  return (
    <div ref={refDoGrafico} className="grafico-barras-deitadas grafico-dinheiro">
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 46)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 8, right: 16 }}
          barGap={VAO_ENTRE_BARRAS}
        >
          <ObservadorDeFoco dados={chartData} aoMudar={foco.aoMudar} />
          <XAxis type="number" tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="nome"
            width="auto"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={false}
            active={foco.dicaAtiva}
            isAnimationActive={false}
            content={({ payload, label }) => {
              if (!payload || payload.length === 0) return null;
              // A série não tem cor própria (cada linha tem a sua): a amostra usa a da linha.
              const cor = (payload[0].payload as (typeof chartData)[number]).cor;
              return (
                <DicaDoGrafico
                  titulo={String(label)}
                  linhas={linhasDaDica(
                    payload.map((e) => ({ ...e, color: cor })),
                    (e) =>
                      typeof e.value === "number"
                        ? { nome: rotuloDaSerie, valor: formatCurrency(e.value), dinheiro: true }
                        : null,
                  )}
                />
              );
            }}
          />
          <Bar
            dataKey="valor"
            radius={raioDaPonta("vertical")}
            maxBarSize={larguraDaBarra(chartData.length)}
            isAnimationActive={false}
          >
            {chartData.map((d, i) => (
              <Cell
                key={d.nome}
                fill={CHART_COLORS[i % CHART_COLORS.length]}
                opacity={opacidadeDoGrupo(i, foco.foco)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
