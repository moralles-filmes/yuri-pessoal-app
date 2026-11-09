"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `faturas-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

import { ReceiptText } from "lucide-react";
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
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/format";
import type { FaturaDoMes } from "@/lib/finance/dashboard";
import {
  axisTick,
  brlCompact,
  CHART_COLORS,
  chaveDoTopoDaPilha,
  GRID_COLOR,
  larguraDaBarra,
  monthLabel,
  opacidadeDoGrupo,
  raioDaPonta,
  VAO_ENTRE_BARRAS,
} from "./chart-theme";
import { DicaDoGrafico, LegendaDoGrafico } from "./dica-do-grafico";
import { linhasDaDica } from "./linhas-da-dica";
import { ObservadorDeFoco, useFocoDoGrafico } from "./use-foco-do-grafico";

/** Ordem de empilhamento, de baixo para cima: só o último com valor leva a ponta arredondada. */
const PILHA = ["meu", "terceiros"] as const;
// O tipo de `Cell` declara `radius` como número, mas a recharts mescla as props da `Cell` sobre o
// retângulo da barra, e o `Rectangle` aceita a lista de quatro raios (verificado em
// `Bar.js`/`Rectangle.js`, recharts 3.9.0). O molde estreito é só do tipo.
const PONTA = { radius: raioDaPonta("horizontal") } as unknown as { radius: number };

/**
 * Faturas dos próximos meses com o VALOR CHEIO (desenho 2026-10-18): a pilha é o total real da
 * fatura, com a minha parte e a de terceiros empilhadas — o único gráfico financeiro que inclui
 * terceiros, e a descrição do card diz isso.
 */
/** Mês sem fatura: `null` em todos os valores, nunca zero. Vai ao recharts sem barra. */
export type MesSemFatura = { mes: string; total: null; meu: null; terceiros: null };

export type ItemDoGraficoDeFaturas = FaturaDoMes | MesSemFatura;

const VAZIO_PADRAO = {
  titulo: "Sem faturas nos próximos meses",
  descricao: "As faturas dos cartões aparecem aqui pelo mês de vencimento.",
};

export function FaturasChart({
  data,
  vazio,
}: {
  data: ItemDoGraficoDeFaturas[];
  vazio?: { titulo: string; descricao: string };
}) {
  // Os ganchos vêm ANTES do retorno do vazio. `chartData` é memorizado: o observador acha o
  // índice por IDENTIDADE, e um array novo a cada render o faria errar.
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();
  const chartData = useMemo(() => data.map((f) => ({ ...f, label: monthLabel(f.mes) })), [data]);

  // Vazio = nenhum mês com fatura. No uso de hoje (sem `vazio`), total zero conta como vazio; com
  // `vazio` (histórico, 05-C), mês com fatura de total zero é zero MEDIDO e o gráfico aparece.
  const temFatura = vazio
    ? data.some((f) => f.total !== null)
    : data.some((f) => f.total !== null && f.total !== 0);
  if (!temFatura) {
    const texto = vazio ?? VAZIO_PADRAO;
    return (
      <EmptyState
        icon={ReceiptText}
        title={texto.titulo}
        description={texto.descricao}
        className="py-8"
      />
    );
  }

  return (
    <div ref={refDoGrafico} className="grafico-barras grafico-dinheiro">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8 }} barGap={VAO_ENTRE_BARRAS}>
          <ObservadorDeFoco dados={chartData} aoMudar={foco.aoMudar} />
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={brlCompact} tick={axisTick} axisLine={false} tickLine={false} width="auto" />
          <Tooltip
            cursor={false}
            active={foco.dicaAtiva}
            isAnimationActive={false}
            content={({ payload, label }) => {
              if (!payload || payload.length === 0) return null;
              const linha = payload[0].payload as (typeof chartData)[number];
              const semFatura = linha.total === null;
              return (
                <DicaDoGrafico
                  titulo={semFatura ? `${String(label)} · sem fatura` : String(label)}
                  total={linha.total === null ? undefined : formatCurrency(linha.total)}
                  linhas={linhasDaDica(payload, (e) =>
                    e.value === null || e.value === undefined
                      ? { valor: "sem fatura", dinheiro: false }
                      : { valor: formatCurrency(Number(e.value)), dinheiro: true },
                  )}
                />
              );
            }}
          />
          <Legend content={<LegendaDoGrafico />} />
          <Bar
            dataKey="meu"
            name="Minha parte"
            stackId="f"
            fill={CHART_COLORS[0]}
            maxBarSize={larguraDaBarra(chartData.length)}
            isAnimationActive={false}
          >
            {chartData.map((f, i) => (
              <Cell
                key={f.mes}
                opacity={opacidadeDoGrupo(i, foco.foco)}
                {...(chaveDoTopoDaPilha(f, PILHA) === "meu" ? PONTA : {})}
              />
            ))}
          </Bar>
          <Bar
            dataKey="terceiros"
            name="Parte de terceiros"
            stackId="f"
            fill={CHART_COLORS[3]}
            maxBarSize={larguraDaBarra(chartData.length)}
            isAnimationActive={false}
          >
            {chartData.map((f, i) => (
              <Cell
                key={f.mes}
                opacity={opacidadeDoGrupo(i, foco.foco)}
                {...(chaveDoTopoDaPilha(f, PILHA) === "terceiros" ? PONTA : {})}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
