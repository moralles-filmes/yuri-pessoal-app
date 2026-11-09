"use client";

/**
 * Fachada da rosca de categorias do painel (04-A): carrega `rosca-categorias-chart-impl` sob demanda
 * e é a dona do que NÃO usa `recharts` — o vazio, a legenda com valor e %, e a nota do que ficou
 * de fora. Assim o `recharts` (109 KB gz) só chega com o desenho, e a leitura em texto das
 * categorias existe mesmo antes (ou sem) ele.
 *
 * Quem chama passa as categorias como vieram e os estornos do cartão; a fachada filtra só as
 * fatias positivas (`dadosDaRosca`) e dobra em "Outros" acima de 8 (D15, `dobrarEmOutros`), que
 * também ordena por minha parte. A conta do que ficou de fora é `foraDaRosca`, sobre as categorias
 * originais — fecha: Σ fatias − estornos + fora = minhas saídas.
 */
import dynamic from "next/dynamic";
import { PieChart as PieIcon } from "lucide-react";
import { ChartSkeleton, chartSkeletonHeightVar } from "@/components/shared/chart-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ValorComOlho } from "@/components/shared/painel/valor-com-olho";
import type { CategoriaSlice } from "@/lib/finance/dashboard";
import { dadosDaRosca, foraDaRosca } from "@/lib/finance/painel";
import { centavosParaReais, formatCurrency, reaisParaCentavos } from "@/lib/format";
import { dobrarEmOutros } from "@/lib/painel/rosca";
import { corDaFatia, percentualDaFatia } from "./cores-da-rosca";

// ⛔ O segundo argumento de `next/dynamic` tem de ser objeto literal escrito ali mesmo — o
// compilador o lê estaticamente e recusa uma constante compartilhada.
const LazyRoscaCategoriasChart = dynamic(
  () => import("./rosca-categorias-chart-impl").then((m) => m.RoscaCategoriasChart),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);

export function RoscaCategoriasChart({
  categorias,
  estornos,
  ariaDaLista = "Minhas saídas por categoria",
  rotuloDoTotal = "minhas saídas",
}: {
  categorias: CategoriaSlice[];
  estornos: number;
  /** `aria-label` da legenda; o default é o texto do painel. */
  ariaDaLista?: string;
  /** Legenda do total no centro da rosca; o default é o texto do painel. */
  rotuloDoTotal?: string;
}) {
  const fatias = dobrarEmOutros(dadosDaRosca(categorias));
  const fora = foraDaRosca(categorias, estornos);

  if (fatias.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={PieIcon}
          title="Sem gastos no período"
          description="Lance despesas para ver a distribuição por categoria."
          className="py-8"
        />
        {fora.frase && <p className="text-xs text-muted-foreground">{fora.frase}</p>}
      </div>
    );
  }

  const total = centavosParaReais(fatias.reduce((s, f) => s + reaisParaCentavos(f.meu), 0));

  return (
    <div className="@container space-y-3">
      <div style={chartSkeletonHeightVar(260)}>
        <LazyRoscaCategoriasChart fatias={fatias} total={total} rotuloDoTotal={rotuloDoTotal} />
      </div>
      <ul
        aria-label={ariaDaLista}
        className="grid gap-x-6 gap-y-1.5 @md:grid-cols-2"
      >
        {fatias.map((f, i) => (
          <li key={f.categoryId ?? i} className="text-sm">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: corDaFatia(f, i) }}
              />
              <span className="min-w-0 flex-1 truncate" title={f.name}>
                {f.name}
              </span>
              <span className="shrink-0 tabular-nums">
                <ValorComOlho texto={formatCurrency(f.meu)} />
              </span>
              <span className="w-12 shrink-0 text-right text-muted-foreground tabular-nums">
                {percentualDaFatia(f.meu, total)}
              </span>
            </div>
            {f.dobradas && (
              <p className="pl-4.5 text-xs text-muted-foreground">{f.dobradas.join(", ")}</p>
            )}
          </li>
        ))}
      </ul>
      {fora.frase && <p className="text-xs text-muted-foreground">{fora.frase}</p>}
    </div>
  );
}
