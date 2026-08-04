/**
 * Fase 17-C — Treinos · Leitura de sessões (server-only).
 *
 * ⛔ NENHUMA FUNÇÃO DESTE ARQUIVO LÊ O TREINO-MODELO PARA MONTAR UMA SESSÃO.
 *
 * Tudo que a tela mostra sobre uma sessão — nome do treino, nome do exercício, tipo de
 * acompanhamento, séries previstas, carga planejada — sai das linhas de
 * `training_session_exercises` / `training_session_sets` e do `workout_snapshot`, congelados no
 * início. Cruzar com `training_workouts` aqui seria reabrir a porta que a subfase existe para
 * fechar: editar o modelo passaria a reescrever o passado.
 *
 * As únicas leituras do catálogo neste arquivo são para OFERECER alternativas de substituição
 * durante uma sessão **ativa** — decisão sobre o futuro, não renderização do passado.
 *
 * Padrão do projeto: uma consulta ampla por entidade + cruzamento em memória (evitar N+1).
 * A RLS garante que só vem o que é do usuário.
 */
import { createClient } from "@/lib/supabase/server";
import {
  asDifficultyLevel,
  asLaterality,
  asPlateKind,
  asRestEndKind,
  asSessionEventKind,
  asSessionExerciseStatus,
  asSessionOrigin,
  asSessionSetStatus,
  asSessionStatus,
  asSetTechnique,
  asSetType,
  asSubstitutionReason,
  asTrackingType,
  asWeightUnit,
  asAutoAdvanceMode,
} from "./constants";
import { deriveExerciseStatus, RUNNING_SESSION_STATUSES } from "./session-machine";
import { parseWorkoutSnapshot } from "./session-snapshot";
import type {
  LocationPlate,
  SessionExercise,
  SessionPause,
  SessionRest,
  SessionSet,
  SessionSubstitution,
  TrainingLocation,
  TrainingSession,
} from "./types";

const ROW_LIMIT = 2000;
const CHILD_LIMIT = 20000;

/**
 * As listas de colunas precisam ser UM literal em uma linha só: o `select` tipado do
 * supabase-js infere o shape a partir do TIPO LITERAL da string, e concatenar com `+` alarga
 * para `string` — aí o retorno vira `GenericStringError` e o build quebra.
 */
const SESSION_SELECT =
  "id,workout_id,program_id,scheduled_workout_id,location_id,status,origin_kind,session_date,started_at,ended_at,workout_name_snapshot,workout_short_name_snapshot,workout_version,program_name_snapshot,workout_snapshot,default_rest_seconds,auto_advance,sound_enabled,vibration_enabled,keep_screen_awake,weight_unit,body_weight_kg,energy_level,mood_level,sleep_quality,soreness_level,pre_notes,rating,perceived_effort,notes,felt_pain,pain_notes,total_seconds,active_seconds,rest_total_seconds,pause_total_seconds,created_at,updated_at";

const SESSION_EXERCISE_SELECT =
  "id,session_id,exercise_id,workout_exercise_id,planned_position,executed_position,status,exercise_name_snapshot,tracking_type,laterality,muscle_group_snapshot,equipment_snapshot,movement_pattern_snapshot,superset_group,technique,is_warmup,counts_in_volume,rest_seconds,increment_kg,notes,skip_reason,replaced_session_exercise_id,is_extra,started_at,ended_at";

const SESSION_SET_SELECT =
  "id,session_id,session_exercise_id,set_number,set_type,status,planned_reps_min,planned_reps_max,planned_weight_kg,planned_additional_weight_kg,planned_assistance_weight_kg,planned_duration_seconds,planned_distance_m,planned_rest_seconds,planned_rir,planned_rpe,reps,weight_kg,additional_weight_kg,assistance_weight_kg,duration_seconds,distance_m,calories,incline_percent,resistance_level,reps_left,reps_right,weight_left_kg,weight_right_kg,rir,rpe,difficulty,is_warmup,counts_in_volume,is_personal_record,notes,completed_at,client_mutation_id";

const REST_SELECT =
  "id,session_id,session_exercise_id,session_set_id,planned_seconds,adjustment_seconds,started_at,ended_at,actual_seconds,end_kind";

const PAUSE_SELECT = "id,session_id,started_at,ended_at,reason";

const SUBSTITUTION_SELECT =
  "id,session_id,original_session_exercise_id,new_session_exercise_id,original_name_snapshot,substitute_name_snapshot,reason,reason_notes,occurred_at";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/* ═══════════════════════════ Locais e anilhas ═══════════════════════════ */

export async function getTrainingLocations(): Promise<TrainingLocation[]> {
  const supabase = await createClient();

  const [locationsRes, platesRes] = await Promise.all([
    supabase
      .from("training_locations")
      .select("id,name,notes,is_default,archived_at")
      .order("is_default", { ascending: false })
      .order("name", { ascending: true })
      .limit(ROW_LIMIT),
    supabase
      .from("training_location_plates")
      .select("id,location_id,kind,weight_kg,quantity,notes")
      .order("weight_kg", { ascending: false })
      .limit(CHILD_LIMIT),
  ]);

  const platesByLocation = new Map<string, LocationPlate[]>();
  for (const row of platesRes.data ?? []) {
    const list = platesByLocation.get(row.location_id) ?? [];
    list.push({
      id: row.id,
      locationId: row.location_id,
      kind: asPlateKind(row.kind),
      weightKg: num(row.weight_kg) ?? 0,
      quantity: row.quantity,
      notes: row.notes,
    });
    platesByLocation.set(row.location_id, list);
  }

  return (locationsRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    notes: row.notes,
    isDefault: row.is_default,
    isArchived: Boolean(row.archived_at),
    plates: platesByLocation.get(row.id) ?? [],
  }));
}

/* ═══════════════════════════ Sessão ═══════════════════════════ */

type SessionRow = {
  id: string;
  [key: string]: unknown;
};

function mapSet(row: Record<string, unknown>): SessionSet {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    sessionExerciseId: row.session_exercise_id as string,
    setNumber: row.set_number as number,
    setType: asSetType(row.set_type as string),
    status: asSessionSetStatus(row.status as string),

    plannedRepsMin: (row.planned_reps_min as number | null) ?? null,
    plannedRepsMax: (row.planned_reps_max as number | null) ?? null,
    plannedWeightKg: num(row.planned_weight_kg),
    plannedAdditionalWeightKg: num(row.planned_additional_weight_kg),
    plannedAssistanceWeightKg: num(row.planned_assistance_weight_kg),
    plannedDurationSeconds: (row.planned_duration_seconds as number | null) ?? null,
    plannedDistanceM: num(row.planned_distance_m),
    plannedRestSeconds: (row.planned_rest_seconds as number | null) ?? null,
    plannedRir: (row.planned_rir as number | null) ?? null,
    plannedRpe: num(row.planned_rpe),

    reps: (row.reps as number | null) ?? null,
    weightKg: num(row.weight_kg),
    additionalWeightKg: num(row.additional_weight_kg),
    assistanceWeightKg: num(row.assistance_weight_kg),
    durationSeconds: (row.duration_seconds as number | null) ?? null,
    distanceM: num(row.distance_m),
    calories: (row.calories as number | null) ?? null,
    inclinePercent: num(row.incline_percent),
    resistanceLevel: num(row.resistance_level),

    repsLeft: (row.reps_left as number | null) ?? null,
    repsRight: (row.reps_right as number | null) ?? null,
    weightLeftKg: num(row.weight_left_kg),
    weightRightKg: num(row.weight_right_kg),

    rir: (row.rir as number | null) ?? null,
    rpe: num(row.rpe),
    difficulty: asDifficultyLevel(row.difficulty as string | null),

    isWarmup: Boolean(row.is_warmup),
    countsInVolume: Boolean(row.counts_in_volume),
    isPersonalRecord: Boolean(row.is_personal_record),

    notes: (row.notes as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    clientMutationId: row.client_mutation_id as string,
  };
}

function mapExercise(
  row: Record<string, unknown>,
  sets: SessionSet[],
): SessionExercise {
  const status = asSessionExerciseStatus(row.status as string);
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    exerciseId: (row.exercise_id as string | null) ?? null,
    workoutExerciseId: (row.workout_exercise_id as string | null) ?? null,

    plannedPosition: row.planned_position as number,
    executedPosition: row.executed_position as number,
    status,
    // DERIVADO na leitura, nunca gravado — como `atrasada` no TO-DO.
    derivedStatus: deriveExerciseStatus(status, sets),

    exerciseName: row.exercise_name_snapshot as string,
    trackingType: asTrackingType(row.tracking_type as string),
    laterality: asLaterality(row.laterality as string),
    muscleGroup: (row.muscle_group_snapshot as string | null) ?? null,
    equipment: (row.equipment_snapshot as string | null) ?? null,
    movementPattern: (row.movement_pattern_snapshot as string | null) ?? null,

    supersetGroup: (row.superset_group as string | null) ?? null,
    technique: asSetTechnique(row.technique as string | null),
    isWarmup: Boolean(row.is_warmup),
    countsInVolume: Boolean(row.counts_in_volume),
    restSeconds: (row.rest_seconds as number | null) ?? null,
    incrementKg: num(row.increment_kg),
    notes: (row.notes as string | null) ?? null,
    skipReason: (row.skip_reason as string | null) ?? null,

    replacedSessionExerciseId: (row.replaced_session_exercise_id as string | null) ?? null,
    isExtra: Boolean(row.is_extra),

    startedAt: (row.started_at as string | null) ?? null,
    endedAt: (row.ended_at as string | null) ?? null,

    sets,
  };
}

function mapSession(
  row: SessionRow,
  parts: {
    exercises: SessionExercise[];
    rests: SessionRest[];
    pauses: SessionPause[];
    substitutions: SessionSubstitution[];
    locationName: string | null;
  },
): TrainingSession {
  return {
    id: row.id,
    status: asSessionStatus(row.status as string),
    origin: asSessionOrigin(row.origin_kind as string),

    workoutId: (row.workout_id as string | null) ?? null,
    programId: (row.program_id as string | null) ?? null,
    scheduledWorkoutId: (row.scheduled_workout_id as string | null) ?? null,
    locationId: (row.location_id as string | null) ?? null,
    locationName: parts.locationName,

    sessionDate: row.session_date as string,
    startedAt: (row.started_at as string | null) ?? null,
    endedAt: (row.ended_at as string | null) ?? null,

    workoutName: row.workout_name_snapshot as string,
    workoutShortName: (row.workout_short_name_snapshot as string | null) ?? null,
    workoutVersion: (row.workout_version as number | null) ?? null,
    programName: (row.program_name_snapshot as string | null) ?? null,
    snapshot: parseWorkoutSnapshot(row.workout_snapshot),

    defaultRestSeconds: row.default_rest_seconds as number,
    autoAdvance: asAutoAdvanceMode(row.auto_advance as string),
    soundEnabled: Boolean(row.sound_enabled),
    vibrationEnabled: Boolean(row.vibration_enabled),
    keepScreenAwake: Boolean(row.keep_screen_awake),
    weightUnit: asWeightUnit(row.weight_unit as string),

    bodyWeightKg: num(row.body_weight_kg),
    energyLevel: (row.energy_level as number | null) ?? null,
    moodLevel: (row.mood_level as number | null) ?? null,
    sleepQuality: (row.sleep_quality as number | null) ?? null,
    sorenessLevel: (row.soreness_level as number | null) ?? null,
    preNotes: (row.pre_notes as string | null) ?? null,

    rating: (row.rating as number | null) ?? null,
    perceivedEffort: (row.perceived_effort as number | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    feltPain: Boolean(row.felt_pain),
    painNotes: (row.pain_notes as string | null) ?? null,

    totalSeconds: (row.total_seconds as number | null) ?? null,
    activeSeconds: (row.active_seconds as number | null) ?? null,
    restTotalSeconds: (row.rest_total_seconds as number | null) ?? null,
    pauseTotalSeconds: (row.pause_total_seconds as number | null) ?? null,

    exercises: parts.exercises,
    rests: parts.rests,
    pauses: parts.pauses,
    substitutions: parts.substitutions,

    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Uma sessão completa, montada só a partir do que foi congelado nela. */
export async function getSession(id: string): Promise<TrainingSession | null> {
  const supabase = await createClient();

  const { data: sessionRow } = await supabase
    .from("training_sessions")
    .select(SESSION_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!sessionRow) return null;

  const [exercisesRes, setsRes, restsRes, pausesRes, substitutionsRes, locationRes] =
    await Promise.all([
      supabase
        .from("training_session_exercises")
        .select(SESSION_EXERCISE_SELECT)
        .eq("session_id", id)
        .order("executed_position", { ascending: true })
        .limit(CHILD_LIMIT),
      supabase
        .from("training_session_sets")
        .select(SESSION_SET_SELECT)
        .eq("session_id", id)
        .order("set_number", { ascending: true })
        .limit(CHILD_LIMIT),
      supabase
        .from("training_session_rests")
        .select(REST_SELECT)
        .eq("session_id", id)
        .order("started_at", { ascending: true })
        .limit(CHILD_LIMIT),
      supabase
        .from("training_session_pauses")
        .select(PAUSE_SELECT)
        .eq("session_id", id)
        .order("started_at", { ascending: true })
        .limit(CHILD_LIMIT),
      supabase
        .from("training_session_substitutions")
        .select(SUBSTITUTION_SELECT)
        .eq("session_id", id)
        .order("occurred_at", { ascending: true })
        .limit(CHILD_LIMIT),
      sessionRow.location_id
        ? supabase
            .from("training_locations")
            .select("name")
            .eq("id", sessionRow.location_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const setsByExercise = new Map<string, SessionSet[]>();
  for (const row of setsRes.data ?? []) {
    const set = mapSet(row as Record<string, unknown>);
    const list = setsByExercise.get(set.sessionExerciseId) ?? [];
    list.push(set);
    setsByExercise.set(set.sessionExerciseId, list);
  }
  for (const list of setsByExercise.values()) list.sort((a, b) => a.setNumber - b.setNumber);

  const exercises = (exercisesRes.data ?? [])
    .map((row) =>
      mapExercise(row as Record<string, unknown>, setsByExercise.get(row.id) ?? []),
    )
    .sort((a, b) => a.executedPosition - b.executedPosition);

  return mapSession(sessionRow as SessionRow, {
    exercises,
    rests: (restsRes.data ?? []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      sessionExerciseId: row.session_exercise_id,
      sessionSetId: row.session_set_id,
      plannedSeconds: row.planned_seconds,
      adjustmentSeconds: row.adjustment_seconds,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      actualSeconds: row.actual_seconds,
      endKind: asRestEndKind(row.end_kind),
    })),
    pauses: (pausesRes.data ?? []).map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      reason: row.reason,
    })),
    substitutions: (substitutionsRes.data ?? []).map((row) => ({
      id: row.id,
      originalSessionExerciseId: row.original_session_exercise_id,
      newSessionExerciseId: row.new_session_exercise_id,
      originalName: row.original_name_snapshot,
      substituteName: row.substitute_name_snapshot,
      reason: asSubstitutionReason(row.reason),
      reasonNotes: row.reason_notes,
      occurredAt: row.occurred_at,
    })),
    locationName: (locationRes.data as { name: string } | null)?.name ?? null,
  });
}

/**
 * A sessão em execução, se houver.
 *
 * É o que faz "fechei a aba no meio do treino, reabri e o sistema perguntou se quero
 * continuar" funcionar: a verdade está no servidor, não no armazenamento local.
 */
export async function getRunningSession(): Promise<TrainingSession | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_sessions")
    .select("id")
    .in("status", [...RUNNING_SESSION_STATUSES])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? getSession(data.id) : null;
}

/** O rascunho de preparação mais recente, para retomar de onde parou. */
export async function getDraftSession(): Promise<TrainingSession | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_sessions")
    .select("id")
    .in("status", ["rascunho", "pronta"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? getSession(data.id) : null;
}

/* ═══════════════════════════ Listas leves ═══════════════════════════ */

export type SessionListItem = {
  id: string;
  status: string;
  sessionDate: string;
  startedAt: string | null;
  endedAt: string | null;
  workoutName: string;
  workoutId: string | null;
  totalSeconds: number | null;
  setCount: number;
};

/**
 * Sessões recentes, sem carregar séries.
 *
 * Serve à preparação ("repetir o último", "duplicar uma sessão passada") e ao card da visão
 * geral. O histórico navegável completo é a 17-D.
 */
export async function getRecentSessions(limit = 20): Promise<SessionListItem[]> {
  const supabase = await createClient();

  const { data: sessions } = await supabase
    .from("training_sessions")
    .select(
      "id,status,session_date,started_at,ended_at,workout_name_snapshot,workout_id,total_seconds",
    )
    .in("status", ["concluida", "abandonada"])
    .order("session_date", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(limit);

  const ids = (sessions ?? []).map((row) => row.id);
  const countBySession = new Map<string, number>();

  if (ids.length > 0) {
    const { data: sets } = await supabase
      .from("training_session_sets")
      .select("session_id,status")
      .in("session_id", ids)
      .limit(CHILD_LIMIT);

    for (const row of sets ?? []) {
      if (row.status !== "concluida" && row.status !== "falhou") continue;
      countBySession.set(row.session_id, (countBySession.get(row.session_id) ?? 0) + 1);
    }
  }

  return (sessions ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    sessionDate: row.session_date,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    workoutName: row.workout_name_snapshot,
    workoutId: row.workout_id,
    totalSeconds: row.total_seconds,
    setCount: countBySession.get(row.id) ?? 0,
  }));
}

/* ═══════════════════════════ Histórico para "última vez" ═══════════════════════════ */

import type { HistorySet } from "./previous";

/**
 * As séries já executadas de um conjunto de exercícios.
 *
 * Lê SÓ as tabelas da sessão: o `exercise_id` é referência informativa e o nome vem do
 * snapshot, então uma sessão de um exercício excluído do catálogo continua entrando no
 * histórico com o nome que tinha.
 */
export async function getExerciseHistory(
  exerciseIds: string[],
  options: { limitSessions?: number; excludeSessionId?: string | null } = {},
): Promise<HistorySet[]> {
  if (exerciseIds.length === 0) return [];
  const supabase = await createClient();

  const { data: exerciseRows } = await supabase
    .from("training_session_exercises")
    .select("id,session_id,exercise_id,exercise_name_snapshot")
    .in("exercise_id", exerciseIds)
    .limit(CHILD_LIMIT);

  if (!exerciseRows?.length) return [];

  const sessionIds = [...new Set(exerciseRows.map((row) => row.session_id))];

  const [sessionsRes, setsRes] = await Promise.all([
    supabase
      .from("training_sessions")
      .select("id,session_date,workout_id,body_weight_kg,status")
      .in("id", sessionIds)
      .order("session_date", { ascending: false })
      .limit(options.limitSessions ?? 200),
    supabase
      .from("training_session_sets")
      .select(
        "session_exercise_id,set_number,status,reps,weight_kg,additional_weight_kg,assistance_weight_kg,duration_seconds,distance_m,rir,rpe,difficulty,is_warmup",
      )
      .in(
        "session_exercise_id",
        exerciseRows.map((row) => row.id),
      )
      .limit(CHILD_LIMIT),
  ]);

  const sessionById = new Map((sessionsRes.data ?? []).map((row) => [row.id, row]));
  const exerciseById = new Map(exerciseRows.map((row) => [row.id, row]));

  const history: HistorySet[] = [];
  for (const row of setsRes.data ?? []) {
    const exercise = exerciseById.get(row.session_exercise_id);
    if (!exercise) continue;
    const session = sessionById.get(exercise.session_id);
    // Sessão cancelada não é execução: não conta como "última vez".
    if (!session || session.status === "cancelada") continue;
    if (options.excludeSessionId && session.id === options.excludeSessionId) continue;

    history.push({
      sessionId: session.id,
      sessionDate: session.session_date,
      workoutId: session.workout_id,
      exerciseId: exercise.exercise_id,
      exerciseName: exercise.exercise_name_snapshot,
      setNumber: row.set_number,
      status: asSessionSetStatus(row.status),
      reps: row.reps,
      weightKg: num(row.weight_kg),
      additionalWeightKg: num(row.additional_weight_kg),
      assistanceWeightKg: num(row.assistance_weight_kg),
      durationSeconds: row.duration_seconds,
      distanceM: num(row.distance_m),
      rir: row.rir,
      rpe: num(row.rpe),
      difficulty: row.difficulty,
      restSeconds: null,
      isWarmup: row.is_warmup,
      bodyWeightKg: num(session.body_weight_kg),
    });
  }

  return history;
}

/* ═══════════════════════════ Linha do tempo ═══════════════════════════ */

export async function getSessionEvents(sessionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_session_events")
    .select("id,kind,occurred_at,session_exercise_id,session_set_id,description")
    .eq("session_id", sessionId)
    .order("occurred_at", { ascending: true })
    .limit(CHILD_LIMIT);

  return (data ?? []).map((row) => ({
    id: row.id,
    kind: asSessionEventKind(row.kind),
    occurredAt: row.occurred_at,
    sessionExerciseId: row.session_exercise_id,
    sessionSetId: row.session_set_id,
    description: row.description,
  }));
}
