"use server";

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { hojeISO } from "@/lib/format";
import {
  RECEIVABLE_STATUSES,
  type ReceivableStatus,
} from "@/lib/finance/constants";
import {
  ORIGENS_DA_ACAO,
  TAMANHO_DO_BLOCO,
  dividirEmBlocos,
  patchDaAcao,
} from "@/lib/finance/receivables-bulk";
import { bulkReceivablesSchema } from "@/lib/validators/receivable";
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
      : hojeISO();

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
      ? { status, pago_em: hojeISO() }
      : { status, pago_em: null };

  const { error } = await ctx.supabase
    .from("receivables")
    .update(updates)
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o recebível.");
  revalidateReceivables();
  return { ok: true, data: undefined };
}

/**
 * Ação em massa: aplica um mesmo status a vários recebíveis de uma vez.
 *
 * TRÊS GARANTIAS:
 * • O filtro de status de origem é REAPLICADO aqui (`.in("status", ORIGENS_DA_ACAO[acao])`).
 *   A conta que a tela fez com `alcanceDaAcao` existe para mostrar o número antes de
 *   confirmar; quem garante é o servidor. Efeito colateral bem-vindo: a ação é idempotente —
 *   rodar duas vezes não faz dano, porque o segundo passe não alcança mais nada.
 * • O UPDATE vai em BLOCOS. O PostgREST manda `id=in.(...)` na query string, que cresce
 *   linear com a seleção; em lote grande a requisição estoura no proxy antes de o banco ver
 *   qualquer coisa.
 * • `afetados` é contado pelas linhas que o banco DEVOLVEU, nunca pelo tamanho da seleção —
 *   senão o toast prometeria uma baixa que não aconteceu.
 */
export async function bulkSetReceivableStatus(
  input: unknown,
): Promise<ActionResult<{ afetados: number; ignorados: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = bulkReceivablesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { acao, pago_em } = parsed.data;

  const ids = [...new Set(parsed.data.ids)];
  const patch = patchDaAcao(acao, pago_em ?? hojeISO());

  let afetados = 0;
  for (const bloco of dividirEmBlocos(ids, TAMANHO_DO_BLOCO)) {
    const { data, error } = await ctx.supabase
      .from("receivables")
      .update(patch)
      .in("id", bloco)
      .in("status", ORIGENS_DA_ACAO[acao])
      .select("id");

    if (error) {
      // Blocos anteriores já foram gravados: informe o que passou em vez de fingir que
      // nada aconteceu — a tela recarrega e mostra o estado real.
      return dbError(
        afetados > 0
          ? `Falha no meio do lote. ${afetados} recebível(is) foram atualizados; tente novamente para o restante.`
          : "Não foi possível aplicar a ação aos recebíveis.",
      );
    }
    afetados += data?.length ?? 0;
  }

  revalidateReceivables();
  return { ok: true, data: { afetados, ignorados: ids.length - afetados } };
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
