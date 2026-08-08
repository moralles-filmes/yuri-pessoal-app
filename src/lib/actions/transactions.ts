"use server";

import { revalidatePath } from "next/cache";
import { transactionSchema } from "@/lib/validators/transaction";
import { splitSchema } from "@/lib/validators/split";
import {
  authContext,
  dbError,
  invalid,
  notAuthed,
  type AuthContext,
} from "@/lib/actions/helpers";
import { resolveOrCreateStatement } from "@/lib/finance/statements";
import { reapplySplit } from "@/lib/finance/split-reapply";
import { criarTransacao } from "@/lib/finance/services";
import {
  sharedExpensesToFormParts,
  type SharedExpenseLike,
  type SplitFormPart,
} from "@/lib/finance/split";
import { reaisParaCentavos } from "@/lib/format";
import type { ActionResult } from "@/types/finance";
import {
  TRANSACTION_STATUSES,
  type Classificacao,
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

/**
 * ⚠️ 18-C · Bloco 4 — a criação saiu daqui e virou `finance/services.ts`. O que sobrou é a
 * casca: auth, serviço e `revalidatePath`. O command `lancarTransacao` chama o MESMO serviço,
 * então um lançamento da IA nasce idêntico a um lançamento do formulário — inclusive na
 * resolução de fatura, que é onde um segundo caminho erraria primeiro.
 *
 * A validação continua sendo a do schema; ela só mudou de lugar (o serviço a faz, porque a
 * divisão é lida do MESMO objeto cru por um segundo schema).
 */
export async function createTransaction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const r = await criarTransacao(ctx, input);
  if (!r.ok) return r.fieldErrors ? invalid(r.fieldErrors) : dbError(r.erro);

  revalidateTransactions();
  return { ok: true, data: { id: r.id } };
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
    .select("id, transfer_group_id, parcelado, classificacao, amount")
    .eq("id", id)
    .single();
  if (loadErr || !existing) return dbError("Lançamento não encontrado.");

  const wasTransfer = !!existing.transfer_group_id;
  const isTransfer = d.type === "transferencia";

  // Transferências são substituídas (remove e recria) para manter as duas pernas
  // sempre consistentes; lançamentos simples são atualizados no lugar.
  if (wasTransfer || isTransfer) {
    // Se for o pagamento de uma fatura, a fatura precisa apontar para o lançamento RECRIADO
    // (o delete abaixo zeraria `pago_transacao_id`). Editar o pagamento não desfaz o pagamento.
    const statementId = await statementPaidBy(ctx, id);

    if (wasTransfer && existing.transfer_group_id) {
      await ctx.supabase
        .from("transactions")
        .delete()
        .eq("transfer_group_id", existing.transfer_group_id);
    } else {
      await ctx.supabase.from("transactions").delete().eq("id", id);
    }

    const recriado = await createTransaction(input);
    if (recriado.ok && statementId) {
      await ctx.supabase
        .from("card_statements")
        .update({ pago_transacao_id: recriado.data.id })
        .eq("id", statementId);
    }
    return recriado;
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

  // Divisão na edição (Fase 05): só em despesa NÃO parcelada — a divisão de compra parcelada
  // é editada em /parcelamentos, por `updateInstallmentSplit`, que chama o MESMO núcleo.
  // Re-aplica apenas quando a divisão muda, então editar só descrição/categoria/data de um
  // gasto já dividido não encosta nos recebíveis. A "minha parte" é sempre derivada.
  if (!existing.parcelado) {
    const split = splitSchema.safeParse(input);
    if (!split.success) return invalid(split.error.flatten().fieldErrors);

    const res = await reapplySplit(ctx, {
      transactionId: id,
      totalCentavos: reaisParaCentavos(d.amount),
      totalCentavosAtual: reaisParaCentavos(existing.amount),
      classificacaoAtual: existing.classificacao as Classificacao,
      // Só despesa é divisível; receita/transferência/ajuste voltam a pessoal.
      classificacaoNova:
        d.type === "despesa" ? split.data.classificacao : "pessoal",
      parts: d.type === "despesa" ? split.data.parts : [],
      mode: { kind: "avista", statementId, cardId },
    });
    if (!res.ok) return dbError(res.error);
  }

  revalidateTransactions();
  return { ok: true, data: { id } };
}

/**
 * Lê a divisão atual de um lançamento (classificação + partes no formato do formulário) para
 * pré-preencher a edição. Server Action de leitura (o form é client component).
 */
export async function getTransactionSplit(
  id: string,
): Promise<ActionResult<{ classificacao: Classificacao; parts: SplitFormPart[] }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: tx } = await ctx.supabase
    .from("transactions")
    .select("classificacao")
    .eq("id", id)
    .maybeSingle();
  const { data: shares } = await ctx.supabase
    .from("shared_expenses")
    .select("person_id, tipo_divisao, percentual, valor")
    .eq("transaction_id", id);

  return {
    ok: true,
    data: {
      classificacao: (tx?.classificacao ?? "pessoal") as Classificacao,
      parts: sharedExpensesToFormParts((shares ?? []) as SharedExpenseLike[]),
    },
  };
}

/**
 * Id da fatura que este lançamento quita, se ele for o pagamento de alguma — ou null.
 *
 * `card_statements.pago_transacao_id` é FK `on delete set null`: apagar o lançamento de
 * pagamento zera o ponteiro mas NÃO limpa `pago_em`/`status`, então a fatura ficaria "paga"
 * apontando para o nada. Quem apaga/recria o lançamento usa isto para acertar a fatura.
 */
async function statementPaidBy(
  ctx: AuthContext,
  txId: string,
): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("card_statements")
    .select("id")
    .eq("pago_transacao_id", txId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: existing } = await ctx.supabase
    .from("transactions")
    .select("transfer_group_id")
    .eq("id", id)
    .single();

  // Apagar o pagamento pela tela de Lançamentos reabre a fatura — mesmo efeito do
  // "Desfazer" em /faturas (o saldo da conta já estorna sozinho, junto com o lançamento).
  const statementId = await statementPaidBy(ctx, id);
  if (statementId) {
    await ctx.supabase
      .from("card_statements")
      .update({
        status: "aberta",
        pago_em: null,
        pago_conta_id: null,
        pago_transacao_id: null,
      })
      .eq("id", statementId);
  }

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
