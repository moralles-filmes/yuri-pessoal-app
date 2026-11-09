"use client";

/**
 * A dica em vidro, a amostra de cor e a legenda dos gráficos (09-E). Só os `-impl` importam este
 * arquivo: a fachada de um gráfico não pode arrastá-lo.
 *
 * A dica fica DENTRO do invólucro que a recharts posiciona, e por isso o olho dos valores a
 * alcança pelo mesmo seletor do resto do painel. A raiz leva só o material, o raio e a
 * tipografia: `vidro-sobreposicao` traz fundo, borda e sombra, e `cn()` (twMerge) deixaria uma
 * classe `bg-*` de fora derrubar o vidro. A dica acompanha o ponteiro, então não tem transição.
 */
import type { ReactNode } from "react";
import type { LegendPayload } from "recharts";
import { ValorComOlho } from "@/components/shared/painel/valor-com-olho";
import { OPACIDADE_EM_ANDAMENTO } from "./chart-theme";
import type { LinhaDaDica } from "./linhas-da-dica";

/**
 * Quadradinho de 10 px com o aro `ring-1 ring-foreground/NN`: o aro é o que mantém visível a cor
 * da série contra o vidro (a série clara sobre o vidro claro). `emAndamento` é o mês que ainda
 * não fechou — contorno tracejado e preenchimento a 35%, nunca parecido com o mês fechado.
 */
export function AmostraDeCor({ cor, emAndamento = false }: { cor: string; emAndamento?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-2.5 shrink-0 rounded-[3px] ring-1 ring-foreground/50"
      style={
        emAndamento
          ? {
              background: `color-mix(in srgb, ${cor} ${OPACIDADE_EM_ANDAMENTO * 100}%, transparent)`,
              border: `1px dashed ${cor}`,
            }
          : { background: cor }
      }
    />
  );
}

export function DicaDoGrafico({
  titulo,
  situacao,
  total,
  linhas,
}: {
  /** Texto ou nó: quem tem dinheiro no título o embrulha em `ValorComOlho`. */
  titulo: ReactNode;
  /** Texto, nunca só cor: "ainda em andamento". */
  situacao?: string;
  /** Total já formatado em BRL; passa pelo olho. */
  total?: string;
  linhas: readonly LinhaDaDica[];
}) {
  if (linhas.length === 0) return null;

  return (
    <div
      data-slot="chart-tooltip"
      className="vidro-sobreposicao min-w-40 max-w-64 rounded-[14px] px-3 py-2.5 text-xs text-foreground"
    >
      <p className="font-medium">{titulo}</p>
      {situacao ? <p className="text-muted-foreground">{situacao}</p> : null}
      <ul className="mt-1.5 space-y-1">
        {linhas.map((l) => (
          <li key={l.chave} className="flex items-center gap-2">
            <AmostraDeCor cor={l.cor} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.nome}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {l.dinheiro ? <ValorComOlho texto={l.valor} /> : l.valor}
            </span>
          </li>
        ))}
      </ul>
      {total ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-foreground/10 pt-1.5">
          <span className="text-muted-foreground">Total</span>
          <span className="font-medium tabular-nums">
            <ValorComOlho texto={total} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Legenda para `<Legend content={LegendaDoGrafico}>`: amostra + nome. O nome é texto
 * `text-muted-foreground`, nunca na cor da série — a cor da série mora só na amostra, onde tem o
 * aro; texto na cor da série não garante 4,5:1 nos dois temas.
 */
export function LegendaDoGrafico({ payload }: { payload?: readonly LegendPayload[] }) {
  if (!payload || payload.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2 text-xs text-muted-foreground">
      {payload.map((p, i) => (
        <li key={`${String(p.value)}-${i}`} className="flex items-center gap-1.5">
          <AmostraDeCor cor={p.color ?? "var(--muted-foreground)"} />
          <span>{String(p.value)}</span>
        </li>
      ))}
    </ul>
  );
}
