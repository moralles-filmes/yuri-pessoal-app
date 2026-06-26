"use server";

import { revalidatePath } from "next/cache";
import { personSchema } from "@/lib/validators/person";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";

function revalidatePeople() {
  revalidatePath("/terceiros");
}

export async function createPerson(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data, error } = await ctx.supabase
    .from("people")
    .insert({ ...parsed.data, user_id: ctx.userId })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível salvar a pessoa.");
  revalidatePeople();
  return { ok: true, data: { id: data.id } };
}

export async function updatePerson(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = personSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("people")
    .update(parsed.data)
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar a pessoa.");
  revalidatePeople();
  return { ok: true, data: { id } };
}

export async function togglePersonActive(
  id: string,
  ativo: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("people")
    .update({ ativo })
    .eq("id", id);

  if (error) return dbError("Não foi possível alterar o status da pessoa.");
  revalidatePeople();
  return { ok: true, data: undefined };
}

/**
 * Exclui a pessoa SOMENTE quando não há recebíveis/divisões vinculados — caso contrário a
 * exclusão apagaria/orfanaria o histórico (e o FK do banco bloquearia). Orienta inativar.
 */
export async function deletePerson(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const [{ count: recCount }, { count: shCount }] = await Promise.all([
    ctx.supabase
      .from("receivables")
      .select("id", { count: "exact", head: true })
      .eq("person_id", id),
    ctx.supabase
      .from("shared_expenses")
      .select("id", { count: "exact", head: true })
      .eq("person_id", id),
  ]);

  if ((recCount ?? 0) > 0 || (shCount ?? 0) > 0) {
    return dbError(
      "Esta pessoa tem gastos/recebíveis vinculados. Inative-a em vez de excluir.",
    );
  }

  const { error } = await ctx.supabase.from("people").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a pessoa.");
  revalidatePeople();
  return { ok: true, data: undefined };
}
