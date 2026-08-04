"use client";

/**
 * Fase 17-C — Preparação, etapa 2: revisar antes de começar.
 *
 * ═══════════ O QUE ESTA TELA GARANTE ═══════════
 *
 * • **Tudo é editável antes de começar**: ordem, número de séries, repetições, carga, descanso,
 *   RIR/RPE, tipo de série e superset — mais a configuração geral da sessão.
 * • **Os valores da última vez são SUGESTÃO.** O usuário escolhe a fonte ("última vez em
 *   qualquer treino" × "última vez neste treino") e aplica com um toque. Nada muda sozinho: sem
 *   o toque, o que vale é o planejado do modelo.
 * • **Nada aqui altera o treino-modelo.** Os ajustes valem só para a sessão de hoje.
 *
 * Ao confirmar, o servidor reconstrói o snapshot a partir do catálogo (nome, tipo de
 * acompanhamento e lateralidade nunca vêm do cliente) e o congela ao iniciar.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  Play,
  Plus,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  AUTO_ADVANCE_LABELS,
  AUTO_ADVANCE_MODES,
  PREVIOUS_SOURCES,
  PREVIOUS_SOURCE_LABELS,
  SET_TYPES,
  SET_TYPE_LABELS,
  TRAINING_BASE_PATH,
  type DifficultyScale,
  type PreviousSource,
  type SetType,
} from "@/lib/training/constants";
import { repRangeLabel, secondsLabel } from "@/lib/training/workout";
import type { WorkoutSnapshot } from "@/lib/training/session-snapshot";
import type { PreviousPerformance } from "@/lib/training/previous";
import type { TrainingLocation, TrainingSession } from "@/lib/training/types";
import {
  abandonSession,
  startSession,
  updateSessionPreparation,
} from "@/lib/actions/training-sessions";

/* ───────────────────────────── Rascunho local ───────────────────────────── */

type DraftSet = {
  setType: SetType;
  repsMin: string;
  repsMax: string;
  weight: string;
  additionalWeight: string;
  assistanceWeight: string;
  duration: string;
  distance: string;
  rest: string;
  rir: string;
  rpe: string;
  isWarmup: boolean;
};

type DraftExercise = {
  key: string;
  name: string;
  muscleGroup: string | null;
  trackingType: string;
  supersetGroup: string | null;
  include: boolean;
  sets: DraftSet[];
};

const text = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);

const toNumber = (value: string): number | null => {
  const cleaned = value.trim().replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

function snapshotToDraft(snapshot: WorkoutSnapshot): DraftExercise[] {
  return snapshot.exercises.map((exercise) => ({
    key: exercise.workoutExerciseId ?? String(exercise.plannedPosition),
    name: exercise.exerciseName,
    muscleGroup: exercise.muscleGroup,
    trackingType: exercise.trackingType,
    supersetGroup: exercise.supersetGroup,
    include: true,
    sets: exercise.sets.map((set) => ({
      setType: set.setType,
      repsMin: text(set.targetRepsMin),
      repsMax: text(set.targetRepsMax),
      weight: text(set.plannedWeightKg),
      additionalWeight: text(set.plannedAdditionalWeightKg),
      assistanceWeight: text(set.plannedAssistanceWeightKg),
      duration: text(set.targetDurationSeconds),
      distance: text(set.targetDistanceM),
      rest: text(set.restSeconds),
      rir: text(set.targetRir),
      rpe: text(set.targetRpe),
      isWarmup: set.isWarmup,
    })),
  }));
}

/* ───────────────────────────── A tela ───────────────────────────── */

export function PrepareReviewClient({
  session,
  snapshot,
  locations,
  previousAny,
  previousSame,
  difficultyScale,
}: {
  session: TrainingSession;
  snapshot: WorkoutSnapshot;
  locations: TrainingLocation[];
  previousAny: Record<string, PreviousPerformance | null>;
  previousSame: Record<string, PreviousPerformance | null>;
  difficultyScale: DifficultyScale;
}) {
  const router = useRouter();

  const [exercises, setExercises] = React.useState<DraftExercise[]>(() =>
    snapshotToDraft(snapshot),
  );
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [previousSource, setPreviousSource] = React.useState<PreviousSource>("qualquer_treino");

  const [title, setTitle] = React.useState(snapshot.workoutName);
  const [locationId, setLocationId] = React.useState(session.locationId ?? "");
  const [restSeconds, setRestSeconds] = React.useState(String(session.defaultRestSeconds));
  const [autoAdvance, setAutoAdvance] = React.useState(session.autoAdvance);
  const [sound, setSound] = React.useState(session.soundEnabled);
  const [vibration, setVibration] = React.useState(session.vibrationEnabled);
  const [screenAwake, setScreenAwake] = React.useState(session.keepScreenAwake);
  const [bodyWeight, setBodyWeight] = React.useState(text(session.bodyWeightKg));
  const [energy, setEnergy] = React.useState(text(session.energyLevel));
  const [mood, setMood] = React.useState(text(session.moodLevel));
  const [sleep, setSleep] = React.useState(text(session.sleepQuality));
  const [soreness, setSoreness] = React.useState(text(session.sorenessLevel));
  const [notes, setNotes] = React.useState(session.preNotes ?? "");

  const [busy, setBusy] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);
  const [runningConflict, setRunningConflict] = React.useState<string | null>(null);

  const previous = previousSource === "mesmo_modelo" ? previousSame : previousAny;

  const included = exercises.filter((exercise) => exercise.include);
  const totalSets = included.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const warmupSets = included.reduce(
    (sum, exercise) => sum + exercise.sets.filter((set) => set.isWarmup).length,
    0,
  );

  /* ───────────── Manipulação do rascunho ───────────── */

  const patchExercise = (key: string, patch: Partial<DraftExercise>) =>
    setExercises((current) =>
      current.map((exercise) => (exercise.key === key ? { ...exercise, ...patch } : exercise)),
    );

  const patchSet = (key: string, index: number, patch: Partial<DraftSet>) =>
    setExercises((current) =>
      current.map((exercise) =>
        exercise.key === key
          ? {
              ...exercise,
              sets: exercise.sets.map((set, i) => (i === index ? { ...set, ...patch } : set)),
            }
          : exercise,
      ),
    );

  const addSet = (key: string) =>
    setExercises((current) =>
      current.map((exercise) =>
        exercise.key === key
          ? {
              ...exercise,
              sets: [
                ...exercise.sets,
                exercise.sets.at(-1) ?? {
                  setType: "trabalho" as SetType,
                  repsMin: "",
                  repsMax: "",
                  weight: "",
                  additionalWeight: "",
                  assistanceWeight: "",
                  duration: "",
                  distance: "",
                  rest: "",
                  rir: "",
                  rpe: "",
                  isWarmup: false,
                },
              ],
            }
          : exercise,
      ),
    );

  const removeSet = (key: string, index: number) =>
    setExercises((current) =>
      current.map((exercise) =>
        exercise.key === key
          ? { ...exercise, sets: exercise.sets.filter((_, i) => i !== index) }
          : exercise,
      ),
    );

  const move = (key: string, offset: number) =>
    setExercises((current) => {
      const index = current.findIndex((exercise) => exercise.key === key);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });

  /**
   * Aplica os valores da última vez — SÓ quando o usuário toca no botão.
   *
   * Este é o único caminho pelo qual um valor anterior entra no plano de hoje. Sem o toque, o
   * campo continua com o que o modelo definiu.
   */
  const applyPrevious = (key: string) => {
    const source = previous[key];
    if (!source) {
      toast.info("Não há registro anterior deste exercício nessa fonte.");
      return;
    }

    setExercises((current) =>
      current.map((exercise) =>
        exercise.key === key
          ? {
              ...exercise,
              sets: exercise.sets.map((set, index) => {
                const reference = source.sets[Math.min(index, source.sets.length - 1)];
                if (!reference) return set;
                return {
                  ...set,
                  weight: text(reference.weightKg) || set.weight,
                  additionalWeight: text(reference.additionalWeightKg) || set.additionalWeight,
                  assistanceWeight: text(reference.assistanceWeightKg) || set.assistanceWeight,
                  repsMin: text(reference.reps) || set.repsMin,
                  repsMax: text(reference.reps) || set.repsMax,
                  duration: text(reference.durationSeconds) || set.duration,
                };
              }),
            }
          : exercise,
      ),
    );
    toast.success("Valores da última vez aplicados. Ajuste o que quiser antes de começar.");
  };

  /* ───────────── Salvar e começar ───────────── */

  const buildPayload = () => ({
    id: session.id,
    title: title.trim() || snapshot.workoutName,
    location_id: locationId || null,
    default_rest_seconds: toNumber(restSeconds) ?? session.defaultRestSeconds,
    auto_advance: autoAdvance,
    sound_enabled: sound,
    vibration_enabled: vibration,
    keep_screen_awake: screenAwake,
    weight_unit: session.weightUnit,
    body_weight_kg: toNumber(bodyWeight),
    energy_level: toNumber(energy),
    mood_level: toNumber(mood),
    sleep_quality: toNumber(sleep),
    soreness_level: toNumber(soreness),
    pre_notes: notes.trim() || null,
    adjustments: exercises.map((exercise, position) => ({
      key: exercise.key,
      include: exercise.include,
      position,
      superset_group: exercise.supersetGroup,
      sets: exercise.sets.map((set) => ({
        set_type: set.setType,
        target_reps_min: toNumber(set.repsMin),
        target_reps_max: toNumber(set.repsMax),
        target_duration_seconds: toNumber(set.duration),
        target_distance_m: toNumber(set.distance),
        planned_weight_kg: toNumber(set.weight),
        planned_additional_weight_kg: toNumber(set.additionalWeight),
        planned_assistance_weight_kg: toNumber(set.assistanceWeight),
        rest_seconds: toNumber(set.rest),
        target_rir: toNumber(set.rir),
        target_rpe: toNumber(set.rpe),
        is_warmup: set.isWarmup,
        counts_in_volume: !set.isWarmup,
      })),
    })),
  });

  const handleStart = async (discardRunning = false) => {
    setBusy(true);

    const prepared = await updateSessionPreparation(buildPayload());
    if (!prepared.ok) {
      setBusy(false);
      toast.error(prepared.error);
      return;
    }

    const started = await startSession({ id: session.id, discard_running: discardRunning });
    setBusy(false);

    if (!started.ok) {
      // "Já existe um treino em andamento" não é uma parede: a tela oferece a saída.
      if (started.error.includes("em andamento")) {
        setRunningConflict(started.error);
        return;
      }
      toast.error(started.error);
      return;
    }

    router.push(`${TRAINING_BASE_PATH}/sessao`);
  };

  const handleDiscard = async () => {
    setBusy(true);
    const result = await abandonSession({ id: session.id, mode: "descartar", confirm: true });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Preparação descartada.");
    router.push(`${TRAINING_BASE_PATH}/hoje`);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* ───────── Resumo ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title || snapshot.workoutName}</CardTitle>
          <CardDescription>
            {included.length} {included.length === 1 ? "exercício" : "exercícios"} ·{" "}
            {totalSets - warmupSets} séries de trabalho
            {warmupSets > 0 ? ` + ${warmupSets} de aquecimento` : ""}
            {snapshot.programName ? ` · ${snapshot.programName}` : ""}
            {snapshot.workoutVersion ? ` · versão ${snapshot.workoutVersion}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground" htmlFor="titulo-sessao">
              Nome deste treino
            </Label>
            <Input
              id="titulo-sessao"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-1.5 h-11"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Valores da última vez</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PREVIOUS_SOURCES.map((source) => (
                <Button
                  key={source}
                  type="button"
                  variant={previousSource === source ? "default" : "outline"}
                  className="h-10"
                  onClick={() => setPreviousSource(source)}
                >
                  {PREVIOUS_SOURCE_LABELS[source]}
                </Button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A fonte muda o que aparece como referência. Nada é aplicado sozinho — use o botão
              em cada exercício.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ───────── Exercícios ───────── */}
      <div className="space-y-2">
        {exercises.map((exercise, index) => {
          const reference = previous[exercise.key];
          const isOpen = expanded === exercise.key;

          return (
            <Card key={exercise.key} className={cn(!exercise.include && "opacity-60")}>
              <CardHeader className="pb-2">
                <div className="flex items-start gap-2">
                  <span className="w-5 shrink-0 pt-1 text-center text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-sm">{exercise.name}</CardTitle>
                    <CardDescription className="truncate text-xs">
                      {exercise.sets.length} {exercise.sets.length === 1 ? "série" : "séries"}
                      {exercise.muscleGroup ? ` · ${exercise.muscleGroup}` : ""}
                      {exercise.supersetGroup ? ` · bloco ${exercise.supersetGroup}` : ""}
                    </CardDescription>
                    {reference ? (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        Última vez em {formatDate(reference.sessionDate)}:{" "}
                        {reference.sets
                          .slice(0, 3)
                          .map(
                            (set) =>
                              `${set.weightKg !== null ? `${set.weightKg} kg` : "—"} × ${set.reps ?? "—"}`,
                          )
                          .join(" · ")}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Primeira vez com este exercício nesta fonte.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      onClick={() => move(exercise.key, -1)}
                      disabled={index === 0}
                      aria-label={`Mover ${exercise.name} para cima`}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      onClick={() => move(exercise.key, 1)}
                      disabled={index === exercises.length - 1}
                      aria-label={`Mover ${exercise.name} para baixo`}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      onClick={() => setExpanded(isOpen ? null : exercise.key)}
                      aria-label={isOpen ? "Recolher séries" : "Editar séries"}
                      aria-expanded={isOpen}
                    >
                      {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {isOpen && (
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => applyPrevious(exercise.key)}
                      disabled={!reference}
                    >
                      <Wand2 className="size-3.5" />
                      Usar valores da última vez
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={() =>
                        patchExercise(exercise.key, { include: !exercise.include })
                      }
                    >
                      {exercise.include ? (
                        <>
                          <X className="size-3.5" />
                          Tirar do treino de hoje
                        </>
                      ) : (
                        <>
                          <Plus className="size-3.5" />
                          Colocar de volta
                        </>
                      )}
                    </Button>
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground">Superset</Label>
                      <Input
                        value={exercise.supersetGroup ?? ""}
                        onChange={(event) =>
                          patchExercise(exercise.key, {
                            supersetGroup: event.target.value.toUpperCase().slice(0, 1) || null,
                          })
                        }
                        className="h-9 w-14 text-center uppercase"
                        maxLength={1}
                        aria-label={`Bloco de superset de ${exercise.name}`}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    {exercise.sets.map((set, setIndex) => (
                      <div key={setIndex} className="rounded-xl border p-2.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {setIndex + 1}
                          </Badge>
                          <Select
                            value={set.setType}
                            onValueChange={(value) =>
                              patchSet(exercise.key, setIndex, {
                                setType: value as SetType,
                                isWarmup: value === "aquecimento",
                              })
                            }
                          >
                            <SelectTrigger className="h-9 min-w-0 flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SET_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {SET_TYPE_LABELS[type]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-9 shrink-0"
                            onClick={() => removeSet(exercise.key, setIndex)}
                            disabled={exercise.sets.length <= 1}
                            aria-label={`Remover série ${setIndex + 1}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <SmallField
                            label="Reps mín."
                            value={set.repsMin}
                            onChange={(repsMin) => patchSet(exercise.key, setIndex, { repsMin })}
                          />
                          <SmallField
                            label="Reps máx."
                            value={set.repsMax}
                            onChange={(repsMax) => patchSet(exercise.key, setIndex, { repsMax })}
                          />
                          <SmallField
                            label="Carga (kg)"
                            value={set.weight}
                            onChange={(weight) => patchSet(exercise.key, setIndex, { weight })}
                          />
                          <SmallField
                            label="Descanso (s)"
                            value={set.rest}
                            onChange={(rest) => patchSet(exercise.key, setIndex, { rest })}
                          />
                          {exercise.trackingType === "peso_corporal_adicional" && (
                            <SmallField
                              label="Adicional (kg)"
                              value={set.additionalWeight}
                              onChange={(additionalWeight) =>
                                patchSet(exercise.key, setIndex, { additionalWeight })
                              }
                            />
                          )}
                          {exercise.trackingType === "peso_corporal_assistido" && (
                            <SmallField
                              label="Assistência (kg)"
                              value={set.assistanceWeight}
                              onChange={(assistanceWeight) =>
                                patchSet(exercise.key, setIndex, { assistanceWeight })
                              }
                            />
                          )}
                          {(exercise.trackingType === "duracao" ||
                            exercise.trackingType === "isometria" ||
                            exercise.trackingType === "distancia_duracao") && (
                            <SmallField
                              label="Duração (s)"
                              value={set.duration}
                              onChange={(duration) =>
                                patchSet(exercise.key, setIndex, { duration })
                              }
                            />
                          )}
                          {exercise.trackingType === "distancia_duracao" && (
                            <SmallField
                              label="Distância (m)"
                              value={set.distance}
                              onChange={(distance) =>
                                patchSet(exercise.key, setIndex, { distance })
                              }
                            />
                          )}
                          {difficultyScale === "rir" && (
                            <SmallField
                              label="RIR alvo"
                              value={set.rir}
                              onChange={(rir) => patchSet(exercise.key, setIndex, { rir })}
                            />
                          )}
                          {difficultyScale === "rpe" && (
                            <SmallField
                              label="RPE alvo"
                              value={set.rpe}
                              onChange={(rpe) => patchSet(exercise.key, setIndex, { rpe })}
                            />
                          )}
                        </div>
                      </div>
                    ))}

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 w-full"
                      onClick={() => addSet(exercise.key)}
                    >
                      <Plus className="size-4" />
                      Adicionar série
                    </Button>
                  </div>
                </CardContent>
              )}

              {!isOpen && (
                <CardContent className="pt-0">
                  <p className="pl-7 text-xs text-muted-foreground">
                    {exercise.sets
                      .slice(0, 4)
                      .map((set) => {
                        const reps = repRangeLabel(toNumber(set.repsMin), toNumber(set.repsMax));
                        const weight = set.weight ? `${set.weight} kg` : null;
                        const duration = set.duration ? secondsLabel(toNumber(set.duration)) : null;
                        return [weight, duration ?? `${reps} reps`].filter(Boolean).join(" × ");
                      })
                      .join(" · ")}
                  </p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* ───────── Configuração da sessão ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Como você quer treinar hoje</CardTitle>
          <CardDescription>
            Vale só para esta sessão. As preferências do módulo continuam como estão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">Local</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="mt-1.5 h-11 w-full">
                  <SelectValue placeholder="Sem local definido" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                      {location.isDefault ? " (padrão)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Descanso padrão (segundos)</Label>
              <Input
                value={restSeconds}
                onChange={(event) => setRestSeconds(event.target.value)}
                inputMode="numeric"
                className="mt-1.5 h-11"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Quando o descanso acabar</Label>
            <Select
              value={autoAdvance}
              onValueChange={(value) => setAutoAdvance(value as typeof autoAdvance)}
            >
              <SelectTrigger className="mt-1.5 h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUTO_ADVANCE_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {AUTO_ADVANCE_LABELS[mode]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <ToggleRow label="Som ao fim do descanso" checked={sound} onChange={setSound} />
            <ToggleRow
              label="Vibração ao fim do descanso"
              checked={vibration}
              onChange={setVibration}
            />
            <ToggleRow
              label="Manter a tela ativa durante o treino"
              checked={screenAwake}
              onChange={setScreenAwake}
              hint="Depende do suporte do navegador. Onde não houver, o app simplesmente não usa."
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs text-muted-foreground">Peso corporal hoje (kg)</Label>
              <Input
                value={bodyWeight}
                onChange={(event) => setBodyWeight(event.target.value)}
                inputMode="decimal"
                className="mt-1.5 h-11"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Sem ele, a carga de exercícios de peso corporal fica indisponível — nunca zero.
              </p>
            </div>
            <ScaleField label="Energia" value={energy} onChange={setEnergy} />
            <ScaleField label="Disposição" value={mood} onChange={setMood} />
            <ScaleField label="Sono" value={sleep} onChange={setSleep} />
            <ScaleField label="Dor/desconforto" value={soreness} onChange={setSoreness} />
          </div>

          {toNumber(soreness) !== null && (toNumber(soreness) as number) >= 4 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <p>
                Você registrou dor ou desconforto alto. O registro fica guardado como você
                anotou — este aplicativo não avalia lesão e não indica tratamento. Se quiser,
                adapte o treino ou encerre; se a dor persistir, procure orientação profissional.
              </p>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Observação</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              className="mt-1.5"
            />
          </div>
        </CardContent>
      </Card>

      {/* ───────── Barra fixa ───────── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Button
            variant="ghost"
            className="h-12 shrink-0"
            onClick={() => setConfirmDiscard(true)}
            disabled={busy}
          >
            Descartar
          </Button>
          <Button
            className="h-12 min-w-0 flex-1 text-base"
            onClick={() => handleStart(false)}
            disabled={busy || included.length === 0}
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
            Começar treino
          </Button>
        </div>
      </div>

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar esta preparação?</DialogTitle>
            <DialogDescription>
              O treino ainda não começou, então não há série registrada para perder. A
              preparação some e você volta para a escolha do treino.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDiscard(false)}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleDiscard} disabled={busy}>
              Descartar preparação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={runningConflict !== null} onOpenChange={() => setRunningConflict(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Já existe um treino em andamento</DialogTitle>
            <DialogDescription>
              {runningConflict} Você pode voltar para ele ou encerrá-lo como abandonado — o que
              já foi registrado lá continua guardado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => router.push(`${TRAINING_BASE_PATH}/sessao`)}>
              Ir para o treino em andamento
            </Button>
            <Button
              onClick={() => {
                setRunningConflict(null);
                void handleStart(true);
              }}
              disabled={busy}
            >
              Encerrar o anterior e começar este
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ───────────────────────────── Campos auxiliares ───────────────────────────── */

function SmallField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        className="mt-1 h-10 text-center tabular-nums"
        aria-label={label}
      />
    </div>
  );
}

function ScaleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label} (1 a 5)</Label>
      <div className="mt-1.5 flex gap-1">
        {[1, 2, 3, 4, 5].map((level) => (
          <Button
            key={level}
            type="button"
            variant={value === String(level) ? "default" : "outline"}
            className="size-10 p-0"
            onClick={() => onChange(value === String(level) ? "" : String(level))}
            aria-label={`${label} nível ${level}`}
            aria-pressed={value === String(level)}
          >
            {level}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border p-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
