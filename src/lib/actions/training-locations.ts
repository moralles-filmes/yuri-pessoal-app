"use server";

/**
 * Fase 17-C — Treinos · Server Actions de local de treino e anilhas.
 *
 * Duas regras próprias:
 *
 * 1. **Um local padrão por usuário.** Um índice único parcial garante no banco; aqui a action
 *    desmarca o anterior antes de marcar o novo, para o usuário não bater num erro de
 *    constraint fazendo uma coisa perfeitamente razoável.
 *
 * 2. **As anilhas são gravadas em bloco.** A tela edita a lista inteira e salva de uma vez —
 *    lista VAZIA é uma escolha válida ("não tenho anilha cadastrada aqui"), não um "não faça
 *    nada". Por isso é delete-do-escopo + insert, e não upsert item a item.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import {
  locationSchema,
  locationUpdateSchema,
  platesSchema,
} from "@/lib/validators/training-session";
import type { ActionResult } from "@/types/finance";

function revalidateLocations() {
  revalidatePath(`${TRAINING_BASE_PATH}/configuracoes`);
  revalidatePath(`${TRAINING_BASE_PATH}/sessao`);
  revalidatePath(`${TRAINING_BASE_PATH}/sessao/preparar`);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/** Desmarca o padrão atual. Necessário antes de marcar outro (índice único parcial). */
async function clearDefault(ctx: Ctx, exceptId?: string) {
  const query = ctx.supabase
    .from("training_locations")
    .update({ is_default: false })
    .eq("user_id", ctx.userId)
    .eq("is_default", true);

  if (exceptId) await query.neq("id", exceptId);
  else await query;
}

export async function createTrainingLocation(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  // O primeiro local vira o padrão sozinho: é o comportamento que o usuário espera.
  const { count } = await ctx.supabase
    .from("training_locations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ctx.userId);

  const isDefault = data.is_default ?? (count ?? 0) === 0;
  if (isDefault) await clearDefault(ctx);

  const { data: created, error } = await ctx.supabase
    .from("training_locations")
    .insert({
      user_id: ctx.userId,
      name: data.name,
      notes: data.notes,
      is_default: isDefault,
    })
    .select("id")
    .single();

  if (error || !created) {
    return dbError(
      error?.code === "23505"
        ? "Já existe um local com esse nome."
        : "Não foi possível salvar o local.",
    );
  }

  revalidateLocations();
  return { ok: true, data: { id: created.id } };
}

export async function updateTrainingLocation(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = locationUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, ...data } = parsed.data;

  if (data.is_default) await clearDefault(ctx, id);

  const { error } = await ctx.supabase
    .from("training_locations")
    .update({
      name: data.name,
      notes: data.notes,
      is_default: data.is_default ?? false,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) {
    return dbError(
      error.code === "23505"
        ? "Já existe um local com esse nome."
        : "Não foi possível salvar o local.",
    );
  }

  revalidateLocations();
  return { ok: true, data: null };
}

/**
 * Exclui um local.
 *
 * As sessões que aconteceram lá continuam existindo: `training_sessions.location_id` é
 * `on delete set null`. As anilhas caem junto (cascade) — elas só existem dentro do local.
 */
export async function deleteTrainingLocation(id: string): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("training_locations")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível excluir o local.");

  revalidateLocations();
  return { ok: true, data: null };
}

/** Grava a lista de anilhas do local inteira. Lista vazia limpa o estoque — é escolha válida. */
export async function saveLocationPlates(input: unknown): Promise<ActionResult<{ saved: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = platesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { location_id, plates } = parsed.data;

  const { data: location } = await ctx.supabase
    .from("training_locations")
    .select("id")
    .eq("id", location_id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!location) return dbError("Local não encontrado.");

  // Peso repetido no mesmo tipo seria duas verdades sobre quantas anilhas existem.
  const seen = new Set<string>();
  for (const plate of plates) {
    const key = `${plate.kind}:${plate.weight_kg}`;
    if (seen.has(key)) {
      return { ok: false, error: `O peso ${plate.weight_kg} kg aparece duas vezes na lista.` };
    }
    seen.add(key);
  }

  const { error: deleteError } = await ctx.supabase
    .from("training_location_plates")
    .delete()
    .eq("location_id", location_id)
    .eq("user_id", ctx.userId);

  if (deleteError) return dbError("Não foi possível atualizar as anilhas.");

  if (plates.length > 0) {
    const { error } = await ctx.supabase.from("training_location_plates").insert(
      plates.map((plate) => ({
        user_id: ctx.userId,
        location_id,
        kind: plate.kind,
        weight_kg: plate.weight_kg,
        quantity: plate.quantity,
        notes: plate.notes,
      })),
    );
    if (error) return dbError("Não foi possível gravar as anilhas.");
  }

  revalidateLocations();
  return { ok: true, data: { saved: plates.length } };
}
