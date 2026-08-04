"use server";

/**
 * Fase 17-B — Treinos · Server Actions de programas.
 *
 * Contrato do projeto (molde em `src/lib/actions/accounts.ts`):
 *   1. `authContext()` → `{ supabase, userId }`; `user_id` SEMPRE de `auth.getUser()`.
 *   2. Zod no servidor; erro → `invalid(...)`.
 *   3. Query com `user_id: ctx.userId` nos inserts e `.eq("user_id", …)` nas mutações.
 *   4. `revalidatePath` + `ActionResult`.
 *
 * ⛔ REGRA PRÓPRIA DESTA SUBFASE: **nenhuma exclusão silenciosa**. Excluir um programa exige
 * dizer o que fazer com os treinos dele — manter avulsos, mover para outro programa ou
 * excluir. O schema não tem valor padrão para essa escolha, então "esquecer" o campo vira erro
 * de validação em vez de perda de dado.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import {
  programDeleteSchema,
  programSchema,
  programStatusSchema,
  programUpdateSchema,
  programWorkoutSchema,
  programWorkoutUpdateSchema,
  reorderSchema,
} from "@/lib/validators/training-routines";
import type { ActionResult } from "@/types/finance";

const PROGRAMS_PATH = `${TRAINING_BASE_PATH}/programas`;
const WORKOUTS_PATH = `${TRAINING_BASE_PATH}/treinos`;
const CALENDAR_PATH = `${TRAINING_BASE_PATH}/calendario`;

function revalidateRoutines() {
  revalidatePath(TRAINING_BASE_PATH);
  revalidatePath(PROGRAMS_PATH);
  revalidatePath(WORKOUTS_PATH);
  revalidatePath(CALENDAR_PATH);
  revalidatePath(`${TRAINING_BASE_PATH}/hoje`);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/** Confere que o programa existe E é do usuário antes de qualquer escrita. */
async function ownsProgram(ctx: Ctx, id: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("training_programs")
    .select("id")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return Boolean(data);
}

/** Próxima posição livre na lista do usuário (a ordenação é sempre explícita). */
async function nextPosition(ctx: Ctx, table: "training_programs" | "training_workouts") {
  const { data } = await ctx.supabase
    .from(table)
    .select("position")
    .eq("user_id", ctx.userId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? -1) + 1;
}

/* ───────────────────────────── Criar / editar ───────────────────────────── */

export async function createTrainingProgram(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = programSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: created, error } = await ctx.supabase
    .from("training_programs")
    .insert({
      user_id: ctx.userId,
      name: data.name,
      description: data.description,
      goal: data.goal,
      level: data.level,
      status: data.status,
      starts_on: data.starts_on,
      ends_on: data.ends_on,
      duration_weeks: data.duration_weeks,
      weekly_frequency: data.weekly_frequency,
      color: data.color,
      icon: data.icon,
      notes: data.notes,
      is_active: data.is_active,
      position: await nextPosition(ctx, "training_programs"),
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível criar o programa.");

  revalidateRoutines();
  return { ok: true, data: { id: created.id } };
}

export async function updateTrainingProgram(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = programUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, ...data } = parsed.data;

  const { error } = await ctx.supabase
    .from("training_programs")
    .update({
      name: data.name,
      description: data.description,
      goal: data.goal,
      level: data.level,
      status: data.status,
      starts_on: data.starts_on,
      ends_on: data.ends_on,
      duration_weeks: data.duration_weeks,
      weekly_frequency: data.weekly_frequency,
      color: data.color,
      icon: data.icon,
      notes: data.notes,
      is_active: data.is_active,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível salvar o programa.");

  revalidateRoutines();
  return { ok: true, data: null };
}

/**
 * Ativar/pausar/finalizar/arquivar. `arquivado` também carimba `archived_at` — a data é o que
 * a lista usa para separar arquivado de ativo sem depender do texto do status.
 */
export async function setTrainingProgramStatus(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = programStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, status } = parsed.data;

  const { error } = await ctx.supabase
    .from("training_programs")
    .update({
      status,
      archived_at: status === "arquivado" ? new Date().toISOString() : null,
      // Só um programa "em uso" faz sentido: pausar/finalizar/arquivar solta a marcação.
      is_active: status === "ativo" ? undefined : false,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível alterar o status do programa.");

  revalidateRoutines();
  return { ok: true, data: null };
}

/**
 * Marca o programa como "em uso".
 *
 * O módulo NÃO bloqueia ter mais de um ativo: devolve quantos outros já estavam ativos para a
 * interface **avisar**. Bloquear seria decidir pelo usuário como ele organiza a rotina dele.
 */
export async function activateTrainingProgram(
  id: string,
): Promise<ActionResult<{ otherActive: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!(await ownsProgram(ctx, id))) return dbError("Programa não encontrado.");

  const { data: actives } = await ctx.supabase
    .from("training_programs")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("is_active", true)
    .neq("id", id);

  const { error } = await ctx.supabase
    .from("training_programs")
    .update({ is_active: true, status: "ativo", archived_at: null })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível ativar o programa.");

  revalidateRoutines();
  return { ok: true, data: { otherActive: actives?.length ?? 0 } };
}

/* ───────────────────────────── Excluir (com destino explícito) ───────────────────────────── */

export type ProgramDependencies = {
  workouts: number;
  scheduledFuture: number;
};

/** O que depende deste programa. A interface pergunta ANTES de excluir. */
export async function getTrainingProgramDependencies(
  id: string,
  hoje: string,
): Promise<ActionResult<ProgramDependencies>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const [links, scheduled] = await Promise.all([
    ctx.supabase
      .from("training_program_workouts")
      .select("id")
      .eq("program_id", id)
      .eq("user_id", ctx.userId),
    ctx.supabase
      .from("training_scheduled_workouts")
      .select("id")
      .eq("program_id", id)
      .eq("user_id", ctx.userId)
      .gte("scheduled_date", hoje),
  ]);

  return {
    ok: true,
    data: { workouts: links.data?.length ?? 0, scheduledFuture: scheduled.data?.length ?? 0 },
  };
}

/**
 * Excluir programa.
 *
 * `workouts_destination` é obrigatório e sem padrão: o usuário escolhe manter os treinos como
 * avulsos, movê-los para outro programa ou excluí-los junto. Nada é decidido por omissão.
 */
export async function deleteTrainingProgram(
  input: unknown,
): Promise<ActionResult<{ workoutsAffected: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = programDeleteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, workouts_destination, target_program_id } = parsed.data;

  if (!(await ownsProgram(ctx, id))) return dbError("Programa não encontrado.");

  if (workouts_destination === "mover") {
    if (!target_program_id) {
      return invalid({ target_program_id: ["Escolha o programa de destino."] });
    }
    if (target_program_id === id) {
      return invalid({ target_program_id: ["Escolha um programa diferente."] });
    }
    if (!(await ownsProgram(ctx, target_program_id))) {
      return invalid({ target_program_id: ["Programa de destino não encontrado."] });
    }
  }

  const { data: links } = await ctx.supabase
    .from("training_program_workouts")
    .select("id,workout_id")
    .eq("program_id", id)
    .eq("user_id", ctx.userId);

  const workoutIds = (links ?? []).map((link) => link.workout_id);

  if (workouts_destination === "excluir" && workoutIds.length > 0) {
    const { error } = await ctx.supabase
      .from("training_workouts")
      .delete()
      .in("id", workoutIds)
      .eq("user_id", ctx.userId);
    if (error) {
      return dbError(
        "Não foi possível excluir os treinos deste programa. Um deles pode estar em uso — exclua-o pela tela de Treinos para ver o motivo.",
      );
    }
  }

  if (workouts_destination === "mover" && workoutIds.length > 0 && target_program_id) {
    // Um treino já vinculado ao destino não pode virar linha duplicada (unique program+workout).
    const { data: existing } = await ctx.supabase
      .from("training_program_workouts")
      .select("workout_id")
      .eq("program_id", target_program_id)
      .eq("user_id", ctx.userId);

    const already = new Set((existing ?? []).map((row) => row.workout_id));
    const toMove = workoutIds.filter((workoutId) => !already.has(workoutId));

    if (toMove.length > 0) {
      const base = (existing?.length ?? 0);
      const { error } = await ctx.supabase.from("training_program_workouts").insert(
        toMove.map((workoutId, index) => ({
          user_id: ctx.userId,
          program_id: target_program_id,
          workout_id: workoutId,
          position: base + index,
        })),
      );
      if (error) return dbError("Não foi possível mover os treinos para o outro programa.");
    }

    await ctx.supabase
      .from("training_workouts")
      .update({ program_id: target_program_id })
      .in("id", workoutIds)
      .eq("user_id", ctx.userId);
  }

  // `training_workouts.program_id` é `set null` e `training_program_workouts` é cascade:
  // no destino "manter_avulsos" o banco já faz a coisa certa sozinho.
  const { error } = await ctx.supabase
    .from("training_programs")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível excluir o programa.");

  revalidateRoutines();
  return { ok: true, data: { workoutsAffected: workoutIds.length } };
}

/* ───────────────────────────── Composição do programa ───────────────────────────── */

export async function addWorkoutToProgram(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = programWorkoutSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: existing } = await ctx.supabase
    .from("training_program_workouts")
    .select("id")
    .eq("program_id", data.program_id)
    .eq("user_id", ctx.userId);

  const { error } = await ctx.supabase.from("training_program_workouts").insert({
    user_id: ctx.userId,
    program_id: data.program_id,
    workout_id: data.workout_id,
    label: data.label,
    suggested_weekdays: data.suggested_weekdays.length > 0 ? data.suggested_weekdays : null,
    notes: data.notes,
    position: existing?.length ?? 0,
  });

  if (error) {
    return dbError(
      error.code === "23505"
        ? "Este treino já faz parte do programa."
        : "Não foi possível adicionar o treino ao programa.",
    );
  }

  revalidateRoutines();
  return { ok: true, data: null };
}

export async function updateProgramWorkout(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = programWorkoutUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, ...data } = parsed.data;

  const { error } = await ctx.supabase
    .from("training_program_workouts")
    .update({
      label: data.label,
      suggested_weekdays: data.suggested_weekdays.length > 0 ? data.suggested_weekdays : null,
      notes: data.notes,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível salvar o treino do programa.");

  revalidateRoutines();
  return { ok: true, data: null };
}

export async function removeWorkoutFromProgram(id: string): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // Tirar do programa NÃO exclui o treino: ele volta a ser avulso e continua reutilizável.
  const { error } = await ctx.supabase
    .from("training_program_workouts")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível remover o treino do programa.");

  revalidateRoutines();
  return { ok: true, data: null };
}

/** Reordenar é sempre reversível: a interface manda a ordem inteira, e ela é regravada. */
export async function reorderProgramWorkouts(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  for (const [index, id] of parsed.data.ids.entries()) {
    const { error } = await ctx.supabase
      .from("training_program_workouts")
      .update({ position: index })
      .eq("id", id)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível salvar a nova ordem.");
  }

  revalidateRoutines();
  return { ok: true, data: null };
}

export async function reorderTrainingPrograms(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  for (const [index, id] of parsed.data.ids.entries()) {
    const { error } = await ctx.supabase
      .from("training_programs")
      .update({ position: index })
      .eq("id", id)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível salvar a nova ordem.");
  }

  revalidateRoutines();
  return { ok: true, data: null };
}

/** Duplicar programa: identificadores novos, mesma composição, nada de histórico arrastado. */
export async function duplicateTrainingProgram(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: origin } = await ctx.supabase
    .from("training_programs")
    .select(
      "name,description,goal,level,starts_on,ends_on,duration_weeks,weekly_frequency,color,icon,notes",
    )
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!origin) return dbError("Programa não encontrado.");

  const { data: created, error } = await ctx.supabase
    .from("training_programs")
    .insert({
      user_id: ctx.userId,
      name: `${origin.name} (cópia)`,
      description: origin.description,
      goal: origin.goal,
      level: origin.level,
      starts_on: origin.starts_on,
      ends_on: origin.ends_on,
      duration_weeks: origin.duration_weeks,
      weekly_frequency: origin.weekly_frequency,
      color: origin.color,
      icon: origin.icon,
      notes: origin.notes,
      // A cópia nasce rascunho e inativa: duplicar não é começar a usar.
      status: "rascunho",
      is_active: false,
      position: await nextPosition(ctx, "training_programs"),
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível duplicar o programa.");

  const { data: links } = await ctx.supabase
    .from("training_program_workouts")
    .select("workout_id,position,label,suggested_weekdays,notes")
    .eq("program_id", id)
    .eq("user_id", ctx.userId);

  if (links?.length) {
    await ctx.supabase.from("training_program_workouts").insert(
      links.map((link) => ({
        user_id: ctx.userId,
        program_id: created.id,
        workout_id: link.workout_id,
        position: link.position,
        label: link.label,
        suggested_weekdays: link.suggested_weekdays,
        notes: link.notes,
      })),
    );
  }

  revalidateRoutines();
  return { ok: true, data: { id: created.id } };
}
