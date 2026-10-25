"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { transactionSchema } from "@/lib/validators/transaction";
import { splitSchema } from "@/lib/validators/split";
import {
  authContext,
  dbError,
  falhaDeLeituraAntes,
  invalid,
  notAuthed,
  traduzirErroDaRpc,
  type AuthContext,
} from "@/lib/actions/helpers";
import { ehErroDeLeitura, exigir } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import { resolveOrCreateStatement } from "@/lib/finance/statements";
import { planejarReaplicacao } from "@/lib/finance/split-reapply";
import { montarLinhaDoLancamento } from "@/lib/finance/linha-do-lancamento";
import { divisaoVazia, type DivisaoPayload } from "@/lib/finance/split-persist";
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
  // qualquer leitura ou escrita.
  if (dataDePagamentoFutura(d.liquidado_em, hojeISO())) {
    return invalid({ liquidado_em: [MSG_DATA_PAGAMENTO_FUTURA] });
  }

  const { data: existing, error: loadErr } = await ctx.supabase
    .from("transactions")
    .select("id, type, transfer_group_id, parcelado, classificacao, amount, card_id, statement_id")
    .eq("id", id)
    .single();
  if (loadErr || !existing) return dbError("Lançamento não encontrado.");

  // 03-G2 (RR12, D-G2-12) — compra parcelada não muda de tipo por aqui. Vem antes de qualquer outra
  // leitura ou escrita: a compra-pai é o TOTAL, e a mudança de tipo desalinharia as parcelas.
  if (existing.parcelado && d.type !== existing.type) {
    return invalid({ type: ["Compra parcelada muda em Parcelamentos."] });
  }

  // REDESIGN-03-C · A2 — a receita decide de quem é o dinheiro ANTES de qualquer escrita: a
  // recusa (ex.: o valor caiu abaixo da "minha parte" de uma compartilhada) não grava nada.
  let colunasDaReceita: ColunasDaResponsabilidade | null = null;
  if (d.type === "receita") {
    const r = lerResponsabilidadeDaReceita(input, d.amount);
    if (!r.ok) return invalid(r.fieldErrors);
    colunasDaReceita = r.colunas;
  }
  const eraReceita = existing.type === "receita";

  const wasTransfer = !!existing.transfer_group_id;
  const isTransfer = d.type === "transferencia";

  // 03-G2 (D-G2-1, RR11) — estorno de cartão (receita com cartão que continua receita) NÃO
  // re-resolve a fatura: preserva cartão e fatura, mesmo com a data mudando. Senão, a despesa de
  // cartão resolve a fatura como sempre; nos demais casos os dois ficam nulos.
  const ehEstorno = existing.type === "receita" && !!existing.card_id && d.type === "receita";
  let cardId: string | null = null;
  let statementId: string | null = null;
  if (ehEstorno) {
    cardId = existing.card_id;
    statementId = existing.statement_id;
  } else if (d.type === "despesa" && d.payment_method === "cartao_credito" && d.card_id) {
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

  // 03-G2 (D-G2-14, §5.3) — a divisão é PLANEJADA antes de qualquer escrita: nenhum delete, nenhum
  // update direto. Quem grava é UMA rpc, no fim; recusa por recebível não deixa nada gravado (RR6).
  let divisao: DivisaoPayload | null = null;
  let colunas: ColunasDaResponsabilidade | undefined;

  if (isTransfer && !wasTransfer) {
    // RR-D-17 — a divisão sai junto: mesmo alcance de `deleteTransaction` (decisão (b)).
    const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: [id] });
    if (protecao.erro) return dbError("Não foi possível conferir os recebíveis deste lançamento. Tente de novo.");
    const motivo = motivoParaNaoApagar(protecao.recebiveis, "so-dinheiro-registrado", "transformar o lançamento em transferência");
    if (motivo) return dbError(motivo);
    divisao = divisaoVazia("so-dinheiro-registrado");
    colunas = { classificacao: "pessoal", valor_pessoal: null };
  } else if (isTransfer) {
    // Transferência editada no lugar: o id é o mesmo, a fatura que ela paga continua apontando para ele.
    divisao = null;
    colunas = { classificacao: "pessoal", valor_pessoal: null };
  } else if (existing.parcelado) {
    // A divisão de compra parcelada é editada em /parcelamentos (`updateInstallmentSplit`).
    divisao = null;
    colunas = undefined;
  } else if (colunasDaReceita) {
    // REDESIGN-03-C · A2(b) — alvo RECEITA: a divisão da despesa antiga sai na MESMA rpc.
    const plano = await planejarReaplicacao(ctx, {
      transactionId: id,
      totalCentavos: reaisParaCentavos(d.amount),
      totalCentavosAtual: reaisParaCentavos(existing.amount),
      classificacaoAtual: existing.classificacao as Classificacao,
      classificacaoNova: "pessoal",
      parts: [],
      mode: { kind: "avista", statementId, cardId },
    });
    if (plano.acao === "bloqueado") return dbError(plano.motivo);
    if (plano.acao === "erro") return dbError(plano.error);
    divisao = plano.acao === "substituir" ? plano.divisao : null;
    colunas = colunasDaReceita;
  } else {
    // Despesa/ajuste (não parcelado): re-aplica só quando a divisão muda, então editar só
    // descrição/categoria/data de um gasto já dividido não encosta nos recebíveis.
    const split = splitSchema.safeParse(input);
    if (!split.success) return invalid(split.error.flatten().fieldErrors);

    const plano = await planejarReaplicacao(ctx, {
      transactionId: id,
      totalCentavos: reaisParaCentavos(d.amount),
      totalCentavosAtual: reaisParaCentavos(existing.amount),
      // Vindo de receita ou de transferência, as colunas voltam a pessoal na mesma rpc.
      classificacaoAtual:
        eraReceita || wasTransfer ? "pessoal" : (existing.classificacao as Classificacao),
      // Só despesa é divisível; ajuste volta a pessoal.
      classificacaoNova: d.type === "despesa" ? split.data.classificacao : "pessoal",
      parts: d.type === "despesa" ? split.data.parts : [],
      mode: { kind: "avista", statementId, cardId },
    });
    if (plano.acao === "bloqueado") return dbError(plano.motivo);
    if (plano.acao === "erro") return dbError(plano.error);
    if (plano.acao === "substituir") {
      divisao = plano.divisao;
      colunas = plano.colunas;
    } else {
      divisao = null;
      // D-G2-14: sair de receita (ou de transferência) volta a pessoal/nulo; despesa → despesa
      // sem mudança de divisão não menciona as duas colunas.
      colunas =
        eraReceita || wasTransfer ? { classificacao: "pessoal", valor_pessoal: null } : undefined;
    }
  }

  const linha = montarLinhaDoLancamento(d, {
    cardId,
    statementId,
    transferGroupId: isTransfer ? (existing.transfer_group_id ?? randomUUID()) : null,
    estorno: ehEstorno,
    colunas,
  });
  const { error } = await ctx.supabase.rpc("salvar_lancamento", {
    p_lancamento: linha,
    p_divisao: divisao,
    p_id: id,
  });
  if (error) {
    // Sem SQLSTATE (rede, timeout) o desfecho é desconhecido: a tela precisa recarregar.
    const desfechoIncerto = typeof error.code !== "string" || error.code.length !== 5;
    if (desfechoIncerto) revalidateTransactions();
    return traduzirErroDaRpc(error, "atualizar o lançamento");
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
