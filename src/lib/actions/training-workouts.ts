"use server";

/**
 * Fase 17-B — Treinos · Server Actions do treino-modelo.
 *
 * ⛔ TRÊS REGRAS PRÓPRIAS DESTA SUBFASE:
 *
 * 1. **Nenhuma exclusão silenciosa.** Excluir um treino com planejamento futuro exige dizer o
 *    que fazer com os dias planejados (manter como "treino removido", remover ou trocar por
 *    outro treino). O schema não tem padrão para essa escolha.
 *
 * 2. **Versionar é escolha do usuário, nunca automática.** "Salvar alterações" grava na mesma
 *    linha; "salvar como nova versão" cria uma linha com `version + 1`, aponta a antiga com
 *    `superseded_by` e arquiva a antiga — que continua legível. Versionar sozinho a cada
 *    edição encheria o banco de intenções que ninguém pediu para guardar.
 *
 * 3. **Superset furado não é salvo.** A contiguidade é validada por `validateSupersets`
 *    (função pura, testada) no servidor também — a interface bloqueia, mas quem garante é
 *    aqui, porque uma ordem impossível quebraria a sessão ao vivo (17-C).
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { hojeISO } from "@/lib/format";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import { applyOrder, validateSupersets } from "@/lib/training/workout";
import {
  reorderSchema,
  workoutAlternativeSchema,
  workoutBulkSchema,
  workoutDeleteSchema,
  workoutDuplicateSchema,
  workoutExerciseSchema,
  workoutExerciseUpdateSchema,
  workoutExercisesAddSchema,
  workoutMoveSchema,
  workoutNewVersionSchema,
  workoutSchema,
  workoutSetsSchema,
  workoutUpdateSchema,
} from "@/lib/validators/training-routines";
import type { ActionResult } from "@/types/finance";

const PROGRAMS_PATH = `${TRAINING_BASE_PATH}/programas`;
const WORKOUTS_PATH = `${TRAINING_BASE_PATH}/treinos`;

function revalidateRoutines() {
  revalidatePath(TRAINING_BASE_PATH);
  revalidatePath(WORKOUTS_PATH);
  revalidatePath(PROGRAMS_PATH);
  revalidatePath(`${TRAINING_BASE_PATH}/calendario`);
  revalidatePath(`${TRAINING_BASE_PATH}/hoje`);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

async function ownsWorkout(ctx: Ctx, id: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("training_workouts")
    .select("id")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return Boolean(data);
}

/** O `workout_id` do exercício, confirmando de quebra que a linha é do usuário. */
async function workoutIdOfExercise(ctx: Ctx, workoutExerciseId: string): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("training_workout_exercises")
    .select("workout_id")
    .eq("id", workoutExerciseId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data?.workout_id ?? null;
}

/* ───────────────────────────── Criar / editar treino ───────────────────────────── */

export async function createTrainingWorkout(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: last } = await ctx.supabase
    .from("training_workouts")
    .select("position")
    .eq("user_id", ctx.userId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await ctx.supabase
    .from("training_workouts")
    .insert({
      user_id: ctx.userId,
      name: data.name,
      short_name: data.short_name,
      description: data.description,
      goal: data.goal,
      status: data.status,
      program_id: data.program_id,
      estimated_minutes: data.estimated_minutes,
      color: data.color,
      icon: data.icon,
      notes: data.notes,
      position: (last?.position ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível criar o treino.");

  // Criar já dentro de um programa também cria o vínculo — senão o treino "sumiria" do programa.
  if (data.program_id) {
    const { data: siblings } = await ctx.supabase
      .from("training_program_workouts")
      .select("id")
      .eq("program_id", data.program_id)
      .eq("user_id", ctx.userId);

    await ctx.supabase.from("training_program_workouts").insert({
      user_id: ctx.userId,
      program_id: data.program_id,
      workout_id: created.id,
      position: siblings?.length ?? 0,
    });
  }

  revalidateRoutines();
  return { ok: true, data: { id: created.id } };
}

export async function updateTrainingWorkout(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, ...data } = parsed.data;

  const { error } = await ctx.supabase
    .from("training_workouts")
    .update({
      name: data.name,
      short_name: data.short_name,
      description: data.description,
      goal: data.goal,
      status: data.status,
      program_id: data.program_id,
      estimated_minutes: data.estimated_minutes,
      color: data.color,
      icon: data.icon,
      notes: data.notes,
      archived_at: data.status === "arquivado" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível salvar o treino.");

  revalidateRoutines();
  return { ok: true, data: null };
}

/* ───────────────────────────── Versionamento ───────────────────────────── */

/**
 * "Salvar como nova versão".
 *
 * Cria uma cópia completa (exercícios, séries e alternativas) com `version + 1` no MESMO
 * `version_group_id`, marca a antiga com `superseded_by` e a arquiva. A versão anterior
 * continua legível — é justamente o ponto: comparar "meu ABC de janeiro × o de maio".
 *
 * Isto **não** é o que protege o histórico de execução. Quem protege é o snapshot da 17-C.
 */
export async function createWorkoutVersion(
  input: unknown,
): Promise<ActionResult<{ id: string; version: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutNewVersionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, note } = parsed.data;

  const { data: origin } = await ctx.supabase
    .from("training_workouts")
    .select(
      "id,name,short_name,description,goal,status,program_id,estimated_minutes,color,icon,notes,version,version_group_id,position,is_favorite",
    )
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!origin) return dbError("Treino não encontrado.");

  const { data: created, error } = await ctx.supabase
    .from("training_workouts")
    .insert({
      user_id: ctx.userId,
      name: origin.name,
      short_name: origin.short_name,
      description: origin.description,
      goal: origin.goal,
      status: "ativo",
      program_id: origin.program_id,
      estimated_minutes: origin.estimated_minutes,
      color: origin.color,
      icon: origin.icon,
      notes: note ?? origin.notes,
      version: origin.version + 1,
      version_group_id: origin.version_group_id,
      position: origin.position,
      is_favorite: origin.is_favorite,
    })
    .select("id,version")
    .single();

  if (error || !created) return dbError("Não foi possível criar a nova versão.");

  const copyError = await copyWorkoutContent(ctx, origin.id, created.id);
  if (copyError) return dbError("A nova versão foi criada, mas copiar os exercícios falhou.");

  // A versão antiga sai de cena sem sumir: arquivada e apontando para a nova.
  await ctx.supabase
    .from("training_workouts")
    .update({
      superseded_by: created.id,
      status: "arquivado",
      archived_at: new Date().toISOString(),
    })
    .eq("id", origin.id)
    .eq("user_id", ctx.userId);

  // O planejamento FUTURO passa a apontar para a versão nova; o passado fica intacto.
  // `hojeISO()` e não `toISOString().slice(0,10)`: em Brasília, das 21h à meia-noite o UTC já
  // virou o dia, e o treino de HOJE seria tratado como passado.
  await ctx.supabase
    .from("training_scheduled_workouts")
    .update({ workout_id: created.id })
    .eq("workout_id", origin.id)
    .eq("user_id", ctx.userId)
    .eq("status", "planejado")
    .gte("scheduled_date", hojeISO());

  // O vínculo com o programa acompanha a versão em uso.
  await ctx.supabase
    .from("training_program_workouts")
    .update({ workout_id: created.id })
    .eq("workout_id", origin.id)
    .eq("user_id", ctx.userId);

  revalidateRoutines();
  return { ok: true, data: { id: created.id, version: created.version } };
}

/** Copia exercícios + séries + alternativas de um treino para outro. Ids sempre novos. */
async function copyWorkoutContent(
  ctx: Ctx,
  fromWorkoutId: string,
  toWorkoutId: string,
): Promise<string | null> {
  const { data: exercises } = await ctx.supabase
    .from("training_workout_exercises")
    .select("*")
    .eq("workout_id", fromWorkoutId)
    .eq("user_id", ctx.userId)
    .order("position", { ascending: true });

  if (!exercises?.length) return null;

  for (const source of exercises) {
    const { id: _oldId, workout_id: _oldWorkout, created_at, updated_at, ...rest } = source;
    void _oldId;
    void _oldWorkout;
    void created_at;
    void updated_at;

    const { data: created, error } = await ctx.supabase
      .from("training_workout_exercises")
      .insert({ ...rest, user_id: ctx.userId, workout_id: toWorkoutId })
      .select("id")
      .single();

    if (error || !created) return error?.message ?? "insert falhou";

    const [{ data: sets }, { data: alternatives }] = await Promise.all([
      ctx.supabase
        .from("training_workout_sets")
        .select("*")
        .eq("workout_exercise_id", source.id)
        .eq("user_id", ctx.userId),
      ctx.supabase
        .from("training_workout_alternatives")
        .select("alternative_exercise_id,note,position")
        .eq("workout_exercise_id", source.id)
        .eq("user_id", ctx.userId),
    ]);

    if (sets?.length) {
      const payload = sets.map((set) => {
        const { id: _setId, workout_exercise_id: _parent, created_at: _c, updated_at: _u, ...setRest } = set;
        void _setId;
        void _parent;
        void _c;
        void _u;
        return { ...setRest, user_id: ctx.userId, workout_exercise_id: created.id };
      });
      const { error: setsError } = await ctx.supabase.from("training_workout_sets").insert(payload);
      if (setsError) return setsError.message;
    }

    if (alternatives?.length) {
      const { error: altError } = await ctx.supabase.from("training_workout_alternatives").insert(
        alternatives.map((alt) => ({
          user_id: ctx.userId,
          workout_exercise_id: created.id,
          alternative_exercise_id: alt.alternative_exercise_id,
          note: alt.note,
          position: alt.position,
        })),
      );
      if (altError) return altError.message;
    }
  }

  return null;
}

/* ───────────────────────────── Duplicar ───────────────────────────── */

/** Duplicar cria identificadores novos e NÃO arrasta histórico, recorde nem vínculo vivo. */
export async function duplicateTrainingWorkout(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutDuplicateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, name, program_id } = parsed.data;

  const { data: origin } = await ctx.supabase
    .from("training_workouts")
    .select("id,name,short_name,description,goal,program_id,estimated_minutes,color,icon,notes")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!origin) return dbError("Treino não encontrado.");

  const { data: last } = await ctx.supabase
    .from("training_workouts")
    .select("position")
    .eq("user_id", ctx.userId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await ctx.supabase
    .from("training_workouts")
    .insert({
      user_id: ctx.userId,
      name: name?.trim() || `${origin.name} (cópia)`,
      short_name: origin.short_name,
      description: origin.description,
      goal: origin.goal,
      status: "ativo",
      // A cópia nasce numa linha do tempo NOVA: version 1 e version_group_id próprio (default).
      program_id: program_id ?? origin.program_id,
      estimated_minutes: origin.estimated_minutes,
      color: origin.color,
      icon: origin.icon,
      notes: origin.notes,
      position: (last?.position ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível duplicar o treino.");

  const copyError = await copyWorkoutContent(ctx, origin.id, created.id);
  if (copyError) return dbError("O treino foi copiado, mas os exercícios falharam.");

  revalidateRoutines();
  return { ok: true, data: { id: created.id } };
}

/* ───────────────────────────── Excluir (com destino explícito) ───────────────────────────── */

export type WorkoutDependencies = {
  scheduledFuture: number;
  scheduledPast: number;
  programs: number;
};

export async function getTrainingWorkoutDependencies(
  id: string,
  hoje: string,
): Promise<ActionResult<WorkoutDependencies>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const [future, past, programs] = await Promise.all([
    ctx.supabase
      .from("training_scheduled_workouts")
      .select("id")
      .eq("workout_id", id)
      .eq("user_id", ctx.userId)
      .gte("scheduled_date", hoje),
    ctx.supabase
      .from("training_scheduled_workouts")
      .select("id")
      .eq("workout_id", id)
      .eq("user_id", ctx.userId)
      .lt("scheduled_date", hoje),
    ctx.supabase
      .from("training_program_workouts")
      .select("id")
      .eq("workout_id", id)
      .eq("user_id", ctx.userId),
  ]);

  return {
    ok: true,
    data: {
      scheduledFuture: future.data?.length ?? 0,
      scheduledPast: past.data?.length ?? 0,
      programs: programs.data?.length ?? 0,
    },
  };
}

/**
 * Excluir treino-modelo.
 *
 * O planejamento PASSADO nunca é tocado — ele vira memória de que aquele dia existiu, com o
 * rótulo "treino removido". O que o usuário decide é o destino do planejamento FUTURO.
 */
export async function deleteTrainingWorkout(
  input: unknown,
): Promise<ActionResult<{ scheduledAffected: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutDeleteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, scheduled_destination, target_workout_id } = parsed.data;

  if (!(await ownsWorkout(ctx, id))) return dbError("Treino não encontrado.");

  if (scheduled_destination === "trocar") {
    if (!target_workout_id) return invalid({ target_workout_id: ["Escolha o treino substituto."] });
    if (target_workout_id === id) return invalid({ target_workout_id: ["Escolha um treino diferente."] });
    if (!(await ownsWorkout(ctx, target_workout_id))) {
      return invalid({ target_workout_id: ["Treino substituto não encontrado."] });
    }
  }

  const { data: future } = await ctx.supabase
    .from("training_scheduled_workouts")
    .select("id")
    .eq("workout_id", id)
    .eq("user_id", ctx.userId)
    .gte("scheduled_date", hojeISO());

  const futureIds = (future ?? []).map((row) => row.id);

  if (futureIds.length > 0) {
    if (scheduled_destination === "remover") {
      const { error } = await ctx.supabase
        .from("training_scheduled_workouts")
        .delete()
        .in("id", futureIds)
        .eq("user_id", ctx.userId);
      if (error) return dbError("Não foi possível limpar o planejamento futuro.");
    }

    if (scheduled_destination === "trocar" && target_workout_id) {
      const { error } = await ctx.supabase
        .from("training_scheduled_workouts")
        .update({ workout_id: target_workout_id })
        .in("id", futureIds)
        .eq("user_id", ctx.userId);
      if (error) return dbError("Não foi possível trocar o treino do planejamento futuro.");
    }
    // "manter": `workout_id` é `set null`, e a linha continua legível como "treino removido".
  }

  const { error } = await ctx.supabase
    .from("training_workouts")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível excluir o treino.");

  revalidateRoutines();
  return { ok: true, data: { scheduledAffected: futureIds.length } };
}

/* ───────────────────────────── Ações em massa ───────────────────────────── */

export type WorkoutBulkOutcome = { affected: number };

export async function bulkTrainingWorkouts(
  input: unknown,
): Promise<ActionResult<WorkoutBulkOutcome>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutBulkSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { ids, action } = parsed.data;

  if (action === "duplicar") {
    let affected = 0;
    for (const id of ids) {
      const result = await duplicateTrainingWorkout({ id });
      if (result.ok) affected += 1;
    }
    revalidateRoutines();
    return { ok: true, data: { affected } };
  }

  const now = new Date().toISOString();
  const patch =
    action === "arquivar"
      ? { status: "arquivado" as const, archived_at: now }
      : action === "restaurar"
        ? { status: "ativo" as const, archived_at: null }
        : { is_favorite: action === "favoritar" };

  const { error } = await ctx.supabase
    .from("training_workouts")
    .update(patch)
    .in("id", ids)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível aplicar a ação em massa.");

  revalidateRoutines();
  return { ok: true, data: { affected: ids.length } };
}

/** Mover treinos para outro programa (ou soltá-los como avulsos). */
export async function moveWorkoutsToProgram(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutMoveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { ids, program_id } = parsed.data;

  const { error } = await ctx.supabase
    .from("training_workouts")
    .update({ program_id })
    .in("id", ids)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível mover os treinos.");

  if (program_id) {
    const { data: existing } = await ctx.supabase
      .from("training_program_workouts")
      .select("workout_id")
      .eq("program_id", program_id)
      .eq("user_id", ctx.userId);

    const already = new Set((existing ?? []).map((row) => row.workout_id));
    const toLink = ids.filter((id) => !already.has(id));

    if (toLink.length > 0) {
      const base = existing?.length ?? 0;
      await ctx.supabase.from("training_program_workouts").insert(
        toLink.map((workoutId, index) => ({
          user_id: ctx.userId,
          program_id,
          workout_id: workoutId,
          position: base + index,
        })),
      );
    }
  }

  revalidateRoutines();
  return { ok: true, data: null };
}

/* ───────────────────────────── Exercícios do treino ───────────────────────────── */

/** Acrescenta um ou mais exercícios ao fim do treino, com a configuração padrão. */
export async function addExercisesToWorkout(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutExercisesAddSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { workout_id, exercise_ids } = parsed.data;

  if (!(await ownsWorkout(ctx, workout_id))) return dbError("Treino não encontrado.");

  const { data: existing } = await ctx.supabase
    .from("training_workout_exercises")
    .select("id")
    .eq("workout_id", workout_id)
    .eq("user_id", ctx.userId);

  const base = existing?.length ?? 0;

  const { error } = await ctx.supabase.from("training_workout_exercises").insert(
    exercise_ids.map((exerciseId, index) => ({
      user_id: ctx.userId,
      workout_id,
      exercise_id: exerciseId,
      position: base + index,
    })),
  );

  if (error) return dbError("Não foi possível adicionar os exercícios.");

  revalidateRoutines();
  return { ok: true, data: null };
}

export async function addExerciseToWorkout(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutExerciseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (!(await ownsWorkout(ctx, data.workout_id))) return dbError("Treino não encontrado.");

  const supersetError = await checkSupersetAfterChange(ctx, data.workout_id, null, data.superset_group);
  if (supersetError) return invalid({ superset_group: [supersetError] });

  const { data: existing } = await ctx.supabase
    .from("training_workout_exercises")
    .select("id")
    .eq("workout_id", data.workout_id)
    .eq("user_id", ctx.userId);

  const { data: created, error } = await ctx.supabase
    .from("training_workout_exercises")
    .insert({
      ...toExercisePayload(data),
      user_id: ctx.userId,
      workout_id: data.workout_id,
      exercise_id: data.exercise_id,
      position: existing?.length ?? 0,
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível adicionar o exercício.");

  revalidateRoutines();
  return { ok: true, data: { id: created.id } };
}

/**
 * Só a CONFIGURAÇÃO do exercício: `workout_id` e `exercise_id` ficam de fora porque são
 * identidade, não configuração — trocar o exercício de um item do treino é remover e
 * adicionar outro, não editar um campo.
 */
type ExercisePayloadInput = {
  default_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_duration_seconds: number | null;
  target_distance_m: number | null;
  planned_weight_kg: number | null;
  planned_additional_weight_kg: number | null;
  planned_assistance_weight_kg: number | null;
  rest_seconds: number | null;
  target_rir: number | null;
  target_rpe: number | null;
  set_type: string;
  technique: string | null;
  superset_group: string | null;
  is_warmup: boolean;
  counts_in_volume: boolean;
  increment_kg: number | null;
  tempo: string | null;
  notes: string | null;
};

function toExercisePayload(data: ExercisePayloadInput) {
  return {
    default_sets: data.default_sets,
    target_reps_min: data.target_reps_min,
    target_reps_max: data.target_reps_max,
    target_duration_seconds: data.target_duration_seconds,
    target_distance_m: data.target_distance_m,
    planned_weight_kg: data.planned_weight_kg,
    planned_additional_weight_kg: data.planned_additional_weight_kg,
    planned_assistance_weight_kg: data.planned_assistance_weight_kg,
    rest_seconds: data.rest_seconds,
    target_rir: data.target_rir,
    target_rpe: data.target_rpe,
    set_type: data.set_type,
    technique: data.technique,
    superset_group: data.superset_group,
    is_warmup: data.is_warmup,
    counts_in_volume: data.counts_in_volume,
    increment_kg: data.increment_kg,
    tempo: data.tempo,
    notes: data.notes,
  };
}

/**
 * Um superset furado não chega ao banco.
 *
 * Simula a mudança sobre a ordem atual e roda `validateSupersets` — a MESMA função pura que a
 * interface usa. Duas implementações da regra dariam duas respostas diferentes.
 */
async function checkSupersetAfterChange(
  ctx: Ctx,
  workoutId: string,
  exerciseRowId: string | null,
  nextGroup: string | null,
): Promise<string | null> {
  if (!nextGroup && !exerciseRowId) return null;

  const { data: rows } = await ctx.supabase
    .from("training_workout_exercises")
    .select("id,position,superset_group")
    .eq("workout_id", workoutId)
    .eq("user_id", ctx.userId)
    .order("position", { ascending: true });

  const previousGroup =
    (rows ?? []).find((row) => row.id === exerciseRowId)?.superset_group ?? null;

  const current = (rows ?? []).map((row) => ({
    supersetGroup: row.id === exerciseRowId ? nextGroup : row.superset_group,
  }));

  // Exercício novo entra no fim da lista.
  if (!exerciseRowId) current.push({ supersetGroup: nextGroup });

  const validation = validateSupersets(current);
  if (validation.ok) return null;

  // Só reclama do que ESTA alteração provocou: um bloco quebrado em outro ponto do treino já
  // tem o próprio aviso na tela, e travar aqui impediria o usuário de consertar o resto.
  const touched = [nextGroup, previousGroup].filter(Boolean);
  const related = validation.issues.find((issue) => touched.includes(issue.group));
  return related?.message ?? null;
}

export async function updateWorkoutExercise(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutExerciseUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, ...data } = parsed.data;

  const workoutId = await workoutIdOfExercise(ctx, id);
  if (!workoutId) return dbError("Exercício do treino não encontrado.");

  const supersetError = await checkSupersetAfterChange(ctx, workoutId, id, data.superset_group);
  if (supersetError) return invalid({ superset_group: [supersetError] });

  const { error } = await ctx.supabase
    .from("training_workout_exercises")
    .update(toExercisePayload(data))
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível salvar o exercício do treino.");

  revalidateRoutines();
  return { ok: true, data: null };
}

export async function removeWorkoutExercise(id: string): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // Séries e alternativas são `on delete cascade`: são parte do exercício, não dados à parte.
  const { error } = await ctx.supabase
    .from("training_workout_exercises")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível remover o exercício.");

  revalidateRoutines();
  return { ok: true, data: null };
}

/**
 * Reordenar exercícios. A ordem nova é validada ANTES de gravar: arrastar um exercício para o
 * meio de um superset quebraria a contiguidade, e isso é recusado com mensagem em pt-BR.
 */
export async function reorderWorkoutExercises(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const ids = parsed.data.ids;

  const { data: rows } = await ctx.supabase
    .from("training_workout_exercises")
    .select("id,position,superset_group")
    .in("id", ids)
    .eq("user_id", ctx.userId);

  if (!rows?.length) return dbError("Exercícios não encontrados.");

  const ordered = applyOrder(
    rows.map((row) => ({ id: row.id, position: row.position, supersetGroup: row.superset_group })),
    ids,
  );

  const validation = validateSupersets(ordered);
  if (!validation.ok) {
    return dbError(
      validation.issues.map((issue) => issue.message).join(" ") ||
        "Esta ordem quebraria um superset.",
    );
  }

  for (const item of ordered) {
    const { error } = await ctx.supabase
      .from("training_workout_exercises")
      .update({ position: item.position })
      .eq("id", item.id)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível salvar a nova ordem.");
  }

  revalidateRoutines();
  return { ok: true, data: null };
}

/* ───────────────────────────── Séries configuradas ─────────────────────────────
 * Gravadas em bloco (apaga e insere). Lista VAZIA é escolha válida: significa "voltar às
 * séries uniformes de `default_sets`", e `expandPlannedSets` resolve os dois casos igual.
 */

export async function setWorkoutSets(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutSetsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { workout_exercise_id, sets } = parsed.data;

  if (!(await workoutIdOfExercise(ctx, workout_exercise_id))) {
    return dbError("Exercício do treino não encontrado.");
  }

  const { error: deleteError } = await ctx.supabase
    .from("training_workout_sets")
    .delete()
    .eq("workout_exercise_id", workout_exercise_id)
    .eq("user_id", ctx.userId);

  if (deleteError) return dbError("Não foi possível salvar as séries.");

  if (sets.length > 0) {
    const { error } = await ctx.supabase.from("training_workout_sets").insert(
      sets.map((set, index) => ({
        user_id: ctx.userId,
        workout_exercise_id,
        set_number: index + 1,
        set_type: set.set_type,
        target_reps_min: set.target_reps_min,
        target_reps_max: set.target_reps_max,
        target_duration_seconds: set.target_duration_seconds,
        target_distance_m: set.target_distance_m,
        planned_weight_kg: set.planned_weight_kg,
        planned_additional_weight_kg: set.planned_additional_weight_kg,
        planned_assistance_weight_kg: set.planned_assistance_weight_kg,
        rest_seconds: set.rest_seconds,
        target_rir: set.target_rir,
        target_rpe: set.target_rpe,
        is_warmup: set.is_warmup,
        counts_in_volume: set.counts_in_volume,
        notes: set.notes,
      })),
    );
    if (error) return dbError("Não foi possível salvar as séries.");
  }

  revalidateRoutines();
  return { ok: true, data: null };
}

/* ───────────────────────────── Alternativas dentro do treino ───────────────────────────── */

export async function addWorkoutAlternative(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutAlternativeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: existing } = await ctx.supabase
    .from("training_workout_alternatives")
    .select("id")
    .eq("workout_exercise_id", data.workout_exercise_id)
    .eq("user_id", ctx.userId);

  const { error } = await ctx.supabase.from("training_workout_alternatives").insert({
    user_id: ctx.userId,
    workout_exercise_id: data.workout_exercise_id,
    alternative_exercise_id: data.alternative_exercise_id,
    note: data.note,
    position: existing?.length ?? 0,
  });

  if (error) {
    return dbError(
      error.code === "23505"
        ? "Essa alternativa já está cadastrada neste exercício."
        : "Não foi possível cadastrar a alternativa.",
    );
  }

  revalidateRoutines();
  return { ok: true, data: null };
}

export async function removeWorkoutAlternative(id: string): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("training_workout_alternatives")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível remover a alternativa.");

  revalidateRoutines();
  return { ok: true, data: null };
}
