"use server";

import { revalidatePath } from "next/cache";
import { authContext, dbError, notAuthed } from "@/lib/actions/helpers";
import { toDateInputValue } from "@/lib/format";
import {
  RECEIVABLE_STATUSES,
  type ReceivableStatus,
} from "@/lib/finance/constants";
import type { ActionResult } from "@/types/finance";

function revalidateReceivables() {
  revalidatePath("/terceiros");
  revalidatePath("/faturas");
}

/** Marca um recebível como recebido: status 'pago' + data (hoje por padrão), sem apagar nada. */
export async function markReceivableReceived(
  id: string,
  pagoEm?: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const data =
    pagoEm && /^\d{4}-\d{2}-\d{2}$/.test(pagoEm)
      ? pagoEm
      : toDateInputValue(new Date());

  const { error } = await ctx.supabase
    .from("receivables")
    .update({ status: "pago", pago_em: data })
    .eq("id", id);

  if (error) return dbError("Não foi possível marcar como recebido.");
  revalidateReceivables();
  return { ok: true, data: undefined };
}

/**
 * Altera o status do recebível. Ao voltar para um status em aberto (pendente/cobrado/ignorado)
 * limpa `pago_em`; ao marcar 'pago' grava a data de hoje. Preserva o restante do histórico.
 */
export async function setReceivableStatus(
  id: string,
  status: ReceivableStatus,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!RECEIVABLE_STATUSES.includes(status)) return dbError("Status inválido.");

  const updates =
    status === "pago"
      ? { status, pago_em: toDateInputValue(new Date()) }
      : { status, pago_em: null };

  const { error } = await ctx.supabase
    .from("receivables")
    .update(updates)
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o recebível.");
  revalidateReceivables();
  return { ok: true, data: undefined };
}

/** Atualiza a data prevista e/ou as observações de um recebível. */
export async function updateReceivable(
  id: string,
  input: { data_prevista?: string | null; observacoes?: string | null },
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const data_prevista =
    input.data_prevista && /^\d{4}-\d{2}-\d{2}$/.test(input.data_prevista)
      ? input.data_prevista
      : null;
  const observacoes = input.observacoes?.trim() ? input.observacoes.trim() : null;

  const { error } = await ctx.supabase
    .from("receivables")
    .update({ data_prevista, observacoes })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o recebível.");
  revalidateReceivables();
  return { ok: true, data: undefined };
}
