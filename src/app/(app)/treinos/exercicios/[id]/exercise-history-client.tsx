"use client";

/**
 * Fase 17-D — Histórico de um exercício (cliente).
 *
 * Três leituras da mesma coisa, para o número nunca depender de enxergar um gráfico:
 * **melhores marcas** (recordes consolidados), **evolução** (gráficos com tabela equivalente) e
 * **todas as séries** já registradas.
 *
 * ═══════════ O 1RM É ESTIMATIVA, E A TELA DIZ ISSO ═══════════
 *
 * A fórmula aparece junto do número e é a escolhida nas configurações do módulo. Fora da faixa
 * de validade, a tela avisa — e em nenhum lugar o sistema sugere tentar uma carga máxima.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Dumbbell, History, LineChart, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { MetricsSummary } from "@/components/training/metrics-summary";
import { EvolutionLineChart, type ChartPoint } from "@/components/training/training-charts";
import {
  TRACKING_TYPE_LABELS,
  TRAINING_BASE_PATH,
  type OneRmFormula,
} from "@/lib/training/constants";
import { durationLabel, longDateLabelIso, shortDateLabelIso } from "@/lib/training/history";
import {
  aggregateSessions,
  formatVolumeKg,
  sessionMetrics,
  type MetricOptions,
  type MetricSession,
} from "@/lib/training/metrics";
import { estimateOneRm } from "@/lib/training/one-rm";
import { isSetDone } from "@/lib/training/session-machine";
import {
  formatRecordValue,
  previousMarkLabel,
  recordTypeLabel,
  RECORD_TYPE_HINTS,
} from "@/lib/training/records";
import { effectiveLoadKg } from "@/lib/training/tracking";
import type { ExerciseSessionEntry, PersonalRecord } from "@/lib/training/history-queries";
import type { ExerciseListItem } from "@/lib/training/types";

export function ExerciseHistoryClient({
  exercise,
  entries,
  sessions,
  records,
  preferences,
}: {
  exercise: ExerciseListItem;
  entries: ExerciseSessionEntry[];
  sessions: MetricSession[];
  records: PersonalRecord[];
  preferences: MetricOptions & { oneRmFormula: OneRmFormula };
}) {
  const options: MetricOptions = {
    includeWarmup: preferences.includeWarmup,
    unilateralRule: preferences.unilateralRule,
  };

  const period = aggregateSessions(sessions, options);
  const last = entries[0] ?? null;

  // Da mais antiga para a mais recente: um gráfico de evolução lido da esquerda para a direita.
  const chronological = [...sessions].reverse();

  const volumePoints: ChartPoint[] = chronological.map((session) => {
    const metrics = sessionMetrics(session, options);
    return {
      label: shortDateLabelIso(session.sessionDate),
      value: metrics.totals.volumeKg,
      display: formatVolumeKg(metrics.totals.volumeKg),
      isPartial: metrics.totals.quality === "parcial",
    };
  });

  const loadPoints: ChartPoint[] = chronological
    .map((session) => {
      const exerciseEntry = session.exercises[0];
      let bestLoad: number | null = null;

      for (const set of exerciseEntry?.sets ?? []) {
        if (!isSetDone(set.status) || set.isWarmup) continue;
        const load = effectiveLoadKg({
          trackingType: exerciseEntry.trackingType,
          weightKg: set.weightKg,
          additionalWeightKg: set.additionalWeightKg,
          assistanceWeightKg: set.assistanceWeightKg,
          bodyWeightKg: session.bodyWeightKg,
        });
        if (load.ok && (bestLoad === null || load.kg > bestLoad)) bestLoad = load.kg;
      }

      return bestLoad === null
        ? null
        : {
            label: shortDateLabelIso(session.sessionDate),
            value: bestLoad,
            display: `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(bestLoad)} kg`,
          };
    })
    .filter((point): point is ChartPoint => point !== null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={exercise.displayName}
        description={`${exercise.primaryMuscleGroupName}${
          exercise.equipmentName ? ` · ${exercise.equipmentName}` : ""
        } · ${TRACKING_TYPE_LABELS[exercise.trackingType]}`}
      >
        <Button variant="outline" asChild>
          <Link href={`${TRAINING_BASE_PATH}/exercicios`}>
            <ArrowLeft className="size-4" />
            Catálogo
          </Link>
        </Button>
      </PageHeader>

      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="Este exercício ainda não foi executado"
          description="Assim que ele entrar num treino registrado, o histórico, as melhores marcas e os gráficos aparecem aqui."
        >
          <Button asChild>
            <Link href={`${TRAINING_BASE_PATH}/hoje`}>Ir para o treino de hoje</Link>
          </Button>
        </EmptyState>
      ) : (
        <Tabs defaultValue="resumo">
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="evolucao">Evolução</TabsTrigger>
            <TabsTrigger value="series">Todas as séries</TabsTrigger>
          </TabsList>

          {/* ── Resumo ── */}
          <TabsContent value="resumo" className="mt-4 space-y-4">
            <MetricsSummary
              totals={period.totals}
              options={options}
              sessionCount={period.sessionCount}
            />

            {last && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    Última execução · {longDateLabelIso(last.sessionDate)}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Registrada em &quot;{last.exerciseName}&quot;, no treino {last.workoutName}.
                  </p>
                </CardHeader>
                <CardContent>
                  <SetsTable
                    entry={last}
                    oneRmFormula={preferences.oneRmFormula}
                  />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="size-4 text-primary" />
                  Melhores marcas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {records.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum recorde consolidado ainda para este exercício.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {records.map((record) => (
                      <li
                        key={record.id}
                        className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {recordTypeLabel(record.recordType, record.referenceWeightKg)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {RECORD_TYPE_HINTS[record.recordType]}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold tabular-nums">
                            {formatRecordValue(record.value, record.unit)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {shortDateLabelIso(record.achievedOn)}
                            {record.oneRmFormula && ` · ${record.oneRmFormula} (estimativa)`}
                          </p>
                          {previousMarkLabel(
                            record.previousValue,
                            record.previousAchievedOn,
                            record.unit,
                          ) && (
                            <p className="text-xs text-muted-foreground">
                              {previousMarkLabel(
                                record.previousValue,
                                record.previousAchievedOn,
                                record.unit,
                              )}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Evolução ── */}
          <TabsContent value="evolucao" className="mt-4 space-y-4">
            {loadPoints.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Dumbbell className="size-4" />
                    Maior carga por sessão
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Carga efetiva — assistência subtrai, carga adicional soma. Sessão sem carga
                    calculável não aparece no gráfico, em vez de entrar como zero.
                  </p>
                </CardHeader>
                <CardContent>
                  <EvolutionLineChart points={loadPoints} valueLabel="Carga" />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <LineChart className="size-4" />
                  Volume por sessão
                </CardTitle>
              </CardHeader>
              <CardContent>
                <EvolutionLineChart points={volumePoints} valueLabel="Volume" />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Todas as séries ── */}
          <TabsContent value="series" className="mt-4 space-y-3">
            {entries.map((entry) => (
              <Card key={entry.sessionId}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
                    <Link
                      href={`${TRAINING_BASE_PATH}/historico/${entry.sessionId}`}
                      className="hover:underline"
                    >
                      {longDateLabelIso(entry.sessionDate)}
                    </Link>
                    <span className="text-sm font-normal text-muted-foreground">
                      {entry.workoutName}
                      {entry.bodyWeightKg !== null &&
                        ` · peso corporal ${new Intl.NumberFormat("pt-BR").format(entry.bodyWeightKg)} kg`}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SetsTable entry={entry} oneRmFormula={preferences.oneRmFormula} />
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function SetsTable({
  entry,
  oneRmFormula,
}: {
  entry: ExerciseSessionEntry;
  oneRmFormula: OneRmFormula;
}) {
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[380px] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th scope="col" className="py-1.5 pr-2 text-left font-medium">
              Série
            </th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Registrado
            </th>
            <th scope="col" className="px-2 py-1.5 text-left font-medium">
              Esforço
            </th>
            <th scope="col" className="py-1.5 pl-2 text-right font-medium">
              1RM estimado
            </th>
          </tr>
        </thead>
        <tbody>
          {entry.sets.map((set) => {
            const done = isSetDone(set.status);
            const registered: string[] = [];
            if (set.weightKg !== null) registered.push(`${number.format(set.weightKg)} kg`);
            if (set.additionalWeightKg !== null)
              registered.push(`+${number.format(set.additionalWeightKg)} kg`);
            if (set.assistanceWeightKg !== null)
              registered.push(`−${number.format(set.assistanceWeightKg)} kg`);
            if (set.reps !== null) registered.push(`${set.reps} rep`);
            if (set.durationSeconds !== null) registered.push(durationLabel(set.durationSeconds));
            if (set.distanceM !== null) registered.push(`${number.format(set.distanceM)} m`);

            const effort: string[] = [];
            if (set.rir !== null) effort.push(`RIR ${set.rir}`);
            if (set.rpe !== null) effort.push(`RPE ${number.format(set.rpe)}`);

            const estimate =
              done && set.weightKg !== null && set.reps !== null
                ? estimateOneRm({ weightKg: set.weightKg, reps: set.reps, formula: oneRmFormula })
                : null;

            return (
              <tr key={set.id} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-2 tabular-nums">
                  {set.setNumber}
                  {set.isWarmup && (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">
                      Aquec.
                    </Badge>
                  )}
                  {set.isPersonalRecord && <Trophy className="ml-1.5 inline size-3 text-primary" />}
                </td>
                <td className="px-2 py-1.5 tabular-nums">{registered.join(" · ") || "—"}</td>
                <td className="px-2 py-1.5 text-muted-foreground">{effort.join(" · ") || "—"}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">
                  {estimate?.ok ? (
                    <span
                      title={`${estimate.formulaLabel}: ${estimate.expression}`}
                      className={estimate.withinValidRange ? "" : "text-amber-600 dark:text-amber-400"}
                    >
                      {number.format(estimate.value)} kg
                      {estimate.measured && " (medido)"}
                      {!estimate.withinValidRange && " *"}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        O 1RM é <strong>estimativa</strong> pela fórmula escolhida nas configurações do módulo.
        Um asterisco marca as séries acima da faixa de validade. O sistema não sugere tentar
        carga máxima.
      </p>
    </div>
  );
}
