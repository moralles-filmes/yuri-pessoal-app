"use server";

import { revalidatePath } from "next/cache";
import {
  authContext,
  dbError,
  invalid,
  notAuthed,
} from "@/lib/actions/helpers";
import {
  argumentosDoPagamento,
  mensagemDoErroDoPagamento,
  montarPagamentoFatura,
} from "@/lib/finance/statement-payment";
import { pagamentoFaturaSchema } from "@/lib/validators/statement";
import { hojeISO } from "@/lib/format";
import type { ActionResult } from "@/types/finance";

function revalidateStatements() {
  revalidatePath("/faturas");
  revalidatePath("/cartoes");
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/contas");
}

/**
 * Paga a fatura: cria UM lançamento de pagamento (transferência que debita a conta escolhida)
 * e marca a fatura como paga, guardando a conta e o lançamento para o "Desfazer".
 * O valor é o total da fatura no momento do pagamento.
 *
 * A garantia de "uma vez só" é da RPC `pagar_fatura` (reserva condicional da fatura +
 * lançamento + ponteiro, numa transação): duas abas ou um clique duplo não pagam duas vezes.
 * A leitura de `pago_em` aqui é só o caminho rápido, para recusar sem ir ao banco gravar.
 *
 * `dataPagamento` ('yyyy-MM-dd') é a data em que o dinheiro saiu da conta — quem paga informa
 * para bater com o extrato do banco. Ausente, usa hoje.
 */
export async function markStatementPaid(
  id: string,
  contaId: string,
  dataPagamento?: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = pagamentoFaturaSchema.safeParse({ id, contaId, dataPagamento });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const data = parsed.data.dataPagamento ?? hojeISO();

  // Fatura com total calculado (view) — precisamos de competência e total.
  const { data: st, error: loadErr } = await ctx.supabase
    .from("card_statements_with_total")
    .select("id, card_id, competencia, pago_em, total_atual")
    .eq("id", id)
    .single();
  if (loadErr || !st) return dbError("Fatura não encontrada.");
  if (st.pago_em) return dbError("Esta fatura já está paga.");

  const total = st.total_atual ?? 0;
  if (total <= 0) return dbError("Não há valor a pagar nesta fatura.");

  // Conta deve existir e ser do usuário (RLS garante o dono).
  const { data: conta } = await ctx.supabase
    .from("accounts")
    .select("id")
    .eq("id", contaId)
    .single();
  if (!conta) return dbError("Conta não encontrada.");

  const { data: card } = st.card_id
    ? await ctx.supabase
        .from("credit_cards")
        .select("nome")
        .eq("id", st.card_id)
        .single()
    : { data: null };

  const payload = montarPagamentoFatura({
    contaId,
    total,
    cartaoNome: card?.nome ?? "Cartão",
    competencia: st.competencia ?? "",
    dataPagamento: data,
  });

  const { error } = await ctx.supabase.rpc(
    "pagar_fatura",
    argumentosDoPagamento({ statementId: id, dataPagamento: data, lancamento: payload }),
  );
  if (error) return dbError(mensagemDoErroDoPagamento(error));

  revalidateStatements();
  return { ok: true, data: undefined };
}

/**
 * Desfaz o pagamento: deleta o lançamento de pagamento (estorna o saldo da conta) e limpa os
 * campos de pagamento. Os lançamentos do cartão voltam a "em aberto" (derivado da fatura).
 */
export async function markStatementUnpaid(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: st } = await ctx.supabase
    .from("card_statements")
    .select("pago_transacao_id")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .single();
  if (!st) return dbError("Fatura não encontrada.");

  if (st.pago_transacao_id) {
    await ctx.supabase
      .from("transactions")
      .delete()
      .eq("id", st.pago_transacao_id);
  }

  const { error } = await ctx.supabase
    .from("card_statements")
    .update({
      status: "aberta",
      pago_em: null,
      pago_conta_id: null,
      pago_transacao_id: null,
    })
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
