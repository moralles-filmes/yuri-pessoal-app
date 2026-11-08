"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { transactionSchema } from "@/lib/validators/transaction";
import { splitSchema } from "@/lib/validators/split";
import {
  authContext,
  dbError,
  desfechoDesconhecido,
  falhaDeLeituraAntes,
  gravadoEmParte,
  invalid,
  nadaGravado,
  notAuthed,
  temSqlstate,
  traduzirErroDaRpc,
  type AuthContext,
} from "@/lib/actions/helpers";
import { ehErroDeLeitura, exigir } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import { resolveOrCreateStatement } from "@/lib/finance/statements";
import { planejarReaplicacao } from "@/lib/finance/split-reapply";
import { montarLinhaDoLancamento } from "@/lib/finance/linha-do-lancamento";
import { divisaoVazia, type DivisaoPayload } from "@/lib/finance/split-persist";
import { competenciaMMAAAA, type PrevisaoDeExclusao } from "@/lib/finance/previsao-da-exclusao";
import { lerEstadoDoReembolso, protecaoDosRecebiveis } from "@/lib/finance/recebimentos-leitura";
import { motivoParaNaoApagar } from "@/lib/finance/protecao-do-recebivel";
import {
  criarTransacao,
  lerReembolsoDaReceita,
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
import { entradaDaPrevia, MSG_LEITURA_DO_REEMBOLSO_FALHOU } from "@/lib/finance/reembolso";
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
  // 03-G2 (D-G2-1, RR11) — estorno de cartão (receita com cartão que continua receita) NÃO
  // re-resolve a fatura: preserva cartão e fatura, mesmo com a data mudando. Senão, a despesa de
  // cartão resolve a fatura como sempre; nos demais casos os dois ficam nulos. Vem antes da decisão
  // da receita (04-C): estorno não abate o que uma pessoa deve.
  const ehEstorno = existing.type === "receita" && !!existing.card_id && d.type === "receita";

  // 04-C · T6 — com pessoa, a sobra decide a classificação, a minha parte e o vínculo; sem pessoa,
  // é a decisão de sempre. Receita que deixa de ser receita não passa por aqui e a linha grava nulo.
  let colunasDaReceita: ColunasDaResponsabilidade | null = null;
  let reembolsoPessoaId: string | null = null;
  if (d.type === "receita") {
    const r = await lerReembolsoDaReceita(ctx, input, {
      amountReais: d.amount,
      transactionId: id,
      estorno: ehEstorno,
    });
    if (!r.ok) return invalid(r.fieldErrors);
    colunasDaReceita = r.colunas;
    reembolsoPessoaId = r.reembolsoPessoaId;
  }
  const eraReceita = existing.type === "receita";

  const wasTransfer = !!existing.transfer_group_id;
  const isTransfer = d.type === "transferencia";

  let cardId: string | null = null;
  let statementId: string | null = null;
  // 03-G2 (revisão final) — o schema aceita receita com cartão e sem conta por causa do estorno
  // (D-G2-19); fora da edição de um estorno existente, isso gravaria uma receita sem conta e sem
  // cartão. Recusa antes de qualquer escrita.
  if (!ehEstorno && d.type === "receita" && d.card_id && !d.account_id) {
    return invalid({ account_id: ["Selecione a conta"] });
  }
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
    reembolsoPessoaId,
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
 * 04-C · T6 — o que a prévia do reembolso precisa saber da pessoa: a dívida, o saldo a favor e, na
 * edição, a contribuição desta receita. SÓ LÊ (sem `revalidatePath`). A tela calcula a prévia a cada
 * valor digitado com `previaDoReembolso`; esta leitura roda uma vez por pessoa. A conta é a do
 * servidor (`entradaDaPrevia`), que recalcula tudo antes de gravar.
 */
export async function lerPreviaDoReembolso(input: {
  pessoaId: string;
  transactionId?: string | null;
}): Promise<
  ActionResult<{
    devidoCentavos: number;
    saldoAFavorCentavos: number;
    parteAtualDestaCentavos: number;
    alocadoDestaCentavos: number;
  }>
> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const ids = z
    .object({ pessoaId: z.uuid(), transactionId: z.uuid().nullish() })
    .safeParse(input);
  if (!ids.success) return dbError("Pessoa ou lançamento inválido.");

  try {
    const estado = await lerEstadoDoReembolso(ctx.supabase, ids.data.pessoaId);
    return { ok: true, data: entradaDaPrevia(estado, ids.data.transactionId ?? null) };
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    return dbError(MSG_LEITURA_DO_REEMBOLSO_FALHOU);
  }
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
 * Fatura que este lançamento quita (id e competência), se ele for o pagamento de alguma — ou null.
 *
 * `card_statements.pago_transacao_id` é FK `on delete set null`: apagar o lançamento de
 * pagamento zera o ponteiro mas NÃO limpa `pago_em`/`status`, então a fatura ficaria "paga"
 * apontando para o nada. Quem apaga o lançamento usa isto para acertar a fatura — e a previsão
 * da exclusão usa a MESMA leitura (K3), com a competência para a frase.
 *
 * 03-G — erro de leitura LANCA ErroDeLeitura (antes virava "não é pagamento de fatura" e a fatura
 * ficava paga apontando para o nada); quem chama captura.
 */
async function faturaPagaPor(
  ctx: AuthContext,
  txId: string,
): Promise<{ id: string; competencia: string } | null> {
  const res = await ctx.supabase
    .from("card_statements")
    .select("id, competencia")
    .eq("pago_transacao_id", txId)
    .maybeSingle();
  const fatura = exigir(res, ROTULOS_DE_LEITURA.fatura);
  return fatura ? { id: fatura.id, competencia: fatura.competencia } : null;
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
  // 03-G (Z15) — recusa ANTES de qualquer escrita.
  let fatura: { id: string; competencia: string } | null;
  try {
    fatura = await faturaPagaPor(ctx, id);
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.fatura);
  }

  // 03-G2 (D-G2-12, RR-F-2, S6) — o lançamento é apagado ANTES de a fatura ser reaberta. Cair entre
  // os dois passos deixa uma fatura "paga" sem pagamento: visível, e nenhum dinheiro em dobro (o
  // desfazer de /faturas aceita `pago_transacao_id` nulo). A ordem antiga deixava a fatura ABERTA
  // com o pagamento ainda debitando a conta — e pagá-la de novo debitava duas vezes.
  // Os dois erros são conferidos; 0 linhas apagadas = já sumiu e segue como hoje (D-G27).
  const apagar = ctx.supabase.from("transactions").delete();
  const { error: erroDoDelete } = await (
    existing?.transfer_group_id
      ? apagar.eq("transfer_group_id", existing.transfer_group_id)
      : apagar.eq("id", id)
  ).select("id");
  if (erroDoDelete) {
    if (temSqlstate(erroDoDelete)) return nadaGravado("excluir o lançamento");
    // 03-G2 (revisão final) — sem SQLSTATE o delete PODE ter acontecido: nunca "Nada foi alterado".
    revalidateTransactions();
    return desfechoDesconhecido(
      fatura
        ? `sido excluído; se ele sumiu, a fatura de ${competenciaMMAAAA(fatura.competencia)} continua marcada como paga e o pagamento se desfaz em Faturas`
        : "sido excluído",
      "Lançamentos",
    );
  }

  if (fatura) {
    const { error: erroDaFatura } = await ctx.supabase
      .from("card_statements")
      .update({
        status: "aberta",
        pago_em: null,
        pago_conta_id: null,
        pago_transacao_id: null,
      })
      .eq("id", fatura.id);
    if (erroDaFatura) {
      revalidateTransactions();
      return gravadoEmParte(
        `O lançamento foi excluído, mas a fatura de ${competenciaMMAAAA(fatura.competencia)} continua marcada como paga. Desfaça o pagamento em Faturas.`,
      );
    }
  }

  revalidateTransactions();
  return { ok: true, data: undefined };
}

/**
 * 03-G2 (K3, D-G2-17) — o que a exclusão leva junto, para o diálogo mostrar ANTES de confirmar.
 * SÓ LÊ: nenhuma escrita. As leituras são as mesmas de `deleteTransaction` (`faturaPagaPor`,
 * `protecaoDosRecebiveis`), mais o que o cascade apaga: recebíveis de qualquer status (o alcance é
 * `so-dinheiro-registrado`), parcelas da compra-pai e o vínculo com a linha da importação.
 * O servidor reconfere tudo ao excluir.
 */
export async function preverExclusaoDoLancamento(
  id: string,
): Promise<ActionResult<PrevisaoDeExclusao>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const lancamentoRes = await ctx.supabase
    .from("transactions")
    .select("type, transfer_group_id, parcelado")
    .eq("id", id)
    .single();
  if (lancamentoRes.error) {
    if (lancamentoRes.error.code === "PGRST116") return dbError("Lançamento não encontrado.");
    return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.lancamento);
  }
  const lancamento = lancamentoRes.data;

  const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: [id] });
  if (protecao.erro) return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.recebiveis);
  const bloqueio = motivoParaNaoApagar(protecao.recebiveis, "so-dinheiro-registrado", "excluir o lançamento");

  let fatura: { id: string; competencia: string } | null;
  try {
    fatura = await faturaPagaPor(ctx, id);
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.fatura);
  }

  const recebiveisRes = await ctx.supabase
    .from("receivables")
    .select("person_id, status")
    .eq("transaction_id", id);
  if (recebiveisRes.error) return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.recebiveis);
  const recebiveis = recebiveisRes.data ?? [];

  const personIds = [...new Set(recebiveis.map((r) => r.person_id))];
  const nomes = new Map<string, string>();
  if (personIds.length > 0) {
    const pessoasRes = await ctx.supabase.from("people").select("id, nome").in("id", personIds);
    if (pessoasRes.error) return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.pessoas);
    for (const p of pessoasRes.data ?? []) nomes.set(p.id, p.nome);
  }

  let parcelas = 0;
  if (lancamento.parcelado) {
    const parcelasRes = await ctx.supabase
      .from("transaction_installments")
      .select("id", { count: "exact", head: true })
      .eq("parent_transaction_id", id);
    if (parcelasRes.error) return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.parcelas);
    parcelas = parcelasRes.count ?? 0;
  }

  const linhasRes = await ctx.supabase
    .from("import_rows")
    .select("id", { count: "exact", head: true })
    .eq("transaction_id", id);
  if (linhasRes.error) return falhaDeLeituraAntes(ROTULOS_DE_LEITURA.linhasDaImportacao);

  const grupos = new Map<string, { pessoa: string; status: string; quantidade: number }>();
  for (const r of recebiveis) {
    const chave = `${r.person_id}|${r.status}`;
    const g = grupos.get(chave);
    if (g) g.quantidade += 1;
    else {
      grupos.set(chave, {
        pessoa: nomes.get(r.person_id) ?? "pessoa não identificada",
        status: r.status,
        quantidade: 1,
      });
    }
  }

  return {
    ok: true,
    data: {
      bloqueio,
      faturaReaberta: fatura ? { competencia: fatura.competencia } : null,
      recebiveis: [...grupos.values()],
      parcelas,
      linhasDaImportacao: linhasRes.count ?? 0,
      ehTransferencia: !!lancamento.transfer_group_id,
    },
  };
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
