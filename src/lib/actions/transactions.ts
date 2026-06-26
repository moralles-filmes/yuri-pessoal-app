"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { transactionSchema } from "@/lib/validators/transaction";
import { splitSchema } from "@/lib/validators/split";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { resolveOrCreateStatement } from "@/lib/finance/statements";
import { applySplit } from "@/lib/finance/split-persist";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";
import type { ActionResult } from "@/types/finance";
import {
  TRANSACTION_STATUSES,
  type TransactionStatus,
} from "@/lib/finance/constants";

function revalidateTransactions() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas");
  revalidatePath("/cartoes");
  revalidatePath("/faturas");
  revalidatePath("/terceiros");
}

export async function createTransaction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  if (d.type === "transferencia") {
    const groupId = randomUUID();
    const common = {
      user_id: ctx.userId,
      type: "transferencia" as const,
      payment_method: "transferencia" as const,
      amount: d.amount,
      purchase_date: d.purchase_date,
      competence_date: d.competence_date,
      description: d.description,
      notes: d.notes,
      tags: d.tags,
      status: d.status,
      transfer_group_id: groupId,
      category_id: null,
      subcategory_id: null,
    };
    const rows = [
      {
        ...common,
        account_id: d.account_id,
        transfer_account_id: d.transfer_account_id,
      },
      {
        ...common,
        account_id: d.transfer_account_id,
        transfer_account_id: d.account_id,
      },
    ];
    const { data, error } = await ctx.supabase
      .from("transactions")
      .insert(rows)
      .select("id");
    if (error || !data || data.length === 0) {
      return dbError("Não foi possível registrar a transferência.");
    }
    revalidateTransactions();
    return { ok: true, data: { id: data[0].id } };
  }

  // Compra no cartão (Fase 03): resolve/cria a fatura e vincula statement_id.
  let cardId: string | null = null;
  let statementId: string | null = null;
  if (
    d.type === "despesa" &&
    d.payment_method === "cartao_credito" &&
    d.card_id
  ) {
    cardId = d.card_id;
    statementId = await resolveOrCreateStatement(ctx, d.card_id, d.purchase_date);
    if (!statementId) return dbError("Não foi possível resolver a fatura do cartão.");
  }

  // Divisão (Fase 05): só faz sentido em despesa; demais tipos ficam 'pessoal'.
  const split = splitSchema.safeParse(input);
  if (!split.success) return invalid(split.error.flatten().fieldErrors);
  const isShared = d.type === "despesa" && split.data.classificacao !== "pessoal";
  const classificacao = isShared ? split.data.classificacao : "pessoal";

  const { data, error } = await ctx.supabase
    .from("transactions")
    .insert({
      user_id: ctx.userId,
      type: d.type,
      payment_method: d.payment_method,
      account_id: d.account_id,
      transfer_account_id: null,
      card_id: cardId,
      statement_id: statementId,
      category_id: d.category_id,
      subcategory_id: d.subcategory_id,
      amount: d.amount,
      purchase_date: d.purchase_date,
      competence_date: d.competence_date,
      description: d.description,
      notes: d.notes,
      tags: d.tags,
      status: d.status,
      classificacao,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível salvar o lançamento.");

  // Grava a divisão (shared_expenses + receivables) e deriva o valor_pessoal. Quase-atômico:
  // se a divisão falhar, remove a transação para não deixar gasto sem divisão consistente.
  if (isShared) {
    const res = await applySplit(ctx, {
      transactionId: data.id,
      totalCentavos: reaisParaCentavos(d.amount),
      statementId,
      cardId,
      parts: split.data.parts,
    });
    if (!res.ok) {
      await ctx.supabase.from("transactions").delete().eq("id", data.id);
      return dbError(res.error);
    }
    await ctx.supabase
      .from("transactions")
      .update({ valor_pessoal: centavosParaReais(res.minhaParteCentavos) })
      .eq("id", data.id);
  }

  revalidateTransactions();
  return { ok: true, data: { id: data.id } };
}

export async function updateTransaction(
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { data: existing, error: loadErr } = await ctx.supabase
    .from("transactions")
    .select("id, transfer_group_id")
    .eq("id", id)
    .single();
  if (loadErr || !existing) return dbError("Lançamento não encontrado.");

  const wasTransfer = !!existing.transfer_group_id;
  const isTransfer = d.type === "transferencia";

  // Transferências são substituídas (remove e recria) para manter as duas pernas
  // sempre consistentes; lançamentos simples são atualizados no lugar.
  if (wasTransfer || isTransfer) {
    if (wasTransfer && existing.transfer_group_id) {
      await ctx.supabase
        .from("transactions")
        .delete()
        .eq("transfer_group_id", existing.transfer_group_id);
    } else {
      await ctx.supabase.from("transactions").delete().eq("id", id);
    }
    return createTransaction(input);
  }

  // Re-resolve a fatura ao editar (ex.: mudou a data ou o cartão). Se deixar de ser
  // compra no cartão, limpa card_id/statement_id. O ajuste manual de fatura é à parte.
  let cardId: string | null = null;
  let statementId: string | null = null;
  if (
    d.type === "despesa" &&
    d.payment_method === "cartao_credito" &&
    d.card_id
  ) {
    cardId = d.card_id;
    statementId = await resolveOrCreateStatement(ctx, d.card_id, d.purchase_date);
    if (!statementId) return dbError("Não foi possível resolver a fatura do cartão.");
  }

  const { error } = await ctx.supabase
    .from("transactions")
    .update({
      type: d.type,
      payment_method: d.payment_method,
      account_id: d.account_id,
      transfer_account_id: null,
      card_id: cardId,
      statement_id: statementId,
      category_id: d.category_id,
      subcategory_id: d.subcategory_id,
      amount: d.amount,
      purchase_date: d.purchase_date,
      competence_date: d.competence_date,
      description: d.description,
      notes: d.notes,
      tags: d.tags,
      status: d.status,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o lançamento.");
  revalidateTransactions();
  return { ok: true, data: { id } };
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: existing } = await ctx.supabase
    .from("transactions")
    .select("transfer_group_id")
    .eq("id", id)
    .single();

  if (existing?.transfer_group_id) {
    await ctx.supabase
      .from("transactions")
      .delete()
      .eq("transfer_group_id", existing.transfer_group_id);
  } else {
    await ctx.supabase.from("transactions").delete().eq("id", id);
  }

  revalidateTransactions();
  return { ok: true, data: undefined };
}

export async function setTransactionStatus(
  id: string,
  status: TransactionStatus,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!TRANSACTION_STATUSES.includes(status)) return dbError("Status inválido.");

  const { data: existing } = await ctx.supabase
    .from("transactions")
    .select("transfer_group_id")
    .eq("id", id)
    .single();

  const { error } = existing?.transfer_group_id
    ? await ctx.supabase
        .from("transactions")
        .update({ status })
        .eq("transfer_group_id", existing.transfer_group_id)
    : await ctx.supabase.from("transactions").update({ status }).eq("id", id);

  if (error) return dbError("Não foi possível atualizar o status.");
  revalidateTransactions();
  return { ok: true, data: undefined };
}
