"use client";

import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Controle de concluir (TO-DO e hábitos): um círculo de 22 px dentro de um botão de 44 px.
 *
 * Os 44 px são o PRÓPRIO botão (espaço reservado), nunca uma área estendida por `after:` ou
 * inset negativo: uma área que se sobrepõe rouba o toque do controle vizinho. Quem usa encaixa o
 * botão consumindo o padding que a linha já tem (margem negativa) ou reservando a altura
 * (`min-h-11`), sem passar por cima de título, alça ou menu.
 *
 * Caixa de seleção em massa e subtarefas continuam quadradas (`ui/checkbox`).
 */
export function CirculoDeConcluir({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
  className,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  "aria-label": string;
  className?: string;
}) {
  return (
    <CheckboxPrimitive.Root
      data-slot="circulo-de-concluir"
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "group/circulo grid size-11 shrink-0 place-items-center rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-[22px] place-items-center rounded-full border-2 border-foreground/52 transition-[background-color,border-color,color,scale] duration-200 ease-estalo group-focus-visible/circulo:outline-2 group-focus-visible/circulo:outline-solid group-focus-visible/circulo:outline-offset-2 group-focus-visible/circulo:outline-ring group-active/circulo:scale-[.9] group-data-[state=checked]/circulo:border-primary-fill group-data-[state=checked]/circulo:bg-primary-fill group-data-[state=checked]/circulo:text-primary-fill-foreground motion-reduce:transition-none"
      >
        <CheckboxPrimitive.Indicator
          data-slot="circulo-de-concluir-indicator"
          className="flex items-center justify-center text-current duration-300 ease-estalo data-[state=checked]:animate-in data-[state=checked]:zoom-in-50 motion-reduce:animate-none"
        >
          <Check className="size-3.5" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );
}
