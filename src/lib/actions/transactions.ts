"use server";

import { revalidatePath } from "next/cache";
import { transactionSchema } from "@/lib/validators/transaction";
import { splitSchema } from "@/lib/validators/split";
import {
  authContext,
  dbError,
  falhaDeLeituraAntes,
  falhaDeLeituraDepois,
  invalid,
  notAuthed,
  type AuthContext,
} from "@/lib/actions/helpers";
import { ehErroDeLeitura, exigir } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import { resolveOrCreateStatement } from "@/lib/finance/statements";
import { reapplySplit } from "@/lib/finance/split-reapply";
import { protecaoDosRecebiveis } from "@/lib/finance/recebimentos-leitura";
import { motivoParaNaoApagar } from "@/lib/finance/protecao-do-recebivel";
import {
  criarTransacao,
  lerResponsabilidadeDaReceita,
  type ColunasDaResponsabilidade,
} from "@/lib/finance/services";
import {
  sharedExpensesToFormParts,
  type SharedExpenseLike,
  type SplitFormPart,
} from "@/lib/finance/split";
import {
  dataDeLiquidacaoAGravar,
  dataDePagamentoFutura,
  liquidadoNoBotao,
  MSG_DATA_PAGAMENTO_FUTURA,
} from "@/lib/finance/caixa";
import { hojeISO, reaisParaCentavos } from "@/lib/format";
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

  // REDESIGN-03-E · P8 — data de pagamento futura é previsão, não caixa. A recusa vem ANTES de
  // qualquer leitura ou escrita — em especial antes do ramo de transferência, que apaga o
  // lançamento e recria: com a recusa vindo da recriação, o delete já teria acontecido.
  if (dataDePagamentoFutura(d.liquidado_em, hojeISO())) {
    return invalid({ liquidado_em: [MSG_DATA_PAGAMENTO_FUTURA] });
  }

  const { data: existing, error: loadErr } = await ctx.supabase
    .from("transactions")
    .select("id, type, transfer_group_id, parcelado, classificacao, amount")
    .eq("id", id)
    .single();
  if (loadErr || !existing) return dbError("Lançamento não encontrado.");

  // REDESIGN-03-C · A2 — a receita decide de quem é o dinheiro ANTES de qualquer escrita: a
  // recusa (ex.: o valor caiu abaixo da "minha parte" de uma compartilhada) não grava nada.
  // ⚠️ Antes INCLUSIVE do ramo de transferência, que apaga o lançamento e recria: com a recusa
  // vindo de dentro do `criarTransacao`, uma transferência editada para receita sumia — e, sendo
  // o pagamento de uma fatura, deixava a fatura "paga" apontando para o nada (achado P2 da
  // auditoria do módulo, 2026-10-11). O `criarTransacao` decide de novo, e chega no mesmo lugar.
  let colunasDaReceita: ColunasDaResponsabilidade | null = null;
  if (d.type === "receita") {
    const r = lerResponsabilidadeDaReceita(input, d.amount);
    if (!r.ok) return invalid(r.fieldErrors);
    colunasDaReceita = r.colunas;
  }
  const eraReceita = existing.type === "receita";

  const wasTransfer = !!existing.transfer_group_id;
  const isTransfer = d.type === "transferencia";

  // Transferências são substituídas (remove e recria) para manter as duas pernas
  // sempre consistentes; lançamentos simples são atualizados no lugar.
  if (wasTransfer || isTransfer) {
    // REDESIGN-03-D · RR-D-17 — apagar e recriar leva a divisão por cascade (shared_expenses e
    // parcelas → recebíveis → recebimentos). Mesmo alcance de `deleteTransaction` (decisão (b)).
    const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: [id] });
    if (protecao.erro) return dbError("Não foi possível conferir os recebíveis deste lançamento. Tente de novo.");
    const motivo = motivoParaNaoApagar(protecao.recebiveis, "so-dinheiro-registrado", "transformar o lançamento em transferência");
    if (motivo) return dbError(motivo);

    // Se for o pagamento de uma fatura, a fatura precisa apontar para o lançamento RECRIADO
    // (o delete abaixo zeraria `pago_transacao_id`). Editar o pagamento não desfaz o pagamento.
    // 03-G (D-G26) — ErroDeLeitura nunca escapa de uma Server Action; aqui nenhuma escrita veio antes.
    let statementId: string | null;
    try {
      statementId = await statementPaidBy(ctx, id);
    } catch (e) {
      if (!ehErroDeLeitura(e)) throw e;
      return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.fatura);
    }

    if (wasTransfer && existing.transfer_group_id) {
      await ctx.supabase
        .from("transactions")
        .delete()
        .eq("transfer_group_id", existing.transfer_group_id);
    } else {
      await ctx.supabase.from("transactions").delete().eq("id", id);
    }

    // 03-G — o serviço direto (é o que `createTransaction` faz por dentro, com o mesmo `ctx`),
    // para ler `leituraFalhou`: aqui o lançamento antigo JÁ foi apagado, então "Nada foi
    // alterado." seria mentira. A frase é a de "depois" (D-G20); a atomicidade é da 03-G2 (RR-F-1).
    const recriado = await criarTransacao(ctx, input);
    if (!recriado.ok) {
      revalidateTransactions();
      if (recriado.leituraFalhou) return falhaDeLeituraDepois(recriado.leituraFalhou);
      return recriado.fieldErrors ? invalid(recriado.fieldErrors) : dbError(recriado.erro);
    }
    if (statementId) {
      await ctx.supabase
        .from("card_statements")
        .update({ pago_transacao_id: recriado.id })
        .eq("id", statementId);
    }
    revalidateTransactions();
    return { ok: true, data: { id: recriado.id } };
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
    // 03-G (D-G26) — ErroDeLeitura nunca escapa de uma Server Action; aqui nenhuma escrita veio antes.
    try {
      statementId = await resolveOrCreateStatement(ctx, d.card_id, d.purchase_date);
    } catch (e) {
      if (!ehErroDeLeitura(e)) throw e;
      return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.fatura);
    }
    if (!statementId) return dbError("Não foi possível resolver a fatura do cartão.");
  }

  // REDESIGN-03-C · A2(b) — alvo RECEITA: a divisão da despesa antiga sai ANTES do update.
  // O caminho é o de sempre (`reapplySplit` → `limpar`, com a recusa por recebível cobrado/pago);
  // o que muda é só a ordem. Com o update primeiro, a recusa chegava com o lançamento já
  // gravado como receita e com o `valor_pessoal` da despesa antiga — e o motor, que passa a ler
  // `valor_pessoal` de receita, contaria isso como renda parcial. Despesa → despesa mantém a
  // ordem de hoje (risco residual RR6 do desenho da 03-C).
  if (colunasDaReceita && !existing.parcelado) {
    const res = await reapplySplit(ctx, {
      transactionId: id,
      totalCentavos: reaisParaCentavos(d.amount),
      totalCentavosAtual: reaisParaCentavos(existing.amount),
      classificacaoAtual: existing.classificacao as Classificacao,
      classificacaoNova: "pessoal",
      parts: [],
      mode: { kind: "avista", statementId, cardId },
    });
    if (!res.ok) return dbError(res.error);
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
      // REDESIGN-03-E · K0 — a data do pagamento acompanha o status: sair de pago/recebido (ou
      // virar compra de cartão) LIMPA a coluna, que o CHECK do banco exige coerente.
      liquidado_em: dataDeLiquidacaoAGravar({
        status: d.status,
        card_id: cardId,
        liquidado_em: d.liquidado_em,
      }),
      // Receita: as colunas da A1. Saindo de receita: volta a pessoal/nulo — sem divisão
      // gravada nem a gravar, `decidirReaplicacao` responde "nada", e uma receita de terceiro
      // virada despesa pessoal ficaria `terceiro` com valor 0 (fora do "meu"). Despesa →
      // despesa: nenhuma das duas chaves, como sempre (quem as grava é a divisão, abaixo).
      ...(colunasDaReceita ??
        (eraReceita ? { classificacao: "pessoal" as const, valor_pessoal: null } : {})),
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o lançamento.");

  // Divisão na edição (Fase 05): só em despesa NÃO parcelada — a divisão de compra parcelada
  // é editada em /parcelamentos, por `updateInstallmentSplit`, que chama o MESMO núcleo.
  // Re-aplica apenas quando a divisão muda, então editar só descrição/categoria/data de um
  // gasto já dividido não encosta nos recebíveis. A "minha parte" é sempre derivada.
  // A receita já passou por aqui ANTES do update (A2(b), acima).
  if (!colunasDaReceita && !existing.parcelado) {
    const split = splitSchema.safeParse(input);
    if (!split.success) return invalid(split.error.flatten().fieldErrors);

    const res = await reapplySplit(ctx, {
      transactionId: id,
      totalCentavos: reaisParaCentavos(d.amount),
      totalCentavosAtual: reaisParaCentavos(existing.amount),
      // Vindo de receita, as colunas acabaram de ser zeradas no update.
      classificacaoAtual: eraReceita ? "pessoal" : (existing.classificacao as Classificacao),
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

  const txRes = await ctx.supabase
    .from("transactions")
    .select("classificacao")
    .eq("id", id)
    .maybeSingle();
  const sharesRes = await ctx.supabase
    .from("shared_expenses")
    .select("person_id, tipo_divisao, percentual, valor")
    .eq("transaction_id", id);

  // 03-G (D-G32) — antes, erro aqui devolvia 'pessoal' com partes vazias, e salvar o formulário
  // APAGAVA a divisão. Com a leitura falha, a resposta é recusa, nunca "sem divisão".
  if (txRes.error || sharesRes.error) {
    return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.divisao);
  }

  return {
    ok: true,
    data: {
      classificacao: (txRes.data?.classificacao ?? "pessoal") as Classificacao,
      parts: sharedExpensesToFormParts((sharesRes.data ?? []) as SharedExpenseLike[]),
    },
  };
}

/**
 * Id da fatura que este lançamento quita, se ele for o pagamento de alguma — ou null.
 *
 * `card_statements.pago_transacao_id` é FK `on delete set null`: apagar o lançamento de
 * pagamento zera o ponteiro mas NÃO limpa `pago_em`/`status`, então a fatura ficaria "paga"
 * apontando para o nada. Quem apaga/recria o lançamento usa isto para acertar a fatura.
 *
 * 03-G — erro de leitura LANCA ErroDeLeitura (antes virava "não é pagamento de fatura" e a fatura
 * ficava paga apontando para o nada); quem chama captura.
 */
async function statementPaidBy(
  ctx: AuthContext,
  txId: string,
): Promise<string | null> {
  const res = await ctx.supabase
    .from("card_statements")
    .select("id")
    .eq("pago_transacao_id", txId)
    .maybeSingle();
  return exigir(res, ROTULOS_DE_LEITURA.fatura)?.id ?? null;
}

export async function deleteTransaction(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const existingRes = await ctx.supabase
    .from("transactions")
    .select("transfer_group_id")
    .eq("id", id)
    .single();
  // PGRST116 = o lançamento já sumiu: segue como hoje (D-G27). Qualquer outro erro recusa antes
  // de qualquer escrita.
  if (existingRes.error && existingRes.error.code !== "PGRST116") {
    return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.lancamento);
  }
  const existing = existingRes.data;

  // REDESIGN-03-D · A4 (decisão (b)) — o cascade levaria o registro do dinheiro que entrou.
  const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: [id] });
  if (protecao.erro) return dbError("Não foi possível conferir os recebíveis deste lançamento. Tente de novo.");
  const motivo = motivoParaNaoApagar(protecao.recebiveis, "so-dinheiro-registrado", "excluir o lançamento");
  if (motivo) return dbError(motivo);

  // Apagar o pagamento pela tela de Lançamentos reabre a fatura — mesmo efeito do
  // "Desfazer" em /faturas (o saldo da conta já estorna sozinho, junto com o lançamento).
  // 03-G (Z15) — recusa ANTES de reabrir a fatura e antes do delete.
  let statementId: string | null;
  try {
    statementId = await statementPaidBy(ctx, id);
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.fatura);
  }
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

  const existingRes = await ctx.supabase
    .from("transactions")
    .select("transfer_group_id, status")
    .eq("id", id)
    .single();
  // PGRST116 = o lançamento já sumiu: segue como hoje (D-G27). Outro erro recusa antes da escrita.
  if (existingRes.error && existingRes.error.code !== "PGRST116") {
    return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.lancamento);
  }
  const existing = existingRes.data;

  // REDESIGN-03-E · P9 — entrar ou sair do estado liquidado grava `liquidado_em = null`: o botão
  // não inventa uma data, e a coluna fica coerente com o CHECK. Entre `pago` e `recebido` a data
  // que o dono informou fica. Sem ler o status atual, limpa (o lado seguro).
  const acao = existing ? liquidadoNoBotao(existing.status as TransactionStatus, status) : "limpar";
  const mudanca = acao === "limpar" ? { status, liquidado_em: null } : { status };

  const { error } = existing?.transfer_group_id
    ? await ctx.supabase
        .from("transactions")
        .update(mudanca)
        .eq("transfer_group_id", existing.transfer_group_id)
    : await ctx.supabase.from("transactions").update(mudanca).eq("id", id);

  if (error) return dbError("Não foi possível atualizar o status.");
  revalidateTransactions();
  return { ok: true, data: undefined };
}
