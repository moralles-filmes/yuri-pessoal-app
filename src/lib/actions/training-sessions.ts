"use server";

/**
 * Fase 17-C — Treinos · Server Actions da sessão ao vivo.
 *
 * ═══════════════════ CINCO REGRAS PRÓPRIAS DESTA CAMADA ═══════════════════
 *
 * 1. **O SNAPSHOT É CONGELADO NO `startSession`.** A partir dali nenhuma action lê
 *    `training_workouts` para nada relacionado a esta sessão. Editar o modelo depois não
 *    reescreve o passado — é a regra que a subfase inteira existe para garantir.
 *
 * 2. **O ESTADO PASSA PELA MÁQUINA.** Nenhuma action grava `status` direto: toda mudança passa
 *    por `transitionSession` (`session-machine.ts`), que recusa com motivo em pt-BR. Uma
 *    mutação atrasada da fila local que chega depois do fim é recusada, não aplicada por cima.
 *
 * 3. **IDEMPOTÊNCIA POR `client_mutation_id`.** Antes de aplicar, a action pergunta se aquela
 *    mutação já foi aplicada nesta sessão. Clique duplo, retry da fila e duas abas convergem
 *    para uma linha — e um retry atrasado não desfaz uma edição posterior.
 *
 * 4. **OS TEMPOS NASCEM NO SERVIDOR.** `started_at`, `ended_at` e os totais vêm de `Date.now()`
 *    aqui; o cliente nunca envia instante. Um celular com o relógio adiantado não reescreve a
 *    duração do treino. O "dia" é `hojeISO()` (Brasília), nunca `toISOString().slice(0,10)`.
 *
 * 5. **NADA É ENCERRADO EM SILÊNCIO.** Descartar exige `confirm: true` no schema; finalizar com
 *    série em andamento exige confirmação; reabrir sessão concluída exige confirmação.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { hojeISO } from "@/lib/format";
import {
  TRAINING_BASE_PATH,
  asSessionExerciseStatus,
  asSessionSetStatus,
  asSessionStatus,
  type SessionEventKind,
  type SessionStatus,
} from "@/lib/training/constants";
import {
  RUNNING_SESSION_STATUSES,
  acceptsSetWrites,
  canFinishSession,
  canStartNewSession,
  canStartRest,
  isSessionDraft,
  transitionExercise,
  transitionSession,
  transitionSet,
} from "@/lib/training/session-machine";
import {
  applyExecutedOrder,
  makeNext,
  moveExercise,
  moveToEnd,
  type Reorderable,
} from "@/lib/training/session-flow";
import {
  applyPreparation,
  buildWorkoutSnapshot,
  emptyWorkoutSnapshot,
  parseWorkoutSnapshot,
  snapshotExerciseRow,
  snapshotSetRow,
  type PreparationAdjustment,
  type SnapshotSource,
  type SnapshotSourceExercise,
  type WorkoutSnapshot,
} from "@/lib/training/session-snapshot";
import { adjustRest, sessionTimes } from "@/lib/training/timers";
import { getWorkout } from "@/lib/training/routine-queries";
import { getTrainingPreferences } from "@/lib/training/queries";
import {
  syncPersonalRecords,
  syncProgressionSuggestions,
} from "@/lib/training/records-sync";
import {
  exerciseAddSchema,
  exerciseMoveSchema,
  exerciseReorderSchema,
  exerciseStatusSchema,
  exerciseSubstituteSchema,
  restAdjustSchema,
  restEndSchema,
  restStartSchema,
  sessionAbandonSchema,
  sessionCreateSchema,
  sessionFinishSchema,
  sessionPauseSchema,
  sessionPrepareSchema,
  sessionReopenSchema,
  sessionResumeSchema,
  sessionStartSchema,
  setAddSchema,
  setDeleteSchema,
  setRecordSchema,
} from "@/lib/validators/training-session";
import type { ActionResult } from "@/types/finance";

const SESSION_PATH = `${TRAINING_BASE_PATH}/sessao`;

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

function revalidateSession() {
  revalidatePath(TRAINING_BASE_PATH);
  revalidatePath(SESSION_PATH);
  revalidatePath(`${SESSION_PATH}/preparar`);
  revalidatePath(`${SESSION_PATH}/revisar`);
  revalidatePath(`${TRAINING_BASE_PATH}/hoje`);
  revalidatePath(`${TRAINING_BASE_PATH}/calendario`);
}

/* ───────────────────────────── Utilitários internos ───────────────────────────── */

const nowIso = () => new Date().toISOString();

/** Linha do tempo append-only. Falha de evento nunca derruba a ação principal. */
async function logEvent(
  ctx: Ctx,
  sessionId: string,
  kind: SessionEventKind,
  extra: {
    description?: string | null;
    sessionExerciseId?: string | null;
    sessionSetId?: string | null;
    payload?: Record<string, string | number | boolean | null>;
  } = {},
) {
  await ctx.supabase.from("training_session_events").insert({
    user_id: ctx.userId,
    session_id: sessionId,
    kind,
    description: extra.description ?? null,
    session_exercise_id: extra.sessionExerciseId ?? null,
    session_set_id: extra.sessionSetId ?? null,
    payload: extra.payload ?? {},
  });
}

/** A sessão, com o mínimo para decidir. `null` quando não é do usuário (a RLS já filtra). */
async function loadSession(ctx: Ctx, id: string) {
  const { data } = await ctx.supabase
    .from("training_sessions")
    .select(
      "id,status,started_at,ended_at,session_date,workout_id,scheduled_workout_id,default_rest_seconds,auto_advance,workout_snapshot,workout_name_snapshot",
    )
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data;
}

/** Aplica a transição pela máquina de estados e grava. */
async function applyStatus(
  ctx: Ctx,
  sessionId: string,
  from: SessionStatus,
  to: SessionStatus,
  patch: Record<string, unknown> = {},
  options: { explicit?: boolean } = {},
): Promise<ActionResult<null>> {
  const transition = transitionSession(from, to, options);
  if (!transition.ok) return { ok: false, error: transition.message };

  const { error } = await ctx.supabase
    .from("training_sessions")
    .update({ status: transition.state, ...patch })
    .eq("id", sessionId)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível atualizar o treino.");
  return { ok: true, data: null };
}

/* ═══════════════════════════ Montagem do snapshot ═══════════════════════════ */

/**
 * O treino-modelo virado em fonte de snapshot.
 *
 * ⚠️ Esta é a **única** leitura do modelo em toda a 17-C, e ela acontece **antes** de a sessão
 * começar. Depois do `startSession`, nada mais volta aqui.
 */
async function sourceFromWorkout(
  ctx: Ctx,
  workoutId: string,
  defaultRestSeconds: number,
): Promise<SnapshotSource | null> {
  const workout = await getWorkout(workoutId);
  if (!workout) return null;

  const exerciseIds = [...new Set(workout.exercises.map((item) => item.exerciseId))];
  const patternByExercise = new Map<string, string | null>();
  if (exerciseIds.length > 0) {
    const { data } = await ctx.supabase
      .from("training_exercises")
      .select("id,movement_pattern")
      .in("id", exerciseIds);
    for (const row of data ?? []) patternByExercise.set(row.id, row.movement_pattern);
  }

  return {
    workoutId: workout.id,
    workoutName: workout.name,
    workoutShortName: workout.shortName,
    workoutVersion: workout.version,
    programId: workout.programId,
    programName: workout.programName,
    defaultRestSeconds,
    exercises: workout.exercises.map<SnapshotSourceExercise>((item) => ({
      id: item.id,
      exerciseId: item.exerciseId,
      workoutExerciseId: item.id,
      exerciseName: item.exerciseName,
      trackingType: item.trackingType,
      laterality: item.laterality,
      muscleGroup: item.primaryMuscleGroupName,
      equipment: item.equipmentName,
      movementPattern: patternByExercise.get(item.exerciseId) ?? null,
      plannedPosition: item.position,
      supersetGroup: item.supersetGroup,
      technique: item.technique,
      incrementKg: item.incrementKg,
      defaultSets: item.defaultSets,
      targetRepsMin: item.targetRepsMin,
      targetRepsMax: item.targetRepsMax,
      targetDurationSeconds: item.targetDurationSeconds,
      targetDistanceM: item.targetDistanceM,
      plannedWeightKg: item.plannedWeightKg,
      plannedAdditionalWeightKg: item.plannedAdditionalWeightKg,
      plannedAssistanceWeightKg: item.plannedAssistanceWeightKg,
      restSeconds: item.restSeconds,
      targetRir: item.targetRir,
      targetRpe: item.targetRpe,
      setType: item.setType,
      isWarmup: item.isWarmup,
      countsInVolume: item.countsInVolume,
      notes: item.notes,
      sets: item.sets,
    })),
  };
}

/**
 * Uma sessão passada virada em fonte de snapshot ("repetir o último", "duplicar sessão").
 *
 * A fonte aqui é EXECUÇÃO, não modelo: o que virou plano de hoje é o que foi de fato feito lá.
 * Nenhuma linha do treino-modelo é consultada — inclusive porque o modelo pode nem existir mais.
 */
async function sourceFromSession(
  ctx: Ctx,
  sessionId: string,
  defaultRestSeconds: number,
): Promise<SnapshotSource | null> {
  const { data: session } = await ctx.supabase
    .from("training_sessions")
    .select("id,workout_id,program_id,workout_name_snapshot,workout_short_name_snapshot,program_name_snapshot,workout_version")
    .eq("id", sessionId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!session) return null;

  const [exercisesRes, setsRes] = await Promise.all([
    ctx.supabase
      .from("training_session_exercises")
      .select(
        "id,exercise_id,workout_exercise_id,executed_position,status,exercise_name_snapshot,tracking_type,laterality,muscle_group_snapshot,equipment_snapshot,movement_pattern_snapshot,superset_group,technique,is_warmup,counts_in_volume,rest_seconds,increment_kg,notes",
      )
      .eq("session_id", sessionId)
      .order("executed_position", { ascending: true }),
    ctx.supabase
      .from("training_session_sets")
      .select(
        "session_exercise_id,set_number,set_type,status,reps,weight_kg,additional_weight_kg,assistance_weight_kg,duration_seconds,distance_m,rir,rpe,is_warmup,counts_in_volume,planned_rest_seconds,planned_reps_min,planned_reps_max",
      )
      .eq("session_id", sessionId)
      .order("set_number", { ascending: true }),
  ]);

  const setsByExercise = new Map<string, typeof setsRes.data>();
  for (const row of setsRes.data ?? []) {
    const list = setsByExercise.get(row.session_exercise_id) ?? [];
    list!.push(row);
    setsByExercise.set(row.session_exercise_id, list);
  }

  const exercises = (exercisesRes.data ?? [])
    // Exercício substituído não volta: quem voltou foi o substituto, que está na lista.
    .filter((row) => row.status !== "substituido")
    .map<SnapshotSourceExercise>((row, index) => {
      const sets = (setsByExercise.get(row.id) ?? []).filter(
        (set) => set.status === "concluida" || set.status === "falhou",
      );

      return {
        id: row.id,
        exerciseId: row.exercise_id,
        workoutExerciseId: row.workout_exercise_id,
        exerciseName: row.exercise_name_snapshot,
        trackingType: row.tracking_type as SnapshotSourceExercise["trackingType"],
        laterality: row.laterality as SnapshotSourceExercise["laterality"],
        muscleGroup: row.muscle_group_snapshot,
        equipment: row.equipment_snapshot,
        movementPattern: row.movement_pattern_snapshot,
        plannedPosition: index,
        supersetGroup: row.superset_group,
        technique: row.technique as SnapshotSourceExercise["technique"],
        incrementKg: row.increment_kg === null ? null : Number(row.increment_kg),
        defaultSets: Math.max(1, sets.length),
        targetRepsMin: null,
        targetRepsMax: null,
        targetDurationSeconds: null,
        targetDistanceM: null,
        plannedWeightKg: null,
        plannedAdditionalWeightKg: null,
        plannedAssistanceWeightKg: null,
        restSeconds: row.rest_seconds,
        targetRir: null,
        targetRpe: null,
        setType: "trabalho",
        isWarmup: row.is_warmup,
        countsInVolume: row.counts_in_volume,
        notes: row.notes,
        // O que foi EXECUTADO vira o planejado de hoje — sugestão editável, nada aplicado sozinho.
        sets: sets.map((set, setIndex) => ({
          setNumber: setIndex + 1,
          setType: set.set_type as SnapshotSourceExercise["setType"],
          targetRepsMin: set.reps ?? set.planned_reps_min,
          targetRepsMax: set.reps ?? set.planned_reps_max,
          targetDurationSeconds: set.duration_seconds,
          targetDistanceM: set.distance_m === null ? null : Number(set.distance_m),
          plannedWeightKg: set.weight_kg === null ? null : Number(set.weight_kg),
          plannedAdditionalWeightKg:
            set.additional_weight_kg === null ? null : Number(set.additional_weight_kg),
          plannedAssistanceWeightKg:
            set.assistance_weight_kg === null ? null : Number(set.assistance_weight_kg),
          restSeconds: set.planned_rest_seconds,
          targetRir: set.rir,
          targetRpe: set.rpe === null ? null : Number(set.rpe),
          isWarmup: set.is_warmup,
          countsInVolume: set.counts_in_volume,
          notes: null,
        })),
      };
    })
    .filter((exercise) => exercise.sets && exercise.sets.length > 0);

  return {
    workoutId: session.workout_id,
    workoutName: session.workout_name_snapshot,
    workoutShortName: session.workout_short_name_snapshot,
    workoutVersion: session.workout_version,
    programId: session.program_id,
    programName: session.program_name_snapshot,
    defaultRestSeconds,
    exercises,
  };
}

/* ═══════════════════════════ Preparação ═══════════════════════════ */

/**
 * Cria o rascunho da sessão (etapa 1 da preparação).
 *
 * O snapshot já é montado aqui para a etapa 2 poder revisar o que será congelado — mas ele só
 * vira fato ao iniciar. Enquanto a sessão é rascunho, reconstruir a partir do modelo é legítimo:
 * ainda não há execução para proteger.
 */
export async function createSession(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = sessionCreateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const preferences = await getTrainingPreferences();
  const defaultRest = data.default_rest_seconds ?? preferences.defaultRestSeconds;

  let source: SnapshotSource | null = null;
  let snapshot: WorkoutSnapshot;

  if (data.origin_kind === "vazio") {
    snapshot = emptyWorkoutSnapshot(data.title ?? "Treino livre", {
      defaultRestSeconds: defaultRest,
    });
  } else if (data.origin_kind === "repetir" || data.origin_kind === "duplicar") {
    const sourceId =
      data.source_session_id ?? (await lastFinishedSessionId(ctx));
    if (!sourceId) {
      return dbError("Não há sessão anterior para repetir. Escolha um treino cadastrado.");
    }
    source = await sourceFromSession(ctx, sourceId, defaultRest);
    if (!source) return dbError("Não foi possível ler a sessão escolhida.");
    if (source.exercises.length === 0) {
      return dbError("A sessão escolhida não tem série registrada para repetir.");
    }
    snapshot = buildWorkoutSnapshot(source);
  } else {
    if (!data.workout_id) return invalid({ workout_id: ["Escolha o treino"] });
    source = await sourceFromWorkout(ctx, data.workout_id, defaultRest);
    if (!source) return dbError("Treino não encontrado.");
    snapshot = buildWorkoutSnapshot(source);
  }

  if (data.title) snapshot = { ...snapshot, workoutName: data.title };

  const { data: created, error } = await ctx.supabase
    .from("training_sessions")
    .insert({
      user_id: ctx.userId,
      status: "rascunho",
      origin_kind: data.origin_kind,
      workout_id: snapshot.workoutId,
      program_id: snapshot.programId,
      scheduled_workout_id: data.scheduled_workout_id,
      location_id: data.location_id ?? (await defaultLocationId(ctx)),
      session_date: data.session_date ?? hojeISO(),
      workout_name_snapshot: snapshot.workoutName,
      workout_short_name_snapshot: snapshot.workoutShortName,
      workout_version: snapshot.workoutVersion,
      program_name_snapshot: snapshot.programName,
      workout_snapshot: snapshot,
      default_rest_seconds: defaultRest,
      auto_advance: data.auto_advance ?? preferences.autoAdvance,
      sound_enabled: data.sound_enabled ?? preferences.restSoundEnabled,
      vibration_enabled: data.vibration_enabled ?? preferences.restVibrationEnabled,
      keep_screen_awake: data.keep_screen_awake ?? preferences.keepScreenAwake,
      weight_unit: data.weight_unit ?? preferences.weightUnit,
      body_weight_kg: data.body_weight_kg,
      energy_level: data.energy_level,
      mood_level: data.mood_level,
      sleep_quality: data.sleep_quality,
      soreness_level: data.soreness_level,
      pre_notes: data.pre_notes,
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível preparar o treino.");

  revalidateSession();
  return { ok: true, data: { id: created.id } };
}

async function lastFinishedSessionId(ctx: Ctx): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("training_sessions")
    .select("id")
    .eq("user_id", ctx.userId)
    .in("status", ["concluida", "abandonada"])
    .order("session_date", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

async function defaultLocationId(ctx: Ctx): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("training_locations")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("is_default", true)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Etapa 2 da preparação: revisar e ajustar antes de começar.
 *
 * Os ajustes valem SÓ para a sessão de hoje. O treino-modelo não é tocado — quem quer mudar o
 * modelo faz isso no construtor (17-B), e a diferença entre as duas coisas é intencional.
 */
export async function updateSessionPreparation(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = sessionPrepareSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const session = await loadSession(ctx, data.id);
  if (!session) return dbError("Sessão não encontrada.");
  if (!isSessionDraft(asSessionStatus(session.status))) {
    return { ok: false, error: "Este treino já começou. Os ajustes agora são feitos na tela do treino." };
  }

  const current = parseWorkoutSnapshot(session.workout_snapshot);
  if (!current) return dbError("Não foi possível ler a preparação do treino.");

  const defaultRest = data.default_rest_seconds ?? current.defaultRestSeconds;
  let snapshot = current;

  if (data.adjustments?.length) {
    // Reconstrói a partir do snapshot atual (e não do modelo): a etapa 2 pode ser reaberta
    // várias vezes, e cada passagem tem de partir do que o usuário já ajustou.
    const asSource: SnapshotSourceExercise[] = current.exercises.map((exercise) => ({
      id: exercise.workoutExerciseId ?? `${exercise.plannedPosition}`,
      exerciseId: exercise.exerciseId,
      workoutExerciseId: exercise.workoutExerciseId,
      exerciseName: exercise.exerciseName,
      trackingType: exercise.trackingType,
      laterality: exercise.laterality,
      muscleGroup: exercise.muscleGroup,
      equipment: exercise.equipment,
      movementPattern: exercise.movementPattern,
      plannedPosition: exercise.plannedPosition,
      supersetGroup: exercise.supersetGroup,
      technique: exercise.technique,
      incrementKg: exercise.incrementKg,
      defaultSets: exercise.sets.length || 1,
      targetRepsMin: null,
      targetRepsMax: null,
      targetDurationSeconds: null,
      targetDistanceM: null,
      plannedWeightKg: null,
      plannedAdditionalWeightKg: null,
      plannedAssistanceWeightKg: null,
      restSeconds: exercise.restSeconds,
      targetRir: null,
      targetRpe: null,
      setType: exercise.sets[0]?.setType ?? "trabalho",
      isWarmup: exercise.isWarmup,
      countsInVolume: exercise.countsInVolume,
      notes: exercise.notes,
      sets: exercise.sets,
    }));

    const adjustments: PreparationAdjustment[] = data.adjustments.map((adjustment) => ({
      key: adjustment.key,
      include: adjustment.include,
      position: adjustment.position ?? undefined,
      supersetGroup: adjustment.superset_group,
      restSeconds: adjustment.rest_seconds,
      notes: adjustment.notes,
      sets: adjustment.sets?.map((set) => ({
        setType: set.set_type,
        targetRepsMin: set.target_reps_min,
        targetRepsMax: set.target_reps_max,
        targetDurationSeconds: set.target_duration_seconds,
        targetDistanceM: set.target_distance_m,
        plannedWeightKg: set.planned_weight_kg,
        plannedAdditionalWeightKg: set.planned_additional_weight_kg,
        plannedAssistanceWeightKg: set.planned_assistance_weight_kg,
        restSeconds: set.rest_seconds,
        targetRir: set.target_rir,
        targetRpe: set.target_rpe,
        isWarmup: set.is_warmup,
        countsInVolume: set.counts_in_volume,
        notes: set.notes,
      })),
    }));

    snapshot = buildWorkoutSnapshot({
      workoutId: current.workoutId,
      workoutName: data.title ?? current.workoutName,
      workoutShortName: current.workoutShortName,
      workoutVersion: current.workoutVersion,
      programId: current.programId,
      programName: current.programName,
      defaultRestSeconds: defaultRest,
      exercises: applyPreparation(asSource, adjustments),
    });
  } else if (data.title) {
    snapshot = { ...current, workoutName: data.title, defaultRestSeconds: defaultRest };
  } else {
    snapshot = { ...current, defaultRestSeconds: defaultRest };
  }

  const { error } = await ctx.supabase
    .from("training_sessions")
    .update({
      status: "pronta",
      workout_name_snapshot: snapshot.workoutName,
      workout_snapshot: snapshot,
      location_id: data.location_id,
      default_rest_seconds: defaultRest,
      auto_advance: data.auto_advance,
      sound_enabled: data.sound_enabled,
      vibration_enabled: data.vibration_enabled,
      keep_screen_awake: data.keep_screen_awake,
      weight_unit: data.weight_unit,
      body_weight_kg: data.body_weight_kg,
      energy_level: data.energy_level,
      mood_level: data.mood_level,
      sleep_quality: data.sleep_quality,
      soreness_level: data.soreness_level,
      pre_notes: data.pre_notes,
    })
    .eq("id", data.id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível salvar a preparação.");

  revalidateSession();
  return { ok: true, data: null };
}

/* ═══════════════════════════ Iniciar ═══════════════════════════ */

/**
 * ⛔ AQUI O TREINO É CONGELADO.
 *
 * O `workout_snapshot` vira linhas de `training_session_exercises` + `training_session_sets`.
 * A partir deste ponto, nenhuma leitura desta sessão passa pelo treino-modelo.
 */
export async function startSession(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = sessionStartSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, discard_running } = parsed.data;

  const session = await loadSession(ctx, id);
  if (!session) return dbError("Sessão não encontrada.");

  const status = asSessionStatus(session.status);
  if (!isSessionDraft(status)) {
    return { ok: false, error: "Este treino já foi iniciado." };
  }

  // NUNCA DUAS SESSÕES EM EXECUÇÃO. A recusa oferece saída, não é uma parede.
  const { data: running } = await ctx.supabase
    .from("training_sessions")
    .select("id")
    .eq("user_id", ctx.userId)
    .in("status", [...RUNNING_SESSION_STATUSES]);

  const others = (running ?? []).filter((row) => row.id !== id);
  if (others.length > 0) {
    if (!discard_running) {
      const guard = canStartNewSession(others.length);
      return { ok: false, error: guard.message ?? "Já existe um treino em andamento." };
    }
    // Escolha explícita do usuário: a anterior é encerrada como abandonada, com registro.
    for (const other of others) {
      await finalizeTimes(ctx, other.id, "abandonada");
      await logEvent(ctx, other.id, "sessao_abandonada", {
        description: "Encerrado ao iniciar outro treino.",
      });
    }
  }

  const snapshot = parseWorkoutSnapshot(session.workout_snapshot);
  if (!snapshot) return dbError("Não foi possível ler a preparação do treino.");

  const startedAt = nowIso();

  const exerciseRows = snapshot.exercises.map((exercise) => ({
    user_id: ctx.userId,
    session_id: id,
    ...snapshotExerciseRow(exercise),
  }));

  if (exerciseRows.length > 0) {
    const { data: inserted, error } = await ctx.supabase
      .from("training_session_exercises")
      .insert(exerciseRows)
      .select("id,planned_position");

    if (error || !inserted) return dbError("Não foi possível preparar os exercícios do treino.");

    const idByPosition = new Map(inserted.map((row) => [row.planned_position, row.id]));

    const setRows = snapshot.exercises.flatMap((exercise) => {
      const sessionExerciseId = idByPosition.get(exercise.plannedPosition);
      if (!sessionExerciseId) return [];
      return exercise.sets.map((set) => ({
        user_id: ctx.userId,
        session_id: id,
        session_exercise_id: sessionExerciseId,
        status: "pendente",
        // As linhas planejadas nascem com um identificador do servidor; os uuids do dispositivo
        // entram quando o usuário registra ou acrescenta uma série.
        client_mutation_id: crypto.randomUUID(),
        ...snapshotSetRow(set, snapshot.defaultRestSeconds),
      }));
    });

    if (setRows.length > 0) {
      const { error: setsError } = await ctx.supabase
        .from("training_session_sets")
        .insert(setRows);
      if (setsError) return dbError("Não foi possível preparar as séries do treino.");
    }
  }

  const result = await applyStatus(ctx, id, status, "ativa", {
    started_at: startedAt,
    // O dia do treino é o dia em que ele COMEÇOU, em Brasília.
    session_date: hojeISO(),
  });
  if (!result.ok) return result;

  await logEvent(ctx, id, "sessao_iniciada", {
    description: snapshot.workoutName,
    payload: { exercicios: snapshot.exercises.length },
  });

  revalidateSession();
  return { ok: true, data: { id } };
}

/* ═══════════════════════════ Registro de série ═══════════════════════════ */

/**
 * Registra (ou corrige) uma série.
 *
 * Idempotente: se aquele `client_mutation_id` já foi aplicado nesta sessão, a action devolve
 * sucesso sem tocar em nada. É isso que faz um retry atrasado da fila local não desfazer uma
 * correção posterior — e o clique duplo não virar duas gravações.
 */
export async function recordSet(input: unknown): Promise<ActionResult<{ applied: boolean }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = setRecordSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const session = await loadSession(ctx, data.session_id);
  if (!session) return dbError("Sessão não encontrada.");

  const status = asSessionStatus(session.status);
  if (!acceptsSetWrites(status)) {
    return { ok: false, error: "Este treino já foi encerrado." };
  }

  // Idempotência: a mesma mutação nunca é aplicada duas vezes.
  const { data: alreadyApplied } = await ctx.supabase
    .from("training_session_sets")
    .select("id")
    .eq("session_id", data.session_id)
    .eq("client_mutation_id", data.client_mutation_id)
    .maybeSingle();

  if (alreadyApplied) return { ok: true, data: { applied: false } };

  const { data: current } = await ctx.supabase
    .from("training_session_sets")
    .select("id,status,session_exercise_id,planned_rest_seconds")
    .eq("id", data.session_set_id)
    .eq("session_id", data.session_id)
    .maybeSingle();

  if (!current) return dbError("Série não encontrada.");

  const transition = transitionSet(asSessionSetStatus(current.status), data.status);
  if (!transition.ok) return { ok: false, error: transition.message };

  const isDone = data.status === "concluida" || data.status === "falhou";

  const { error } = await ctx.supabase
    .from("training_session_sets")
    .update({
      status: transition.state,
      client_mutation_id: data.client_mutation_id,
      reps: data.reps,
      weight_kg: data.weight_kg,
      additional_weight_kg: data.additional_weight_kg,
      assistance_weight_kg: data.assistance_weight_kg,
      duration_seconds: data.duration_seconds,
      distance_m: data.distance_m,
      calories: data.calories,
      incline_percent: data.incline_percent,
      resistance_level: data.resistance_level,
      reps_left: data.reps_left,
      reps_right: data.reps_right,
      weight_left_kg: data.weight_left_kg,
      weight_right_kg: data.weight_right_kg,
      rir: data.rir,
      rpe: data.rpe,
      difficulty: data.difficulty,
      ...(data.set_type ? { set_type: data.set_type } : {}),
      ...(data.is_warmup === undefined ? {} : { is_warmup: data.is_warmup }),
      ...(data.counts_in_volume === undefined ? {} : { counts_in_volume: data.counts_in_volume }),
      notes: data.notes,
      completed_at: isDone ? nowIso() : null,
    })
    .eq("id", data.session_set_id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível registrar a série.");

  // O exercício passa a "ativo" e marca quando começou — o tempo por exercício sai daí.
  await ctx.supabase
    .from("training_session_exercises")
    .update({ status: "ativo", started_at: nowIso() })
    .eq("id", current.session_exercise_id)
    .eq("user_id", ctx.userId)
    .is("started_at", null);

  await logEvent(
    ctx,
    data.session_id,
    data.status === "pulada" ? "serie_pulada" : "serie_registrada",
    { sessionSetId: data.session_set_id, sessionExerciseId: current.session_exercise_id },
  );

  if (data.start_rest && isDone) {
    await openRest(ctx, {
      sessionId: data.session_id,
      sessionExerciseId: current.session_exercise_id,
      sessionSetId: data.session_set_id,
      plannedSeconds: data.rest_seconds ?? current.planned_rest_seconds ?? session.default_rest_seconds,
      fromStatus: status,
    });
  }

  revalidateSession();
  return { ok: true, data: { applied: true } };
}

/** Acrescenta uma série ao exercício. Sempre ANEXA (max + 1): renumerar mudaria o já anotado. */
export async function addSet(input: unknown): Promise<ActionResult<{ id: string | null }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = setAddSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const session = await loadSession(ctx, data.session_id);
  if (!session) return dbError("Sessão não encontrada.");
  if (!acceptsSetWrites(asSessionStatus(session.status))) {
    return { ok: false, error: "Este treino já foi encerrado." };
  }

  const { data: alreadyApplied } = await ctx.supabase
    .from("training_session_sets")
    .select("id")
    .eq("session_id", data.session_id)
    .eq("client_mutation_id", data.client_mutation_id)
    .maybeSingle();

  if (alreadyApplied) return { ok: true, data: { id: alreadyApplied.id } };

  const { data: existing } = await ctx.supabase
    .from("training_session_sets")
    .select(
      "set_number,planned_reps_min,planned_reps_max,planned_weight_kg,planned_additional_weight_kg,planned_assistance_weight_kg,planned_duration_seconds,planned_distance_m,planned_rest_seconds,planned_rir,planned_rpe",
    )
    .eq("session_exercise_id", data.session_exercise_id)
    .order("set_number", { ascending: false });

  const last = existing?.[0];
  const nextNumber = (last?.set_number ?? 0) + 1;
  if (nextNumber > 100) return dbError("Limite de séries deste exercício atingido.");

  const { data: created, error } = await ctx.supabase
    .from("training_session_sets")
    .insert({
      user_id: ctx.userId,
      session_id: data.session_id,
      session_exercise_id: data.session_exercise_id,
      set_number: nextNumber,
      set_type: data.set_type ?? "trabalho",
      status: "pendente",
      client_mutation_id: data.client_mutation_id,
      // A série extra nasce com o alvo da última — sugestão editável, nada aplicado sozinho.
      planned_reps_min: last?.planned_reps_min ?? null,
      planned_reps_max: last?.planned_reps_max ?? null,
      planned_weight_kg: last?.planned_weight_kg ?? null,
      planned_additional_weight_kg: last?.planned_additional_weight_kg ?? null,
      planned_assistance_weight_kg: last?.planned_assistance_weight_kg ?? null,
      planned_duration_seconds: last?.planned_duration_seconds ?? null,
      planned_distance_m: last?.planned_distance_m ?? null,
      planned_rest_seconds: last?.planned_rest_seconds ?? session.default_rest_seconds,
      planned_rir: last?.planned_rir ?? null,
      planned_rpe: last?.planned_rpe ?? null,
      is_warmup: data.is_warmup ?? false,
      counts_in_volume: data.counts_in_volume ?? true,
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível adicionar a série.");

  await logEvent(ctx, data.session_id, "serie_adicionada", {
    sessionExerciseId: data.session_exercise_id,
    sessionSetId: created.id,
  });

  revalidateSession();
  return { ok: true, data: { id: created.id } };
}

/** Remove uma série. Só séries ainda não registradas — o que foi feito não some sem registro. */
export async function deleteSet(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = setDeleteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: current } = await ctx.supabase
    .from("training_session_sets")
    .select("id,status")
    .eq("id", data.session_set_id)
    .eq("session_id", data.session_id)
    .maybeSingle();

  if (!current) return dbError("Série não encontrada.");
  if (current.status === "concluida" || current.status === "falhou") {
    return {
      ok: false,
      error: "Esta série já foi registrada. Desfaça o registro antes de removê-la.",
    };
  }

  const { error } = await ctx.supabase
    .from("training_session_sets")
    .delete()
    .eq("id", data.session_set_id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível remover a série.");

  revalidateSession();
  return { ok: true, data: null };
}

/* ═══════════════════════════ Descanso ═══════════════════════════ */

async function openRest(
  ctx: Ctx,
  input: {
    sessionId: string;
    sessionExerciseId: string | null;
    sessionSetId: string | null;
    plannedSeconds: number;
    fromStatus: SessionStatus;
  },
): Promise<void> {
  // NUNCA DOIS DESCANSOS ATIVOS: o anterior é encerrado antes (o índice único também garante).
  await closeActiveRest(ctx, input.sessionId, "proxima_serie");

  await ctx.supabase.from("training_session_rests").insert({
    user_id: ctx.userId,
    session_id: input.sessionId,
    session_exercise_id: input.sessionExerciseId,
    session_set_id: input.sessionSetId,
    planned_seconds: Math.max(0, Math.min(3600, input.plannedSeconds)),
    started_at: nowIso(),
  });

  // Pausada continua pausada: começar um descanso não deve tirar o treino da pausa.
  if (input.fromStatus === "ativa" || input.fromStatus === "descansando") {
    await ctx.supabase
      .from("training_sessions")
      .update({ status: "descansando" })
      .eq("id", input.sessionId)
      .eq("user_id", ctx.userId);
  }

  await logEvent(ctx, input.sessionId, "descanso_iniciado", {
    sessionSetId: input.sessionSetId,
    payload: { planejado: input.plannedSeconds },
  });
}

/** Encerra o descanso aberto, gravando o tempo REAL (que pode ser maior ou menor). */
async function closeActiveRest(
  ctx: Ctx,
  sessionId: string,
  endKind: "natural" | "pulado" | "proxima_serie" | "cancelado",
): Promise<boolean> {
  const { data: active } = await ctx.supabase
    .from("training_session_rests")
    .select("id,started_at")
    .eq("session_id", sessionId)
    .is("ended_at", null)
    .maybeSingle();

  if (!active) return false;

  const endedAt = new Date();
  const actual = Math.max(
    0,
    Math.floor((endedAt.getTime() - Date.parse(active.started_at)) / 1000),
  );

  await ctx.supabase
    .from("training_session_rests")
    .update({
      ended_at: endedAt.toISOString(),
      actual_seconds: actual,
      end_kind: endKind,
    })
    .eq("id", active.id)
    .eq("user_id", ctx.userId);

  return true;
}

export async function startRest(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = restStartSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const session = await loadSession(ctx, data.session_id);
  if (!session) return dbError("Sessão não encontrada.");

  const status = asSessionStatus(session.status);
  if (!acceptsSetWrites(status)) return { ok: false, error: "Este treino já foi encerrado." };

  let setStatus: string | null = null;
  if (data.session_set_id) {
    const { data: set } = await ctx.supabase
      .from("training_session_sets")
      .select("status")
      .eq("id", data.session_set_id)
      .eq("session_id", data.session_id)
      .maybeSingle();
    setStatus = set?.status ?? null;
  }

  const guard = canStartRest(setStatus ? asSessionSetStatus(setStatus) : null, {
    explicit: data.explicit,
  });
  if (!guard.allowed) return { ok: false, error: guard.message ?? "Não foi possível descansar." };

  await openRest(ctx, {
    sessionId: data.session_id,
    sessionExerciseId: data.session_exercise_id,
    sessionSetId: data.session_set_id,
    plannedSeconds: data.planned_seconds,
    fromStatus: status,
  });

  revalidateSession();
  return { ok: true, data: null };
}

/** +15s / +30s / −15s. Reduzir abaixo do já decorrido ENCERRA em vez de criar alvo no passado. */
export async function adjustActiveRest(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = restAdjustSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { session_id, delta_seconds } = parsed.data;

  const { data: active } = await ctx.supabase
    .from("training_session_rests")
    .select("id,started_at,planned_seconds,adjustment_seconds")
    .eq("session_id", session_id)
    .is("ended_at", null)
    .maybeSingle();

  if (!active) return { ok: false, error: "Não há descanso em andamento." };

  const result = adjustRest(
    {
      startedAt: active.started_at,
      plannedSeconds: active.planned_seconds,
      adjustmentSeconds: active.adjustment_seconds,
    },
    delta_seconds,
    Date.now(),
  );

  if (result.endsNow) return endRest({ session_id, end_kind: "natural" });

  const { error } = await ctx.supabase
    .from("training_session_rests")
    .update({ adjustment_seconds: Math.round(result.adjustmentSeconds) })
    .eq("id", active.id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível ajustar o descanso.");

  await logEvent(ctx, session_id, "descanso_ajustado", {
    payload: { delta: delta_seconds, alvo: result.targetSeconds },
  });

  revalidateSession();
  return { ok: true, data: null };
}

export async function endRest(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = restEndSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { session_id, end_kind } = parsed.data;

  const session = await loadSession(ctx, session_id);
  if (!session) return dbError("Sessão não encontrada.");

  const closed = await closeActiveRest(ctx, session_id, end_kind);
  if (!closed) return { ok: true, data: null };

  const status = asSessionStatus(session.status);
  if (status === "descansando") {
    const result = await applyStatus(ctx, session_id, status, "ativa");
    if (!result.ok) return result;
  }

  await logEvent(ctx, session_id, "descanso_encerrado", { payload: { motivo: end_kind } });

  revalidateSession();
  return { ok: true, data: null };
}

/* ═══════════════════════════ Exercícios durante a sessão ═══════════════════════════ */

async function loadOrderable(ctx: Ctx, sessionId: string): Promise<Reorderable[]> {
  const { data } = await ctx.supabase
    .from("training_session_exercises")
    .select("id,executed_position")
    .eq("session_id", sessionId)
    .order("executed_position", { ascending: true });

  return (data ?? []).map((row) => ({ id: row.id, executedPosition: row.executed_position }));
}

/**
 * Grava a nova ordem.
 *
 * ⚠️ Só `executed_position` muda. `planned_position` fica intacta e as séries continuam
 * penduradas no exercício — reordenar nunca perde nada.
 */
async function persistOrder(
  ctx: Ctx,
  sessionId: string,
  ordered: Reorderable[],
): Promise<boolean> {
  for (const item of ordered) {
    const { error } = await ctx.supabase
      .from("training_session_exercises")
      .update({ executed_position: item.executedPosition })
      .eq("id", item.id)
      .eq("session_id", sessionId)
      .eq("user_id", ctx.userId);
    if (error) return false;
  }
  return true;
}

export async function reorderSessionExercises(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = exerciseReorderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { session_id, ordered_ids } = parsed.data;

  const current = await loadOrderable(ctx, session_id);
  if (current.length === 0) return dbError("Sessão sem exercícios.");

  const ordered = applyExecutedOrder(current, ordered_ids);
  if (!(await persistOrder(ctx, session_id, ordered))) {
    return dbError("Não foi possível reordenar.");
  }

  await logEvent(ctx, session_id, "exercicio_reordenado");
  revalidateSession();
  return { ok: true, data: null };
}

export async function moveSessionExercise(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = exerciseMoveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { session_id, session_exercise_id, mode, current_exercise_id } = parsed.data;

  const current = await loadOrderable(ctx, session_id);
  if (current.length === 0) return dbError("Sessão sem exercícios.");

  const ordered =
    mode === "proximo"
      ? makeNext(current, session_exercise_id, current_exercise_id ?? null)
      : mode === "fim"
        ? moveToEnd(current, session_exercise_id)
        : moveExercise(current, session_exercise_id, mode === "cima" ? -1 : 1);

  if (!(await persistOrder(ctx, session_id, ordered))) {
    return dbError("Não foi possível mover o exercício.");
  }

  await logEvent(ctx, session_id, "exercicio_reordenado", {
    sessionExerciseId: session_exercise_id,
    payload: { modo: mode },
  });

  revalidateSession();
  return { ok: true, data: null };
}

/** Pular ou retomar um exercício. As séries registradas ficam onde estão. */
export async function setSessionExerciseStatus(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = exerciseStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { session_id, session_exercise_id, status, reason } = parsed.data;

  const { data: current } = await ctx.supabase
    .from("training_session_exercises")
    .select("id,status")
    .eq("id", session_exercise_id)
    .eq("session_id", session_id)
    .maybeSingle();

  if (!current) return dbError("Exercício não encontrado.");

  const transition = transitionExercise(asSessionExerciseStatus(current.status), status);
  if (!transition.ok) return { ok: false, error: transition.message };

  const { error } = await ctx.supabase
    .from("training_session_exercises")
    .update({
      status: transition.state,
      skip_reason: status === "pulado" ? reason : null,
    })
    .eq("id", session_exercise_id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível atualizar o exercício.");

  await logEvent(
    ctx,
    session_id,
    status === "pulado" ? "exercicio_pulado" : "exercicio_retomado",
    { sessionExerciseId: session_exercise_id, description: reason },
  );

  revalidateSession();
  return { ok: true, data: null };
}

/** Monta a identidade congelada de um exercício do catálogo. */
async function snapshotSourceFromCatalog(
  ctx: Ctx,
  exerciseId: string,
): Promise<SnapshotSourceExercise | null> {
  const { data: exercise } = await ctx.supabase
    .from("training_exercises")
    .select(
      "id,name,tracking_type,laterality,movement_pattern,primary_muscle_group_id,equipment_id,default_rest_seconds,default_increment_kg",
    )
    .eq("id", exerciseId)
    .maybeSingle();

  if (!exercise) return null;

  const [groupRes, equipRes] = await Promise.all([
    ctx.supabase
      .from("training_muscle_groups")
      .select("name")
      .eq("id", exercise.primary_muscle_group_id)
      .maybeSingle(),
    exercise.equipment_id
      ? ctx.supabase
          .from("training_equipment")
          .select("name")
          .eq("id", exercise.equipment_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    id: exercise.id,
    exerciseId: exercise.id,
    workoutExerciseId: null,
    exerciseName: exercise.name,
    trackingType: exercise.tracking_type as SnapshotSourceExercise["trackingType"],
    laterality: exercise.laterality as SnapshotSourceExercise["laterality"],
    muscleGroup: (groupRes.data as { name: string } | null)?.name ?? null,
    equipment: (equipRes.data as { name: string } | null)?.name ?? null,
    movementPattern: exercise.movement_pattern,
    plannedPosition: 0,
    supersetGroup: null,
    technique: null,
    incrementKg:
      exercise.default_increment_kg === null ? null : Number(exercise.default_increment_kg),
    defaultSets: 3,
    targetRepsMin: null,
    targetRepsMax: null,
    targetDurationSeconds: null,
    targetDistanceM: null,
    plannedWeightKg: null,
    plannedAdditionalWeightKg: null,
    plannedAssistanceWeightKg: null,
    restSeconds: exercise.default_rest_seconds,
    targetRir: null,
    targetRpe: null,
    setType: "trabalho",
    isWarmup: false,
    countsInVolume: true,
    notes: null,
  };
}

/** Insere um exercício + suas séries na sessão, já congelados. */
async function insertSessionExercise(
  ctx: Ctx,
  sessionId: string,
  source: SnapshotSourceExercise,
  options: {
    defaultRestSeconds: number;
    executedPosition: number;
    plannedPosition: number;
    isExtra: boolean;
    replacedSessionExerciseId?: string | null;
  },
): Promise<string | null> {
  const snapshot = buildWorkoutSnapshot({
    workoutId: null,
    workoutName: "temporario",
    workoutShortName: null,
    workoutVersion: null,
    programId: null,
    programName: null,
    defaultRestSeconds: options.defaultRestSeconds,
    exercises: [source],
  });

  const exercise = snapshot.exercises[0];
  if (!exercise) return null;

  const { data: created, error } = await ctx.supabase
    .from("training_session_exercises")
    .insert({
      user_id: ctx.userId,
      session_id: sessionId,
      ...snapshotExerciseRow(exercise),
      planned_position: options.plannedPosition,
      executed_position: options.executedPosition,
      is_extra: options.isExtra,
      replaced_session_exercise_id: options.replacedSessionExerciseId ?? null,
    })
    .select("id")
    .single();

  if (error || !created) return null;

  if (exercise.sets.length > 0) {
    const { error: setsError } = await ctx.supabase.from("training_session_sets").insert(
      exercise.sets.map((set) => ({
        user_id: ctx.userId,
        session_id: sessionId,
        session_exercise_id: created.id,
        status: "pendente",
        client_mutation_id: crypto.randomUUID(),
        ...snapshotSetRow(set, options.defaultRestSeconds),
      })),
    );
    if (setsError) return null;
  }

  return created.id;
}

export async function addSessionExercise(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = exerciseAddSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const session = await loadSession(ctx, data.session_id);
  if (!session) return dbError("Sessão não encontrada.");
  if (!acceptsSetWrites(asSessionStatus(session.status))) {
    return { ok: false, error: "Este treino já foi encerrado." };
  }

  const source = await snapshotSourceFromCatalog(ctx, data.exercise_id);
  if (!source) return dbError("Exercício não encontrado.");

  const positions = await loadOrderable(ctx, data.session_id);
  const nextPosition = positions.length;

  const created = await insertSessionExercise(
    ctx,
    data.session_id,
    {
      ...source,
      defaultSets: data.sets ?? 3,
      targetRepsMin: data.target_reps_min,
      targetRepsMax: data.target_reps_max,
      restSeconds: data.rest_seconds ?? source.restSeconds,
    },
    {
      defaultRestSeconds: session.default_rest_seconds,
      executedPosition: nextPosition,
      plannedPosition: nextPosition,
      isExtra: true,
    },
  );

  if (!created) return dbError("Não foi possível adicionar o exercício.");

  await logEvent(ctx, data.session_id, "exercicio_adicionado", {
    sessionExerciseId: created,
    description: source.exerciseName,
  });

  revalidateSession();
  return { ok: true, data: { id: created } };
}

/**
 * Substitui um exercício.
 *
 * ⚠️ REGISTRO, NÃO EQUIVALÊNCIA. O sistema grava original, substituto, motivo e momento — e não
 * afirma em lugar nenhum que os dois exercícios são intercambiáveis.
 *
 * O original CONTINUA na sessão, com status `substituido` e com as séries que já tinham sido
 * feitas: nenhuma série registrada se perde ao substituir.
 */
export async function substituteSessionExercise(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = exerciseSubstituteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const session = await loadSession(ctx, data.session_id);
  if (!session) return dbError("Sessão não encontrada.");
  if (!acceptsSetWrites(asSessionStatus(session.status))) {
    return { ok: false, error: "Este treino já foi encerrado." };
  }

  const { data: original } = await ctx.supabase
    .from("training_session_exercises")
    .select(
      "id,status,exercise_id,exercise_name_snapshot,executed_position,planned_position,superset_group,rest_seconds",
    )
    .eq("id", data.session_exercise_id)
    .eq("session_id", data.session_id)
    .maybeSingle();

  if (!original) return dbError("Exercício não encontrado.");

  const transition = transitionExercise(asSessionExerciseStatus(original.status), "substituido");
  if (!transition.ok) return { ok: false, error: transition.message };

  const source = await snapshotSourceFromCatalog(ctx, data.substitute_exercise_id);
  if (!source) return dbError("Exercício substituto não encontrado.");

  // As séries PENDENTES do original viram o plano do substituto; as feitas ficam onde estão.
  const { data: pendingSets } = await ctx.supabase
    .from("training_session_sets")
    .select(
      "set_number,set_type,status,planned_reps_min,planned_reps_max,planned_weight_kg,planned_additional_weight_kg,planned_assistance_weight_kg,planned_duration_seconds,planned_distance_m,planned_rest_seconds,planned_rir,planned_rpe,is_warmup,counts_in_volume",
    )
    .eq("session_exercise_id", original.id)
    .order("set_number", { ascending: true });

  const pending = (pendingSets ?? []).filter(
    (set) => set.status === "pendente" || set.status === "ativa",
  );

  const keepPlanned = data.keep_planned_sets !== false && pending.length > 0;

  const withSets: SnapshotSourceExercise = keepPlanned
    ? {
        ...source,
        supersetGroup: original.superset_group,
        restSeconds: original.rest_seconds ?? source.restSeconds,
        defaultSets: pending.length,
        sets: pending.map((set, index) => ({
          setNumber: index + 1,
          setType: set.set_type as SnapshotSourceExercise["setType"],
          targetRepsMin: set.planned_reps_min,
          targetRepsMax: set.planned_reps_max,
          targetDurationSeconds: set.planned_duration_seconds,
          targetDistanceM: set.planned_distance_m === null ? null : Number(set.planned_distance_m),
          plannedWeightKg: null,
          plannedAdditionalWeightKg: null,
          plannedAssistanceWeightKg: null,
          restSeconds: set.planned_rest_seconds,
          targetRir: set.planned_rir,
          targetRpe: set.planned_rpe === null ? null : Number(set.planned_rpe),
          isWarmup: set.is_warmup,
          countsInVolume: set.counts_in_volume,
          notes: null,
        })),
      }
    : { ...source, supersetGroup: original.superset_group };

  const positions = await loadOrderable(ctx, data.session_id);

  const createdId = await insertSessionExercise(ctx, data.session_id, withSets, {
    defaultRestSeconds: session.default_rest_seconds,
    executedPosition: positions.length,
    plannedPosition: original.planned_position,
    isExtra: false,
    replacedSessionExerciseId: original.id,
  });

  if (!createdId) return dbError("Não foi possível registrar a substituição.");

  // O substituto assume o lugar do original na ordem de execução.
  const ordered = makeNext(
    [...positions, { id: createdId, executedPosition: positions.length }],
    createdId,
    original.id,
  );
  await persistOrder(ctx, data.session_id, ordered);

  await ctx.supabase
    .from("training_session_exercises")
    .update({ status: "substituido", ended_at: nowIso() })
    .eq("id", original.id)
    .eq("user_id", ctx.userId);

  // As séries pendentes do original saem: elas viraram as do substituto.
  await ctx.supabase
    .from("training_session_sets")
    .delete()
    .eq("session_exercise_id", original.id)
    .in("status", ["pendente", "ativa"])
    .eq("user_id", ctx.userId);

  await ctx.supabase.from("training_session_substitutions").insert({
    user_id: ctx.userId,
    session_id: data.session_id,
    original_session_exercise_id: original.id,
    new_session_exercise_id: createdId,
    original_exercise_id: original.exercise_id,
    substitute_exercise_id: data.substitute_exercise_id,
    original_name_snapshot: original.exercise_name_snapshot,
    substitute_name_snapshot: source.exerciseName,
    reason: data.reason,
    reason_notes: data.reason_notes,
  });

  await logEvent(ctx, data.session_id, "exercicio_substituido", {
    sessionExerciseId: createdId,
    description: `${original.exercise_name_snapshot} → ${source.exerciseName}`,
    payload: { motivo: data.reason },
  });

  revalidateSession();
  return { ok: true, data: { id: createdId } };
}

/* ═══════════════════════════ Pausar / retomar ═══════════════════════════ */

export async function pauseSession(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = sessionPauseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, reason } = parsed.data;

  const session = await loadSession(ctx, id);
  if (!session) return dbError("Sessão não encontrada.");

  const status = asSessionStatus(session.status);
  const result = await applyStatus(ctx, id, status, "pausada");
  if (!result.ok) return result;

  // O índice único parcial garante uma pausa aberta por sessão; aqui só não duplicamos.
  const { data: openPause } = await ctx.supabase
    .from("training_session_pauses")
    .select("id")
    .eq("session_id", id)
    .is("ended_at", null)
    .maybeSingle();

  if (!openPause) {
    await ctx.supabase.from("training_session_pauses").insert({
      user_id: ctx.userId,
      session_id: id,
      started_at: nowIso(),
      reason,
    });
  }

  await logEvent(ctx, id, "sessao_pausada", { description: reason });

  revalidateSession();
  return { ok: true, data: null };
}

export async function resumeSession(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = sessionResumeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id } = parsed.data;

  const session = await loadSession(ctx, id);
  if (!session) return dbError("Sessão não encontrada.");

  const { data: openPause } = await ctx.supabase
    .from("training_session_pauses")
    .select("id")
    .eq("session_id", id)
    .is("ended_at", null)
    .maybeSingle();

  if (openPause) {
    await ctx.supabase
      .from("training_session_pauses")
      .update({ ended_at: nowIso() })
      .eq("id", openPause.id)
      .eq("user_id", ctx.userId);
  }

  // Voltar para o estado certo: se o descanso continuou correndo, é "descansando".
  const { data: activeRest } = await ctx.supabase
    .from("training_session_rests")
    .select("id")
    .eq("session_id", id)
    .is("ended_at", null)
    .maybeSingle();

  const result = await applyStatus(
    ctx,
    id,
    asSessionStatus(session.status),
    activeRest ? "descansando" : "ativa",
  );
  if (!result.ok) return result;

  await logEvent(ctx, id, "sessao_retomada");

  revalidateSession();
  return { ok: true, data: null };
}

/* ═══════════════════════════ Encerrar ═══════════════════════════ */

/** Fecha descanso e pausa em aberto e congela os tempos com `timers.ts`. */
async function finalizeTimes(
  ctx: Ctx,
  sessionId: string,
  status: "concluida" | "abandonada",
  extra: Record<string, unknown> = {},
): Promise<void> {
  await closeActiveRest(ctx, sessionId, "cancelado");

  const endedAt = new Date();

  await ctx.supabase
    .from("training_session_pauses")
    .update({ ended_at: endedAt.toISOString() })
    .eq("session_id", sessionId)
    .eq("user_id", ctx.userId)
    .is("ended_at", null);

  const [sessionRes, pausesRes, restsRes] = await Promise.all([
    ctx.supabase
      .from("training_sessions")
      .select("started_at")
      .eq("id", sessionId)
      .maybeSingle(),
    ctx.supabase
      .from("training_session_pauses")
      .select("started_at,ended_at")
      .eq("session_id", sessionId),
    ctx.supabase
      .from("training_session_rests")
      .select("started_at,ended_at")
      .eq("session_id", sessionId),
  ]);

  const times = sessionTimes(
    {
      startedAt: sessionRes.data?.started_at ?? null,
      endedAt: endedAt.toISOString(),
      pauses: (pausesRes.data ?? []).map((row) => ({
        startedAt: row.started_at,
        endedAt: row.ended_at,
      })),
      rests: (restsRes.data ?? []).map((row) => ({
        startedAt: row.started_at,
        endedAt: row.ended_at,
      })),
    },
    endedAt.getTime(),
  );

  await ctx.supabase
    .from("training_sessions")
    .update({
      status,
      ended_at: endedAt.toISOString(),
      total_seconds: times.totalSeconds,
      active_seconds: times.activeSeconds,
      rest_total_seconds: times.restSeconds,
      pause_total_seconds: times.pausedSeconds,
      ...extra,
    })
    .eq("id", sessionId)
    .eq("user_id", ctx.userId);
}

/**
 * Finaliza com revisão.
 *
 * É AQUI (e só aqui) que um dia planejado vira `concluido` — a 17-B nunca grava esse status,
 * de propósito: não existe "concluído manual" sem execução.
 */
export async function finishSession(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = sessionFinishSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const session = await loadSession(ctx, data.id);
  if (!session) return dbError("Sessão não encontrada.");

  const status = asSessionStatus(session.status);
  const transition = transitionSession(status, "concluida");
  if (!transition.ok) return { ok: false, error: transition.message };

  const { data: sets } = await ctx.supabase
    .from("training_session_sets")
    .select("status")
    .eq("session_id", data.id);

  const guard = canFinishSession(
    (sets ?? []).map((row) => ({ status: asSessionSetStatus(row.status) })),
    { confirmed: data.confirm_active_sets },
  );
  if (!guard.allowed) return { ok: false, error: guard.message ?? "Confirme para finalizar." };

  await finalizeTimes(ctx, data.id, "concluida", {
    rating: data.rating,
    perceived_effort: data.perceived_effort,
    notes: data.notes,
    felt_pain: data.felt_pain ?? false,
    pain_notes: data.pain_notes,
  });

  // O dia planejado é concluído pela SESSÃO — nunca à mão.
  if (session.scheduled_workout_id) {
    await ctx.supabase
      .from("training_scheduled_workouts")
      .update({ status: "concluido" })
      .eq("id", session.scheduled_workout_id)
      .eq("user_id", ctx.userId);
  }

  await logEvent(ctx, data.id, "sessao_concluida");

  /* 17-D — a consolidação dos recordes e a avaliação das regras de progressão acontecem AQUI,
     depois de a execução estar fechada. As duas são idempotentes e nenhuma pode derrubar a
     finalização: um erro em `metrics`/`records` não pode custar ao usuário o treino que ele
     acabou de fazer. `syncProgressionSuggestions` respeita o interruptor do módulo e a trava de
     dor registrada — a decisão continua sendo de `progression.ts`. */
  try {
    await syncPersonalRecords(ctx);
    await syncProgressionSuggestions(ctx);
  } catch {
    // Silencioso de propósito: o recálculo pode ser refeito pelo botão da tela de recordes.
  }

  revalidateSession();
  revalidatePath(`${TRAINING_BASE_PATH}/historico`);
  revalidatePath(`${TRAINING_BASE_PATH}/recordes`);
  revalidatePath(`${TRAINING_BASE_PATH}/evolucao`);
  return { ok: true, data: { id: data.id } };
}

/**
 * Encerrar sem concluir.
 *
 * `abandonar` preserva tudo o que foi registrado; `descartar` apaga a sessão inteira (cascade).
 * O schema exige `confirm: true` — nada é encerrado em silêncio.
 */
export async function abandonSession(input: unknown): Promise<ActionResult<{ deleted: boolean }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = sessionAbandonSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const session = await loadSession(ctx, data.id);
  if (!session) return dbError("Sessão não encontrada.");

  if (data.mode === "descartar") {
    const { error } = await ctx.supabase
      .from("training_sessions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível descartar o treino.");

    revalidateSession();
    return { ok: true, data: { deleted: true } };
  }

  const status = asSessionStatus(session.status);
  if (isSessionDraft(status)) {
    // Um rascunho nunca foi executado: não há o que "abandonar" — ele é descartado.
    await ctx.supabase
      .from("training_sessions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    revalidateSession();
    return { ok: true, data: { deleted: true } };
  }

  const transition = transitionSession(status, "abandonada");
  if (!transition.ok) return { ok: false, error: transition.message };

  await finalizeTimes(ctx, data.id, "abandonada", { notes: data.reason });
  await logEvent(ctx, data.id, "sessao_abandonada", { description: data.reason });

  revalidateSession();
  return { ok: true, data: { deleted: false } };
}

/** Reabrir uma sessão encerrada. Exige confirmação — não é um botão ao lado de "Finalizar". */
export async function reopenSession(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = sessionReopenSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id } = parsed.data;

  const session = await loadSession(ctx, id);
  if (!session) return dbError("Sessão não encontrada.");

  const { data: running } = await ctx.supabase
    .from("training_sessions")
    .select("id")
    .eq("user_id", ctx.userId)
    .in("status", [...RUNNING_SESSION_STATUSES]);

  if ((running ?? []).some((row) => row.id !== id)) {
    return { ok: false, error: "Encerre o treino em andamento antes de reabrir este." };
  }

  const result = await applyStatus(
    ctx,
    id,
    asSessionStatus(session.status),
    "ativa",
    { ended_at: null, total_seconds: null, active_seconds: null, rest_total_seconds: null, pause_total_seconds: null },
    { explicit: true },
  );
  if (!result.ok) return result;

  await logEvent(ctx, id, "sessao_reaberta");

  revalidateSession();
  return { ok: true, data: null };
}
