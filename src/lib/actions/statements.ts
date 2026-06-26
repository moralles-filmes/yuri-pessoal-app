"use server";

import { revalidatePath } from "next/cache";
import { authContext, dbError, notAuthed } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";

function revalidateStatements() {
  revalidatePath("/faturas");
  revalidatePath("/cartoes");
}

/** Marca a fatura como paga (único status persistido). Os demais são calculados na leitura. */
export async function markStatementPaid(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("card_statements")
    .update({ status: "paga", pago_em: new Date().toISOString() })
    .eq("id", id);

  if (error) return dbError("Não foi possível marcar a fatura como paga.");
  revalidateStatements();
  return { ok: true, data: undefined };
}

/** Desfaz o pagamento: volta o status para o cálculo na leitura (limpa pago_em). */
export async function markStatementUnpaid(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("card_statements")
    .update({ status: "aberta", pago_em: null })
    .eq("id", id);

  if (error) return dbError("Não foi possível desfazer o pagamento.");
  revalidateStatements();
  return { ok: true, data: undefined };
}

/**
 * Ajuste manual (exceção): move um lançamento para outra fatura do MESMO cartão.
 * Preserva o histórico (só reatribui `statement_id`). Valida que destino é do mesmo
 * cartão; a RLS garante que ambos pertencem ao usuário.
 */
export async function moveTransactionToStatement(
  txId: string,
  targetStatementId: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: tx } = await ctx.supabase
    .from("transactions")
    .select("id, card_id")
    .eq("id", txId)
    .single();
  if (!tx || !tx.card_id) {
    return dbError("Lançamento de cartão não encontrado.");
  }

  const { data: target } = await ctx.supabase
    .from("card_statements")
    .select("id, card_id")
    .eq("id", targetStatementId)
    .single();
  if (!target || target.card_id !== tx.card_id) {
    return dbError("A fatura de destino precisa ser do mesmo cartão.");
  }

  const { error } = await ctx.supabase
    .from("transactions")
    .update({ statement_id: targetStatementId })
    .eq("id", txId);

  if (error) return dbError("Não foi possível mover o lançamento.");
  revalidatePath("/faturas");
  revalidatePath("/financeiro/lancamentos");
  return { ok: true, data: undefined };
}
