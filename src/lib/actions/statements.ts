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
import {
  MSG_LEITURA_DO_PAGAMENTO_FALHOU,
  mensagemDoErroDoDesfazer,
  previsaoDoDesfazer,
  type LancamentoDoPagamento,
  type PrevisaoDoDesfazer,
} from "@/lib/finance/desfazer-pagamento";
import {
  dataDePagamentoFutura,
  MSG_DATA_PAGAMENTO_FATURA_FUTURA,
} from "@/lib/finance/caixa";
import {
  desfazerPagamentoFaturaSchema,
  pagamentoFaturaSchema,
} from "@/lib/validators/statement";
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

  // 03-F K3 — data futura é recusada antes de qualquer leitura e sem chamar a RPC.
  if (dataDePagamentoFutura(parsed.data.dataPagamento, hojeISO())) {
    return invalid({ dataPagamento: [MSG_DATA_PAGAMENTO_FATURA_FUTURA] });
  }

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
 * Lê o pagamento que o "Desfazer" vai desfazer, SEM escrever nada: qual lançamento sai, de
 * qual conta, com que valor e em que data foi pago (03-F K1). A view `card_statements_with_total`
 * não expõe `pago_transacao_id`, por isso a leitura vai à tabela.
 */
export async function preverDesfazerPagamento(
  id: string,
): Promise<ActionResult<PrevisaoDoDesfazer>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = desfazerPagamentoFaturaSchema.pick({ id: true }).safeParse({ id });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  // Erro de leitura NÃO vira "não encontrada" nem "sem lançamento": o diálogo afirmaria um
  // fato falso ("nenhum saldo muda") com o botão de confirmar à mostra.
  const { data: fatura, error: erroFatura } = await ctx.supabase
    .from("card_statements")
    .select("pago_em, pago_transacao_id")
    .eq("id", id)
    .maybeSingle();
  if (erroFatura) return dbError(MSG_LEITURA_DO_PAGAMENTO_FALHOU);
  if (!fatura) return dbError("Fatura não encontrada.");

  let lancamento: LancamentoDoPagamento | null = null;
  if (fatura.pago_transacao_id) {
    const { data: tx, error: erroLancamento } = await ctx.supabase
      .from("transactions")
      .select(
        "id, type, status, amount, description, transfer_account_id, transfer_group_id, account:accounts!transactions_account_id_fkey(name)",
      )
      .eq("id", fatura.pago_transacao_id)
      .maybeSingle();
    if (erroLancamento) return dbError(MSG_LEITURA_DO_PAGAMENTO_FALHOU);
    if (tx) {
      lancamento = {
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amount: Number(tx.amount),
        description: tx.description ?? "",
        transfer_account_id: tx.transfer_account_id,
        transfer_group_id: tx.transfer_group_id,
        conta: tx.account?.name ?? null,
      };
    }
  }

  return { ok: true, data: previsaoDoDesfazer({ fatura, lancamento }) };
}

/**
 * Desfaz o pagamento LIDO na confirmação: `lancamentoId` é o que `preverDesfazerPagamento`
 * devolveu (`null` para fatura paga sem lançamento) e é obrigatório, para nenhum chamador
 * desfazer sem dizer o que leu. A RPC `desfazer_pagamento_fatura` trava a fatura, recusa se o
 * pagamento mudou ou foi editado em Lançamentos e, numa transação, reabre a fatura e apaga o
 * lançamento (o saldo da conta volta junto).
 */
export async function markStatementUnpaid(
  id: string,
  lancamentoId: string | null,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = desfazerPagamentoFaturaSchema.safeParse({ id, lancamentoId });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase.rpc("desfazer_pagamento_fatura", {
    p_statement_id: parsed.data.id,
    // O tipo gerado não marca o argumento como nulo, mas a função trata `null` (fatura sem lançamento).
    p_lancamento_id: parsed.data.lancamentoId as string,
  });
  if (error) return dbError(mensagemDoErroDoDesfazer(error));

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
