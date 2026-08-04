/**
 * Fase 17-D — Treinos · Leitura do histórico, recordes e progressão (server-only).
 *
 * ⛔ NENHUMA FUNÇÃO DESTE ARQUIVO LÊ `training_workouts` PARA MONTAR HISTÓRICO.
 *
 * Vale aqui a mesma regra de `session-queries.ts` (17-C): nome do treino, nome do exercício,
 * tipo de acompanhamento, grupo muscular e séries saem do que foi CONGELADO na sessão. A única
 * leitura do modelo neste arquivo é para APLICAR uma sugestão de progressão — decisão sobre o
 * futuro, não renderização do passado.
 *
 * Padrão do projeto: uma consulta ampla por entidade + cruzamento em memória (evitar N+1). A
 * RLS garante que só vem o que é do usuário.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/format";
import {
  asDifficultyLevel,
  asLaterality,
  asOneRmFormula,
  asSessionSetStatus,
  asSessionStatus,
  asSetType,
  asTrackingType,
  type DifficultyLevel,
  type OneRmFormula,
} from "./constants";
import { asRecordType, asRecordUnit, type RecordType, type RecordUnit } from "./records";
import {
  asSuggestionStatus,
  type ProgressionRule,
  type ProgressionScope,
  type ProgressionIncrementMode,
  type SuggestionStatus,
} from "./progression";
import type { HistoryItem } from "./history";
import type { MetricExercise, MetricSession, MetricSet } from "./metrics";
import type { TrainingSession } from "./types";
import { addDaysIso } from "./schedule";

const SESSION_LIMIT = 500;
const CHILD_LIMIT = 20000;

/**
 * As listas de colunas precisam ser UM literal em uma linha só: o `select` tipado do
 * supabase-js infere o shape do TIPO LITERAL da string; concatenar alarga para `string` e o
 * retorno vira `GenericStringError`.
 */
const HISTORY_SESSION_SELECT =
  "id,session_date,status,workout_id,workout_name_snapshot,program_id,program_name_snapshot,body_weight_kg,total_seconds,active_seconds,started_at,ended_at,notes,felt_pain,pain_notes,rating,location_id";

const HISTORY_EXERCISE_SELECT =
  "id,session_id,exercise_id,exercise_name_snapshot,tracking_type,laterality,muscle_group_snapshot,counts_in_volume,executed_position,planned_position,status";

const HISTORY_SET_SELECT =
  "id,session_id,session_exercise_id,set_number,set_type,status,is_warmup,counts_in_volume,reps,weight_kg,additional_weight_kg,assistance_weight_kg,duration_seconds,distance_m,calories,reps_left,reps_right,weight_left_kg,weight_right_kg,rir,rpe,difficulty,planned_reps_min,planned_reps_max,planned_weight_kg,is_personal_record";

const RECORD_SELECT =
  "id,exercise_id,exercise_name_snapshot,scope,record_type,record_key,value,unit,reference_weight_kg,reps,weight_kg,one_rm_formula,achieved_on,session_id,session_set_id,previous_value,previous_achieved_on,notes,updated_at";

const RULE_SELECT =
  "id,name,scope,exercise_id,muscle_group_id,min_sessions,require_top_of_range,require_all_working_sets,require_no_failure,max_rir,max_rpe,max_difficulty,increment_mode,increment_kg,increment_percent,is_active,position,notes";

const SUGGESTION_SELECT =
  "id,rule_id,exercise_id,exercise_name_snapshot,workout_id,workout_exercise_id,workout_name_snapshot,kind,previous_value,suggested_value,unit,reason,basis,status,dedupe_key,suggested_on,decided_at,decision_notes";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/* ═══════════════════════════ Histórico ═══════════════════════════ */

export type HistoryRange = {
  /** Datas puras, inclusivas. Sem `from`, a leitura volta `days` dias a partir de hoje. */
  from?: string | null;
  to?: string | null;
  days?: number;
  limit?: number;
};

/**
 * As sessões do período, com exercícios e séries — a "uma leitura ampla" do módulo.
 *
 * Traz só o que foi EXECUTADO (`concluida` / `abandonada`): rascunho e sessão em andamento não
 * são histórico, e sessão cancelada não é execução. O filtro fino acontece em memória, em
 * `history.ts`.
 */
export async function getSessionHistory(range: HistoryRange = {}): Promise<HistoryItem[]> {
  const supabase = await createClient();

  const to = range.to ?? hojeISO();
  const from = range.from ?? addDaysIso(to, -(range.days ?? 365));

  const { data: sessions } = await supabase
    .from("training_sessions")
    .select(HISTORY_SESSION_SELECT)
    .in("status", ["concluida", "abandonada"])
    .gte("session_date", from)
    .lte("session_date", to)
    .order("session_date", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(range.limit ?? SESSION_LIMIT);

  const rows = sessions ?? [];
  if (rows.length === 0) return [];

  const sessionIds = rows.map((row) => row.id);
  const locationIds = [...new Set(rows.map((row) => row.location_id).filter(Boolean))] as string[];

  const [exercisesRes, setsRes, recordsRes, locationsRes] = await Promise.all([
    supabase
      .from("training_session_exercises")
      .select(HISTORY_EXERCISE_SELECT)
      .in("session_id", sessionIds)
      .order("executed_position", { ascending: true })
      .limit(CHILD_LIMIT),
    supabase
      .from("training_session_sets")
      .select(HISTORY_SET_SELECT)
      .in("session_id", sessionIds)
      .order("set_number", { ascending: true })
      .limit(CHILD_LIMIT),
    supabase
      .from("training_personal_records")
      .select("session_id")
      .in("session_id", sessionIds)
      .limit(CHILD_LIMIT),
    locationIds.length > 0
      ? supabase.from("training_locations").select("id,name").in("id", locationIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const setsByExercise = new Map<string, MetricSet[]>();
  for (const row of setsRes.data ?? []) {
    const list = setsByExercise.get(row.session_exercise_id) ?? [];
    list.push(mapMetricSet(row));
    setsByExercise.set(row.session_exercise_id, list);
  }

  const exercisesBySession = new Map<string, MetricExercise[]>();
  for (const row of exercisesRes.data ?? []) {
    const list = exercisesBySession.get(row.session_id) ?? [];
    list.push({
      id: row.id,
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name_snapshot,
      trackingType: asTrackingType(row.tracking_type),
      laterality: asLaterality(row.laterality),
      muscleGroup: row.muscle_group_snapshot,
      countsInVolume: row.counts_in_volume,
      sets: (setsByExercise.get(row.id) ?? []).sort((a, b) => a.setNumber - b.setNumber),
    });
    exercisesBySession.set(row.session_id, list);
  }

  const sessionsWithRecord = new Set((recordsRes.data ?? []).map((row) => row.session_id));
  const locationById = new Map((locationsRes.data ?? []).map((row) => [row.id, row.name]));

  return rows.map((row) => ({
    id: row.id,
    sessionDate: row.session_date,
    status: asSessionStatus(row.status),
    workoutId: row.workout_id,
    workoutName: row.workout_name_snapshot,
    programId: row.program_id,
    programName: row.program_name_snapshot,
    bodyWeightKg: num(row.body_weight_kg),
    totalSeconds: row.total_seconds,
    activeSeconds: row.active_seconds,
    exercises: exercisesBySession.get(row.id) ?? [],
    hasNotes: Boolean(row.notes?.trim()) || Boolean(row.pain_notes?.trim()),
    feltPain: Boolean(row.felt_pain),
    hasRecord: sessionsWithRecord.has(row.id),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    locationName: row.location_id ? locationById.get(row.location_id) ?? null : null,
    rating: row.rating,
  }));
}

function mapMetricSet(row: Record<string, unknown>): MetricSet & {
  id: string;
  rir: number | null;
  rpe: number | null;
  difficulty: DifficultyLevel | null;
  plannedRepsMin: number | null;
  plannedRepsMax: number | null;
  plannedWeightKg: number | null;
  isPersonalRecord: boolean;
} {
  return {
    id: row.id as string,
    setNumber: row.set_number as number,
    status: asSessionSetStatus(row.status as string),
    setType: asSetType(row.set_type as string),
    isWarmup: Boolean(row.is_warmup),
    countsInVolume: Boolean(row.counts_in_volume),
    reps: (row.reps as number | null) ?? null,
    weightKg: num(row.weight_kg),
    additionalWeightKg: num(row.additional_weight_kg),
    assistanceWeightKg: num(row.assistance_weight_kg),
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    distanceM: num(row.distance_m),
    calories: (row.calories as number | null) ?? null,
    repsLeft: (row.reps_left as number | null) ?? null,
    repsRight: (row.reps_right as number | null) ?? null,
    weightLeftKg: num(row.weight_left_kg),
    weightRightKg: num(row.weight_right_kg),
    rir: (row.rir as number | null) ?? null,
    rpe: num(row.rpe),
    difficulty: asDifficultyLevel(row.difficulty as string | null),
    plannedRepsMin: (row.planned_reps_min as number | null) ?? null,
    plannedRepsMax: (row.planned_reps_max as number | null) ?? null,
    plannedWeightKg: num(row.planned_weight_kg),
    isPersonalRecord: Boolean(row.is_personal_record),
  };
}

/**
 * Uma sessão completa (17-C) no formato que `metrics.ts` consome.
 *
 * Adaptador explícito, não `as`: se um campo do domínio mudar de nome, o erro aparece aqui e
 * não numa conta silenciosamente errada.
 */
export function trainingSessionToMetric(session: TrainingSession): MetricSession {
  return {
    id: session.id,
    sessionDate: session.sessionDate,
    status: session.status,
    workoutId: session.workoutId,
    workoutName: session.workoutName,
    programId: session.programId,
    programName: session.programName,
    bodyWeightKg: session.bodyWeightKg,
    totalSeconds: session.totalSeconds,
    activeSeconds: session.activeSeconds,
    exercises: session.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      trackingType: exercise.trackingType,
      laterality: exercise.laterality,
      muscleGroup: exercise.muscleGroup,
      countsInVolume: exercise.countsInVolume,
      sets: exercise.sets.map((set) => ({
        id: set.id,
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
      })),
    })),
  };
}

/* ═══════════════════════════ Histórico de UM exercício ═══════════════════════════ */

export type ExerciseSessionEntry = {
  sessionId: string;
  sessionDate: string;
  workoutId: string | null;
  workoutName: string;
  bodyWeightKg: number | null;
  exerciseName: string;
  trackingType: ReturnType<typeof asTrackingType>;
  sets: ReturnType<typeof mapMetricSet>[];
};

/**
 * Todas as execuções de um exercício, da mais recente para a mais antiga.
 *
 * O cruzamento é por `exercise_id` **ou** pelo nome congelado: um exercício excluído do
 * catálogo continua tendo histórico, com o nome que tinha (a mesma decisão de `previous.ts`).
 */
export async function getExerciseSessions(
  exerciseId: string,
  options: { limitSessions?: number } = {},
): Promise<ExerciseSessionEntry[]> {
  const supabase = await createClient();

  const { data: exerciseRows } = await supabase
    .from("training_session_exercises")
    .select("id,session_id,exercise_id,exercise_name_snapshot,tracking_type")
    .eq("exercise_id", exerciseId)
    .limit(CHILD_LIMIT);

  if (!exerciseRows?.length) return [];

  const sessionIds = [...new Set(exerciseRows.map((row) => row.session_id))];

  const [sessionsRes, setsRes] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("id,session_date,status,workout_id,workout_name_snapshot,body_weight_kg")
      .in("id", sessionIds)
      .in("status", ["concluida", "abandonada"])
      .order("session_date", { ascending: false })
      .limit(options.limitSessions ?? 200),
    supabase
      .from("training_session_sets")
      .select(HISTORY_SET_SELECT)
      .in(
        "session_exercise_id",
        exerciseRows.map((row) => row.id),
      )
      .order("set_number", { ascending: true })
      .limit(CHILD_LIMIT),
  ]);

  const sessionById = new Map((sessionsRes.data ?? []).map((row) => [row.id, row]));
  const exerciseById = new Map(exerciseRows.map((row) => [row.id, row]));

  const bySession = new Map<string, ExerciseSessionEntry>();

  for (const row of setsRes.data ?? []) {
    const exercise = exerciseById.get(row.session_exercise_id);
    if (!exercise) continue;
    const session = sessionById.get(exercise.session_id);
    if (!session) continue;

    const entry = bySession.get(session.id) ?? {
      sessionId: session.id,
      sessionDate: session.session_date,
      workoutId: session.workout_id,
      workoutName: session.workout_name_snapshot,
      bodyWeightKg: num(session.body_weight_kg),
      exerciseName: exercise.exercise_name_snapshot,
      trackingType: asTrackingType(exercise.tracking_type),
      sets: [],
    };
    entry.sets.push(mapMetricSet(row));
    bySession.set(session.id, entry);
  }

  return [...bySession.values()]
    .map((entry) => ({ ...entry, sets: entry.sets.sort((a, b) => a.setNumber - b.setNumber) }))
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
}

/** As sessões de um exercício no formato que `metrics.ts` consome. */
export function exerciseSessionsToMetric(entries: ExerciseSessionEntry[]) {
  return entries.map((entry) => ({
    id: entry.sessionId,
    sessionDate: entry.sessionDate,
    status: "concluida" as const,
    workoutId: entry.workoutId,
    workoutName: entry.workoutName,
    programId: null,
    programName: null,
    bodyWeightKg: entry.bodyWeightKg,
    totalSeconds: null,
    activeSeconds: null,
    exercises: [
      {
        id: `${entry.sessionId}-ex`,
        exerciseId: null,
        exerciseName: entry.exerciseName,
        trackingType: entry.trackingType,
        laterality: "bilateral" as const,
        muscleGroup: null,
        countsInVolume: true,
        sets: entry.sets,
      },
    ],
  }));
}

/* ═══════════════════════════ Recordes ═══════════════════════════ */

export type PersonalRecord = {
  id: string;
  exerciseId: string | null;
  exerciseName: string | null;
  scope: "exercicio" | "geral";
  recordType: RecordType;
  recordKey: string;
  value: number;
  unit: RecordUnit;
  referenceWeightKg: number | null;
  reps: number | null;
  weightKg: number | null;
  oneRmFormula: OneRmFormula | null;
  achievedOn: string;
  sessionId: string | null;
  sessionSetId: string | null;
  previousValue: number | null;
  previousAchievedOn: string | null;
  notes: string | null;
  updatedAt: string;
};

export async function getPersonalRecords(): Promise<PersonalRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_personal_records")
    .select(RECORD_SELECT)
    .order("achieved_on", { ascending: false })
    .limit(CHILD_LIMIT);

  return (data ?? []).map((row) => ({
    id: row.id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name_snapshot,
    scope: row.scope === "geral" ? "geral" : "exercicio",
    recordType: asRecordType(row.record_type),
    recordKey: row.record_key,
    value: num(row.value) ?? 0,
    unit: asRecordUnit(row.unit),
    referenceWeightKg: num(row.reference_weight_kg),
    reps: row.reps,
    weightKg: num(row.weight_kg),
    oneRmFormula: row.one_rm_formula ? asOneRmFormula(row.one_rm_formula) : null,
    achievedOn: row.achieved_on,
    sessionId: row.session_id,
    sessionSetId: row.session_set_id,
    previousValue: num(row.previous_value),
    previousAchievedOn: row.previous_achieved_on,
    notes: row.notes,
    updatedAt: row.updated_at,
  }));
}

/* ═══════════════════════════ Progressão ═══════════════════════════ */

export async function getProgressionRules(): Promise<ProgressionRule[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_progression_rules")
    .select(RULE_SELECT)
    .order("position", { ascending: true })
    .limit(200);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    scope: row.scope as ProgressionScope,
    exerciseId: row.exercise_id,
    muscleGroupId: row.muscle_group_id,
    minSessions: row.min_sessions,
    requireTopOfRange: row.require_top_of_range,
    requireAllWorkingSets: row.require_all_working_sets,
    requireNoFailure: row.require_no_failure,
    maxRir: row.max_rir,
    maxRpe: num(row.max_rpe),
    maxDifficulty: asDifficultyLevel(row.max_difficulty),
    incrementMode: row.increment_mode as ProgressionIncrementMode,
    incrementKg: num(row.increment_kg),
    incrementPercent: num(row.increment_percent),
    isActive: row.is_active,
  }));
}

export type ProgressionSuggestionRow = {
  id: string;
  ruleId: string | null;
  exerciseId: string | null;
  exerciseName: string;
  workoutId: string | null;
  workoutExerciseId: string | null;
  workoutName: string | null;
  kind: string;
  previousValue: number | null;
  suggestedValue: number;
  unit: string;
  reason: string;
  basis: unknown;
  status: SuggestionStatus;
  dedupeKey: string;
  suggestedOn: string;
  decidedAt: string | null;
  decisionNotes: string | null;
};

export async function getProgressionSuggestions(
  statuses: SuggestionStatus[] = ["pendente"],
): Promise<ProgressionSuggestionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_progression_suggestions")
    .select(SUGGESTION_SELECT)
    .in("status", statuses)
    .order("suggested_on", { ascending: false })
    .limit(500);

  return (data ?? []).map((row) => ({
    id: row.id,
    ruleId: row.rule_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name_snapshot,
    workoutId: row.workout_id,
    workoutExerciseId: row.workout_exercise_id,
    workoutName: row.workout_name_snapshot,
    kind: row.kind,
    previousValue: num(row.previous_value),
    suggestedValue: num(row.suggested_value) ?? 0,
    unit: row.unit,
    reason: row.reason,
    basis: row.basis,
    status: asSuggestionStatus(row.status),
    dedupeKey: row.dedupe_key,
    suggestedOn: row.suggested_on,
    decidedAt: row.decided_at,
    decisionNotes: row.decision_notes,
  }));
}

/* ═══════════════════════════ Apoio às telas ═══════════════════════════ */

export type HistoryFacets = {
  workouts: { id: string; name: string }[];
  programs: { id: string; name: string }[];
  exercises: { id: string; name: string }[];
  muscleGroups: string[];
};

/**
 * As opções dos filtros, tiradas do PRÓPRIO histórico.
 *
 * Deliberadamente não vêm do catálogo: filtrar por um treino que nunca foi executado devolveria
 * sempre lista vazia, e um exercício excluído do catálogo sumiria do filtro mesmo tendo
 * histórico.
 */
export function facetsFromHistory(items: HistoryItem[]): HistoryFacets {
  const workouts = new Map<string, string>();
  const programs = new Map<string, string>();
  const exercises = new Map<string, string>();
  const muscleGroups = new Set<string>();

  for (const item of items) {
    if (item.workoutId) workouts.set(item.workoutId, item.workoutName);
    if (item.programId && item.programName) programs.set(item.programId, item.programName);
    for (const exercise of item.exercises) {
      if (exercise.exerciseId) exercises.set(exercise.exerciseId, exercise.exerciseName);
      if (exercise.muscleGroup) muscleGroups.add(exercise.muscleGroup);
    }
  }

  const sortByName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });

  return {
    workouts: [...workouts.entries()].map(([id, name]) => ({ id, name })).sort(sortByName),
    programs: [...programs.entries()].map(([id, name]) => ({ id, name })).sort(sortByName),
    exercises: [...exercises.entries()].map(([id, name]) => ({ id, name })).sort(sortByName),
    muscleGroups: [...muscleGroups].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    ),
  };
}
