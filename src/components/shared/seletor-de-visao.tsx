"use client";

/**
 * REDESIGN-07-A · V1 — o seletor de visão, escrito UMA vez.
 *
 * Era o mesmo bloco JSX em Agenda, Tarefas, Hábitos e Estudos, e em todos a visão ativa
 * só era dita pela COR (`bg-primary`): nada de `aria-pressed`, nada de foco visível próprio.
 * É o defeito que a 02-E fechou no nav da IA, só que vivo em quatro telas.
 *
 * ⚠️ POR QUE `aria-pressed` E NÃO `radiogroup`. `radiogroup` promete ao leitor de tela uma
 * parada de Tab e navegação por setas; sem implementar o foco itinerante, ele anunciaria
 * "botão de opção" com um teclado que não se comporta como tal. `aria-pressed` é nativo de
 * `<button>` — zero código de teclado — e é anunciado como "botão de alternância,
 * pressionado". O custo aceito: cada visão é uma parada de Tab.
 *
 * ⛔ Imports de runtime: só React, `cn` e a primitiva `Button`. Nada de `lucide-react`, `zod`
 * ou `validators` — a marca de ativo é um traço de SVG inline.
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SeletorDeVisao<V extends string>({
  rotulo,
  visoes,
  rotulos,
  atual,
  aoEscolher,
  className,
}: {
  /** Nome do grupo, lido pelo leitor de tela ("Visão das tarefas"). */
  rotulo: string;
  visoes: readonly V[];
  rotulos: Record<V, string>;
  atual: V;
  aoEscolher: (visao: V) => void;
  className?: string;
}) {
  const trilha = React.useRef<HTMLDivElement>(null);

  // A 390 px a trilha de Tarefas rola, e a visão que a notificação abre ("Atrasadas") nascia
  // escondida à direita. Rola SÓ a trilha (`scrollLeft`) — `scrollIntoView` rolaria a página.
  React.useEffect(() => {
    const t = trilha.current;
    const ativa = t?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!t || !ativa) return;
    const inicio = ativa.offsetLeft;
    const fim = inicio + ativa.offsetWidth;
    if (inicio < t.scrollLeft || fim > t.scrollLeft + t.clientWidth) {
      t.scrollLeft = inicio - (t.clientWidth - ativa.offsetWidth) / 2;
    }
  }, [atual]);

  return (
    // `relative`: é o offsetParent das opções, para `offsetLeft` ser medido dentro da trilha.
    // `p-1`: a trilha rola, e quem rola recorta sombra — 4 px é o que o anel de foco precisa.
    <div
      ref={trilha}
      role="group"
      aria-label={rotulo}
      className={cn(
        "relative inline-flex max-w-full gap-0.5 overflow-x-auto rounded-lg border bg-muted/40 p-1",
        className,
      )}
    >
      {visoes.map((visao) => {
        const ativa = visao === atual;
        return (
          <Button
            key={visao}
            type="button"
            variant="ghost"
            aria-pressed={ativa}
            onClick={() => aoEscolher(visao)}
            className={cn(
              "px-3",
              ativa
                ? "bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground dark:hover:bg-primary"
                : "text-muted-foreground",
            )}
          >
            {ativa && <MarcaDeAtiva />}
            {rotulos[visao]}
          </Button>
        );
      })}
    </div>
  );
}

/** Estado que não depende de cor: a marca só existe na opção ativa. */
function MarcaDeAtiva() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}
