"use client";

/**
 * Fase 17-D — Treinos · Resumo de agregados.
 *
 * ═══════════ O NÚMERO NUNCA APARECE SOZINHO ═══════════
 *
 * Todo total mostrado aqui vem de `metrics.ts` e vem acompanhado de duas coisas: a **regra que
 * está valendo** (aquecimento dentro ou fora, como o unilateral é contado) e, quando é o caso,
 * o aviso de que o agregado é **parcial** — com o motivo por extenso.
 *
 * Um "12.480 kg" sem contexto é um número que o usuário não consegue conferir. Com a regra
 * escrita ao lado, ele consegue.
 */
import { Dumbbell, Repeat, Timer, TrendingUp, Info } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { cn } from "@/lib/utils";
import {
  formatVolumeKg,
  partialExplanation,
  volumeRuleLabel,
  type MetricOptions,
  type MetricTotals,
} from "@/lib/training/metrics";
import { durationLabel } from "@/lib/training/history";

export function PartialNotice({
  totals,
  className,
}: {
  totals: MetricTotals;
  className?: string;
}) {
  if (totals.quality !== "parcial") return null;

  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <strong className="font-semibold">Total parcial.</strong> {partialExplanation(totals)}
      </span>
    </p>
  );
}

/** A regra vigente, escrita. Exigência da fase: a tela sempre mostra qual regra está valendo. */
export function VolumeRuleNote({
  options,
  className,
}: {
  options: MetricOptions;
  className?: string;
}) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Regra de contagem: {volumeRuleLabel(options)}.
    </p>
  );
}

export function MetricsSummary({
  totals,
  options,
  sessionCount,
  totalSeconds,
  className,
}: {
  totals: MetricTotals;
  options: MetricOptions;
  sessionCount?: number;
  totalSeconds?: number | null;
  className?: string;
}) {
  const hasVolume = totals.units.includes("kg");
  const hasDuration = totals.durationSeconds > 0;
  const hasDistance = totals.distanceM > 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sessionCount !== undefined && (
          <StatCard
            label="Treinos"
            value={String(sessionCount)}
            icon={TrendingUp}
            hint={totalSeconds ? durationLabel(totalSeconds) : undefined}
          />
        )}
        {hasVolume && (
          <StatCard
            label="Volume"
            value={formatVolumeKg(totals.volumeKg)}
            icon={Dumbbell}
            hint={totals.quality === "parcial" ? "Parcial — veja o motivo abaixo" : "carga × repetições"}
          />
        )}
        <StatCard
          label="Séries"
          value={String(totals.sets)}
          icon={Repeat}
          hint={`${totals.workingSets} de trabalho${
            totals.warmupSets > 0 ? ` · ${totals.warmupSets} de aquecimento` : ""
          }`}
        />
        <StatCard
          label="Repetições"
          value={new Intl.NumberFormat("pt-BR").format(totals.reps)}
          icon={Repeat}
        />
        {hasDuration && (
          <StatCard
            label="Tempo sob tensão"
            value={durationLabel(totals.durationSeconds)}
            icon={Timer}
            hint="exercícios medidos em tempo"
          />
        )}
        {hasDistance && (
          <StatCard
            label="Distância"
            value={
              totals.distanceM >= 1000
                ? `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(
                    totals.distanceM / 1000,
                  )} km`
                : `${new Intl.NumberFormat("pt-BR").format(totals.distanceM)} m`
            }
            icon={TrendingUp}
          />
        )}
        {totals.calories > 0 && (
          <StatCard
            label="Calorias"
            value={new Intl.NumberFormat("pt-BR").format(totals.calories)}
            icon={Info}
            hint="estimativa do painel do aparelho"
          />
        )}
      </div>

      <PartialNotice totals={totals} />
      <VolumeRuleNote options={options} />
    </div>
  );
}
