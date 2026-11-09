"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveTooltipDataPoints } from "recharts";

/**
 * O foco de um gráfico: qual grupo está sob o ponteiro, o dedo ou o teclado. Os três saem do
 * MESMO estado da dica da recharts (`useActiveTooltipDataPoints`), então o grupo esmaecido e a
 * dica aberta nunca discordam.
 *
 * Só os `-impl` importam este arquivo: ele traz a `recharts`, e a fachada não pode arrastá-la.
 *
 * `dicaAtiva` vai para `<Tooltip active>`: `false` força a dica apagada, `undefined` devolve o
 * controle à recharts. No toque a dica fica presa até o dedo tocar fora ou a página rolar —
 * esses dois gestos a apagam, e o foco (grupo esmaecido) vai junto.
 */
export function useFocoDoGrafico() {
  // Ref de CALLBACK, guardada em estado: o invólucro pode montar depois do hook (o gráfico sai do
  // vazio para o cheio sem remontar o componente), e um `useRef` lido num efeito de montagem
  // nunca veria o elemento — o `pointermove` ficaria sem ouvinte e a dica apagada por rolagem
  // só voltaria com um toque.
  const [raiz, ref] = useState<HTMLElement | null>(null);
  const [bruto, setBruto] = useState<number | null>(null);
  const [dicaAtiva, setDicaAtiva] = useState<false | undefined>(undefined);

  const aoMudar = useCallback((indice: number | null) => {
    setBruto(indice === null || indice < 0 ? null : indice);
  }, []);

  useEffect(() => {
    const aoTocar = (e: PointerEvent) => {
      const dentro = raiz !== null && e.target instanceof Node && raiz.contains(e.target);
      setDicaAtiva(dentro ? undefined : false);
    };
    const aoRolar = () => setDicaAtiva(false);
    const aoMover = () => setDicaAtiva(undefined);

    window.addEventListener("pointerdown", aoTocar, { passive: true });
    window.addEventListener("scroll", aoRolar, { passive: true });
    raiz?.addEventListener("pointermove", aoMover, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", aoTocar);
      window.removeEventListener("scroll", aoRolar);
      raiz?.removeEventListener("pointermove", aoMover);
    };
  }, [raiz]);

  const foco = dicaAtiva === false ? null : bruto;
  return { ref, foco, aoMudar, dicaAtiva };
}

/**
 * Filho direto do gráfico da recharts (renderiza `null`): traduz o ponto ativo da dica no índice
 * dele em `dados` e avisa `aoMudar` SÓ quando o índice muda. `dados` tem de ser o mesmo array
 * entregue ao gráfico — a recharts devolve os próprios objetos, e é por identidade que se acha o
 * índice.
 */
export function ObservadorDeFoco({
  dados,
  aoMudar,
}: {
  dados: readonly unknown[];
  aoMudar: (indice: number | null) => void;
}) {
  const pontos = useActiveTooltipDataPoints();
  const ponto = pontos?.[0];
  const indice = ponto === undefined ? null : dados.indexOf(ponto);

  useEffect(() => {
    aoMudar(indice === null || indice < 0 ? null : indice);
  }, [indice, aoMudar]);

  return null;
}
