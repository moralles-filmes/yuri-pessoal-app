"use client";

/**
 * Fase 16-B — Dieta e Alimentação · Progresso contra a meta.
 *
 * Existe para que a honestidade do total apareça SEMPRE junto do número. Um "1.850 kcal de
 * 2.000" calculado sobre um dia em que faltava dado é um piso, não o valor real — e a barra
 * diz isso, em vez de deixar o usuário concluir que ficou abaixo da meta quando pode não ter
 * ficado.
 *
 * Três estados visuais, todos com contraste em claro E escuro:
 *   dentro da meta/faixa → dourado (a cor de acerto do sistema)
 *   acima                → âmbar (não é erro, é informação)
 *   sem meta             → neutro, e a barra some
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { formatNutrientAmount, roundForDisplay, type NutrientTotalQuality } from "@/lib/nutrition/calc";
import type { GoalProgress } from "@/lib/nutrition/goals";
import type { NutrientDefinition } from "@/lib/nutrition/types";
import { TotalQualityBadge } from "./nutrient-value";

const FALLBACK: NutrientDefinition = {
  code: "",
  name: "",
  shortName: null,
  unit: "g",
  group: "outro",
  position: 0,
  isCore: false,
  precision: 1,
};

export function GoalProgressBar({
  progress,
  definition,
  label,
  compact = false,
  className,
}: {
  progress: GoalProgress;
  definition?: NutrientDefinition;
  label: string;
  compact?: boolean;
  className?: string;
}) {
  const def = definition ?? FALLBACK;
  const { consumed, target, percent, remaining, status, quality } = progress;

  // A barra é limitada a 100% para não estourar o layout, mas o texto mostra o valor real.
  const width = percent === null ? 0 : Math.min(100, Math.max(0, percent));

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {label}
          <TotalQualityBadge quality={quality} />
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">
            {formatNutrientAmount(consumed, def)}
          </span>
          {target !== null ? (
            <> / {formatNutrientAmount(target, def)} {def.unit}</>
          ) : (
            <> {def.unit}</>
          )}
        </span>
      </div>

      {target !== null && (
        <>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={percent === null ? undefined : Math.round(percent)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${Math.round(percent ?? 0)}% da meta`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                status === "acima" ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${width}%` }}
            />
          </div>

          {!compact && (
            <p className="text-[11px] text-muted-foreground">
              {remaining === null ? null : remaining > 0 ? (
                <>Faltam {formatNutrientAmount(remaining, def)} {def.unit}</>
              ) : remaining < 0 ? (
                <>{formatNutrientAmount(Math.abs(remaining), def)} {def.unit} acima da meta</>
              ) : (
                <>Meta atingida</>
              )}
              {percent !== null && <> · {roundForDisplay(percent, 0)}%</>}
            </p>
          )}
        </>
      )}

      {target === null && !compact && (
        <p className="text-[11px] text-muted-foreground">Sem meta definida para este nutriente.</p>
      )}
    </div>
  );
}

/**
 * Selo de aderência do dia.
 * Mostra a qualidade junto: aderência calculada sobre total parcial não é uma nota final.
 */
export function AdherenceBadge({
  percent,
  quality,
  className,
}: {
  percent: number | null;
  quality: NutrientTotalQuality;
  className?: string;
}) {
  if (percent === null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Sem meta para comparar
      </span>
    );
  }

  const rounded = roundForDisplay(percent, 0);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums",
          rounded >= 90
            ? "bg-primary/15 text-primary"
            : rounded >= 70
              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
              : "bg-muted text-muted-foreground",
        )}
      >
        {rounded}%
      </span>
      <TotalQualityBadge quality={quality} />
    </span>
  );
}
