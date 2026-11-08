"use server";

import { revalidatePath } from "next/cache";
import { recurringSchema } from "@/lib/validators/recurring";
import {
  authContext,
  dbError,
  falhaDeLeituraDepois,
  invalid,
  notAuthed,
} from "@/lib/actions/helpers";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import type { ActionResult, GenerationResult } from "@/types/finance";
import { hojeISO } from "@/lib/format";
import {
  RECURRENCE_FIELDS,
  runGeneration,
  type RecurrenceRow,
} from "@/lib/finance/generation";

function revalidateRecurring() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/recorrencias");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas");
}

export async function createRecurring(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = recurringSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { data, error } = await ctx.supabase
    .from("recurring_transactions")
    .insert({
      user_id: ctx.userId,
      type: d.type,
      payment_method: d.payment_method,
      account_id: d.payment_method === "cartao_credito" ? null : d.account_id,
      card_id: d.payment_method === "cartao_credito" ? d.card_id : null,
      category_id: d.category_id,
      subcategory_id: d.subcategory_id,
      amount: d.amount,
      description: d.description,
      tags: d.tags,
      frequency: d.frequency,
      interval_count: d.interval_count,
      anchor_date: d.anchor_date,
      next_due_date: d.next_due_date ?? d.anchor_date,
      end_date: d.end_date,
      generated_status: d.generated_status,
      is_active: d.is_active,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível salvar a recorrência.");
  revalidateRecurring();
  return { ok: true, data: { id: data.id } };
}

export async function updateRecurring(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = recurringSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("recurring_transactions")
    .update({
      type: d.type,
      payment_method: d.payment_method,
      account_id: d.payment_method === "cartao_credito" ? null : d.account_id,
      card_id: d.payment_method === "cartao_credito" ? d.card_id : null,
      category_id: d.category_id,
      subcategory_id: d.subcategory_id,
      amount: d.amount,
      description: d.description,
      tags: d.tags,
      frequency: d.frequency,
      interval_count: d.interval_count,
      anchor_date: d.anchor_date,
      next_due_date: d.next_due_date ?? d.anchor_date,
      end_date: d.end_date,
      generated_status: d.generated_status,
      is_active: d.is_active,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar a recorrência.");
  revalidateRecurring();
  return { ok: true, data: undefined };
}

export async function deleteRecurring(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("recurring_transactions")
    .delete()
    .eq("id", id);

  if (error) return dbError("Não foi possível excluir a recorrência.");
  revalidateRecurring();
  return { ok: true, data: undefined };
}

/**
 * Gera agora: uma recorrência específica (id) ou todas as vencidas do usuário.
 */
export async function generateRecurringNow(
  id?: string,
): Promise<ActionResult<GenerationResult>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const today = hojeISO();
  let query = ctx.supabase
    .from("recurring_transactions")
    .select(RECURRENCE_FIELDS)
    .eq("is_active", true);
  query = id ? query.eq("id", id) : query.lte("next_due_date", today);

  const { data, error } = await query;
  if (error) return dbError("Não foi possível gerar as recorrências.");

  const recurrences = (data ?? []) as unknown as RecurrenceRow[];
  const { generated, interrompida } = await runGeneration(ctx, recurrences, today);
  revalidateRecurring();
  // 03-G (D-G26, D-G31): a fatura não pôde ser lida no meio do laço, depois de lançamentos
  // possivelmente gravados — a frase não pode afirmar que nada mudou.
  if (interrompida) return falhaDeLeituraDepois(ROTULOS_DE_LEITURA.fatura);
  return { ok: true, data: { generated, recurrences: recurrences.length } };
}
