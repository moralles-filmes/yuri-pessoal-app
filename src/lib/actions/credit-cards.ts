"use server";

import { revalidatePath } from "next/cache";
import { creditCardSchema } from "@/lib/validators/credit-card";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";

function revalidateCards() {
  revalidatePath("/cartoes");
  revalidatePath("/faturas");
}

export async function createCreditCard(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = creditCardSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { data, error } = await ctx.supabase
    .from("credit_cards")
    .insert({
      user_id: ctx.userId,
      nome: d.nome,
      banco: d.banco,
      bandeira: d.bandeira,
      limite_total: d.limite_total,
      dia_fechamento: d.dia_fechamento,
      dia_vencimento: d.dia_vencimento,
      cor: d.cor ?? "#A98438",
      ativo: d.ativo,
      observacoes: d.observacoes,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível salvar o cartão.");
  revalidateCards();
  return { ok: true, data: { id: data.id } };
}

export async function updateCreditCard(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = creditCardSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("credit_cards")
    .update({
      nome: d.nome,
      banco: d.banco,
      bandeira: d.bandeira,
      limite_total: d.limite_total,
      dia_fechamento: d.dia_fechamento,
      dia_vencimento: d.dia_vencimento,
      cor: d.cor ?? "#A98438",
      ativo: d.ativo,
      observacoes: d.observacoes,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o cartão.");
  revalidateCards();
  return { ok: true, data: { id } };
}

export async function toggleCreditCardActive(
  id: string,
  ativo: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("credit_cards")
    .update({ ativo })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o cartão.");
  revalidateCards();
  return { ok: true, data: undefined };
}

/**
 * Exclui um cartão. Bloqueia se houver lançamentos vinculados (orienta inativar),
 * evitando perda de histórico. Sem lançamentos, as faturas caem por ON DELETE CASCADE.
 */
export async function deleteCreditCard(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { count } = await ctx.supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("card_id", id);

  if ((count ?? 0) > 0) {
    return dbError(
      "Este cartão tem lançamentos vinculados. Inative-o em vez de excluir para preservar o histórico.",
    );
  }

  const { error } = await ctx.supabase
    .from("credit_cards")
    .delete()
    .eq("id", id);

  if (error) return dbError("Não foi possível excluir o cartão.");
  revalidateCards();
  return { ok: true, data: undefined };
}
