"use server";

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { hojeISO } from "@/lib/format";
import type { ReceivableStatus } from "@/lib/finance/constants";
import {
  aplicarAcaoEmMassa,
  decidirRecebivel,
  desfazerUltimoRecebimento,
  receberSaldo,
  registrarRecebimento,
} from "@/lib/finance/recebimentos-servico";
import {
  bulkReceivablesSchema,
  receberSaldoSchema,
  registrarRecebimentoSchema,
} from "@/lib/validators/receivable";
import type { ActionResult } from "@/types/finance";

function revalidateReceivables() {
  revalidatePath("/terceiros");
  revalidatePath("/faturas");
  revalidatePath("/parcelamentos");
}

/** "Receber": recebimento do saldo restante + coluna em `pago` (K1). Data padrão: hoje. */
export async function markReceivableReceived(id: string, pagoEm?: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const parsed = receberSaldoSchema.safeParse({ id, ...(pagoEm ? { recebido_em: pagoEm } : {}) });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const hoje = hojeISO();
  const res = await receberSaldo(ctx, parsed.data.id, parsed.data.recebido_em ?? hoje, hoje);
  if (res.ok) revalidateReceivables();
  return res;
}

/** Registrar um recebimento (parcial ou total). */
export async function registrarRecebimentoAction(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const parsed = registrarRecebimentoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const res = await registrarRecebimento(ctx, parsed.data, hojeISO());
  if (res.ok) revalidateReceivables();
  return res;
}

/** "Desfazer": remove o ÚLTIMO recebimento (ou reabre o legado). */
export async function desfazerRecebimentoAction(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const parsed = receberSaldoSchema.safeParse({ id });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const res = await desfazerUltimoRecebimento(ctx, parsed.data.id);
  if (res.ok) revalidateReceivables();
  return res;
}

/**
 * Decisões do dono: cobrado, ignorado e voltar para pendente. `pago` NÃO entra por aqui:
 * quitar é sempre por recebimento (K1), e sair de `pago` é o Desfazer.
 */
export async function setReceivableStatus(id: string, status: ReceivableStatus): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (status !== "pendente" && status !== "cobrado" && status !== "ignorado") {
    return dbError("Use Receber para marcar como recebido.");
  }
  const res = await decidirRecebivel(ctx, id, status);
  if (res.ok) revalidateReceivables();
  return res;
}

/**
 * Ação em massa. O filtro de status de origem é REAPLICADO no servidor, o UPDATE vai em
 * BLOCOS e `afetados` é contado pelas linhas que o banco devolveu (garantias da Fase 05,
 * agora dentro de `aplicarAcaoEmMassa`).
 */
export async function bulkSetReceivableStatus(
  input: unknown,
): Promise<ActionResult<{ afetados: number; ignorados: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const parsed = bulkReceivablesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const hoje = hojeISO();
  const res = await aplicarAcaoEmMassa(ctx, parsed.data.ids, parsed.data.acao, parsed.data.pago_em ?? hoje, hoje);
  if (res.ok) revalidateReceivables();
  return res;
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
