"use client";

/**
 * Fase 17-F — destaque do registro aberto por deep-link (busca global e notificações).
 *
 * O requisito da subfase não é "a busca encontra", é "o clique ABRE O REGISTRO". Em listas
 * longas, chegar na página certa e não achar o item é o mesmo que não ter aberto — então o
 * item ganha âncora, um anel de destaque e rolagem até ele.
 *
 * ACESSIBILIDADE:
 *  • o destaque NÃO é só cor: o item recebe `aria-current="true"`, e leitores de tela anunciam
 *    "atual" ao chegar nele;
 *  • `prefers-reduced-motion` desliga a rolagem suave — quem pede menos movimento recebe o
 *    salto direto, não uma animação.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

export function DeepLinkHighlight({
  id,
  active,
  className,
  children,
}: {
  /** Âncora estável (`meta-<id>`, `recorde-<id>`…). */
  id: string;
  active: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!active || !ref.current) return;
    const reduz =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current.scrollIntoView({
      block: "center",
      behavior: reduz ? "auto" : "smooth",
    });
  }, [active]);

  return (
    <div
      ref={ref}
      id={id}
      aria-current={active ? "true" : undefined}
      className={cn(
        "scroll-mt-24 rounded-xl transition-shadow",
        active && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
    >
      {children}
    </div>
  );
}