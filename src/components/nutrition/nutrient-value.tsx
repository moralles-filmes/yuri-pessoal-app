"use client";

/**
 * Fase 16-A — Dieta e Alimentação · Exibição de um valor nutricional.
 *
 * A razão de existir deste componente é a regra que sustenta o módulo: **ausência não é
 * zero**. Um "—" com um tooltip que explica "a fonte não analisou" é honesto; um "0,0 g" no
 * mesmo lugar é mentira. Toda tela que mostrar nutriente usa isto, para a distinção nunca
 * depender de alguém lembrar de tratá-la.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import {
  NUTRIENT_VALUE_STATE_HINTS,
  NUTRIENT_VALUE_STATE_LABELS,
  NUTRIENT_VALUE_STATE_SHORT,
  type NutrientValueState,
} from "@/lib/nutrition/constants";
import { formatNutrientAmount, type NutrientTotalQuality } from "@/lib/nutrition/calc";
import { TOTAL_QUALITY_HINTS, TOTAL_QUALITY_LABELS } from "@/lib/nutrition/calc";
import type { NutrientDefinition } from "@/lib/nutrition/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function NutrientValue({
  amount,
  state,
  definition,
  showUnit = true,
  className,
}: {
  amount: number | null;
  state: NutrientValueState;
  definition: NutrientDefinition;
  showUnit?: boolean;
  className?: string;
}) {
  if (state === "disponivel" && amount !== null) {
    return (
      <span className={cn("tabular-nums", className)}>
        {formatNutrientAmount(amount, definition)}
        {showUnit && <span className="ml-1 text-xs text-muted-foreground">{definition.unit}</span>}
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-help border-b border-dotted border-muted-foreground/50 text-sm text-muted-foreground",
            className,
          )}
          // O leitor de tela recebe a explicação inteira; o "—" sozinho não diria nada.
          aria-label={`${NUTRIENT_VALUE_STATE_LABELS[state]}: ${NUTRIENT_VALUE_STATE_HINTS[state]}`}
        >
          {NUTRIENT_VALUE_STATE_SHORT[state] || "—"}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <p className="font-medium">{NUTRIENT_VALUE_STATE_LABELS[state]}</p>
        <p className="text-xs opacity-90">{NUTRIENT_VALUE_STATE_HINTS[state]}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Selo de qualidade de um TOTAL (soma de vários itens). "Parcial" com cara de exato seria
 * mentira numérica, então o selo aparece sempre que o total não é exato.
 */
export function TotalQualityBadge({
  quality,
  className,
}: {
  quality: NutrientTotalQuality;
  className?: string;
}) {
  if (quality === "exato") return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-help rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            quality === "parcial"
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
            className,
          )}
        >
          {TOTAL_QUALITY_LABELS[quality]}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <p className="text-xs">{TOTAL_QUALITY_HINTS[quality]}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Macro compacto para a linha da lista ("128 kcal", "2,5 g"). Mostra "—" quando a fonte não
 * publicou o valor — nunca 0.
 */
export function MacroChip({
  label,
  value,
  unit,
  precision = 1,
  className,
}: {
  label: string;
  value: number | null;
  unit: string;
  precision?: number;
  className?: string;
}) {
  const definition = { precision } as NutrientDefinition;
  return (
    <span className={cn("inline-flex items-baseline gap-1 text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">
        {value === null ? "—" : `${formatNutrientAmount(value, definition)} ${unit}`}
      </span>
    </span>
  );
}
