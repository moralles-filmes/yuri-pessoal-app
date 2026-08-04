/**
 * Fase 17-C — Treinos · O CONGELAMENTO do treino (PURO, sem I/O, sem `Date.now()`).
 *
 * ═══════════════════ A REGRA INEGOCIÁVEL DA SUBFASE ═══════════════════
 *
 * Ao iniciar a sessão, o treino-modelo é COPIADO para cá: nome, programa, versão, exercícios,
 * ordem, séries, repetições, cargas, descansos, tipo de série, superset, tracking type e nome
 * do exercício. Daí em diante, **nenhuma leitura de sessão passada volta ao modelo**. Renomear
 * o exercício, mudar a carga planejada, arquivar ou excluir o treino não muda o que já
 * aconteceu.
 *
 * É o mesmo princípio de `nutrition_diary_entries.nutrients_snapshot` (16-B), em outro domínio:
 * o histórico é fato consumado, e fato consumado não é recalculado a partir do catálogo atual.
 *
 * ═══════════════════ UM CAMINHO SÓ ═══════════════════
 *
 * Este arquivo **não reimplementa** a expansão de séries: ele CHAMA `expandPlannedSets`
 * (17-B), o formato único de série planejada. Assim o construtor de treino, a pré-visualização
 * e a sessão concordam sempre sobre quantas séries existem e o que cada uma pede — do mesmo
 * jeito que `buildRecipeEntrySnapshot` chama `buildDiaryEntrySnapshot` na Dieta.
 *
 * Repetir o último treino e duplicar uma sessão passada também passam por aqui: o que muda é
 * a FONTE dos números (execução em vez de modelo), nunca o construtor.
 */
import type { Laterality, SetTechnique, SetType, TrackingType } from "./constants";
import { expandPlannedSets, type PlannableExercise, type PlannedSet } from "./workout";

export const SNAPSHOT_VERSION = 1 as const;

/* ───────────────────────────── O que entra ─────────────────────────────
 * `PlannableExercise` (17-B) + os campos de identidade que precisam ficar congelados. O shape
 * é o menor que resolve: o teste monta um objeto pequeno e a action passa o que leu do banco.
 */

export type SnapshotSourceExercise = PlannableExercise & {
  /** Referência informativa. `null` quando o exercício não existe mais no catálogo. */
  exerciseId: string | null;
  workoutExerciseId: string | null;
  exerciseName: string;
  muscleGroup: string | null;
  equipment: string | null;
  movementPattern: string | null;
  supersetGroup: string | null;
  technique: SetTechnique | null;
  plannedPosition: number;
  incrementKg: number | null;
};

export type SnapshotSource = {
  workoutId: string | null;
  workoutName: string;
  workoutShortName: string | null;
  workoutVersion: number | null;
  programId: string | null;
  programName: string | null;
  defaultRestSeconds: number;
  exercises: SnapshotSourceExercise[];
};

/* ───────────────────────────── O que fica gravado ───────────────────────────── */

export type SnapshotExercise = {
  exerciseId: string | null;
  workoutExerciseId: string | null;
  exerciseName: string;
  trackingType: TrackingType;
  laterality: Laterality;
  muscleGroup: string | null;
  equipment: string | null;
  movementPattern: string | null;
  plannedPosition: number;
  supersetGroup: string | null;
  technique: SetTechnique | null;
  isWarmup: boolean;
  countsInVolume: boolean;
  restSeconds: number | null;
  incrementKg: number | null;
  notes: string | null;
  /** Saídas de `expandPlannedSets`. O formato único, congelado. */
  sets: PlannedSet[];
};

export type WorkoutSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  workoutId: string | null;
  workoutName: string;
  workoutShortName: string | null;
  workoutVersion: number | null;
  programId: string | null;
  programName: string | null;
  defaultRestSeconds: number;
  exercises: SnapshotExercise[];
};

/* ───────────────────────────── Construtor ───────────────────────────── */

/**
 * Congela o treino.
 *
 * A ordem é normalizada para 0..n-1 aqui: `plannedPosition` é o que a sessão vai comparar
 * depois com `executedPosition`, e um buraco na numeração do modelo não pode virar um buraco
 * na sessão.
 */
export function buildWorkoutSnapshot(source: SnapshotSource): WorkoutSnapshot {
  const ordered = [...source.exercises]
    .map((exercise, index) => ({ exercise, index }))
    .sort((a, b) => a.exercise.plannedPosition - b.exercise.plannedPosition || a.index - b.index)
    .map(({ exercise }) => exercise);

  return {
    version: SNAPSHOT_VERSION,
    workoutId: source.workoutId,
    workoutName: source.workoutName.trim() || "Treino",
    workoutShortName: source.workoutShortName,
    workoutVersion: source.workoutVersion,
    programId: source.programId,
    programName: source.programName,
    defaultRestSeconds: source.defaultRestSeconds,
    exercises: ordered.map((exercise, position) => ({
      exerciseId: exercise.exerciseId,
      workoutExerciseId: exercise.workoutExerciseId,
      exerciseName: exercise.exerciseName,
      trackingType: exercise.trackingType,
      laterality: exercise.laterality ?? "bilateral",
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment,
      movementPattern: exercise.movementPattern,
      plannedPosition: position,
      supersetGroup: exercise.supersetGroup,
      technique: exercise.technique,
      isWarmup: exercise.isWarmup,
      countsInVolume: exercise.countsInVolume,
      restSeconds: exercise.restSeconds,
      incrementKg: exercise.incrementKg,
      notes: exercise.notes,
      // ⛔ Uma única expansão de séries no módulo inteiro.
      sets: expandPlannedSets(exercise),
    })),
  };
}

/** Treino vazio (o usuário monta durante a sessão). Nome obrigatório, zero exercício. */
export function emptyWorkoutSnapshot(
  name: string,
  options: { defaultRestSeconds?: number } = {},
): WorkoutSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    workoutId: null,
    workoutName: name.trim() || "Treino livre",
    workoutShortName: null,
    workoutVersion: null,
    programId: null,
    programName: null,
    defaultRestSeconds: options.defaultRestSeconds ?? 90,
    exercises: [],
  };
}

/* ───────────────────────────── Ajustes da preparação ─────────────────────────────
 * Na etapa 2 da preparação o usuário revisa tudo antes de começar: ordem, número de séries,
 * repetições, carga, descanso, RIR/RPE, tipo de série e superset.
 *
 * Os ajustes são aplicados ao EXERCÍCIO PLANEJÁVEL, e só depois o snapshot é construído — em
 * vez de o cliente mandar o snapshot pronto. Assim:
 *   • nome, tipo de acompanhamento e lateralidade continuam vindo do catálogo (o cliente não
 *     pode inventar identidade);
 *   • a expansão de séries continua passando por `expandPlannedSets`.
 */

export type PreparationSetInput = {
  setType?: SetType;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDurationSeconds?: number | null;
  targetDistanceM?: number | null;
  plannedWeightKg?: number | null;
  plannedAdditionalWeightKg?: number | null;
  plannedAssistanceWeightKg?: number | null;
  restSeconds?: number | null;
  targetRir?: number | null;
  targetRpe?: number | null;
  isWarmup?: boolean;
  countsInVolume?: boolean;
  notes?: string | null;
};

export type PreparationAdjustment = {
  /** `workoutExerciseId` do modelo, ou o id temporário de um exercício acrescentado. */
  key: string;
  /** Fora da sessão de hoje sem mexer no modelo. */
  include?: boolean;
  position?: number;
  supersetGroup?: string | null;
  restSeconds?: number | null;
  notes?: string | null;
  /** Lista COMPLETA de séries. Ausente = mantém as do modelo. Vazia = remove o exercício. */
  sets?: PreparationSetInput[];
};

/**
 * Aplica os ajustes da preparação à lista de exercícios planejáveis.
 *
 * Exercício sem ajuste continua exatamente como está no modelo — a preparação é opcional, e o
 * caminho de quem só aperta "Começar" não passa por nenhuma transformação.
 */
export function applyPreparation(
  exercises: SnapshotSourceExercise[],
  adjustments: PreparationAdjustment[],
): SnapshotSourceExercise[] {
  const byKey = new Map(adjustments.map((adjustment) => [adjustment.key, adjustment]));

  return exercises
    .map((exercise) => {
      const key = exercise.workoutExerciseId ?? exercise.id;
      const adjustment = byKey.get(key);
      if (!adjustment) return exercise;
      if (adjustment.include === false) return null;

      const sets = adjustment.sets;
      const merged: SnapshotSourceExercise = {
        ...exercise,
        plannedPosition: adjustment.position ?? exercise.plannedPosition,
        supersetGroup:
          adjustment.supersetGroup === undefined ? exercise.supersetGroup : adjustment.supersetGroup,
        restSeconds:
          adjustment.restSeconds === undefined ? exercise.restSeconds : adjustment.restSeconds,
        notes: adjustment.notes === undefined ? exercise.notes : adjustment.notes,
      };

      if (sets === undefined) return merged;
      if (sets.length === 0) return null;

      // A lista configurada vira a verdade — é a mesma regra de `training_workout_sets`
      // (17-B): existindo linha configurada, `defaultSets` passa a ser só exibição.
      return {
        ...merged,
        defaultSets: sets.length,
        sets: sets.map((set, index) => ({
          setNumber: index + 1,
          setType: set.setType ?? merged.setType,
          targetRepsMin: set.targetRepsMin ?? null,
          targetRepsMax: set.targetRepsMax ?? null,
          targetDurationSeconds: set.targetDurationSeconds ?? null,
          targetDistanceM: set.targetDistanceM ?? null,
          plannedWeightKg: set.plannedWeightKg ?? null,
          plannedAdditionalWeightKg: set.plannedAdditionalWeightKg ?? null,
          plannedAssistanceWeightKg: set.plannedAssistanceWeightKg ?? null,
          restSeconds: set.restSeconds ?? null,
          targetRir: set.targetRir ?? null,
          targetRpe: set.targetRpe ?? null,
          isWarmup: set.isWarmup ?? false,
          countsInVolume: set.countsInVolume ?? true,
          notes: set.notes ?? null,
        })),
      };
    })
    .filter((exercise): exercise is SnapshotSourceExercise => exercise !== null);
}

/* ───────────────────────────── Linhas para o banco ─────────────────────────────
 * O jsonb é a cópia integral; as linhas filhas são a forma CONSULTÁVEL do mesmo congelamento
 * (para filtrar por exercício, somar volume e ordenar sem abrir o jsonb inteiro). Uma coisa só,
 * em duas formas — não duas verdades: as duas nascem desta função, no mesmo instante.
 */

export type SnapshotExerciseRow = {
  exercise_id: string | null;
  workout_exercise_id: string | null;
  planned_position: number;
  executed_position: number;
  exercise_name_snapshot: string;
  tracking_type: TrackingType;
  laterality: Laterality;
  muscle_group_snapshot: string | null;
  equipment_snapshot: string | null;
  movement_pattern_snapshot: string | null;
  superset_group: string | null;
  technique: SetTechnique | null;
  is_warmup: boolean;
  counts_in_volume: boolean;
  rest_seconds: number | null;
  increment_kg: number | null;
  notes: string | null;
};

export type SnapshotSetRow = {
  set_number: number;
  set_type: SetType;
  planned_reps_min: number | null;
  planned_reps_max: number | null;
  planned_weight_kg: number | null;
  planned_additional_weight_kg: number | null;
  planned_assistance_weight_kg: number | null;
  planned_duration_seconds: number | null;
  planned_distance_m: number | null;
  planned_rest_seconds: number | null;
  planned_rir: number | null;
  planned_rpe: number | null;
  is_warmup: boolean;
  counts_in_volume: boolean;
};

export function snapshotExerciseRow(exercise: SnapshotExercise): SnapshotExerciseRow {
  return {
    exercise_id: exercise.exerciseId,
    workout_exercise_id: exercise.workoutExerciseId,
    planned_position: exercise.plannedPosition,
    // A execução começa igual ao planejado; reordenar durante o treino muda só esta coluna.
    executed_position: exercise.plannedPosition,
    exercise_name_snapshot: exercise.exerciseName,
    tracking_type: exercise.trackingType,
    laterality: exercise.laterality,
    muscle_group_snapshot: exercise.muscleGroup,
    equipment_snapshot: exercise.equipment,
    movement_pattern_snapshot: exercise.movementPattern,
    superset_group: exercise.supersetGroup,
    technique: exercise.technique,
    is_warmup: exercise.isWarmup,
    counts_in_volume: exercise.countsInVolume,
    rest_seconds: exercise.restSeconds,
    increment_kg: exercise.incrementKg,
    notes: exercise.notes,
  };
}

export function snapshotSetRow(set: PlannedSet, defaultRestSeconds: number): SnapshotSetRow {
  return {
    set_number: set.setNumber,
    set_type: set.setType,
    planned_reps_min: set.targetRepsMin,
    planned_reps_max: set.targetRepsMax,
    planned_weight_kg: set.plannedWeightKg,
    planned_additional_weight_kg: set.plannedAdditionalWeightKg,
    planned_assistance_weight_kg: set.plannedAssistanceWeightKg,
    planned_duration_seconds: set.targetDurationSeconds,
    planned_distance_m: set.targetDistanceM,
    planned_rest_seconds: set.restSeconds ?? defaultRestSeconds,
    planned_rir: set.targetRir,
    planned_rpe: set.targetRpe,
    is_warmup: set.isWarmup,
    counts_in_volume: set.countsInVolume,
  };
}

/* ───────────────────────────── Resumo ───────────────────────────── */

export type SnapshotSummary = {
  exerciseCount: number;
  setCount: number;
  workingSetCount: number;
  warmupSetCount: number;
  muscleGroups: string[];
};

/** Os números que a preparação e a revisão mostram. Um lugar só, para as duas concordarem. */
export function summarizeSnapshot(snapshot: WorkoutSnapshot): SnapshotSummary {
  let setCount = 0;
  let warmupSetCount = 0;
  const muscleGroups: string[] = [];

  for (const exercise of snapshot.exercises) {
    for (const set of exercise.sets) {
      setCount += 1;
      if (set.isWarmup) warmupSetCount += 1;
    }
    if (exercise.muscleGroup && !muscleGroups.includes(exercise.muscleGroup)) {
      muscleGroups.push(exercise.muscleGroup);
    }
  }

  return {
    exerciseCount: snapshot.exercises.length,
    setCount,
    workingSetCount: setCount - warmupSetCount,
    warmupSetCount,
    muscleGroups,
  };
}

/* ───────────────────────────── Leitura de volta ─────────────────────────────
 * O jsonb pode ter sido gravado por uma versão anterior do código. Ler com tolerância evita que
 * uma sessão antiga deixe de abrir — o snapshot é histórico e não pode ser "migrado" à força.
 */
export function parseWorkoutSnapshot(value: unknown): WorkoutSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<WorkoutSnapshot>;
  if (!Array.isArray(raw.exercises)) return null;

  return {
    version: SNAPSHOT_VERSION,
    workoutId: raw.workoutId ?? null,
    workoutName: typeof raw.workoutName === "string" ? raw.workoutName : "Treino",
    workoutShortName: raw.workoutShortName ?? null,
    workoutVersion: raw.workoutVersion ?? null,
    programId: raw.programId ?? null,
    programName: raw.programName ?? null,
    defaultRestSeconds:
      typeof raw.defaultRestSeconds === "number" ? raw.defaultRestSeconds : 90,
    exercises: raw.exercises,
  };
}
