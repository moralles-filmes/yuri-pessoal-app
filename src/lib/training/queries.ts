/**
 * Fase 17-A — Treinos · Camada de leitura (server-only).
 *
 * Padrão do projeto: UMA consulta ampla por entidade + cruzamento em memória (evitar N+1).
 * A RLS garante que só vem o que é do usuário **mais** o que é global (`user_id is null`) —
 * nenhuma query aqui filtra por `user_id` manualmente, e nem deve: quem faz isso é a policy.
 *
 * Tudo que é "favorito", "arquivado", "editável", "nome exibido", "descanso efetivo" e
 * "incremento efetivo" é DERIVADO aqui, combinando o exercício com a preferência do usuário.
 * A base do sistema nunca é alterada — é o mesmo desenho do catálogo de alimentos (16-A).
 */
import { createClient } from "@/lib/supabase/server";
import {
  asEquipmentCategory,
  asExerciseSource,
  asExerciseType,
  asLaterality,
  asMovementPattern,
  asMuscleRegion,
  asMuscleRole,
  asTrackingType,
  asAutoAdvanceMode,
  asDifficultyScale,
  asOneRmFormula,
  asUnilateralVolumeRule,
  asWeightUnit,
} from "./constants";
import { resolveIncrementKg, resolveRestSeconds } from "./tracking";
import {
  DEFAULT_TRAINING_PREFERENCES,
  type Equipment,
  type ExerciseAlternative,
  type ExerciseListItem,
  type ExerciseMuscleLink,
  type MuscleGroup,
  type TrainingCatalogSummary,
  type TrainingPreferences,
} from "./types";

/** Teto de segurança: nenhuma leitura traz mais que isto de uma vez. */
const EXERCISE_LIMIT = 5000;
const LINK_LIMIT = 20000;

/**
 * As listas de colunas precisam ser UM literal em uma linha só: o `select` tipado do
 * supabase-js infere o shape a partir do TIPO LITERAL da string, e concatenar com `+` alarga
 * para `string` — aí o retorno vira `GenericStringError` e o build quebra.
 */
const EXERCISE_SELECT =
  "id,user_id,name,alternative_name,description,primary_muscle_group_id,equipment_id,movement_pattern,exercise_type,tracking_type,laterality,instructions,tips,common_mistakes,notes,image_url,video_url,default_rest_seconds,default_increment_kg,is_system_exercise,is_verified,system_code,source,origin_exercise_id,archived_at,created_at,updated_at";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/* ───────────────────────────── Vocabulário ───────────────────────────── */

export async function getMuscleGroups(): Promise<MuscleGroup[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_muscle_groups")
    .select("id,slug,name,region,parent_id,color,position,is_system,archived_at")
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    region: asMuscleRegion(row.region),
    parentId: row.parent_id,
    color: row.color,
    position: row.position,
    isSystem: row.is_system,
    isArchived: Boolean(row.archived_at),
  }));
}

export async function getEquipment(): Promise<Equipment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_equipment")
    .select("id,slug,name,category,default_increment_kg,position,is_system,archived_at")
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: asEquipmentCategory(row.category),
    defaultIncrementKg: num(row.default_increment_kg),
    position: row.position,
    isSystem: row.is_system,
    isArchived: Boolean(row.archived_at),
  }));
}

/* ───────────────────────────── Preferências ─────────────────────────────
 * Sem linha = valores padrão. NÃO criamos a linha na leitura: um GET não deveria escrever, e
 * o primeiro salvamento faz o upsert de qualquer jeito.
 */
export async function getTrainingPreferences(): Promise<TrainingPreferences> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_preferences")
    .select(
      "weight_unit,difficulty_scale,default_rest_seconds,default_increment_kg,week_starts_on,weekly_workout_goal,auto_advance,rest_sound_enabled,rest_vibration_enabled,keep_screen_awake,unilateral_volume_rule,count_warmup_in_volume,one_rm_formula,progression_enabled,habit_id",
    )
    .maybeSingle();

  if (!data) return DEFAULT_TRAINING_PREFERENCES;

  return {
    weightUnit: asWeightUnit(data.weight_unit),
    difficultyScale: asDifficultyScale(data.difficulty_scale),
    defaultRestSeconds: data.default_rest_seconds ?? DEFAULT_TRAINING_PREFERENCES.defaultRestSeconds,
    defaultIncrementKg:
      num(data.default_increment_kg) ?? DEFAULT_TRAINING_PREFERENCES.defaultIncrementKg,
    weekStartsOn: data.week_starts_on ?? DEFAULT_TRAINING_PREFERENCES.weekStartsOn,
    weeklyWorkoutGoal: data.weekly_workout_goal ?? null,
    autoAdvance: asAutoAdvanceMode(data.auto_advance),
    restSoundEnabled: data.rest_sound_enabled,
    restVibrationEnabled: data.rest_vibration_enabled,
    keepScreenAwake: data.keep_screen_awake,
    unilateralVolumeRule: asUnilateralVolumeRule(data.unilateral_volume_rule),
    countWarmupInVolume: data.count_warmup_in_volume,
    oneRmFormula: asOneRmFormula(data.one_rm_formula),
    progressionEnabled: data.progression_enabled,
    // 17-F — hábito que REFLETE as sessões concluídas (opt-in). NULL = desligado.
    habitId: data.habit_id ?? null,
  };
}

/* ───────────────────────────── Exercícios ───────────────────────────── */

/**
 * Catálogo completo já cruzado com preferências e vocabulário.
 *
 * Quatro consultas amplas (exercícios, vínculos de músculo, grupos, equipamentos, preferências
 * por exercício) e o cruzamento em memória. Com ~100 exercícios da base + os do usuário isso é
 * uma fração do custo de uma consulta por linha.
 */
export async function getExercises(): Promise<ExerciseListItem[]> {
  const supabase = await createClient();

  const [exercisesRes, linksRes, groups, equipment, prefsRes, preferences] = await Promise.all([
    supabase.from("training_exercises").select(EXERCISE_SELECT).limit(EXERCISE_LIMIT),
    supabase
      .from("training_exercise_muscles")
      .select("exercise_id,muscle_group_id,role,position")
      .limit(LINK_LIMIT),
    getMuscleGroups(),
    getEquipment(),
    supabase
      .from("training_exercise_prefs")
      .select("exercise_id,is_favorite,archived_at,custom_name,custom_rest_seconds,custom_increment_kg,notes"),
    getTrainingPreferences(),
  ]);

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));

  const linksByExercise = new Map<string, ExerciseMuscleLink[]>();
  for (const link of linksRes.data ?? []) {
    const group = groupById.get(link.muscle_group_id);
    if (!group) continue;
    const list = linksByExercise.get(link.exercise_id) ?? [];
    list.push({
      muscleGroupId: link.muscle_group_id,
      muscleGroupName: group.name,
      role: asMuscleRole(link.role),
      position: link.position,
    });
    linksByExercise.set(link.exercise_id, list);
  }

  const prefByExercise = new Map((prefsRes.data ?? []).map((p) => [p.exercise_id, p]));

  return (exercisesRes.data ?? []).map((row) => {
    const pref = prefByExercise.get(row.id);
    const group = groupById.get(row.primary_muscle_group_id);
    const equip = row.equipment_id ? equipmentById.get(row.equipment_id) : undefined;
    const secondary = (linksByExercise.get(row.id) ?? []).sort((a, b) => a.position - b.position);

    return {
      id: row.id,
      userId: row.user_id,

      displayName: pref?.custom_name?.trim() || row.name,
      name: row.name,
      alternativeName: row.alternative_name,
      description: row.description,

      primaryMuscleGroupId: row.primary_muscle_group_id,
      primaryMuscleGroupName: group?.name ?? "Sem grupo",
      primaryMuscleRegion: group?.region ?? "outro",
      secondaryMuscles: secondary,
      muscleGroupIds: [row.primary_muscle_group_id, ...secondary.map((s) => s.muscleGroupId)],

      equipmentId: row.equipment_id,
      equipmentName: equip?.name ?? null,
      equipmentCategory: equip?.category ?? null,

      movementPattern: asMovementPattern(row.movement_pattern),
      exerciseType: asExerciseType(row.exercise_type),
      trackingType: asTrackingType(row.tracking_type),
      laterality: asLaterality(row.laterality),

      instructions: row.instructions,
      tips: row.tips,
      commonMistakes: row.common_mistakes,
      notes: row.notes,
      imageUrl: row.image_url,
      videoUrl: row.video_url,

      restSeconds: resolveRestSeconds({
        prefRestSeconds: pref?.custom_rest_seconds ?? null,
        exerciseRestSeconds: row.default_rest_seconds,
        defaultRestSeconds: preferences.defaultRestSeconds,
      }),
      incrementKg: resolveIncrementKg({
        prefIncrementKg: num(pref?.custom_increment_kg),
        exerciseIncrementKg: num(row.default_increment_kg),
        equipmentIncrementKg: equip?.defaultIncrementKg ?? null,
        defaultIncrementKg: preferences.defaultIncrementKg,
      }),

      isSystemExercise: row.is_system_exercise,
      isVerified: row.is_verified,
      source: asExerciseSource(row.source),
      systemCode: row.system_code,
      originExerciseId: row.origin_exercise_id,

      isFavorite: pref?.is_favorite ?? false,
      // Arquivado do usuário vence: é como ele "esconde" um exercício da base.
      isArchived: Boolean(pref?.archived_at ?? row.archived_at),
      isEditable: row.user_id !== null,

      customName: pref?.custom_name ?? null,
      prefNotes: pref?.notes ?? null,

      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies ExerciseListItem;
  });
}

/** Alternativas cadastradas pelo usuário, indexadas por exercício de origem. */
export async function getExerciseAlternatives(): Promise<ExerciseAlternative[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_exercise_alternatives")
    .select("id,exercise_id,alternative_exercise_id,note,position,alternative:training_exercises!training_exercise_alternatives_alternative_exercise_id_fkey(name)")
    .order("position", { ascending: true });

  return (data ?? []).map((row) => {
    const alternative = row.alternative as { name: string } | { name: string }[] | null;
    const name = Array.isArray(alternative) ? alternative[0]?.name : alternative?.name;
    return {
      id: row.id,
      exerciseId: row.exercise_id,
      alternativeExerciseId: row.alternative_exercise_id,
      alternativeName: name ?? "Exercício removido",
      note: row.note,
      position: row.position,
    };
  });
}

/** Números da visão geral. Derivados da mesma lista que a tela do catálogo usa. */
export function summarizeCatalog(exercises: ExerciseListItem[]): TrainingCatalogSummary {
  const byMuscleGroup: Record<string, number> = {};
  let systemExercises = 0;
  let ownExercises = 0;
  let favorites = 0;
  let archived = 0;

  for (const exercise of exercises) {
    if (exercise.isArchived) {
      archived += 1;
      continue;
    }
    if (exercise.isSystemExercise) systemExercises += 1;
    else ownExercises += 1;
    if (exercise.isFavorite) favorites += 1;
    byMuscleGroup[exercise.primaryMuscleGroupId] =
      (byMuscleGroup[exercise.primaryMuscleGroupId] ?? 0) + 1;
  }

  return {
    totalExercises: systemExercises + ownExercises,
    systemExercises,
    ownExercises,
    favorites,
    archived,
    muscleGroups: 0,
    equipment: 0,
    byMuscleGroup,
  };
}
