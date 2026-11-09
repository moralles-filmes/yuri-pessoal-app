"use client";

/**
 * ⚠️ **NINGUÉM IMPORTA ESTE ARQUIVO DIRETO.** Ele é baixado sob demanda por
 * `rosca-categorias-chart.tsx`, que é a fachada pública — é ali que o `recharts` (109 KB gz)
 * deixa de entrar no primeiro byte da rota. A legenda e a nota do que ficou de fora moram na
 * fachada, porque não usam `recharts`.
 */

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ValorComOlho } from "@/components/shared/painel/valor-com-olho";
import { formatCurrency } from "@/lib/format";
import type { CategoriaSlice } from "@/lib/finance/dashboard";
import { anguloDoVao, opacidadeDoGrupo } from "./chart-theme";
import { centroDaRosca, corDaFatia } from "./cores-da-rosca";
import { useFocoDoGrafico } from "./use-foco-do-grafico";

/**
 * Rosca das MINHAS saídas por categoria. As fatias já chegam positivas e ordenadas pela fachada
 * (a mesma ordem da legenda, para a cor ser a mesma); o vazio também é decidido lá. Todas as
 * categorias aparecem — dobrar em "Outros" fica para a 06 (D15). O total fica no centro e dá lugar
 * à fatia em foco (mouse, toque), com o nome e o percentual dela.
 */
export function RoscaCategoriasChart({
  fatias,
  total,
  rotuloDoTotal = "minhas saídas",
}: {
  fatias: CategoriaSlice[];
  total: number;
  rotuloDoTotal?: string;
}) {
  // `ref` sai do objeto: um `ref={x.ref}` faz o lint do React tratar `x` inteiro como ref.
  const { ref: refDoGrafico, ...foco } = useFocoDoGrafico({ zerarAoDispensar: true });
  const centro = centroDaRosca({ fatias, total, rotuloDoTotal }, foco.foco);

  return (
    <div ref={refDoGrafico} className="relative">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={fatias}
            dataKey="meu"
            nameKey="name"
            innerRadius={62}
            outerRadius={96}
            paddingAngle={anguloDoVao(fatias.length, 79)}
            isAnimationActive={false}
            onMouseEnter={(_, i) => foco.aoMudar(i)}
            onMouseLeave={() => foco.aoMudar(null)}
            onClick={(_, i) => foco.aoMudar(i)}
          >
            {fatias.map((f, i) => (
              <Cell
                key={f.categoryId ?? i}
                fill={corDaFatia(f, i)}
                stroke="none"
                opacity={opacidadeDoGrupo(i, foco.foco)}
              />
            ))}
          </Pie>
          <Tooltip content={() => null} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="max-w-26 text-center text-base leading-tight font-semibold tabular-nums">
          <ValorComOlho texto={formatCurrency(centro.valor)} />
        </span>
        <span className="max-w-26 truncate text-xs text-muted-foreground">{centro.rotulo}</span>
        {centro.percentual !== null && (
          <span className="text-xs text-muted-foreground tabular-nums">{centro.percentual}</span>
        )}
      </div>
    </div>
  );
}
