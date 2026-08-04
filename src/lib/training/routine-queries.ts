/**
 * Fase 17-B — Treinos · Leitura de programas, treinos-modelo e planejamento (server-only).
 *
 * Padrão do projeto: UMA consulta ampla por entidade + cruzamento em memória. Um treino com 8
 * exercícios, 30 séries configuradas e 5 alternativas seriam ~44 consultas no modelo ingênuo;
 * aqui são 5, independentemente do tamanho.
 *
 * A RLS garante que só vem o que é do usuário — nenhuma query aqui filtra por `user_id` à mão
 * (a policy faz isso), exceto onde o filtro deixa a intenção explícita.
 *
 * DERIVADO AQUI, NUNCA GRAVADO: `isSuperseded` (tem `superseded_by`), o nome do treino/programa
 * denormalizado e os resumos. O status "atrasado"/"hoje" do planejamento é derivado mais
 * adiante, em `schedule.ts`, com o `hoje` injetado pela página.
 */
import { createClient } from "@/lib/supabase/server";
import {
  asLaterality,
  asProgramStatus,
  asScheduleEntryKind,
  asScheduleSource,
  asScheduleStatus,
  asSetTechnique,
  asSetType,
  asTrackingType,
  asTrainingGoal,
  asTrainingLevel,
  asWorkoutStatus,
} from "./constants";
import type {
  ProgramWorkoutLink,
  ScheduledWorkout,
  TrainingProgram,
  TrainingWorkout,
  WorkoutExercise,
  WorkoutExerciseAlternative,
  WorkoutSetConfig,
} from "./types";

/** Tetos de segurança: nenhuma leitura traz mais que isto de uma vez. */
const ROW_LIMIT = 2000;
const CHILD_LIMIT = 20000;

/**
 * As listas de colunas precisam ser UM literal em uma linha só: o `select` tipado do
 * supabase-js infere o shape a partir do TIPO LITERAL da string, e concatenar com `+` alarga
 * para `string` — aí o retorno vira `GenericStringError` e o build quebra.
 */
const PROGRAM_SELECT =
  "id,name,description,goal,level,status,starts_on,ends_on,duration_weeks,weekly_frequency,color,icon,notes,position,is_active,archived_at,created_at,updated_at";

const WORKOUT_SELECT =
  "id,name,short_name,description,goal,status,program_id,estimated_minutes,color,icon,notes,version,version_group_id,superseded_by,is_favorite,position,archived_at,created_at,updated_at";

const WORKOUT_EXERCISE_SELECT =
  "id,workout_id,exercise_id,position,default_sets,target_reps_min,target_reps_max,target_duration_seconds,target_distance_m,planned_weight_kg,planned_additional_weight_kg,planned_assistance_weight_kg,rest_seconds,target_rir,target_rpe,set_type,technique,superset_group,is_warmup,counts_in_volume,increment_kg,tempo,notes";

const WORKOUT_SET_SELECT =
  "id,workout_exercise_id,set_number,set_type,target_reps_min,target_reps_max,target_duration_seconds,target_distance_m,planned_weight_kg,planned_additional_weight_kg,planned_assistance_weight_kg,rest_seconds,target_rir,target_rpe,is_warmup,counts_in_volume,notes";

const SCHEDULE_SELECT =
  "id,scheduled_date,planned_time,planned_duration_minutes,entry_kind,workout_id,program_id,title,status,position,original_date,reschedule_reason,skip_reason,notes,source,created_at,updated_at";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/* ═══════════════════════════ Treinos-modelo ═══════════════════════════ */

/**
 * Todos os treinos-modelo, com exercícios, séries configuradas e alternativas já montados.
 *
 * Cinco consultas: treinos, exercícios do treino, séries, alternativas e o catálogo (nome do
 * exercício, tipo de acompanhamento, grupo muscular). O catálogo entra porque o construtor e
 * o resumo precisam do `tracking_type` — que é o que decide quais campos aquele exercício usa.
 */
export async function getWorkouts(): Promise<TrainingWorkout[]> {
  const supabase = await createClient();

  const [workoutsRes, exercisesRes, setsRes, alternativesRes, catalogRes, groupsRes, equipRes, programsRes] =
    await Promise.all([
      supabase.from("training_workouts").select(WORKOUT_SELECT).limit(ROW_LIMIT),
      supabase.from("training_workout_exercises").select(WORKOUT_EXERCISE_SELECT).limit(CHILD_LIMIT),
      supabase.from("training_workout_sets").select(WORKOUT_SET_SELECT).limit(CHILD_LIMIT),
      supabase
        .from("training_workout_alternatives")
        .select("id,workout_exercise_id,alternative_exercise_id,note,position")
        .limit(CHILD_LIMIT),
      supabase
        .from("training_exercises")
        .select("id,name,tracking_type,laterality,primary_muscle_group_id,equipment_id")
        .limit(CHILD_LIMIT),
      supabase.from("training_muscle_groups").select("id,name"),
      supabase.from("training_equipment").select("id,name"),
      supabase.from("training_programs").select("id,name").limit(ROW_LIMIT),
    ]);

  const catalog = new Map((catalogRes.data ?? []).map((row) => [row.id, row]));
  const groupName = new Map((groupsRes.data ?? []).map((row) => [row.id, row.name]));
  const equipName = new Map((equipRes.data ?? []).map((row) => [row.id, row.name]));
  const programName = new Map((programsRes.data ?? []).map((row) => [row.id, row.name]));

  // Músculos secundários de todos os exercícios usados (uma consulta a mais, não uma por linha).
  const usedExerciseIds = [...new Set((exercisesRes.data ?? []).map((row) => row.exercise_id))];
  const secondaryByExercise = new Map<string, string[]>();
  if (usedExerciseIds.length > 0) {
    const { data: links } = await supabase
      .from("training_exercise_muscles")
      .select("exercise_id,muscle_group_id")
      .in("exercise_id", usedExerciseIds);

    for (const link of links ?? []) {
      const list = secondaryByExercise.get(link.exercise_id) ?? [];
      list.push(link.muscle_group_id);
      secondaryByExercise.set(link.exercise_id, list);
    }
  }

  const setsByExercise = new Map<string, WorkoutSetConfig[]>();
  for (const row of setsRes.data ?? []) {
    const list = setsByExercise.get(row.workout_exercise_id) ?? [];
    list.push({
      id: row.id,
      workoutExerciseId: row.workout_exercise_id,
      setNumber: row.set_number,
      setType: asSetType(row.set_type),
      targetRepsMin: row.target_reps_min,
      targetRepsMax: row.target_reps_max,
      targetDurationSeconds: row.target_duration_seconds,
      targetDistanceM: num(row.target_distance_m),
      plannedWeightKg: num(row.planned_weight_kg),
      plannedAdditionalWeightKg: num(row.planned_additional_weight_kg),
      plannedAssistanceWeightKg: num(row.planned_assistance_weight_kg),
      restSeconds: row.rest_seconds,
      targetRir: row.target_rir,
      targetRpe: num(row.target_rpe),
      isWarmup: row.is_warmup,
      countsInVolume: row.counts_in_volume,
      notes: row.notes,
    });
    setsByExercise.set(row.workout_exercise_id, list);
  }
  for (const list of setsByExercise.values()) list.sort((a, b) => a.setNumber - b.setNumber);

  const altByExercise = new Map<string, WorkoutExerciseAlternative[]>();
  for (const row of alternativesRes.data ?? []) {
    const list = altByExercise.get(row.workout_exercise_id) ?? [];
    list.push({
      id: row.id,
      workoutExerciseId: row.workout_exercise_id,
      alternativeExerciseId: row.alternative_exercise_id,
      alternativeName: catalog.get(row.alternative_exercise_id)?.name ?? "Exercício removido",
      note: row.note,
      position: row.position,
    });
    altByExercise.set(row.workout_exercise_id, list);
  }
  for (const list of altByExercise.values()) list.sort((a, b) => a.position - b.position);

  const exercisesByWorkout = new Map<string, WorkoutExercise[]>();
  for (const row of exercisesRes.data ?? []) {
    const source = catalog.get(row.exercise_id);
    const secondary = (secondaryByExercise.get(row.exercise_id) ?? []).filter(
      (id) => id !== source?.primary_muscle_group_id,
    );

    const list = exercisesByWorkout.get(row.workout_id) ?? [];
    list.push({
      id: row.id,
      workoutId: row.workout_id,
      exerciseId: row.exercise_id,

      exerciseName: source?.name ?? "Exercício removido",
      trackingType: asTrackingType(source?.tracking_type),
      laterality: asLaterality(source?.laterality),
      primaryMuscleGroupId: source?.primary_muscle_group_id ?? "",
      primaryMuscleGroupName: source?.primary_muscle_group_id
        ? (groupName.get(source.primary_muscle_group_id) ?? "Sem grupo")
        : "Sem grupo",
      secondaryMuscleGroupIds: secondary,
      equipmentName: source?.equipment_id ? (equipName.get(source.equipment_id) ?? null) : null,

      position: row.position,
      defaultSets: row.default_sets,

      targetRepsMin: row.target_reps_min,
      targetRepsMax: row.target_reps_max,
      targetDurationSeconds: row.target_duration_seconds,
      targetDistanceM: num(row.target_distance_m),

      plannedWeightKg: num(row.planned_weight_kg),
      plannedAdditionalWeightKg: num(row.planned_additional_weight_kg),
      plannedAssistanceWeightKg: num(row.planned_assistance_weight_kg),

      restSeconds: row.rest_seconds,
      targetRir: row.target_rir,
      targetRpe: num(row.target_rpe),

      setType: asSetType(row.set_type),
      technique: asSetTechnique(row.technique),
      supersetGroup: row.superset_group,

      isWarmup: row.is_warmup,
      countsInVolume: row.counts_in_volume,

      incrementKg: num(row.increment_kg),
      tempo: row.tempo,
      notes: row.notes,

      sets: setsByExercise.get(row.id) ?? [],
      alternatives: altByExercise.get(row.id) ?? [],
    });
    exercisesByWorkout.set(row.workout_id, list);
  }
  for (const list of exercisesByWorkout.values()) list.sort((a, b) => a.position - b.position);

  return (workoutsRes.data ?? [])
    .map<TrainingWorkout>((row) => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      description: row.description,
      goal: asTrainingGoal(row.goal),
      status: asWorkoutStatus(row.status),
      programId: row.program_id,
      programName: row.program_id ? (programName.get(row.program_id) ?? null) : null,
      estimatedMinutes: row.estimated_minutes,
      color: row.color,
      icon: row.icon,
      notes: row.notes,
      version: row.version,
      versionGroupId: row.version_group_id,
      supersededBy: row.superseded_by,
      isSuperseded: Boolean(row.superseded_by),
      isFavorite: row.is_favorite,
      position: row.position,
      isArchived: Boolean(row.archived_at),
      exercises: exercisesByWorkout.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR"));
}

/** Um treino específico já montado. Reusa `getWorkouts` — uma leitura, um caminho. */
export async function getWorkout(id: string): Promise<TrainingWorkout | null> {
  const workouts = await getWorkouts();
  return workouts.find((workout) => workout.id === id) ?? null;
}

/* ═══════════════════════════ Programas ═══════════════════════════ */

export async function getPrograms(): Promise<TrainingProgram[]> {
  const supabase = await createClient();

  const [programsRes, linksRes, workoutsRes] = await Promise.all([
    supabase.from("training_programs").select(PROGRAM_SELECT).limit(ROW_LIMIT),
    supabase
      .from("training_program_workouts")
      .select("id,program_id,workout_id,position,label,suggested_weekdays,notes")
      .limit(CHILD_LIMIT),
    supabase.from("training_workouts").select("id,name,short_name").limit(ROW_LIMIT),
  ]);

  const workoutById = new Map((workoutsRes.data ?? []).map((row) => [row.id, row]));

  const linksByProgram = new Map<string, ProgramWorkoutLink[]>();
  for (const row of linksRes.data ?? []) {
    const workout = workoutById.get(row.workout_id);
    const list = linksByProgram.get(row.program_id) ?? [];
    list.push({
      id: row.id,
      programId: row.program_id,
      workoutId: row.workout_id,
      workoutName: workout?.name ?? "Treino removido",
      workoutShortName: workout?.short_name ?? null,
      position: row.position,
      label: row.label,
      suggestedWeekdays: (row.suggested_weekdays ?? []).filter(
        (day): day is number => typeof day === "number",
      ),
      notes: row.notes,
    });
    linksByProgram.set(row.program_id, list);
  }
  for (const list of linksByProgram.values()) list.sort((a, b) => a.position - b.position);

  return (programsRes.data ?? [])
    .map<TrainingProgram>((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      goal: asTrainingGoal(row.goal),
      level: asTrainingLevel(row.level),
      status: asProgramStatus(row.status),
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      durationWeeks: row.duration_weeks,
      weeklyFrequency: row.weekly_frequency,
      color: row.color,
      icon: row.icon,
      notes: row.notes,
      position: row.position,
      isActive: row.is_active,
      isArchived: Boolean(row.archived_at),
      workouts: linksByProgram.get(row.id) ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pt-BR"));
}

/* ═══════════════════════════ Planejamento ═══════════════════════════ */

/**
 * Dias planejados de um intervalo (data pura, inclusivo nos dois extremos).
 *
 * O status devolvido é o **gravado**. "Atrasado" e "hoje" nascem depois, em
 * `derivePlannedStatus`, com o `hoje` que a página injeta — nunca aqui, e nunca no banco.
 */
export async function getScheduledWorkouts(
  from: string,
  to: string,
): Promise<ScheduledWorkout[]> {
  const supabase = await createClient();

  const [entriesRes, workoutsRes, programsRes] = await Promise.all([
    supabase
      .from("training_scheduled_workouts")
      .select(SCHEDULE_SELECT)
      .gte("scheduled_date", from)
      .lte("scheduled_date", to)
      .order("scheduled_date", { ascending: true })
      .limit(CHILD_LIMIT),
    supabase.from("training_workouts").select("id,name,short_name").limit(ROW_LIMIT),
    supabase.from("training_programs").select("id,name").limit(ROW_LIMIT),
  ]);

  const workoutById = new Map((workoutsRes.data ?? []).map((row) => [row.id, row]));
  const programById = new Map((programsRes.data ?? []).map((row) => [row.id, row.name]));

  return (entriesRes.data ?? []).map<ScheduledWorkout>((row) => ({
    id: row.id,
    scheduledDate: row.scheduled_date,
    plannedTime: row.planned_time,
    plannedDurationMinutes: row.planned_duration_minutes,
    entryKind: asScheduleEntryKind(row.entry_kind),
    workoutId: row.workout_id,
    // Treino excluído deixa a linha legível como "treino removido" em vez de sumir.
    workoutName: row.workout_id ? (workoutById.get(row.workout_id)?.name ?? "Treino removido") : null,
    programId: row.program_id,
    programName: row.program_id ? (programById.get(row.program_id) ?? null) : null,
    title: row.title,
    status: asScheduleStatus(row.status),
    position: row.position,
    originalDate: row.original_date,
    rescheduleReason: row.reschedule_reason,
    skipReason: row.skip_reason,
    notes: row.notes,
    source: asScheduleSource(row.source),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/* ═══════════════════════════ Resumo do módulo ═══════════════════════════ */

export type RoutineSummary = {
  programs: number;
  activePrograms: number;
  workouts: number;
  archivedWorkouts: number;
  /** Treinos que ainda não têm exercício nenhum — a UI convida a montar. */
  emptyWorkouts: number;
};

export function summarizeRoutines(
  programs: TrainingProgram[],
  workouts: TrainingWorkout[],
): RoutineSummary {
  const live = workouts.filter((workout) => !workout.isArchived && !workout.isSuperseded);

  return {
    programs: programs.filter((program) => !program.isArchived).length,
    activePrograms: programs.filter((program) => program.isActive && !program.isArchived).length,
    workouts: live.length,
    archivedWorkouts: workouts.filter((workout) => workout.isArchived).length,
    emptyWorkouts: live.filter((workout) => workout.exercises.length === 0).length,
  };
}
