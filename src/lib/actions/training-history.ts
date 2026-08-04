"use server";

/**
 * Fase 17-D — Treinos · Server Actions do histórico, dos recordes e da progressão.
 *
 * Molde do projeto: `authContext()` → Zod (`safeParse`) → query com `user_id` explícito →
 * `revalidatePath` → `ActionResult`. Nenhum id vem do client sem passar por `.eq("user_id", …)`.
 *
 * ═══════════════════════ AS TRÊS REGRAS QUE ESTAS ACTIONS EXISTEM PARA GARANTIR ═══════════════════════
 *
 *  1. **Excluir uma sessão recalcula os recordes afetados.** Um recorde que dependia dela não
 *     sobrevive a ela — e o segundo melhor assume, com a data dele.
 *  2. **Nenhuma sugestão é aplicada sozinha.** Aceitar é uma ação explícita, grava o valor
 *     anterior e só então altera o treino-modelo (17-B).
 *  3. **Dor registrada nunca vira sugestão de aumento.** A trava mora em `progression.ts`, e
 *     estas actions não têm caminho que a contorne.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import {
  findWorkoutExerciseTarget,
  syncPersonalRecords,
  syncProgressionSuggestions,
} from "@/lib/training/records-sync";
// 17-F — o hábito "Treinar" reflete o histórico (opt-in, sem segundo registro).
import { reflectTrainingInHabit } from "@/lib/training/habit-sync";
import {
  deleteSessionSchema,
  generateSuggestionsSchema,
  progressionRuleDeleteSchema,
  progressionRuleSchema,
  progressionRuleUpdateSchema,
  rebuildRecordsSchema,
  suggestionDecisionSchema,
} from "@/lib/validators/training-history";
import type { ActionResult } from "@/types/finance";

const HISTORY_PATH = `${TRAINING_BASE_PATH}/historico`;

function revalidateHistory() {
  revalidatePath(TRAINING_BASE_PATH);
  revalidatePath(HISTORY_PATH);
  revalidatePath(`${TRAINING_BASE_PATH}/recordes`);
  revalidatePath(`${TRAINING_BASE_PATH}/evolucao`);
  revalidatePath(`${TRAINING_BASE_PATH}/exercicios`);
}

/* ═══════════════════════════ Recordes ═══════════════════════════ */

/**
 * Recalcula todos os recordes a partir do histórico.
 *
 * Idempotente: rodar duas vezes seguidas não muda nada na segunda. É o mesmo caminho usado ao
 * finalizar e ao excluir uma sessão — não existe rotina especial de "desfazer recorde".
 */
export async function rebuildPersonalRecords(
  input: unknown = {},
): Promise<ActionResult<{ created: number; improved: number; removed: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = rebuildRecordsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  try {
    const result = await syncPersonalRecords(ctx);
    revalidateHistory();
    return {
      ok: true,
      data: { created: result.created, improved: result.improved, removed: result.removed },
    };
  } catch {
    return dbError("Não foi possível recalcular os recordes.");
  }
}

/* ═══════════════════════════ Exclusão de sessão ═══════════════════════════ */

/**
 * Exclui um treino do histórico.
 *
 * Exige confirmação explícita (o schema **não tem valor padrão** para `confirm`) e recalcula os
 * recordes logo depois. As linhas filhas caem por cascade; o dia planejado que a sessão havia
 * concluído volta a `planejado`, porque a execução que o concluiu deixou de existir.
 */
export async function deleteTrainingSession(
  input: unknown,
): Promise<ActionResult<{ recordsRemoved: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = deleteSessionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id } = parsed.data;

  const { data: session } = await ctx.supabase
    .from("training_sessions")
    .select("id,status,scheduled_workout_id,session_date")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!session) return dbError("Treino não encontrado.");
  if (session.status === "ativa" || session.status === "descansando" || session.status === "pausada") {
    return {
      ok: false,
      error: "Este treino ainda está em andamento. Finalize ou descarte pela tela da sessão.",
    };
  }

  const { error } = await ctx.supabase
    .from("training_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível excluir o treino.");

  // O dia planejado tinha sido concluído POR ESTA sessão (17-B/17-C): sem ela, volta a aberto.
  if (session.scheduled_workout_id) {
    await ctx.supabase
      .from("training_scheduled_workouts")
      .update({ status: "planejado" })
      .eq("id", session.scheduled_workout_id)
      .eq("user_id", ctx.userId)
      .eq("status", "concluido");
  }

  let recordsRemoved = 0;
  try {
    const result = await syncPersonalRecords(ctx);
    recordsRemoved = result.removed;
  } catch {
    // A exclusão já aconteceu; o recálculo pode ser refeito pelo botão da tela de recordes.
  }

  // 17-F — o hábito vinculado volta a refletir o que o histórico sustenta naquele dia.
  await reflectTrainingInHabit(ctx, session.session_date);

  revalidateHistory();
  revalidatePath(`${TRAINING_BASE_PATH}/calendario`);
  revalidatePath("/habitos");
  return { ok: true, data: { recordsRemoved } };
}

/* ═══════════════════════════ Regras de progressão ═══════════════════════════ */

export async function createProgressionRule(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = progressionRuleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: created, error } = await ctx.supabase
    .from("training_progression_rules")
    .insert({
      user_id: ctx.userId,
      name: data.name,
      scope: data.scope,
      exercise_id: data.scope === "exercicio" ? data.exercise_id : null,
      muscle_group_id: data.scope === "grupo" ? data.muscle_group_id : null,
      min_sessions: data.min_sessions,
      require_top_of_range: data.require_top_of_range,
      require_all_working_sets: data.require_all_working_sets,
      require_no_failure: data.require_no_failure,
      max_rir: data.max_rir,
      max_rpe: data.max_rpe,
      max_difficulty: data.max_difficulty,
      increment_mode: data.increment_mode,
      increment_kg: data.increment_mode === "fixo" ? data.increment_kg : null,
      increment_percent: data.increment_mode === "percentual" ? data.increment_percent : null,
      is_active: data.is_active,
      notes: data.notes,
    })
    .select("id")
    .single();

  if (error || !created) {
    return dbError(
      error?.code === "23505"
        ? "Já existe uma regra para esse alvo. Edite a regra existente em vez de criar outra."
        : "Não foi possível salvar a regra.",
    );
  }

  revalidatePath(`${TRAINING_BASE_PATH}/evolucao`);
  revalidatePath(`${TRAINING_BASE_PATH}/configuracoes`);
  return { ok: true, data: { id: created.id } };
}

export async function updateProgressionRule(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = progressionRuleUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, ...data } = parsed.data;

  const { error } = await ctx.supabase
    .from("training_progression_rules")
    .update({
      name: data.name,
      scope: data.scope,
      exercise_id: data.scope === "exercicio" ? data.exercise_id : null,
      muscle_group_id: data.scope === "grupo" ? data.muscle_group_id : null,
      min_sessions: data.min_sessions,
      require_top_of_range: data.require_top_of_range,
      require_all_working_sets: data.require_all_working_sets,
      require_no_failure: data.require_no_failure,
      max_rir: data.max_rir,
      max_rpe: data.max_rpe,
      max_difficulty: data.max_difficulty,
      increment_mode: data.increment_mode,
      increment_kg: data.increment_mode === "fixo" ? data.increment_kg : null,
      increment_percent: data.increment_mode === "percentual" ? data.increment_percent : null,
      is_active: data.is_active,
      notes: data.notes,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) {
    return dbError(
      error.code === "23505"
        ? "Já existe uma regra para esse alvo."
        : "Não foi possível salvar a regra.",
    );
  }

  revalidatePath(`${TRAINING_BASE_PATH}/evolucao`);
  return { ok: true, data: null };
}

/**
 * Exclui a regra.
 *
 * As sugestões já geradas **ficam** (a FK é `set null`): elas registram o que foi decidido, e
 * apagar histórico de decisão para "limpar" seria perder informação do usuário.
 */
export async function deleteProgressionRule(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = progressionRuleDeleteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("training_progression_rules")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível excluir a regra.");

  revalidatePath(`${TRAINING_BASE_PATH}/evolucao`);
  return { ok: true, data: null };
}

/* ═══════════════════════════ Sugestões ═══════════════════════════ */

export async function generateProgressionSuggestions(
  input: unknown = {},
): Promise<ActionResult<{ created: number; note: string | null }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = generateSuggestionsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  try {
    const result = await syncProgressionSuggestions(ctx, { exerciseId: parsed.data.exercise_id });
    revalidatePath(`${TRAINING_BASE_PATH}/evolucao`);
    return { ok: true, data: { created: result.created, note: result.note } };
  } catch {
    return dbError("Não foi possível avaliar as regras de progressão.");
  }
}

/**
 * Aceitar ou ignorar uma sugestão.
 *
 * **Aceitar** grava o novo valor no treino-modelo (17-B) — é a única escrita no modelo em toda
 * a 17-D, e ela acontece por decisão explícita. O valor anterior fica preservado na própria
 * sugestão, então dá para ver de onde veio a carga atual.
 *
 * **Ignorar** marca a sugestão; o índice único parcial impede que a mesma proposta reapareça.
 */
export async function decideProgressionSuggestion(
  input: unknown,
): Promise<ActionResult<{ applied: boolean; message: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = suggestionDecisionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, decision, notes } = parsed.data;

  const { data: suggestion } = await ctx.supabase
    .from("training_progression_suggestions")
    .select(
      "id,status,kind,exercise_id,exercise_name_snapshot,workout_exercise_id,previous_value,suggested_value,unit",
    )
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!suggestion) return dbError("Sugestão não encontrada.");
  if (suggestion.status !== "pendente") {
    return { ok: false, error: "Esta sugestão já foi decidida." };
  }

  const decidedAt = new Date().toISOString();

  if (decision === "ignorar") {
    const { error } = await ctx.supabase
      .from("training_progression_suggestions")
      .update({ status: "ignorada", decided_at: decidedAt, decision_notes: notes })
      .eq("id", id)
      .eq("user_id", ctx.userId);

    if (error) return dbError("Não foi possível registrar a decisão.");

    revalidatePath(`${TRAINING_BASE_PATH}/evolucao`);
    return {
      ok: true,
      data: { applied: false, message: "Sugestão ignorada. Ela não vai reaparecer igual." },
    };
  }

  // Aceitar: acha o alvo no modelo (o gravado na sugestão ou o treino ativo do exercício).
  let target = suggestion.workout_exercise_id;
  let workoutName: string | null = null;

  if (!target && suggestion.exercise_id) {
    const found = await findWorkoutExerciseTarget(ctx, suggestion.exercise_id);
    target = found?.workoutExerciseId ?? null;
    workoutName = found?.workoutName ?? null;
  }

  let applied = false;
  if (target && suggestion.kind === "carga") {
    const { error } = await ctx.supabase
      .from("training_workout_exercises")
      .update({ planned_weight_kg: suggestion.suggested_value })
      .eq("id", target)
      .eq("user_id", ctx.userId);
    applied = !error;
  }

  const { error: decisionError } = await ctx.supabase
    .from("training_progression_suggestions")
    .update({
      status: "aceita",
      decided_at: decidedAt,
      decision_notes: notes,
      workout_exercise_id: target,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (decisionError) return dbError("Não foi possível registrar a decisão.");

  revalidatePath(`${TRAINING_BASE_PATH}/evolucao`);
  revalidatePath(`${TRAINING_BASE_PATH}/treinos`);

  return {
    ok: true,
    data: {
      applied,
      message: applied
        ? `Carga planejada atualizada${workoutName ? ` em "${workoutName}"` : ""}. O valor anterior fica registrado na sugestão.`
        : "Decisão registrada. Nenhum treino-modelo usa este exercício, então nada foi alterado — ajuste a carga ao preparar a próxima sessão.",
    },
  };
}
