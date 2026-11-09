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
 * esses dois gestos a apagam, e o foco (grupo esmaecido) vai junto. Teclado (`focusin` e
 * `keydown` dentro do gráfico) a devolve: quem rola e navega por Tab e setas também vê a dica.
 *
 * `zerarAoDispensar` (só a rosca liga): tocar fora e rolar também zeram o foco bruto. Sem isso, o
 * próximo `pointerdown` dentro do gráfico (o buraco da rosca) devolveria `dicaAtiva` e, com ele,
 * a fatia antiga ao centro. Nos gráficos de barra NÃO se zera: `ObservadorDeFoco` só emite quando
 * o índice muda, então zerar impediria reabrir a dica no mesmo grupo.
 */
export function useFocoDoGrafico({ zerarAoDispensar = false }: { zerarAoDispensar?: boolean } = {}) {
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
      if (zerarAoDispensar && !dentro) setBruto(null);
    };
    const aoRolar = () => {
      setDicaAtiva(false);
      if (zerarAoDispensar) setBruto(null);
    };
    const aoMover = () => setDicaAtiva(undefined);
    // Crescimento ÚNICO, ao montar: acabada a animação, a raiz leva `data-crescido` e o CSS para de
    // aplicá-la. Sem isso, redimensionar remonta o path da barra (a chave dela muda com x) e o
    // `@keyframes` recomeça. Só DOM: nada aqui renderiza.
    const aoCrescer = (e: AnimationEvent) => {
      if (e.animationName.startsWith("crescer-")) raiz?.setAttribute("data-crescido", "");
    };
    // A superfície da recharts tem `tabIndex` 0; receber foco por CLIQUE ativa a interação de
    // teclado no índice 0 e deixa dica e esmaecimento presos. `preventDefault` no `mousedown`
    // impede esse foco (o toque também sintetiza `mousedown`); Tab e setas seguem intactos. NÃO
    // passivo, senão o `preventDefault` não vale.
    const aoPressionar = (e: MouseEvent) => e.preventDefault();

    window.addEventListener("pointerdown", aoTocar, { passive: true });
    window.addEventListener("scroll", aoRolar, { passive: true });
    raiz?.addEventListener("pointermove", aoMover, { passive: true });
    raiz?.addEventListener("focusin", aoMover, { passive: true });
    raiz?.addEventListener("keydown", aoMover, { passive: true });
    raiz?.addEventListener("animationend", aoCrescer);
    raiz?.addEventListener("mousedown", aoPressionar);
    return () => {
      window.removeEventListener("pointerdown", aoTocar);
      window.removeEventListener("scroll", aoRolar);
      raiz?.removeEventListener("pointermove", aoMover);
      raiz?.removeEventListener("focusin", aoMover);
      raiz?.removeEventListener("keydown", aoMover);
      raiz?.removeEventListener("animationend", aoCrescer);
      raiz?.removeEventListener("mousedown", aoPressionar);
    };
  }, [raiz, zerarAoDispensar]);

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
