"use client";

/**
 * Fase 17-C — Treinos · A tela do treino acontecendo.
 *
 * ═══════════════════ AS QUATRO EXIGÊNCIAS DESTA TELA ═══════════════════
 *
 * 1. **Não perder dado.** Cada registro é aplicado no estado local, persistido na fila do
 *    dispositivo e só então enviado. Fechar a aba, bloquear o celular ou perder a conexão não
 *    apaga uma série feita.
 * 2. **Não errar o tempo.** O descanso e o cronômetro vivem em componentes isolados que
 *    derivam de `timers.ts` a partir de timestamps. O tique só provoca o re-render.
 * 3. **Não errar o fluxo.** O que vem agora sai de `nextStep` (`session-flow.ts`): concluir a
 *    3ª de 4 séries leva para a 4ª SÉRIE, não para outro exercício.
 * 4. **Não exigir precisão.** Um exercício por vez, alvos de toque grandes, teclado numérico,
 *    e nada destrutivo sem confirmação.
 *
 * ═══════════════════ ESTADO OTIMISTA + FILA ═══════════════════
 *
 * `optimistic` guarda o que o usuário acabou de fazer, antes de o servidor confirmar. A tela
 * renderiza a fusão entre o que veio do servidor e essa camada — é isso que faz o registro
 * continuar instantâneo com o Wi-Fi ruim da academia.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  ListOrdered,
  Pause,
  Play,
  Plus,
  Timer,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { TRAINING_BASE_PATH, type DifficultyScale } from "@/lib/training/constants";
import {
  nextStep,
  summarizeFlow,
  type FlowExercise,
} from "@/lib/training/session-flow";
import { isSetDone, isSetPending } from "@/lib/training/session-machine";
import { repRangeLabel, secondsLabel } from "@/lib/training/workout";
import { formatDuration } from "@/lib/training/timers";
import type {
  ExerciseListItem,
  SessionExercise,
  SessionSet,
  TrainingLocation,
  TrainingSession,
} from "@/lib/training/types";
import type { PreviousSuggestion } from "@/lib/training/previous";
import {
  addSessionExercise,
  addSet,
  adjustActiveRest,
  endRest,
  moveSessionExercise,
  pauseSession,
  recordSet,
  resumeSession,
  setSessionExerciseStatus,
  startRest,
  substituteSessionExercise,
} from "@/lib/actions/training-sessions";
import { AddExerciseSheet } from "./add-exercise-sheet";
import { ExerciseListSheet } from "./exercise-list-sheet";
import { PlateCalculatorSheet } from "./plate-calculator";
import { RestPanel, SessionClock } from "./rest-panel";
import { SubstituteSheet } from "./substitute-sheet";
import { SyncStatus } from "./sync-status";
import {
  SetEditor,
  draftFromSet,
  draftToPayload,
  type SetValuesDraft,
} from "./set-editor";
import {
  clearSessionQueue,
  useSessionQueue,
  type QueuedMutation,
} from "./use-session-queue";
import { useWakeLock } from "./use-now";

/** Camada otimista: o que o usuário fez e o servidor ainda não confirmou. */
type OptimisticSet = { status: SessionSet["status"]; values: Partial<SessionSet> };

export function SessionLiveClient({
  session,
  catalog,
  alternativesByExercise,
  location,
  suggestionsByExercise,
  difficultyScale,
}: {
  session: TrainingSession;
  catalog: ExerciseListItem[];
  alternativesByExercise: Record<string, string[]>;
  location: TrainingLocation | null;
  /** Valores da última vez, por `session_exercise_id`. SUGESTÃO — nada é aplicado sozinho. */
  suggestionsByExercise: Record<string, PreviousSuggestion[]>;
  difficultyScale: DifficultyScale;
}) {
  const router = useRouter();
  useWakeLock(session.keepScreenAwake);

  const [optimistic, setOptimistic] = React.useState<Record<string, OptimisticSet>>({});
  const [drafts, setDrafts] = React.useState<Record<string, SetValuesDraft>>({});
  const [currentExerciseId, setCurrentExerciseId] = React.useState<string | null>(null);
  const [listOpen, setListOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [platesOpen, setPlatesOpen] = React.useState(false);
  const [platesTarget, setPlatesTarget] = React.useState<number | null>(null);
  const [substituteFor, setSubstituteFor] = React.useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = React.useState(false);

  /* ───────────── Fila: cada mutação vira uma chamada de action ───────────── */

  const send = React.useCallback(async (mutation: QueuedMutation) => {
    const payload = { ...mutation.payload, session_id: session.id };
    switch (mutation.kind) {
      case "registrar_serie":
        return recordSet({ ...payload, client_mutation_id: mutation.id });
      case "adicionar_serie":
        return addSet({ ...payload, client_mutation_id: mutation.id });
      case "iniciar_descanso":
        return startRest(payload);
      case "ajustar_descanso":
        return adjustActiveRest(payload);
      case "encerrar_descanso":
        return endRest(payload);
      case "mover_exercicio":
        return moveSessionExercise(payload);
      case "status_exercicio":
        return setSessionExerciseStatus(payload);
      case "substituir_exercicio":
        return substituteSessionExercise(payload);
      case "adicionar_exercicio":
        return addSessionExercise(payload);
      case "pausar":
        return pauseSession({ id: session.id, ...mutation.payload });
      case "retomar":
        return resumeSession({ id: session.id });
      default:
        return { ok: false as const, error: "Ação desconhecida." };
    }
  }, [session.id]);

  // Quando a fila esvazia, buscamos o estado do servidor: é ele a verdade, e é o que traz
  // séries criadas, exercícios substituídos e o descanso aberto. A camada otimista só some
  // depois disso — antes, a tela ficaria em branco por um instante.
  const handleSettled = React.useCallback(() => {
    setOptimistic({});
    router.refresh();
  }, [router]);

  const queue = useSessionQueue(session.id, send, handleSettled);

  /* ───────────── Estado renderizado = servidor + camada otimista ───────────── */

  const exercises = React.useMemo(
    () =>
      session.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => {
          const patch = optimistic[set.id];
          return patch ? { ...set, ...patch.values, status: patch.status } : set;
        }),
      })),
    [session.exercises, optimistic],
  );

  const flow: FlowExercise[] = exercises.map((exercise) => ({
    id: exercise.id,
    executedPosition: exercise.executedPosition,
    status: exercise.status,
    supersetGroup: exercise.supersetGroup,
    sets: exercise.sets.map((set) => ({
      id: set.id,
      setNumber: set.setNumber,
      status: set.status,
      isWarmup: set.isWarmup,
    })),
  }));

  const step = nextStep(flow, currentExerciseId);
  const progress = summarizeFlow(flow);

  const focusedExerciseId =
    step.kind === "serie" ? step.exerciseId : (currentExerciseId ?? exercises[0]?.id ?? null);
  const exercise = exercises.find((item) => item.id === focusedExerciseId) ?? null;

  const focusedSet =
    step.kind === "serie" && step.exerciseId === exercise?.id
      ? (exercise?.sets.find((set) => set.id === step.setId) ?? null)
      : (exercise?.sets.find((set) => isSetPending(set.status)) ??
        exercise?.sets[exercise.sets.length - 1] ??
        null);

  const activeRest = session.rests.find((rest) => rest.endedAt === null) ?? null;
  const isPaused = session.status === "pausada";

  /* ───────────── Rascunho do campo ───────────── */

  const suggestionFor = (exerciseId: string, setNumber: number) =>
    suggestionsByExercise[exerciseId]?.[setNumber - 1] ?? null;

  const draftFor = (set: SessionSet, exerciseId: string): SetValuesDraft =>
    drafts[set.id] ?? draftFromSet(set, suggestionFor(exerciseId, set.setNumber));

  const setDraft = (setId: string, draft: SetValuesDraft) =>
    setDrafts((current) => ({ ...current, [setId]: draft }));

  /* ───────────── Ações ───────────── */

  const registerSet = (
    target: SessionSet,
    status: "concluida" | "falhou" | "pulada" | "pendente",
    options: { startRest?: boolean } = {},
  ) => {
    if (!exercise) return;
    const draft = draftFor(target, exercise.id);
    const payload = draftToPayload(draft);

    // Otimismo primeiro: a tela responde na hora, mesmo sem rede.
    setOptimistic((current) => ({
      ...current,
      [target.id]: {
        status,
        values: {
          reps: payload.reps,
          weightKg: payload.weight_kg,
          additionalWeightKg: payload.additional_weight_kg,
          assistanceWeightKg: payload.assistance_weight_kg,
          durationSeconds: payload.duration_seconds,
          distanceM: payload.distance_m,
          rir: payload.rir,
          rpe: payload.rpe,
          difficulty: payload.difficulty,
        },
      },
    }));

    // O descanso só nasce sozinho para série FEITA, com descanso configurado e com o modo de
    // avanço ligado. "Nunca avançar" também significa "não abrir o cronômetro sem eu pedir".
    const shouldRest =
      options.startRest ??
      ((status === "concluida" || status === "falhou") &&
        session.autoAdvance !== "nunca" &&
        (target.plannedRestSeconds ?? session.defaultRestSeconds) > 0);

    queue.enqueue("registrar_serie", {
      session_set_id: target.id,
      status,
      ...payload,
      start_rest: shouldRest,
      rest_seconds: target.plannedRestSeconds ?? session.defaultRestSeconds,
    });

    setCurrentExerciseId(exercise.id);
  };

  const handleRestAdjust = (delta: number) =>
    queue.enqueue("ajustar_descanso", { delta_seconds: delta });

  const handleRestEnd = (kind: "natural" | "pulado") =>
    queue.enqueue("encerrar_descanso", { end_kind: kind });

  const handlePauseToggle = () =>
    isPaused ? queue.enqueue("retomar", {}) : queue.enqueue("pausar", {});

  const handleMove = (exerciseId: string, mode: "proximo" | "fim" | "cima" | "baixo") =>
    queue.enqueue("mover_exercicio", {
      session_exercise_id: exerciseId,
      mode,
      current_exercise_id: currentExerciseId,
    });

  const handleAddSet = () => {
    if (!exercise) return;
    queue.enqueue("adicionar_serie", { session_exercise_id: exercise.id });
  };

  const substituteExercise = exercises.find((item) => item.id === substituteFor) ?? null;

  /* ───────────── Sessão sem exercício ───────────── */

  if (exercises.length === 0) {
    return (
      <div className="space-y-4">
        <SessionHeader
          session={session}
          progress={progress}
          queue={queue}
          onOpenList={() => setListOpen(true)}
          onPauseToggle={handlePauseToggle}
          isPaused={isPaused}
        />
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Este treino ainda não tem exercício. Adicione o primeiro para começar a registrar.
          </p>
          <Button className="mt-4 h-12" onClick={() => setPickerOpen(true)}>
            <Plus className="size-4" />
            Adicionar exercício
          </Button>
        </div>
        <AddExerciseSheet
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          catalog={catalog}
          onConfirm={(id) => queue.enqueue("adicionar_exercicio", { exercise_id: id })}
        />
        <FinishBar sessionId={session.id} progress={progress} onFinish={() => setConfirmFinish(true)} />
        <ConfirmFinishDialog
          open={confirmFinish}
          onOpenChange={setConfirmFinish}
          progress={progress}
          sessionId={session.id}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <SessionHeader
        session={session}
        progress={progress}
        queue={queue}
        onOpenList={() => setListOpen(true)}
        onPauseToggle={handlePauseToggle}
        isPaused={isPaused}
      />

      {activeRest && (
        <RestPanel
          rest={activeRest}
          autoAdvance={session.autoAdvance}
          soundEnabled={session.soundEnabled}
          vibrationEnabled={session.vibrationEnabled}
          isPaused={isPaused}
          nextLabel={nextLabelFor(step, exercises)}
          nextTargetLabel={nextTargetLabelFor(step, exercises)}
          onAdjust={handleRestAdjust}
          onSkip={() => handleRestEnd("pulado")}
          onFinish={() => handleRestEnd("natural")}
          onPauseToggle={handlePauseToggle}
        />
      )}

      {exercise && focusedSet ? (
        <div className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Exercício {exercise.executedPosition + 1} de {exercises.length}
                {exercise.supersetGroup ? ` · bloco ${exercise.supersetGroup}` : ""}
              </p>
              <h2 className="truncate text-xl font-semibold">{exercise.exerciseName}</h2>
              <p className="truncate text-sm text-muted-foreground">
                {exercise.muscleGroup}
                {exercise.equipment ? ` · ${exercise.equipment}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-10"
                onClick={() => {
                  const previous = exercises
                    .filter((item) => item.executedPosition < exercise.executedPosition)
                    .at(-1);
                  if (previous) setCurrentExerciseId(previous.id);
                }}
                disabled={exercise.executedPosition === 0}
                aria-label="Exercício anterior"
              >
                <ChevronLeft className="size-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-10"
                onClick={() => {
                  const next = exercises.find(
                    (item) => item.executedPosition > exercise.executedPosition,
                  );
                  if (next) setCurrentExerciseId(next.id);
                }}
                disabled={exercise.executedPosition === exercises.length - 1}
                aria-label="Próximo exercício"
              >
                <ChevronRight className="size-5" />
              </Button>
            </div>
          </div>

          {/* Séries do exercício: um toque leva para qualquer uma. */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {exercise.sets.map((set) => {
              const done = isSetDone(set.status);
              const isFocused = set.id === focusedSet.id;
              return (
                <button
                  key={set.id}
                  type="button"
                  onClick={() => setCurrentExerciseId(exercise.id)}
                  className={cn(
                    "flex h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-sm tabular-nums transition-colors",
                    isFocused && "border-primary bg-primary/10 font-semibold",
                    done && !isFocused && "bg-muted text-muted-foreground",
                    set.status === "pulada" && "line-through opacity-60",
                  )}
                  aria-current={isFocused ? "step" : undefined}
                  aria-label={`Série ${set.setNumber}${set.isWarmup ? " de aquecimento" : ""}`}
                >
                  {done && <Check className="mr-1 size-3.5" />}
                  {set.setNumber}
                  {set.isWarmup && <span className="ml-1 text-[10px]">aq</span>}
                </button>
              );
            })}
            <Button variant="ghost" className="h-11" onClick={handleAddSet}>
              <Plus className="size-4" />
              Série
            </Button>
          </div>

          <SetSummary
            set={focusedSet}
            suggestion={suggestionFor(exercise.id, focusedSet.setNumber)}
          />

          <div className="mt-4">
            <SetEditor
              exercise={exercise}
              set={focusedSet}
              draft={draftFor(focusedSet, exercise.id)}
              onDraftChange={(draft) => setDraft(focusedSet.id, draft)}
              difficultyScale={difficultyScale}
              onConfirm={() => registerSet(focusedSet, "concluida")}
              onSkip={() => registerSet(focusedSet, "pulada", { startRest: false })}
              onUndo={() => registerSet(focusedSet, "pendente", { startRest: false })}
              onOpenPlates={(target) => {
                setPlatesTarget(target);
                setPlatesOpen(true);
              }}
            />
          </div>

          {exercise.notes && (
            <p className="mt-3 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
              {exercise.notes}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Todas as séries foram resolvidas.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Você ainda pode voltar a qualquer exercício, adicionar séries ou finalizar o treino.
          </p>
        </div>
      )}

      <FinishBar
        sessionId={session.id}
        progress={progress}
        onFinish={() => setConfirmFinish(true)}
      />

      <ExerciseListSheet
        open={listOpen}
        onOpenChange={setListOpen}
        exercises={exercises}
        currentExerciseId={focusedExerciseId}
        onSelect={(id) => {
          setCurrentExerciseId(id);
          handleMove(id, "proximo");
        }}
        onMove={handleMove}
        onSkip={(id) =>
          queue.enqueue("status_exercicio", { session_exercise_id: id, status: "pulado" })
        }
        onResume={(id) =>
          queue.enqueue("status_exercicio", { session_exercise_id: id, status: "pendente" })
        }
        onSubstitute={(id) => {
          setSubstituteFor(id);
          setListOpen(false);
        }}
        onAdd={() => {
          setListOpen(false);
          setPickerOpen(true);
        }}
      />

      <SubstituteSheet
        open={substituteFor !== null}
        onOpenChange={(open) => !open && setSubstituteFor(null)}
        exercise={substituteExercise}
        catalog={catalog}
        alternativeIds={
          substituteExercise?.exerciseId
            ? (alternativesByExercise[substituteExercise.exerciseId] ?? [])
            : []
        }
        onConfirm={({ substituteExerciseId, reason, reasonNotes }) => {
          if (!substituteFor) return;
          queue.enqueue("substituir_exercicio", {
            session_exercise_id: substituteFor,
            substitute_exercise_id: substituteExerciseId,
            reason,
            reason_notes: reasonNotes,
          });
          setSubstituteFor(null);
          toast.success("Substituição registrada.");
        }}
      />

      <AddExerciseSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        catalog={catalog}
        onConfirm={(id) => queue.enqueue("adicionar_exercicio", { exercise_id: id })}
      />

      <PlateCalculatorSheet
        open={platesOpen}
        onOpenChange={setPlatesOpen}
        location={location}
        initialTargetKg={platesTarget}
        onApply={(weightKg) => {
          if (!focusedSet) return;
          setDraft(focusedSet.id, {
            ...draftFor(focusedSet, exercise?.id ?? ""),
            weight: String(weightKg),
          });
        }}
      />

      <ConfirmFinishDialog
        open={confirmFinish}
        onOpenChange={setConfirmFinish}
        progress={progress}
        sessionId={session.id}
      />
    </div>
  );
}

/* ───────────────────────────── Cabeçalho ───────────────────────────── */

function SessionHeader({
  session,
  progress,
  queue,
  onOpenList,
  onPauseToggle,
  isPaused,
}: {
  session: TrainingSession;
  progress: ReturnType<typeof summarizeFlow>;
  queue: ReturnType<typeof useSessionQueue>;
  onOpenList: () => void;
  onPauseToggle: () => void;
  isPaused: boolean;
}) {
  return (
    // `top-16`: o Header do app é `sticky top-0` com `h-16`. Em `top-0` este cabeçalho
    // escorregava para trás dele ao rolar — cronômetro e séries sumiam justamente na tela
    // que se usa de pé, no celular. `z-20` o mantém acima do conteúdo e abaixo do Header.
    <div className="sticky top-16 z-20 -mx-1 rounded-2xl border bg-background/95 p-3 backdrop-blur sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{session.workoutName}</p>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Timer className="size-3.5" />
            <SessionClock
              startedAt={session.startedAt}
              endedAt={session.endedAt}
              running={session.status !== "concluida" && session.status !== "abandonada"}
              pauses={session.pauses.map((pause) => ({
                startedAt: pause.startedAt,
                endedAt: pause.endedAt,
              }))}
              rests={session.rests.map((rest) => ({
                startedAt: rest.startedAt,
                endedAt: rest.endedAt,
              }))}
            />
            <span>·</span>
            <span>
              {progress.setsDone} de {progress.setsTotal} séries
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            onClick={onPauseToggle}
            aria-label={isPaused ? "Retomar o treino" : "Pausar o treino"}
          >
            {isPaused ? <Play className="size-5" /> : <Pause className="size-5" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            onClick={onOpenList}
            aria-label="Lista de exercícios"
          >
            <ListOrdered className="size-5" />
          </Button>
        </div>
      </div>

      {isPaused && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          Treino pausado. O tempo parado não entra no tempo ativo.
        </p>
      )}

      <SyncStatus
        className="mt-2"
        state={queue.state}
        pending={queue.pending}
        lastError={queue.lastError}
        onRetry={queue.flush}
      />
      {queue.state === "erro" && queue.lastError && (
        <p className="mt-1 text-xs text-destructive">{queue.lastError}</p>
      )}
    </div>
  );
}

/* ───────────────────────────── Resumo da série ───────────────────────────── */

function SetSummary({
  set,
  suggestion,
}: {
  set: SessionSet;
  suggestion: PreviousSuggestion | null;
}) {
  const planned: string[] = [];
  if (set.plannedRepsMin !== null || set.plannedRepsMax !== null) {
    planned.push(`${repRangeLabel(set.plannedRepsMin, set.plannedRepsMax)} reps`);
  }
  if (set.plannedWeightKg !== null) planned.push(`${set.plannedWeightKg} kg`);
  if (set.plannedDurationSeconds !== null) {
    planned.push(secondsLabel(set.plannedDurationSeconds));
  }
  if (set.plannedRestSeconds !== null) {
    planned.push(`descanso ${secondsLabel(set.plannedRestSeconds)}`);
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <Badge variant="secondary" className="text-[10px]">
        Série {set.setNumber}
        {set.isWarmup ? " · aquecimento" : ""}
      </Badge>
      {planned.length > 0 && <span>Previsto: {planned.join(" · ")}</span>}
      {suggestion && (
        <span>
          Última vez:{" "}
          {[
            suggestion.weightKg !== null ? `${suggestion.weightKg} kg` : null,
            suggestion.reps !== null ? `${suggestion.reps} reps` : null,
            suggestion.durationSeconds !== null ? secondsLabel(suggestion.durationSeconds) : null,
          ]
            .filter(Boolean)
            .join(" × ") || "sem valores"}
        </span>
      )}
    </div>
  );
}

/* ───────────────────────────── Barra de finalização ───────────────────────────── */

function FinishBar({
  sessionId,
  progress,
  onFinish,
}: {
  sessionId: string;
  progress: ReturnType<typeof summarizeFlow>;
  onFinish: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${Math.round((progress.ratio ?? 0) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.setsPending === 0
              ? "Todas as séries resolvidas"
              : `${progress.setsPending} ${progress.setsPending === 1 ? "série" : "séries"} em aberto`}
          </p>
        </div>
        <Button asChild variant="ghost" className="h-12 shrink-0">
          <Link href={`${TRAINING_BASE_PATH}/sessao/revisar?id=${sessionId}`} onClick={onFinish}>
            <Flag className="size-4" />
            Finalizar
          </Link>
        </Button>
      </div>
    </div>
  );
}

function ConfirmFinishDialog({
  open,
  onOpenChange,
  progress,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  progress: ReturnType<typeof summarizeFlow>;
  sessionId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Finalizar o treino</DialogTitle>
          <DialogDescription>
            {progress.setsPending > 0
              ? `Ainda há ${progress.setsPending} ${progress.setsPending === 1 ? "série em aberto" : "séries em aberto"}. Você pode finalizar assim mesmo — elas ficam registradas como não feitas.`
              : "Você vai para a tela de revisão, onde confere o resumo, avalia e salva."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="size-4" />
            Voltar ao treino
          </Button>
          <Button asChild>
            <Link href={`${TRAINING_BASE_PATH}/sessao/revisar?id=${sessionId}`}>
              Revisar e finalizar
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Rótulos do "a seguir" ───────────────────────────── */

function nextLabelFor(
  step: ReturnType<typeof nextStep>,
  exercises: SessionExercise[],
): string | null {
  if (step.kind !== "serie") return null;
  const exercise = exercises.find((item) => item.id === step.exerciseId);
  if (!exercise) return null;
  return `${exercise.exerciseName} · série ${step.setNumber} de ${exercise.sets.length}`;
}

function nextTargetLabelFor(
  step: ReturnType<typeof nextStep>,
  exercises: SessionExercise[],
): string | null {
  if (step.kind !== "serie") return null;
  const exercise = exercises.find((item) => item.id === step.exerciseId);
  const set = exercise?.sets.find((item) => item.id === step.setId);
  if (!set) return null;

  const parts = [
    set.plannedWeightKg !== null ? `${set.plannedWeightKg} kg` : null,
    set.plannedRepsMin !== null || set.plannedRepsMax !== null
      ? `${repRangeLabel(set.plannedRepsMin, set.plannedRepsMax)} reps`
      : null,
    set.plannedDurationSeconds !== null ? secondsLabel(set.plannedDurationSeconds) : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" × ") : null;
}

/** Limpa o rascunho local ao sair de uma sessão encerrada. */
export function useClearQueueOnFinish(sessionId: string, finished: boolean) {
  React.useEffect(() => {
    if (finished) clearSessionQueue(sessionId);
  }, [sessionId, finished]);
}

export { formatDuration };
