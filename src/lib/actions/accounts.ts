"use server";

import { revalidatePath } from "next/cache";
import { accountSchema } from "@/lib/validators/account";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";

function revalidateAccounts() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas");
}

export async function createAccount(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data, error } = await ctx.supabase
    .from("accounts")
    .insert({ ...parsed.data, user_id: ctx.userId })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível salvar a conta.");
  revalidateAccounts();
  return { ok: true, data: { id: data.id } };
}

export async function updateAccount(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("accounts")
    .update(parsed.data)
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar a conta.");
  revalidateAccounts();
  return { ok: true, data: undefined };
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("accounts").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a conta.");
  revalidateAccounts();
  return { ok: true, data: undefined };
}
