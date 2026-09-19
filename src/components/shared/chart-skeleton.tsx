"use client";

/**
 * Espaço reservado enquanto o código de um gráfico é baixado (P3 da auditoria de performance).
 *
 * ═══════════ POR QUE A ALTURA VEM DE UMA VARIÁVEL CSS ═══════════
 *
 * O `loading:` do `next/dynamic` é uma função SEM acesso às props do componente que está sendo
 * carregado — e é justamente a prop `height` que define o tamanho do gráfico. Se o esqueleto
 * chutasse uma altura, a página daria um salto no instante em que o gráfico chegasse.
 *
 * Então quem sabe a altura (o componente-invólucro) a publica em `--chart-skeleton-h` no
 * elemento que envolve o gráfico, e o esqueleto a lê por herança. O valor de reserva (240px)
 * cobre o caso de alguém esquecer de publicá-la: erra para "espaço a mais", nunca para zero.
 *
 * Cor: `bg-muted`, token do design system — dark e light sem nenhum condicional aqui dentro.
 */

/** Altura padrão quando o invólucro não publica `--chart-skeleton-h`. */
export const CHART_SKELETON_FALLBACK_HEIGHT = 240;

/** Publica a altura do gráfico para o esqueleto, como estilo inline herdável. */
export function chartSkeletonHeightVar(height: number): React.CSSProperties {
  return { "--chart-skeleton-h": `${height}px` } as React.CSSProperties;
}

export function ChartSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="w-full animate-pulse rounded-lg bg-muted/60"
      style={{ height: `var(--chart-skeleton-h, ${CHART_SKELETON_FALLBACK_HEIGHT}px)` }}
    />
  );
}

/**
 * Variante para os gráficos que trazem o botão "Ver os números em tabela" logo abaixo
 * (`ChartFrame` dos Treinos). Sem essa linha fantasma, a chegada do gráfico empurraria o
 * conteúdo seguinte em ~36px.
 */
export function ChartSkeletonWithToggle() {
  return (
    <div>
      <ChartSkeleton />
      <div aria-hidden="true" className="mt-2 h-7 w-44 animate-pulse rounded-md bg-muted/40" />
    </div>
  );
}
