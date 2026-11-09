"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por
 * `barras-entradas-saidas-chart.tsx`, que é a fachada pública — é ali que o `recharts` (109 KB gz)
 * deixa de entrar no primeiro byte da rota.
 */

import { BarChart3 } from "lucide-react";
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
import type { EvolucaoPonto } from "@/lib/finance/dashboard";
import { temDadosNasBarras } from "./barras-dados";
import {
  axisTick,
  brlCompact,
  CHART_COLORS,
  GRID_COLOR,
  larguraDaBarra,
  monthLabel,
  OPACIDADE_EM_ANDAMENTO,
  opacidadeDoGrupo,
  raioDaPonta,
  VAO_ENTRE_BARRAS,
} from "./chart-theme";
import { DicaDoGrafico, LegendaDoGrafico } from "./dica-do-grafico";
import { linhasDaDica } from "./linhas-da-dica";
import { ObservadorDeFoco, useFocoDoGrafico } from "./use-foco-do-grafico";

const COR_ENTRADAS = CHART_COLORS[0];
const COR_SAIDAS = "var(--muted-foreground)";

/**
 * O mês em andamento NÃO se confunde com o fechado (D-A-10): preenchimento a 35% e contorno
 * tracejado, na cor da série. Entra na `Cell` por espalhamento condicional, e não por ternário:
 * a recharts mescla as props da `Cell` por cima das da `Bar`, e um `fillOpacity` explicitamente
 * `undefined` apagaria o 0,6 das saídas fechadas.
 */
function marcaDoMesParcial(cor: string) {
  return {
    fillOpacity: OPACIDADE_EM_ANDAMENTO,
    stroke: cor,
    strokeWidth: 1.5,
    strokeDasharray: "4 3",
  };
}
const PARCIAL_ENTRADAS = marcaDoMesParcial(COR_ENTRADAS);
const PARCIAL_SAIDAS = marcaDoMesParcial(COR_SAIDAS);

/**
 * Minhas entradas × minhas saídas por mês, barras agrupadas. O mês em andamento (`parcial`) sai
 * a 35% e com a borda tracejada, e a legenda e a dica dizem por quê.
 */
export function BarrasEntradasSaidasChart({
  dados,
  series = "ambas",
  nomes = { entradas: "Minhas entradas", saidas: "Minhas saídas" },
}: {
  dados: (EvolucaoPonto & { parcial: boolean })[];
  /** `saidas`: só a barra de saídas (o recorte por cartão não segue as entradas — 04-A2). */
  series?: "ambas" | "saidas";
  /** Os rótulos dependem da responsabilidade (Meu · Terceiros · Consolidado): quem chama os dá. */
  nomes?: { entradas: string; saidas: string };
}) {
  // O gancho vem ANTES do retorno do vazio: o gráfico pode sair do vazio para o cheio sem remontar.
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref e recusar
  // `x.dicaAtiva` na renderização.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico();
  // Memorizado: o observador acha o índice por IDENTIDADE, e um array novo a cada render o faria
  // errar enquanto a recharts ainda guarda o anterior.
  const chartData = useMemo(() => dados.map((p) => ({ ...p, label: monthLabel(p.mes) })), [dados]);
  if (!temDadosNasBarras(dados)) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Sem histórico ainda"
        description="Os meses aparecem conforme você registra entradas e saídas."
        className="py-8"
      />
    );
  }

  return (
    <div ref={refDoGrafico} className="grafico-barras grafico-dinheiro">
      {/* A legenda do mês parcial mora na FACHADA (altura reservada exata, sem salto). */}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          margin={{ left: 4, right: 12, top: 8 }}
          barGap={VAO_ENTRE_BARRAS}
        >
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
              return (
                <DicaDoGrafico
                  titulo={String(label)}
                  situacao={linha.parcial ? "ainda em andamento" : undefined}
                  linhas={linhasDaDica(payload, (e) =>
                    typeof e.value === "number"
                      ? { valor: formatCurrency(e.value), dinheiro: true }
                      : null,
                  )}
                />
              );
            }}
          />
          <Legend content={<LegendaDoGrafico />} />
          {series !== "saidas" && (
            <Bar
              dataKey="entradas"
              name={nomes.entradas}
              fill={COR_ENTRADAS}
              radius={raioDaPonta("horizontal")}
              maxBarSize={larguraDaBarra(chartData.length)}
              isAnimationActive={false}
            >
              {chartData.map((p, i) => (
                <Cell
                  key={p.mes}
                  fill={COR_ENTRADAS}
                  opacity={opacidadeDoGrupo(i, foco.foco)}
                  {...(p.parcial ? PARCIAL_ENTRADAS : {})}
                />
              ))}
            </Bar>
          )}
          <Bar
            dataKey="saidas"
            name={nomes.saidas}
            fill={COR_SAIDAS}
            fillOpacity={0.6}
            radius={raioDaPonta("horizontal")}
            maxBarSize={larguraDaBarra(chartData.length)}
            isAnimationActive={false}
          >
            {chartData.map((p, i) => (
              <Cell
                key={p.mes}
                fill={COR_SAIDAS}
                opacity={opacidadeDoGrupo(i, foco.foco)}
                {...(p.parcial ? PARCIAL_SAIDAS : {})}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
