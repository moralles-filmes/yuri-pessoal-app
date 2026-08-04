"use client";

/**
 * Fase 17-D — Detalhe de um treino passado (cliente).
 *
 * Mostra o que aconteceu: exercícios na ordem executada (com a ordem planejada ao lado quando
 * elas diferem), cada série com o que foi registrado, substituições, observações e a linha do
 * tempo da sessão.
 *
 * ═══════════ O QUE ESTA TELA NÃO FAZ ═══════════
 *
 * Não avalia, não elogia e não sugere carga. As comparações descrevem o FATO ("acima da sessão
 * anterior"), e quando falta dado para comparar a resposta é "indisponível" — nunca zero.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trash2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { timeInSaoPaulo } from "@/lib/format";
import { MetricsSummary } from "@/components/training/metrics-summary";
import {
  DERIVED_EXERCISE_STATUS_LABELS,
  SESSION_EVENT_LABELS,
  SESSION_SET_STATUS_LABELS,
  SESSION_STATUS_LABELS,
  SET_TYPE_LABELS,
  SUBSTITUTION_REASON_LABELS,
  TRAINING_BASE_PATH,
  type OneRmFormula,
} from "@/lib/training/constants";
import {
  averageOfRecentSessions,
  bestSessionOfSameWorkout,
  compareSessions,
  durationLabel,
  longDateLabelIso,
  previousSessionOfSameWorkout,
  type HistoryItem,
  type SessionComparison,
} from "@/lib/training/history";
import {
  formatVolumeKg,
  sessionMetrics,
  setContribution,
  type MetricOptions,
  type MetricSession,
} from "@/lib/training/metrics";
import { estimateOneRm } from "@/lib/training/one-rm";
import { isSetDone } from "@/lib/training/session-machine";
import type { SessionEvent, SessionExercise, SessionSet, TrainingSession } from "@/lib/training/types";
import { deleteTrainingSession } from "@/lib/actions/training-history";

type ComparisonChoice = "anterior" | "melhor" | "media";

export function SessionDetailClient({
  session,
  current,
  history,
  events,
  preferences,
}: {
  session: TrainingSession;
  current: MetricSession;
  history: HistoryItem[];
  events: SessionEvent[];
  preferences: MetricOptions & { oneRmFormula: OneRmFormula };
}) {
  const router = useRouter();
  const [comparisonChoice, setComparisonChoice] = React.useState<ComparisonChoice>("anterior");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const options: MetricOptions = {
    includeWarmup: preferences.includeWarmup,
    unilateralRule: preferences.unilateralRule,
  };

  const metrics = sessionMetrics(current, options);

  const previous = previousSessionOfSameWorkout(current, history);
  const best = bestSessionOfSameWorkout(current, history, options);
  const average = averageOfRecentSessions(current, history, 4, options);

  const comparison: SessionComparison =
    comparisonChoice === "melhor"
      ? compareSessions(current, best, "melhor sessão deste treino", options)
      : comparisonChoice === "anterior"
        ? compareSessions(current, previous, "sessão anterior deste treino", options)
        : {
            volumeDeltaKg:
              average === null ? null : Number((metrics.totals.volumeKg - average.volumeKg).toFixed(3)),
            volumePercent:
              average === null || average.volumeKg === 0
                ? null
                : Number(
                    (((metrics.totals.volumeKg - average.volumeKg) / average.volumeKg) * 100).toFixed(3),
                  ),
            setsDelta: average === null ? null : Number((metrics.totals.sets - average.sets).toFixed(1)),
            repsDelta: average === null ? null : Number((metrics.totals.reps - average.reps).toFixed(1)),
            durationDeltaSeconds: null,
            direction:
              average === null
                ? "indisponivel"
                : metrics.totals.volumeKg > average.volumeKg
                  ? "acima"
                  : metrics.totals.volumeKg < average.volumeKg
                    ? "abaixo"
                    : "igual",
            isPartial: metrics.totals.quality === "parcial",
            referenceLabel:
              average === null
                ? "média das últimas sessões"
                : `média das últimas ${average.sessions} sessões deste treino`,
          };

  const orderChanged = session.exercises.some(
    (exercise) => exercise.plannedPosition !== exercise.executedPosition,
  );

  async function confirmDelete() {
    setBusy(true);
    const result = await deleteTrainingSession({ id: session.id, confirm: true });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Treino excluído. Os recordes foram recalculados a partir do histórico restante.");
    router.push(`${TRAINING_BASE_PATH}/historico`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.workoutName}
        description={`${longDateLabelIso(session.sessionDate)}${
          session.programName ? ` · ${session.programName}` : ""
        }${session.locationName ? ` · ${session.locationName}` : ""}`}
      >
        <Button variant="outline" asChild>
          <Link href={`${TRAINING_BASE_PATH}/historico`}>
            <ArrowLeft className="size-4" />
            Voltar
          </Link>
        </Button>
        <Button variant="ghost" onClick={() => setDeleteOpen(true)}>
          <Trash2 className="size-4" />
          Excluir
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={session.status === "concluida" ? "secondary" : "outline"}>
          {SESSION_STATUS_LABELS[session.status]}
        </Badge>
        {session.startedAt && (
          <span className="text-sm text-muted-foreground">
            {timeInSaoPaulo(new Date(session.startedAt))}
            {session.endedAt && ` às ${timeInSaoPaulo(new Date(session.endedAt))}`}
          </span>
        )}
        {session.bodyWeightKg !== null && (
          <span className="text-sm text-muted-foreground">
            Peso corporal: {new Intl.NumberFormat("pt-BR").format(session.bodyWeightKg)} kg
          </span>
        )}
        {session.feltPain && (
          <Badge variant="outline" className="text-amber-600 dark:text-amber-400">
            Dor registrada
          </Badge>
        )}
      </div>

      <MetricsSummary
        totals={metrics.totals}
        options={options}
        totalSeconds={session.totalSeconds}
      />

      {/* ── Tempos ── */}
      {session.totalSeconds !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tempos da sessão</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <TimeItem label="Total" value={durationLabel(session.totalSeconds)} />
            <TimeItem label="Ativo" value={durationLabel(session.activeSeconds)} />
            <TimeItem label="Descanso" value={durationLabel(session.restTotalSeconds)} />
            <TimeItem label="Pausado" value={durationLabel(session.pauseTotalSeconds)} />
          </CardContent>
        </Card>
      )}

      {/* ── Comparação ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Comparação</CardTitle>
          <Select
            value={comparisonChoice}
            onValueChange={(value) => setComparisonChoice(value as ComparisonChoice)}
          >
            <SelectTrigger className="h-8 w-[220px]" aria-label="Comparar com">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anterior">Sessão anterior deste treino</SelectItem>
              <SelectItem value="melhor">Melhor sessão deste treino</SelectItem>
              <SelectItem value="media">Média das últimas quatro</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {comparison.direction === "indisponivel" ? (
            <p className="text-sm text-muted-foreground">
              Ainda não há {comparison.referenceLabel} para comparar. A comparação fica
              indisponível — e não vira zero.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                Em relação à {comparison.referenceLabel}, o volume ficou{" "}
                <strong
                  className={cn(
                    comparison.direction === "acima" && "text-emerald-600 dark:text-emerald-400",
                    comparison.direction === "abaixo" && "text-muted-foreground",
                  )}
                >
                  {comparison.direction}
                </strong>
                {comparison.volumeDeltaKg !== null && (
                  <>
                    {" "}
                    ({comparison.volumeDeltaKg > 0 ? "+" : ""}
                    {formatVolumeKg(comparison.volumeDeltaKg)}
                    {comparison.volumePercent !== null &&
                      ` · ${comparison.volumePercent > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", {
                        maximumFractionDigits: 1,
                      }).format(comparison.volumePercent)}%`}
                    )
                  </>
                )}
                .
              </p>
              <p className="text-xs text-muted-foreground">
                Séries: {comparison.setsDelta !== null && comparison.setsDelta > 0 ? "+" : ""}
                {comparison.setsDelta ?? "—"} · Repetições:{" "}
                {comparison.repsDelta !== null && comparison.repsDelta > 0 ? "+" : ""}
                {comparison.repsDelta ?? "—"}
                {comparison.isPartial && " · comparação parcial (alguma série ficou fora do volume)"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Exercícios ── */}
      <div className="space-y-3">
        {orderChanged && (
          <p className="text-xs text-muted-foreground">
            A ordem executada foi diferente da planejada — cada exercício mostra as duas.
          </p>
        )}

        {session.exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            bodyWeightKg={session.bodyWeightKg}
            options={options}
            oneRmFormula={preferences.oneRmFormula}
            showPlannedOrder={orderChanged}
          />
        ))}
      </div>

      {/* ── Substituições ── */}
      {session.substitutions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Substituições</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {session.substitutions.map((substitution) => (
              <p key={substitution.id}>
                <strong>{substitution.originalName}</strong> → {substitution.substituteName}
                <span className="text-muted-foreground">
                  {" "}
                  · {SUBSTITUTION_REASON_LABELS[substitution.reason]}
                  {substitution.reasonNotes && ` · ${substitution.reasonNotes}`} ·{" "}
                  {timeInSaoPaulo(new Date(substitution.occurredAt))}
                </span>
              </p>
            ))}
            <p className="text-xs text-muted-foreground">
              Substituir é registro do que aconteceu — o sistema não afirma equivalência entre os
              exercícios.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Observações ── */}
      {(session.notes || session.painNotes || session.preNotes) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Observações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {session.preNotes && (
              <p>
                <span className="text-muted-foreground">Antes do treino: </span>
                {session.preNotes}
              </p>
            )}
            {session.notes && <p>{session.notes}</p>}
            {session.painNotes && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                <strong>Dor registrada:</strong> {session.painNotes}
                <span className="mt-1 block text-xs">
                  Registro do que você sentiu — o sistema não interpreta nem diagnostica. Se
                  persistir, vale procurar orientação profissional.
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Linha do tempo ── */}
      {events.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1.5 text-sm">
              {events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                    {timeInSaoPaulo(new Date(event.occurredAt))}
                  </span>
                  <span>
                    {SESSION_EVENT_LABELS[event.kind]}
                    {event.description && (
                      <span className="text-muted-foreground"> · {event.description}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir este treino?</DialogTitle>
            <DialogDescription>
              Todas as séries, tempos, substituições e observações são apagados. Os recordes são
              recalculados a partir do histórico restante — uma marca que dependia deste treino
              volta ao valor anterior.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Excluir treino
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimeItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value || "—"}</p>
    </div>
  );
}

/* ═══════════════════════════ Exercício ═══════════════════════════ */

function ExerciseCard({
  exercise,
  bodyWeightKg,
  options,
  oneRmFormula,
  showPlannedOrder,
}: {
  exercise: SessionExercise;
  bodyWeightKg: number | null;
  options: MetricOptions;
  oneRmFormula: OneRmFormula;
  showPlannedOrder: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="text-muted-foreground tabular-nums">{exercise.executedPosition + 1}.</span>
          {exercise.exerciseId ? (
            <Link
              href={`${TRAINING_BASE_PATH}/exercicios/${exercise.exerciseId}`}
              className="hover:underline"
            >
              {exercise.exerciseName}
            </Link>
          ) : (
            exercise.exerciseName
          )}
          <Badge variant="outline" className="text-xs font-normal">
            {DERIVED_EXERCISE_STATUS_LABELS[exercise.derivedStatus]}
          </Badge>
          {exercise.supersetGroup && (
            <Badge variant="secondary" className="text-xs">
              Superset {exercise.supersetGroup}
            </Badge>
          )}
          {showPlannedOrder && exercise.plannedPosition !== exercise.executedPosition && (
            <span className="text-xs font-normal text-muted-foreground">
              (planejado na posição {exercise.plannedPosition + 1})
            </span>
          )}
        </CardTitle>
        {exercise.muscleGroup && (
          <p className="text-xs text-muted-foreground">
            {exercise.muscleGroup}
            {exercise.equipment && ` · ${exercise.equipment}`}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {exercise.sets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma série registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="py-1.5 pr-2 text-left font-medium">
                    Série
                  </th>
                  <th scope="col" className="py-1.5 px-2 text-left font-medium">
                    Registrado
                  </th>
                  <th scope="col" className="py-1.5 px-2 text-left font-medium">
                    Planejado
                  </th>
                  <th scope="col" className="py-1.5 px-2 text-left font-medium">
                    Esforço
                  </th>
                  <th scope="col" className="py-1.5 pl-2 text-right font-medium">
                    Volume
                  </th>
                </tr>
              </thead>
              <tbody>
                {exercise.sets.map((set) => (
                  <SetRow
                    key={set.id}
                    set={set}
                    exercise={exercise}
                    bodyWeightKg={bodyWeightKg}
                    options={options}
                    oneRmFormula={oneRmFormula}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {exercise.notes && (
          <p className="text-xs text-muted-foreground">Observação: {exercise.notes}</p>
        )}
        {exercise.skipReason && (
          <p className="text-xs text-muted-foreground">Motivo de pular: {exercise.skipReason}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SetRow({
  set,
  exercise,
  bodyWeightKg,
  options,
  oneRmFormula,
}: {
  set: SessionSet;
  exercise: SessionExercise;
  bodyWeightKg: number | null;
  options: MetricOptions;
  oneRmFormula: OneRmFormula;
}) {
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  const done = isSetDone(set.status);

  const contribution = setContribution(
    {
      setNumber: set.setNumber,
      status: set.status,
      setType: set.setType,
      isWarmup: set.isWarmup,
      countsInVolume: set.countsInVolume,
      reps: set.reps,
      weightKg: set.weightKg,
      additionalWeightKg: set.additionalWeightKg,
      assistanceWeightKg: set.assistanceWeightKg,
      durationSeconds: set.durationSeconds,
      distanceM: set.distanceM,
      calories: set.calories,
      repsLeft: set.repsLeft,
      repsRight: set.repsRight,
      weightLeftKg: set.weightLeftKg,
      weightRightKg: set.weightRightKg,
    },
    exercise,
    bodyWeightKg,
    options,
  );

  const registered: string[] = [];
  if (set.weightKg !== null) registered.push(`${number.format(set.weightKg)} kg`);
  if (set.additionalWeightKg !== null)
    registered.push(`+${number.format(set.additionalWeightKg)} kg`);
  if (set.assistanceWeightKg !== null)
    registered.push(`−${number.format(set.assistanceWeightKg)} kg (assistência)`);
  if (set.reps !== null) registered.push(`${set.reps} rep`);
  if (set.repsLeft !== null || set.repsRight !== null)
    registered.push(`E ${set.repsLeft ?? "—"} / D ${set.repsRight ?? "—"}`);
  if (set.durationSeconds !== null) registered.push(durationLabel(set.durationSeconds));
  if (set.distanceM !== null) registered.push(`${number.format(set.distanceM)} m`);
  if (set.calories !== null) registered.push(`${set.calories} kcal (estimativa)`);

  const planned: string[] = [];
  if (set.plannedWeightKg !== null) planned.push(`${number.format(set.plannedWeightKg)} kg`);
  if (set.plannedRepsMin !== null || set.plannedRepsMax !== null) {
    planned.push(
      set.plannedRepsMin !== null && set.plannedRepsMax !== null && set.plannedRepsMin !== set.plannedRepsMax
        ? `${set.plannedRepsMin}–${set.plannedRepsMax} rep`
        : `${set.plannedRepsMax ?? set.plannedRepsMin} rep`,
    );
  }
  if (set.plannedDurationSeconds !== null) planned.push(durationLabel(set.plannedDurationSeconds));

  const effort: string[] = [];
  if (set.rir !== null) effort.push(`RIR ${set.rir}`);
  if (set.rpe !== null) effort.push(`RPE ${number.format(set.rpe)}`);
  if (set.difficulty) effort.push(set.difficulty.replace("_", " "));

  const oneRm =
    done && set.weightKg !== null && set.reps !== null
      ? estimateOneRm({ weightKg: set.weightKg, reps: set.reps, formula: oneRmFormula })
      : null;

  return (
    <tr className={cn("border-b border-border/50", !done && "text-muted-foreground")}>
      <td className="py-1.5 pr-2">
        <span className="tabular-nums">{set.setNumber}</span>
        {set.isWarmup && (
          <Badge variant="outline" className="ml-1.5 text-[10px]">
            Aquecimento
          </Badge>
        )}
        {set.setType !== "trabalho" && !set.isWarmup && (
          <Badge variant="outline" className="ml-1.5 text-[10px]">
            {SET_TYPE_LABELS[set.setType]}
          </Badge>
        )}
        {set.isPersonalRecord && <Trophy className="ml-1.5 inline size-3 text-primary" />}
        {!done && (
          <span className="ml-1.5 text-xs">{SESSION_SET_STATUS_LABELS[set.status]}</span>
        )}
      </td>
      <td className="px-2 py-1.5 tabular-nums">{registered.join(" · ") || "—"}</td>
      <td className="px-2 py-1.5 tabular-nums text-muted-foreground">
        {planned.join(" · ") || "—"}
      </td>
      <td className="px-2 py-1.5 text-muted-foreground">
        {effort.join(" · ") || "—"}
        {oneRm?.ok && (
          <span className="block text-xs">
            1RM est. {number.format(oneRm.value)} kg ({oneRm.formulaLabel})
            {!oneRm.withinValidRange && " · fora da faixa de validade"}
          </span>
        )}
      </td>
      <td className="py-1.5 pl-2 text-right tabular-nums">
        {contribution.unit !== "kg"
          ? "—"
          : contribution.ok
            ? formatVolumeKg(contribution.volumeKg)
            : "indisponível"}
      </td>
    </tr>
  );
}
