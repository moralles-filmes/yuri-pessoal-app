"use server";

/**
 * Fase 17-A — Treinos · Server Actions do catálogo de exercícios.
 *
 * Contrato do projeto (src/lib/actions/accounts.ts é o molde):
 *   1. `authContext()` → `{ supabase, userId }`; `user_id` SEMPRE de `auth.getUser()`.
 *   2. Zod no servidor; erro → `invalid(...)`.
 *   3. Query Supabase com `user_id: ctx.userId` nos inserts; erro → `dbError(...)`.
 *   4. `revalidatePath` + `ActionResult`.
 *
 * DUAS REGRAS PRÓPRIAS DESTE MÓDULO:
 *
 * • A BASE DO SISTEMA É IMUTÁVEL. Nenhuma action edita ou exclui exercício com
 *   `user_id is null`. A policy já barra no banco; aqui barramos antes, para devolver uma
 *   mensagem em pt-BR em vez de "0 linhas afetadas". Favoritar, arquivar e apelidar um
 *   exercício global gravam em `training_exercise_prefs`, que é dado do usuário.
 *
 * • EXERCÍCIO DIGITADO NÃO SE PASSA POR BASE. `is_system_exercise`, `source = 'sistema'`,
 *   `system_code` e `is_verified` não vêm do client em nenhuma hipótese.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import {
  trainingAlternativeSchema,
  trainingBulkSchema,
  trainingDuplicateSchema,
  trainingEquipmentSchema,
  trainingExercisePrefSchema,
  trainingExerciseSchema,
  trainingExerciseUpdateSchema,
  trainingMuscleGroupSchema,
} from "@/lib/validators/training";
import type { ActionResult } from "@/types/finance";

const EXERCISES_PATH = `${TRAINING_BASE_PATH}/exercicios`;

function revalidateTraining() {
  revalidatePath(TRAINING_BASE_PATH);
  revalidatePath(EXERCISES_PATH);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

const NOT_EDITABLE =
  "Exercícios da base do sistema são somente leitura. Use “Duplicar” para criar uma cópia sua e editar à vontade.";

/** Confere que o exercício existe E pertence ao usuário. */
async function ownsExercise(ctx: Ctx, exerciseId: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("training_exercises")
    .select("id,user_id")
    .eq("id", exerciseId)
    .maybeSingle();
  return Boolean(data && data.user_id === ctx.userId);
}

/** Gera um slug estável para vocabulário criado pelo usuário. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** Regrava os músculos secundários de um exercício próprio (apaga e insere). */
async function replaceSecondaryMuscles(
  ctx: Ctx,
  exerciseId: string,
  muscles: { muscle_group_id: string; role: string }[],
): Promise<string | null> {
  const { error: deleteError } = await ctx.supabase
    .from("training_exercise_muscles")
    .delete()
    .eq("exercise_id", exerciseId)
    .eq("user_id", ctx.userId);
  if (deleteError) return deleteError.message;

  if (muscles.length === 0) return null;

  const { error } = await ctx.supabase.from("training_exercise_muscles").insert(
    muscles.map((muscle, index) => ({
      user_id: ctx.userId,
      exercise_id: exerciseId,
      muscle_group_id: muscle.muscle_group_id,
      role: muscle.role,
      position: index,
    })),
  );
  return error?.message ?? null;
}

/* ───────────────────────────── Criar / editar / excluir ───────────────────────────── */

export async function createTrainingExercise(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingExerciseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (data.secondary_muscles.some((m) => m.muscle_group_id === data.primary_muscle_group_id)) {
    return invalid({
      secondary_muscles: ["O grupo principal não pode ser cadastrado também como secundário."],
    });
  }

  const { data: created, error } = await ctx.supabase
    .from("training_exercises")
    .insert({
      user_id: ctx.userId,
      name: data.name,
      alternative_name: data.alternative_name,
      description: data.description,
      primary_muscle_group_id: data.primary_muscle_group_id,
      equipment_id: data.equipment_id,
      movement_pattern: data.movement_pattern,
      exercise_type: data.exercise_type,
      tracking_type: data.tracking_type,
      laterality: data.laterality,
      instructions: data.instructions,
      tips: data.tips,
      common_mistakes: data.common_mistakes,
      notes: data.notes,
      image_url: data.image_url,
      video_url: data.video_url,
      default_rest_seconds: data.default_rest_seconds,
      default_increment_kg: data.default_increment_kg,
      // Nunca do client: quem cria à mão cria como 'usuario'.
      source: "usuario",
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível criar o exercício.");

  const muscleError = await replaceSecondaryMuscles(ctx, created.id, data.secondary_muscles);
  if (muscleError) return dbError("Exercício criado, mas os grupos secundários falharam.");

  revalidateTraining();
  return { ok: true, data: { id: created.id } };
}

export async function updateTrainingExercise(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingExerciseUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, secondary_muscles, ...data } = parsed.data;

  if (!(await ownsExercise(ctx, id))) return dbError(NOT_EDITABLE);

  if (secondary_muscles.some((m) => m.muscle_group_id === data.primary_muscle_group_id)) {
    return invalid({
      secondary_muscles: ["O grupo principal não pode ser cadastrado também como secundário."],
    });
  }

  const { error } = await ctx.supabase
    .from("training_exercises")
    .update({
      name: data.name,
      alternative_name: data.alternative_name,
      description: data.description,
      primary_muscle_group_id: data.primary_muscle_group_id,
      equipment_id: data.equipment_id,
      movement_pattern: data.movement_pattern,
      exercise_type: data.exercise_type,
      tracking_type: data.tracking_type,
      laterality: data.laterality,
      instructions: data.instructions,
      tips: data.tips,
      common_mistakes: data.common_mistakes,
      notes: data.notes,
      image_url: data.image_url,
      video_url: data.video_url,
      default_rest_seconds: data.default_rest_seconds,
      default_increment_kg: data.default_increment_kg,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível salvar o exercício.");

  const muscleError = await replaceSecondaryMuscles(ctx, id, secondary_muscles);
  if (muscleError) return dbError("Exercício salvo, mas os grupos secundários falharam.");

  revalidateTraining();
  return { ok: true, data: null };
}

export async function deleteTrainingExercise(id: string): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!(await ownsExercise(ctx, id))) return dbError(NOT_EDITABLE);

  const { error } = await ctx.supabase
    .from("training_exercises")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível excluir o exercício.");
  revalidateTraining();
  return { ok: true, data: null };
}

/**
 * Duplicar: cria uma cópia PESSOAL e editável, com `origin_exercise_id` apontando para a
 * origem. A cópia nasce como `duplicado` e **sem** o selo de verificado — ela não é mais a
 * linha da base, é sua.
 */
export async function duplicateTrainingExercise(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingDuplicateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data: origin } = await ctx.supabase
    .from("training_exercises")
    .select(
      "id,name,alternative_name,description,primary_muscle_group_id,equipment_id,movement_pattern,exercise_type,tracking_type,laterality,instructions,tips,common_mistakes,notes,image_url,video_url,default_rest_seconds,default_increment_kg",
    )
    .eq("id", parsed.data.exercise_id)
    .maybeSingle();

  if (!origin) return dbError("Exercício não encontrado.");

  const { data: created, error } = await ctx.supabase
    .from("training_exercises")
    .insert({
      user_id: ctx.userId,
      name: parsed.data.name?.trim() || `${origin.name} (cópia)`,
      alternative_name: origin.alternative_name,
      description: origin.description,
      primary_muscle_group_id: origin.primary_muscle_group_id,
      equipment_id: origin.equipment_id,
      movement_pattern: origin.movement_pattern,
      exercise_type: origin.exercise_type,
      tracking_type: origin.tracking_type,
      laterality: origin.laterality,
      instructions: origin.instructions,
      tips: origin.tips,
      common_mistakes: origin.common_mistakes,
      notes: origin.notes,
      image_url: origin.image_url,
      video_url: origin.video_url,
      default_rest_seconds: origin.default_rest_seconds,
      default_increment_kg: origin.default_increment_kg,
      origin_exercise_id: origin.id,
      source: "duplicado",
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível duplicar o exercício.");

  // Copia os músculos secundários da origem (inclusive quando ela é global).
  const { data: links } = await ctx.supabase
    .from("training_exercise_muscles")
    .select("muscle_group_id,role,position")
    .eq("exercise_id", origin.id);

  if (links?.length) {
    await replaceSecondaryMuscles(
      ctx,
      created.id,
      links.map((l) => ({ muscle_group_id: l.muscle_group_id, role: l.role })),
    );
  }

  revalidateTraining();
  return { ok: true, data: { id: created.id } };
}

/* ───────────────────────────── Preferência (favorito/arquivo/apelido) ─────────────────────────────
 * Funciona igual para exercício da base e para exercício próprio — é o que permite favoritar
 * e arquivar a base sem nunca editá-la.
 */
export async function setTrainingExercisePref(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingExercisePrefSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: existing } = await ctx.supabase
    .from("training_exercise_prefs")
    .select("id,is_favorite,archived_at")
    .eq("exercise_id", data.exercise_id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  const archivedAt =
    data.archived === undefined
      ? (existing?.archived_at ?? null)
      : data.archived
        ? new Date().toISOString()
        : null;

  const payload = {
    user_id: ctx.userId,
    exercise_id: data.exercise_id,
    is_favorite: data.is_favorite ?? existing?.is_favorite ?? false,
    archived_at: archivedAt,
    custom_name: data.custom_name,
    custom_rest_seconds: data.custom_rest_seconds,
    custom_increment_kg: data.custom_increment_kg,
    notes: data.notes,
  };

  const { error } = await ctx.supabase
    .from("training_exercise_prefs")
    .upsert(payload, { onConflict: "user_id,exercise_id" });

  if (error) return dbError("Não foi possível salvar a preferência.");
  revalidateTraining();
  return { ok: true, data: null };
}

/* ───────────────────────────── Ações em massa ─────────────────────────────
 * Devolve quantos itens foram afetados e quantos foram IGNORADOS, para a interface poder
 * dizer a verdade ("3 arquivados, 2 ignorados por serem da base do sistema").
 */
export type BulkOutcome = { affected: number; skipped: number; reason?: string };

export async function bulkTrainingExercises(
  input: unknown,
): Promise<ActionResult<BulkOutcome>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingBulkSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { ids, action, muscle_group_id, equipment_id } = parsed.data;

  // Só alcança o que o usuário pode ver — a policy garante, e o filtro deixa explícito.
  const { data: rows } = await ctx.supabase
    .from("training_exercises")
    .select("id,user_id")
    .in("id", ids);

  const found = rows ?? [];
  const ownIds = found.filter((r) => r.user_id === ctx.userId).map((r) => r.id);
  const allIds = found.map((r) => r.id);

  // Favoritar e arquivar valem para qualquer exercício (viram preferência do usuário).
  if (action === "favoritar" || action === "desfavoritar" || action === "arquivar" || action === "restaurar") {
    const isFavoriteAction = action === "favoritar" || action === "desfavoritar";
    const { data: existing } = await ctx.supabase
      .from("training_exercise_prefs")
      .select("exercise_id,is_favorite,archived_at,custom_name,custom_rest_seconds,custom_increment_kg,notes")
      .in("exercise_id", allIds)
      .eq("user_id", ctx.userId);

    const byExercise = new Map((existing ?? []).map((p) => [p.exercise_id, p]));
    const now = new Date().toISOString();

    const payload = allIds.map((exerciseId) => {
      const prev = byExercise.get(exerciseId);
      return {
        user_id: ctx.userId,
        exercise_id: exerciseId,
        is_favorite: isFavoriteAction ? action === "favoritar" : (prev?.is_favorite ?? false),
        archived_at: isFavoriteAction
          ? (prev?.archived_at ?? null)
          : action === "arquivar"
            ? now
            : null,
        custom_name: prev?.custom_name ?? null,
        custom_rest_seconds: prev?.custom_rest_seconds ?? null,
        custom_increment_kg: prev?.custom_increment_kg ?? null,
        notes: prev?.notes ?? null,
      };
    });

    if (payload.length === 0) return { ok: true, data: { affected: 0, skipped: ids.length } };

    const { error } = await ctx.supabase
      .from("training_exercise_prefs")
      .upsert(payload, { onConflict: "user_id,exercise_id" });
    if (error) return dbError("Não foi possível aplicar a ação em massa.");

    revalidateTraining();
    return { ok: true, data: { affected: allIds.length, skipped: ids.length - allIds.length } };
  }

  // Excluir e recategorizar só alcançam exercício PRÓPRIO.
  const skipped = ids.length - ownIds.length;
  const skipReason = skipped > 0 ? "Exercícios da base do sistema foram ignorados." : undefined;

  if (ownIds.length === 0) {
    return { ok: true, data: { affected: 0, skipped, reason: skipReason } };
  }

  if (action === "excluir") {
    const { error } = await ctx.supabase
      .from("training_exercises")
      .delete()
      .in("id", ownIds)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível excluir os exercícios.");
  }

  if (action === "mudar_grupo") {
    if (!muscle_group_id) return invalid({ muscle_group_id: ["Escolha o grupo muscular."] });
    const { error } = await ctx.supabase
      .from("training_exercises")
      .update({ primary_muscle_group_id: muscle_group_id })
      .in("id", ownIds)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível alterar o grupo muscular.");
    // O novo principal não pode continuar como secundário.
    await ctx.supabase
      .from("training_exercise_muscles")
      .delete()
      .in("exercise_id", ownIds)
      .eq("muscle_group_id", muscle_group_id)
      .eq("user_id", ctx.userId);
  }

  if (action === "mudar_equipamento") {
    const { error } = await ctx.supabase
      .from("training_exercises")
      .update({ equipment_id: equipment_id })
      .in("id", ownIds)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível alterar o equipamento.");
  }

  revalidateTraining();
  return { ok: true, data: { affected: ownIds.length, skipped, reason: skipReason } };
}

/* ───────────────────────────── Alternativas ───────────────────────────── */

export async function addTrainingAlternative(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingAlternativeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase.from("training_exercise_alternatives").insert({
    user_id: ctx.userId,
    exercise_id: parsed.data.exercise_id,
    alternative_exercise_id: parsed.data.alternative_exercise_id,
    note: parsed.data.note,
  });

  if (error) {
    return dbError(
      error.code === "23505"
        ? "Essa alternativa já está cadastrada."
        : "Não foi possível cadastrar a alternativa.",
    );
  }

  revalidateTraining();
  return { ok: true, data: null };
}

export async function removeTrainingAlternative(id: string): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("training_exercise_alternatives")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível remover a alternativa.");
  revalidateTraining();
  return { ok: true, data: null };
}

/* ───────────────────────────── Vocabulário do usuário ─────────────────────────────
 * Criar grupo/equipamento próprio. A base global continua intocada.
 */

export async function createTrainingMuscleGroup(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingMuscleGroupSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data, error } = await ctx.supabase
    .from("training_muscle_groups")
    .insert({
      user_id: ctx.userId,
      slug: slugify(parsed.data.name) || `grupo_${Date.now()}`,
      name: parsed.data.name,
      region: parsed.data.region,
      parent_id: parsed.data.parent_id,
      color: parsed.data.color,
      position: 900,
    })
    .select("id")
    .single();

  if (error || !data) {
    return dbError(
      error?.code === "23505"
        ? "Você já tem um grupo com esse nome."
        : "Não foi possível criar o grupo muscular.",
    );
  }

  revalidateTraining();
  return { ok: true, data: { id: data.id } };
}

export async function createTrainingEquipment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingEquipmentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data, error } = await ctx.supabase
    .from("training_equipment")
    .insert({
      user_id: ctx.userId,
      slug: slugify(parsed.data.name) || `equip_${Date.now()}`,
      name: parsed.data.name,
      category: parsed.data.category,
      default_increment_kg: parsed.data.default_increment_kg,
      position: 900,
    })
    .select("id")
    .single();

  if (error || !data) {
    return dbError(
      error?.code === "23505"
        ? "Você já tem um equipamento com esse nome."
        : "Não foi possível criar o equipamento.",
    );
  }

  revalidateTraining();
  return { ok: true, data: { id: data.id } };
}
