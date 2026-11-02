"use server";

import { revalidatePath } from "next/cache";
import { motivoParaNaoApagar } from "@/lib/finance/protecao-do-recebivel";
import { protecaoDosRecebiveis } from "@/lib/finance/recebimentos-leitura";
import {
  installmentPurchaseEditSchema,
  installmentPurchaseSchema,
} from "@/lib/validators/installment";
import { splitSchema } from "@/lib/validators/split";
import {
  authContext,
  dbError,
  desfechoDesconhecido,
  falhaDeLeituraAntes,
  falhaDeLeituraDepois,
  gravadoEmParte,
  invalid,
  nadaGravado,
  notAuthed,
  temSqlstate,
  traduzirErroDaRpc,
  type AuthContext,
} from "@/lib/actions/helpers";
import { ehErroDeLeitura } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import { getOrCreateStatementByFatura } from "@/lib/finance/statements";
import { planejarParcelamento } from "@/lib/finance/installments";
import { montarCompraPai } from "@/lib/finance/linha-do-lancamento";
import { montarDivisaoParcelada, type DivisaoPayload } from "@/lib/finance/split-persist";
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
 * parcelas, cada uma na sua fatura, + a divisão com terceiros quando houver. ATÔMICA (03-G2,
 * E4): tudo vai por UMA chamada da rpc `criar_compra_parcelada`, numa transação do banco — não
 * existe mais compra-pai gravada sem as parcelas, nem compensação por delete.
 *
 * As faturas de TODAS as parcelas são resolvidas ANTES da rpc (D-G2-2): se alguma falhar, nada é
 * gravado em `transactions`. Uma fatura vazia pode sobrar se a rpc falhar depois — não é dinheiro
 * (nenhum lançamento, nenhum total) e já acontecia antes; fica declarado, não tratado.
 * O `user_id` vem sempre de `auth.uid()` (a rpc o assume).
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
  // 03-G — `.single()` sem linha (PGRST116) é ausência legítima; qualquer outro erro é leitura falha.
  const cardRes = await ctx.supabase
    .from("credit_cards")
    .select("id, dia_fechamento, dia_vencimento")
    .eq("id", d.card_id)
    .single();
  if (cardRes.error && cardRes.error.code !== "PGRST116") {
    return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.cartao);
  }
  const card = cardRes.data;
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

  // D-G2-2 — a fatura de CADA parcela é resolvida antes de qualquer escrita em `transactions`.
  // Leitura falha lança `ErroDeLeitura` (03-G) e vira "Nada foi alterado."; `null` também.
  const parcelasDaRpc: {
    numero: number;
    total_parcelas: number;
    valor: number;
    statement_id: string;
    data_competencia: string;
  }[] = [];
  const faturaDe = new Map<number, string>();
  for (const p of plano) {
    let statementId: string | null;
    try {
      statementId = await getOrCreateStatementByFatura(ctx, d.card_id, p.fatura);
    } catch (e) {
      if (!ehErroDeLeitura(e)) throw e;
      return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.fatura);
    }
    if (!statementId) {
      return dbError("Não foi possível resolver a fatura de uma das parcelas. Nada foi alterado.");
    }
    faturaDe.set(p.numero, statementId);
    parcelasDaRpc.push({
      numero: p.numero,
      total_parcelas: d.parcelas_total_label ?? d.qtd_parcelas,
      valor: p.valor,
      statement_id: statementId,
      data_competencia: p.fatura.competencia,
    });
  }

  // Divisão (Fase 05): a parte de cada terceiro acompanha CADA parcela (1 recebível por pessoa ×
  // parcela, na fatura dela). Os recebíveis levam o `numero` REAL da parcela (pode começar em k > 1).
  let colunas: { classificacao: Classificacao; valor_pessoal: number | null } = {
    classificacao: "pessoal",
    valor_pessoal: null,
  };
  let divisao: DivisaoPayload | null = null;
  if (isShared) {
    const montada = montarDivisaoParcelada({
      totalCentavos: reaisParaCentavos(d.valor_total),
      parts: split.data.parts,
      parcelas: plano.map((p) => ({
        numero: p.numero,
        statementId: faturaDe.get(p.numero) ?? null,
        cardId: d.card_id,
        valorCentavos: p.valorCentavos,
      })),
      alcance: "regra-cheia",
    });
    if (!montada.ok) return dbError(montada.error);
    divisao = montada.divisao;
    colunas = {
      classificacao: split.data.classificacao,
      valor_pessoal: centavosParaReais(montada.minhaParteCentavos),
    };
  }

  const { data, error } = await ctx.supabase.rpc("criar_compra_parcelada", {
    p_pai: montarCompraPai(d, colunas),
    p_parcelas: parcelasDaRpc,
    p_divisao: divisao,
  });
  if (error || !data) {
    // Sem SQLSTATE (rede, timeout) a gravação pode ter acontecido: a tela precisa se atualizar.
    if (typeof error?.code !== "string" || error.code.length !== 5) revalidateInstallments();
    return traduzirErroDaRpc(error, "salvar a compra parcelada", "Parcelamentos");
  }

  revalidateInstallments();
  return { ok: true, data: { id: data } };
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

  const parentRes = await ctx.supabase
    .from("transactions")
    .select("id, classificacao, card_id")
    .eq("id", parentId)
    .eq("parcelado", true)
    .maybeSingle();
  if (parentRes.error) return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.comprasParceladas);
  const parent = parentRes.data;
  if (!parent) return dbError("Compra parcelada não encontrada.");

  const parcelasRes = await ctx.supabase
    .from("transaction_installments")
    .select("id, numero, statement_id, valor")
    .eq("parent_transaction_id", parentId)
    .eq("status", "ativa")
    .order("numero", { ascending: true });
  if (parcelasRes.error) return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.parcelas);
  const parcelas = parcelasRes.data;
  if (!parcelas || parcelas.length === 0) {
    return dbError(
      "Este parcelamento não tem parcelas ativas para dividir.",
    );
  }

  // 03-G2 (E3b): `numero` é a numeração REAL da parcela (pode começar em k > 1), a mesma que a RPC
  // `salvar_lancamento` usa para achar `transaction_installments` — não a posição na lista.
  const parcelasBase = parcelas.map((p) => ({
    numero: p.numero,
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

  const parcelasRes = await ctx.supabase
    .from("transaction_installments")
    .select("id, statement_id")
    .eq("parent_transaction_id", parentId)
    .eq("status", "ativa");
  if (parcelasRes.error) return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.parcelas);
  const parcelas = parcelasRes.data;
  if (!parcelas || parcelas.length === 0) {
    return dbError("Não há parcelas ativas para cancelar.");
  }

  const statementIds = [
    ...new Set(parcelas.map((p) => p.statement_id).filter(Boolean)),
  ] as string[];
  // 03-G — sem as faturas, toda parcela parecia "aberta" e parcela de fatura PAGA seria cancelada.
  const statementsRes = statementIds.length
    ? await ctx.supabase
        .from("card_statements")
        .select("id, data_fechamento, data_vencimento, pago_em")
        .in("id", statementIds)
    : { data: [], error: null };
  if (statementsRes.error) return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.faturas);
  const statements = statementsRes.data;
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

  // 03-G2 (D-G2-9) — a classificação do pai é lida ANTES das escritas: repetir o cancelamento depois
  // de uma queda entre o passo 1 e o 2 (sem recebível sobrando) também precisa recalcular.
  const paiRes = await ctx.supabase
    .from("transactions")
    .select("id, classificacao")
    .eq("id", parentId)
    .maybeSingle();
  if (paiRes.error) return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.comprasParceladas);
  const paiEhDividido = !!paiRes.data && paiRes.data.classificacao !== "pessoal";

  // REDESIGN-03-D · A4 — a regra única: recebimento registrado, cobrado, pago ou ignorado barra
  // a ação inteira; o acerto com a pessoa é decisão do dono, não efeito colateral do cancelamento.
  const protecao = await protecaoDosRecebiveis(ctx.supabase, { installmentIds: ids });
  if (protecao.erro) {
    return dbError("Não foi possível conferir os recebíveis das parcelas. Tente de novo.");
  }
  const motivo = motivoParaNaoApagar(
    protecao.recebiveis,
    "regra-cheia",
    "cancelar as parcelas futuras",
  );
  if (motivo) return dbError(motivo);

  // Ordem das escritas (D-G2-9; ordenada, não atômica): (1) recebíveis → (2) parcelas → (3) minha
  // parte. Cair entre (1) e (2) deixa a parte do terceiro naquelas parcelas sem dono (a minha parte
  // ainda a desconta e ele já não deve nada) até o cancelamento ser repetido, que fecha. A ordem de antes (parcelas primeiro) deixava a cobrança de parcela que
  // não existe mais, somando em /terceiros.
  const apagouRecebiveis = protecao.recebiveis.length > 0;
  if (apagouRecebiveis) {
    const { error: delErr } = await ctx.supabase
      .from("receivables")
      .delete()
      .in("installment_id", ids);
    if (delErr) {
      if (temSqlstate(delErr)) return nadaGravado("cancelar as parcelas futuras");
      // 03-G2 (revisão final) — sem SQLSTATE os recebíveis PODEM ter saído: nunca "Nada foi
      // alterado". Repetir o cancelamento converge (o recálculo roda para a compra dividida).
      revalidateInstallments();
      return desfechoDesconhecido(
        "removido os recebíveis destas parcelas sem cancelá-las",
        "Parcelamentos",
      );
    }
  }

  const { error } = await ctx.supabase
    .from("transaction_installments")
    .update({ status: "cancelada" })
    .in("id", ids);
  if (error) {
    if (!apagouRecebiveis) return nadaGravado("cancelar as parcelas futuras");
    revalidateInstallments();
    return gravadoEmParte(
      "Os recebíveis destas parcelas foram removidos, mas as parcelas não foram canceladas. Tente cancelar de novo.",
    );
  }

  if (apagouRecebiveis || paiEhDividido) {
    // 03-G — leitura falha aqui gravaria valor_pessoal calculado sobre listas vazias; as parcelas
    // já foram canceladas, por isso a frase é a de "depois".
    const recalculo = await recomputeParentValorPessoal(ctx, parentId);
    if (recalculo === "leitura") {
      revalidateInstallments();
      return falhaDeLeituraDepois(ROTULOS_DE_LEITURA.parcelas);
    }
    if (recalculo === "escrita") {
      revalidateInstallments();
      return gravadoEmParte(
        "As parcelas foram canceladas, mas a minha parte da compra não foi recalculada. Edite a divisão em Parcelamentos para recalcular.",
      );
    }
  }

  revalidateInstallments();
  return { ok: true, data: undefined };
}

/**
 * Regrava `valor_pessoal` do pai como (Σ parcelas ativas − Σ recebíveis restantes), depois de
 * o conjunto de parcelas mudar. Não recalcula a divisão: as partes gravadas em
 * `shared_expenses` continuam sendo o que o usuário informou — só a MINHA parte, que é sempre
 * derivada, precisa acompanhar. Sem nenhum recebível a despesa volta a ser inteiramente minha.
 * Devolve `'leitura'` (não gravou nada) ou `'escrita'` (o update falhou) em vez de lançar.
 */
async function recomputeParentValorPessoal(
  ctx: AuthContext,
  parentId: string,
): Promise<"ok" | "leitura" | "escrita"> {
  const ativasRes = await ctx.supabase
    .from("transaction_installments")
    .select("valor")
    .eq("parent_transaction_id", parentId)
    .eq("status", "ativa");
  const recsRes = await ctx.supabase
    .from("receivables")
    .select("valor")
    .eq("transaction_id", parentId);
  // 03-G — com leitura falha, não regrava valor_pessoal sobre listas vazias.
  if (ativasRes.error || recsRes.error) return "leitura";

  const totalCentavos = (ativasRes.data ?? []).reduce(
    (acc, p) => acc + reaisParaCentavos(p.valor),
    0,
  );
  const terceirosCentavos = (recsRes.data ?? []).reduce(
    (acc, r) => acc + reaisParaCentavos(r.valor),
    0,
  );

  const { error } = await ctx.supabase
    .from("transactions")
    .update({
      valor_pessoal:
        terceirosCentavos > 0
          ? centavosParaReais(totalCentavos - terceirosCentavos)
          : null,
    })
    .eq("id", parentId);
  return error ? "escrita" : "ok";
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

  // REDESIGN-03-D · RR-D-17 — o cascade (parcelas → recebíveis → recebimentos) levaria o registro
  // do dinheiro que entrou. Mesmo alcance de `deleteTransaction` (decisão (b)): só recebimento
  // registrado bloqueia; `pago` legado sem recebimento continua deixando excluir.
  const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: [parentId] });
  if (protecao.erro) return dbError("Não foi possível conferir os recebíveis deste parcelamento. Tente de novo.");
  const motivo = motivoParaNaoApagar(protecao.recebiveis, "so-dinheiro-registrado", "excluir o parcelamento");
  if (motivo) return dbError(motivo);

  const { error } = await ctx.supabase
    .from("transactions")
    .delete()
    .eq("id", parentId)
    .eq("parcelado", true);
  if (error) return dbError("Não foi possível excluir o parcelamento.");

  revalidateInstallments();
  return { ok: true, data: undefined };
}
