"use server";

/**
 * Fase 17-A — Treinos · Server Action das preferências do módulo.
 *
 * Uma linha por usuário, criada no primeiro salvamento (a leitura não escreve — ver
 * `getTrainingPreferences`). O `upsert` por `user_id` é o que torna a operação idempotente:
 * salvar duas vezes não cria duas linhas.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import { trainingPreferencesSchema } from "@/lib/validators/training";
import type { ActionResult } from "@/types/finance";

export async function saveTrainingPreferences(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingPreferencesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("training_preferences")
    .upsert({ user_id: ctx.userId, ...parsed.data }, { onConflict: "user_id" });

  if (error) return dbError("Não foi possível salvar as preferências.");

  revalidatePath(TRAINING_BASE_PATH);
  revalidatePath(`${TRAINING_BASE_PATH}/configuracoes`);
  revalidatePath(`${TRAINING_BASE_PATH}/exercicios`);
  return { ok: true, data: null };
}
