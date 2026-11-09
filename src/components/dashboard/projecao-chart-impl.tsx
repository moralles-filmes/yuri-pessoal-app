"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por `projecao-chart.tsx`, que é a
 * fachada pública — é ali que o `recharts` (109 KB gz) deixa de entrar no primeiro byte da rota.
 * Importar daqui reintroduz o peso que a fachada existe para evitar. Ver `.turbo/REPORT.md`.
 */

import { TrendingUp } from "lucide-react";
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
import type { ProjecaoPonto } from "@/lib/finance/dashboard";
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

/**
 * 04-A — série futura visualmente distinta: o que é projeção sai hachurado, com a borda tracejada
 * e a legenda "(projetado)". Vale também em /relatorios, onde este gráfico é reaproveitado; os
 * números, os `dataKey` e a regra de vazio não mudam.
 */
function Hachura({ id, cor }: { id: string; cor: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" fill={cor} fillOpacity={0.25} />
      <line x1="0" y1="0" x2="0" y2="6" stroke={cor} strokeWidth={2.5} />
    </pattern>
  );
}

const COR_FATURAS = CHART_COLORS[0];
const COR_RECORRENCIAS = CHART_COLORS[2];
const COR_CONTAS_FIXAS = CHART_COLORS[4];

/** Ordem de empilhamento, de baixo para cima: só o último com valor leva a ponta arredondada. */
const PILHA = ["faturas", "recorrencias", "contasFixas"] as const;
// O tipo de `Cell` declara `radius` como número, mas a recharts mescla as props da `Cell` sobre o
// retângulo da barra, e o `Rectangle` aceita a lista de quatro raios (verificado em
// `Bar.js`/`Rectangle.js`, recharts 3.9.0). O molde estreito é só do tipo.
const PONTA = { radius: raioDaPonta("horizontal") } as unknown as { radius: number };

/**
 * A hachura e o contorno tracejado moram na `Cell`; a `Bar` leva a cor SÓLIDA, que é de onde a
 * legenda tira a amostra (um `url(#...)` na legenda não desenharia nada).
 */
function marcaDaProjecao(hachura: string, cor: string) {
  return { fill: `url(#${hachura})`, stroke: cor, strokeWidth: 1.5, strokeDasharray: "4 3" };
}
const PROJECAO_FATURAS = marcaDaProjecao("hachura-projecao-faturas", COR_FATURAS);
const PROJECAO_RECORRENCIAS = marcaDaProjecao("hachura-projecao-recorrencias", COR_RECORRENCIAS);
const PROJECAO_CONTAS_FIXAS = marcaDaProjecao("hachura-projecao-contas-fixas", COR_CONTAS_FIXAS);

/** Minha projeção: a minha parte das faturas + recorrências + contas fixas (barras empilhadas). */
export function ProjecaoChart({ data }: { data: ProjecaoPonto[] }) {
  // Os ganchos vêm ANTES do retorno do vazio. `chartData` é memorizado: o observador acha o
  // índice por IDENTIDADE, e um array novo a cada render o faria errar.
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();
  const chartData = useMemo(() => data.map((p) => ({ ...p, label: monthLabel(p.mes) })), [data]);

  const temDados = data.some((p) => p.total > 0);
  if (!temDados) {
    return (
      <EmptyState
        nivel={3}
        icon={TrendingUp}
        title="Sem projeção"
        description="Cadastre faturas, recorrências ou contas fixas para projetar os próximos meses."
        className="py-8"
      />
    );
  }

  return (
    <div ref={refDoGrafico} className="grafico-barras grafico-dinheiro">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8 }} barGap={VAO_ENTRE_BARRAS}>
          <ObservadorDeFoco dados={chartData} aoMudar={foco.aoMudar} />
          <defs>
            <Hachura id="hachura-projecao-faturas" cor={COR_FATURAS} />
            <Hachura id="hachura-projecao-recorrencias" cor={COR_RECORRENCIAS} />
            <Hachura id="hachura-projecao-contas-fixas" cor={COR_CONTAS_FIXAS} />
          </defs>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
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
            dataKey="faturas"
            name="Minha parte das faturas (projetado)"
            stackId="p"
            fill={COR_FATURAS}
            maxBarSize={larguraDaBarra(chartData.length)}
            isAnimationActive={false}
          >
            {chartData.map((p, i) => (
              <Cell
                key={p.mes}
                opacity={opacidadeDoGrupo(i, foco.foco)}
                {...PROJECAO_FATURAS}
                {...(chaveDoTopoDaPilha(p, PILHA) === "faturas" ? PONTA : {})}
              />
            ))}
          </Bar>
          <Bar
            dataKey="recorrencias"
            name="Recorrências (projetado)"
            stackId="p"
            fill={COR_RECORRENCIAS}
            maxBarSize={larguraDaBarra(chartData.length)}
            isAnimationActive={false}
          >
            {chartData.map((p, i) => (
              <Cell
                key={p.mes}
                opacity={opacidadeDoGrupo(i, foco.foco)}
                {...PROJECAO_RECORRENCIAS}
                {...(chaveDoTopoDaPilha(p, PILHA) === "recorrencias" ? PONTA : {})}
              />
            ))}
          </Bar>
          <Bar
            dataKey="contasFixas"
            name="Contas fixas (projetado)"
            stackId="p"
            fill={COR_CONTAS_FIXAS}
            maxBarSize={larguraDaBarra(chartData.length)}
            isAnimationActive={false}
          >
            {chartData.map((p, i) => (
              <Cell
                key={p.mes}
                opacity={opacidadeDoGrupo(i, foco.foco)}
                {...PROJECAO_CONTAS_FIXAS}
                {...(chaveDoTopoDaPilha(p, PILHA) === "contasFixas" ? PONTA : {})}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
