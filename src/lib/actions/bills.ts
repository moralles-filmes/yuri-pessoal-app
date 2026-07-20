"use server";

import { revalidatePath } from "next/cache";
import { billSchema } from "@/lib/validators/bill";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";
import { hojeISO } from "@/lib/format";

function revalidateBills() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/contas-fixas");
}

export async function createBill(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = billSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data, error } = await ctx.supabase
    .from("bills")
    .insert({ ...parsed.data, user_id: ctx.userId })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível salvar a conta fixa.");
  revalidateBills();
  return { ok: true, data: { id: data.id } };
}

export async function updateBill(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = billSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("bills")
    .update(parsed.data)
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar a conta fixa.");
  revalidateBills();
  return { ok: true, data: undefined };
}

export async function deleteBill(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("bills").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a conta fixa.");
  revalidateBills();
  return { ok: true, data: undefined };
}

export async function toggleBillActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("bills")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) return dbError("Não foi possível alterar a conta fixa.");
  revalidateBills();
  return { ok: true, data: undefined };
}

/**
 * Lança a conta fixa no mês atual: cria uma despesa pendente na data de
 * vencimento (dia clampado ao último dia do mês). Idempotente por mês:
 * se já existir lançamento com mesma descrição e competência, não duplica.
 */
export async function generateBillTransaction(
  billId: string,
): Promise<ActionResult<{ id: string | null }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: bill, error } = await ctx.supabase
    .from("bills")
    .select("*")
    .eq("id", billId)
    .single();
  if (error || !bill) return dbError("Conta fixa não encontrada.");

  // Competência derivada do mês corrente EM BRASÍLIA. Com `new Date()` no servidor (UTC),
  // entre 21h e 00h do último dia do mês o mês já era o seguinte: a conta fixa era lançada
  // na competência errada e — como a guarda de duplicata abaixo compara justamente esta
  // data — não enxergava o lançamento correto do dia, duplicando a despesa.
  const hoje = hojeISO();
  const [year, month] = hoje.split("-").map(Number); // month é 1-based
  const lastDay = new Date(year, month, 0).getDate(); // dia 0 do mês seguinte = último deste
  const day = Math.min(bill.due_day, lastDay);
  const dueDate = `${hoje.slice(0, 7)}-${String(day).padStart(2, "0")}`;

  const { data: dup } = await ctx.supabase
    .from("transactions")
    .select("id")
    .eq("description", bill.name)
    .eq("competence_date", dueDate)
    .limit(1);
  if (dup && dup.length > 0) {
    return { ok: true, data: { id: null } };
  }

  const { data: created, error: insErr } = await ctx.supabase
    .from("transactions")
    .insert({
      user_id: ctx.userId,
      type: "despesa",
      payment_method: null,
      account_id: bill.account_id,
      category_id: bill.category_id,
      amount: bill.amount,
      purchase_date: dueDate,
      competence_date: dueDate,
      description: bill.name,
      status: "pendente",
    })
    .select("id")
    .single();

  if (insErr || !created) return dbError("Não foi possível lançar a conta fixa.");
  revalidatePath("/financeiro/lancamentos");
  revalidateBills();
  return { ok: true, data: { id: created.id } };
}
