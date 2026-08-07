"use server";

import { revalidatePath } from "next/cache";
import {
  installmentPurchaseEditSchema,
  installmentPurchaseSchema,
} from "@/lib/validators/installment";
import { splitSchema } from "@/lib/validators/split";
import {
  authContext,
  dbError,
  invalid,
  notAuthed,
  type AuthContext,
} from "@/lib/actions/helpers";
import { getOrCreateStatementByFatura } from "@/lib/finance/statements";
import { planejarParcelamento } from "@/lib/finance/installments";
import { applySplitParcelado } from "@/lib/finance/split-persist";
import { reapplySplit } from "@/lib/finance/split-reapply";
import { statusEfetivo } from "@/lib/finance/invoice";
import { centavosParaReais, hojeISO, reaisParaCentavos } from "@/lib/format";
import type { Classificacao } from "@/lib/finance/constants";
import type { ActionResult } from "@/types/finance";

function revalidateInstallments() {
  revalidatePath("/parcelamentos");
  revalidatePath("/faturas");
  revalidatePath("/cartoes");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro");
  revalidatePath("/terceiros");
}

/**
 * Cria uma COMPRA PARCELADA: a transação "pai" (total + metadados, sem fatura) + as N
 * parcelas, cada uma resolvida na sua fatura. Criação quase-atômica: em falha ao resolver
 * faturas ou gravar as parcelas, a compra pai é removida para não deixar parcelas órfãs.
 * O `user_id` vem sempre de `auth.uid()`.
 */
export async function createInstallmentPurchase(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = installmentPurchaseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  // Divisão (Fase 05): compra parcelada também pode ser compartilhada/de terceiro.
  const split = splitSchema.safeParse(input);
  if (!split.success) return invalid(split.error.flatten().fieldErrors);
  const isShared = split.data.classificacao !== "pessoal";

  // Dias do cartão (RLS garante que é do usuário) para distribuir as faturas.
  const { data: card } = await ctx.supabase
    .from("credit_cards")
    .select("id, dia_fechamento, dia_vencimento")
    .eq("id", d.card_id)
    .single();
  if (!card) return dbError("Cartão não encontrado.");

  let plano;
  try {
    plano = planejarParcelamento({
      valorTotalReais: d.valor_total,
      qtd: d.qtd_parcelas,
      dataCompra: d.purchase_date,
      diaFechamento: card.dia_fechamento,
      diaVencimento: card.dia_vencimento,
      overrideUltimaCentavos: d.override_ultima_centavos ?? null,
      numeroInicial: d.numero_inicial ?? 1,
      competenciaBase: d.fatura_inicial_competencia ?? null,
    });
  } catch {
    return dbError("Não foi possível calcular as parcelas.");
  }

  // Compra original: guarda o TOTAL e os metadados; statement_id NULL (não entra em fatura).
  const { data: parent, error: parentErr } = await ctx.supabase
    .from("transactions")
    .insert({
      user_id: ctx.userId,
      type: "despesa",
      payment_method: "cartao_credito",
      account_id: null,
      transfer_account_id: null,
      card_id: d.card_id,
      statement_id: null,
      category_id: d.category_id,
      subcategory_id: d.subcategory_id,
      amount: d.valor_total,
      purchase_date: d.purchase_date,
      competence_date: d.competence_date,
      description: d.description,
      notes: d.notes,
      status: "pago",
      parcelado: true,
      qtd_parcelas: d.qtd_parcelas,
      valor_total: d.valor_total,
      classificacao: isShared ? split.data.classificacao : "pessoal",
    })
    .select("id")
    .single();
  if (parentErr || !parent) {
    return dbError("Não foi possível salvar a compra parcelada.");
  }

  // Resolve a fatura de cada parcela e monta as linhas a inserir.
  const rows: {
    user_id: string;
    parent_transaction_id: string;
    card_id: string;
    statement_id: string;
    numero: number;
    total_parcelas: number;
    valor: number;
    data_competencia: string;
    status: "ativa";
  }[] = [];
  for (const p of plano) {
    const statementId = await getOrCreateStatementByFatura(
      ctx,
      d.card_id,
      p.fatura,
    );
    if (!statementId) {
      await ctx.supabase.from("transactions").delete().eq("id", parent.id);
      return dbError("Não foi possível resolver a fatura de uma das parcelas.");
    }
    rows.push({
      user_id: ctx.userId,
      parent_transaction_id: parent.id,
      card_id: d.card_id,
      statement_id: statementId,
      numero: p.numero,
      total_parcelas: d.parcelas_total_label ?? d.qtd_parcelas,
      valor: p.valor,
      data_competencia: p.fatura.competencia,
      status: "ativa",
    });
  }

  const { data: parcelasInseridas, error: instErr } = await ctx.supabase
    .from("transaction_installments")
    .insert(rows)
    .select("id, numero, statement_id");
  if (instErr || !parcelasInseridas) {
    // Rollback lógico: remove a compra pai (sem parcelas, pois o batch falhou inteiro).
    await ctx.supabase.from("transactions").delete().eq("id", parent.id);
    return dbError("Não foi possível salvar as parcelas.");
  }

  // Divisão da compra parcelada (Fase 05): a parte de cada terceiro acompanha CADA parcela,
  // com 1 receivable por (pessoa × parcela) na statement_id da parcela. Quase-atômico: em
  // falha, remove a compra pai (cascade limpa parcelas, divisões e recebíveis).
  if (isShared) {
    const valorPorNumero = new Map(
      plano.map((p) => [p.numero, p.valorCentavos]),
    );
    const parcelas = [...parcelasInseridas]
      .sort((a, b) => a.numero - b.numero)
      .map((p) => ({
        installmentId: p.id,
        statementId: p.statement_id,
        cardId: d.card_id,
        valorCentavos: valorPorNumero.get(p.numero) ?? 0,
      }));
    const res = await applySplitParcelado(ctx, {
      parentId: parent.id,
      totalCentavos: reaisParaCentavos(d.valor_total),
      parts: split.data.parts,
      parcelas,
    });
    if (!res.ok) {
      await ctx.supabase.from("transactions").delete().eq("id", parent.id);
      return dbError(res.error);
    }
    await ctx.supabase
      .from("transactions")
      .update({ valor_pessoal: centavosParaReais(res.minhaParteCentavos) })
      .eq("id", parent.id);
  }

  revalidateInstallments();
  return { ok: true, data: { id: parent.id } };
}

/**
 * Divisão de uma compra parcelada JÁ CRIADA: troca o terceiro, refaz as partes ou remove a
 * divisão. Delega ao núcleo único (`reapplySplit`) — é o MESMO código que decide a divisão de
 * um lançamento à vista, então as duas telas não podem divergir de regra.
 *
 * A base da divisão é a soma das parcelas ATIVAS, não `valor_total`: com parcela cancelada os
 * dois divergem, e distribuir sobre o total contratado quebraria a invariante de
 * `distribuirTerceirosPorParcela` (Σ terceiros ≤ Σ parcelas).
 *
 * Alcança as parcelas de faturas já fechadas ou pagas de propósito — é o caso de quem
 * importou a fatura e só depois percebeu que a compra era de um terceiro. O que protege o
 * histórico é a recusa quando já existe recebível cobrado/pago, não a data da fatura.
 */
export async function updateInstallmentSplit(
  parentId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const split = splitSchema.safeParse(input);
  if (!split.success) return invalid(split.error.flatten().fieldErrors);

  const { data: parent } = await ctx.supabase
    .from("transactions")
    .select("id, classificacao, card_id")
    .eq("id", parentId)
    .eq("parcelado", true)
    .maybeSingle();
  if (!parent) return dbError("Compra parcelada não encontrada.");

  const { data: parcelas } = await ctx.supabase
    .from("transaction_installments")
    .select("id, statement_id, valor")
    .eq("parent_transaction_id", parentId)
    .eq("status", "ativa");
  if (!parcelas || parcelas.length === 0) {
    return dbError(
      "Este parcelamento não tem parcelas ativas para dividir.",
    );
  }

  const parcelasBase = parcelas.map((p) => ({
    installmentId: p.id,
    statementId: p.statement_id,
    cardId: parent.card_id,
    valorCentavos: reaisParaCentavos(p.valor),
  }));
  const totalCentavos = parcelasBase.reduce(
    (acc, p) => acc + p.valorCentavos,
    0,
  );

  const res = await reapplySplit(ctx, {
    transactionId: parentId,
    totalCentavos,
    // Esta ação nunca muda o valor da compra: a base de antes é a mesma de agora, e a
    // comparação recai sobre as partes (que é o que o usuário está de fato editando).
    totalCentavosAtual: totalCentavos,
    classificacaoAtual: parent.classificacao as Classificacao,
    classificacaoNova: split.data.classificacao,
    parts: split.data.parts,
    mode: { kind: "parcelado", parcelas: parcelasBase },
  });
  if (!res.ok) return dbError(res.error);

  revalidateInstallments();
  return { ok: true, data: { id: parentId } };
}

/**
 * Cancela as parcelas FUTURAS (ainda em faturas ABERTAS) de um parcelamento, marcando-as
 * como `cancelada`. NÃO toca em parcelas de faturas fechadas/pagas (já efetivadas). A view
 * de fatura exclui parcelas canceladas do total, então elas saem das faturas abertas.
 *
 * ⚠️ Cancelar a parcela tem de cancelar a COBRANÇA dela. Sem isso, um parcelamento dividido
 * deixava o terceiro devendo por parcelas que não existem mais — o valor continuava somando
 * em "Quem paga esta fatura" e em /terceiros. Recebível já cobrado/pago não é apagado: aí a
 * ação inteira é recusada, em vez de tirar a parcela da fatura e deixar a cobrança órfã.
 */
export async function cancelInstallmentFuture(
  parentId: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: parcelas } = await ctx.supabase
    .from("transaction_installments")
    .select("id, statement_id")
    .eq("parent_transaction_id", parentId)
    .eq("status", "ativa");
  if (!parcelas || parcelas.length === 0) {
    return dbError("Não há parcelas ativas para cancelar.");
  }

  const statementIds = [
    ...new Set(parcelas.map((p) => p.statement_id).filter(Boolean)),
  ] as string[];
  const { data: statements } = statementIds.length
    ? await ctx.supabase
        .from("card_statements")
        .select("id, data_fechamento, data_vencimento, pago_em")
        .in("id", statementIds)
    : { data: [] };
  const stMap = new Map((statements ?? []).map((s) => [s.id, s]));

  const today = hojeISO();
  const cancelaveis = parcelas.filter((p) => {
    if (!p.statement_id) return true; // sem fatura resolvida → tratável como futura
    const s = stMap.get(p.statement_id);
    if (!s) return true;
    return statusEfetivo(s, today) === "aberta";
  });

  if (cancelaveis.length === 0) {
    return dbError(
      "Só é possível cancelar parcelas de faturas ainda abertas. As demais já foram efetivadas.",
    );
  }

  const ids = cancelaveis.map((p) => p.id);

  // Recebíveis das parcelas que vão sumir da fatura. `cobrado`/`pago` barra a ação inteira:
  // o acerto com a pessoa é decisão dela, não efeito colateral de um cancelamento.
  const { data: recebiveis } = await ctx.supabase
    .from("receivables")
    .select("id, status")
    .in("installment_id", ids);
  if (
    (recebiveis ?? []).some(
      (r) => r.status === "cobrado" || r.status === "pago",
    )
  ) {
    return dbError(
      "Há recebíveis cobrados ou pagos nas parcelas futuras. Acerte-os em A Receber antes de cancelar.",
    );
  }

  const { error } = await ctx.supabase
    .from("transaction_installments")
    .update({ status: "cancelada" })
    .in("id", ids);
  if (error) return dbError("Não foi possível cancelar as parcelas futuras.");

  if ((recebiveis ?? []).length > 0) {
    await ctx.supabase.from("receivables").delete().in("installment_id", ids);
    await recomputeParentValorPessoal(ctx, parentId);
  }

  revalidateInstallments();
  return { ok: true, data: undefined };
}

/**
 * Regrava `valor_pessoal` do pai como (Σ parcelas ativas − Σ recebíveis restantes), depois de
 * o conjunto de parcelas mudar. Não recalcula a divisão: as partes gravadas em
 * `shared_expenses` continuam sendo o que o usuário informou — só a MINHA parte, que é sempre
 * derivada, precisa acompanhar. Sem nenhum recebível a despesa volta a ser inteiramente minha.
 */
async function recomputeParentValorPessoal(
  ctx: AuthContext,
  parentId: string,
): Promise<void> {
  const { data: ativas } = await ctx.supabase
    .from("transaction_installments")
    .select("valor")
    .eq("parent_transaction_id", parentId)
    .eq("status", "ativa");
  const { data: recs } = await ctx.supabase
    .from("receivables")
    .select("valor")
    .eq("transaction_id", parentId);

  const totalCentavos = (ativas ?? []).reduce(
    (acc, p) => acc + reaisParaCentavos(p.valor),
    0,
  );
  const terceirosCentavos = (recs ?? []).reduce(
    (acc, r) => acc + reaisParaCentavos(r.valor),
    0,
  );

  await ctx.supabase
    .from("transactions")
    .update({
      valor_pessoal:
        terceirosCentavos > 0
          ? centavosParaReais(totalCentavos - terceirosCentavos)
          : null,
    })
    .eq("id", parentId);
}

/**
 * Edita METADADOS da compra parcelada (descrição, categoria, observações). Não redistribui
 * valores nem mexe nas parcelas — escopo definido para a Fase 04.
 */
export async function updateInstallmentPurchase(
  parentId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = installmentPurchaseEditSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("transactions")
    .update({
      category_id: d.category_id,
      subcategory_id: d.subcategory_id,
      description: d.description,
      notes: d.notes,
    })
    .eq("id", parentId)
    .eq("parcelado", true);
  if (error) return dbError("Não foi possível atualizar o parcelamento.");

  revalidateInstallments();
  return { ok: true, data: { id: parentId } };
}

/**
 * Exclui uma compra parcelada por completo (a transação pai + todas as parcelas via cascade).
 * Ação destrutiva: deve ser confirmada na UI.
 */
export async function deleteInstallmentPurchase(
  parentId: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("transactions")
    .delete()
    .eq("id", parentId)
    .eq("parcelado", true);
  if (error) return dbError("Não foi possível excluir o parcelamento.");

  revalidateInstallments();
  return { ok: true, data: undefined };
}
