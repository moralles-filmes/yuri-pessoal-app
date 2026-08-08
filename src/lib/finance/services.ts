import "server-only";

/**
 * Fase 18-C · Bloco 4 — Financeiro · O SERVIÇO de lançamento, extraído da Server Action.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE A FUNÇÃO INTEIRA, E NÃO SÓ O PEDAÇO QUE A IA USA.                             ║
 * ║                                                                                       ║
 * ║ A tentação era escrever um "lançamento simples" para a IA — sem transferência, sem     ║
 * ║ cartão, sem divisão — e deixar `createTransaction` como estava. Seria uma SEGUNDA      ║
 * ║ implementação do insert, e a divergência apareceria no primeiro campo novo: um         ║
 * ║ lançamento da IA nasceria diferente de um lançamento do formulário, na mesma tabela.   ║
 * ║                                                                                       ║
 * ║ Então a função inteira mora aqui e os dois caminhos a chamam. Quem restringe o que a   ║
 * ║ IA pode lançar é o SCHEMA DA FERRAMENTA (não há campo de transferência, de parcela nem ║
 * ║ de divisão) — restrição na entrada, não uma cópia mutilada da regra.                   ║
 * ║                                                                                       ║
 * ║ ⚠️ E é aqui que mora a razão de este ser o ÚLTIMO command da subfase: este arquivo     ║
 * ║ toca fatura, recebível de terceiro e saldo de conta ao mesmo tempo. O bug de lançar em ║
 * ║ dobro já aconteceu neste projeto — é a memória que sustenta o claim-first do Bloco 3.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { randomUUID } from "node:crypto";
import type { AuthContext } from "@/lib/actions/helpers";
import { transactionSchema } from "@/lib/validators/transaction";
import { splitSchema } from "@/lib/validators/split";
import {
  getOrCreateStatementForCompetencia,
  resolveOrCreateStatement,
} from "@/lib/finance/statements";
import { applySplit } from "@/lib/finance/split-persist";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";

export type FinanceServiceContext = AuthContext;

export type CriarTransacaoResultado =
  | { readonly ok: true; readonly id: string; readonly statementId: string | null }
  | {
      readonly ok: false;
      readonly erro: string;
      readonly fieldErrors?: Record<string, string[] | undefined>;
    };

/**
 * Cria o lançamento. `input` é o objeto CRU — o mesmo que o formulário envia — porque a
 * divisão é lida do mesmo objeto por um segundo schema (`splitSchema`), e separar as duas
 * validações aqui obrigaria a casca a conhecer essa dupla leitura.
 */
export async function criarTransacao(
  ctx: FinanceServiceContext,
  input: unknown,
): Promise<CriarTransacaoResultado> {
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      erro: "Verifique os campos destacados.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;

  if (d.type === "transferencia") {
    // UMA linha por transferência: `public.account_balance` já deriva os dois lados da
    // mesma linha (-amount na conta de origem `account_id`, +amount no destino
    // `transfer_account_id`). Gravar as duas pernas espelhadas fazia os efeitos se
    // anularem e o saldo das contas não mudava. `transfer_group_id` continua marcando
    // a linha como transferência (usado em update/delete/status).
    const { data, error } = await ctx.supabase
      .from("transactions")
      .insert({
        user_id: ctx.userId,
        type: "transferencia" as const,
        payment_method: "transferencia" as const,
        account_id: d.account_id,
        transfer_account_id: d.transfer_account_id,
        transfer_group_id: randomUUID(),
        amount: d.amount,
        purchase_date: d.purchase_date,
        competence_date: d.competence_date,
        description: d.description,
        notes: d.notes,
        tags: d.tags,
        status: d.status,
        category_id: null,
        subcategory_id: null,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, erro: "Não foi possível registrar a transferência." };
    }
    return { ok: true, id: data.id, statementId: null };
  }

  // Compra no cartão (Fase 03): resolve/cria a fatura e vincula statement_id. Na importação,
  // `statement_competencia` força a fatura sendo importada (evita derivar de uma data antiga).
  let cardId: string | null = null;
  let statementId: string | null = null;
  if (d.type === "despesa" && d.payment_method === "cartao_credito" && d.card_id) {
    cardId = d.card_id;
    statementId = d.statement_competencia
      ? await getOrCreateStatementForCompetencia(ctx, d.card_id, d.statement_competencia)
      : await resolveOrCreateStatement(ctx, d.card_id, d.purchase_date);
    if (!statementId) {
      return { ok: false, erro: "Não foi possível resolver a fatura do cartão." };
    }
  }

  // Divisão (Fase 05): só faz sentido em despesa; demais tipos ficam 'pessoal'.
  const split = splitSchema.safeParse(input);
  if (!split.success) {
    return {
      ok: false,
      erro: "Verifique os campos destacados.",
      fieldErrors: split.error.flatten().fieldErrors,
    };
  }
  const isShared = d.type === "despesa" && split.data.classificacao !== "pessoal";
  const classificacao = isShared ? split.data.classificacao : "pessoal";

  const { data, error } = await ctx.supabase
    .from("transactions")
    .insert({
      user_id: ctx.userId,
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
      classificacao,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, erro: "Não foi possível salvar o lançamento." };

  // Grava a divisão (shared_expenses + receivables) e deriva o valor_pessoal. Quase-atômico:
  // se a divisão falhar, remove a transação para não deixar gasto sem divisão consistente.
  if (isShared) {
    const res = await applySplit(ctx, {
      transactionId: data.id,
      totalCentavos: reaisParaCentavos(d.amount),
      statementId,
      cardId,
      parts: split.data.parts,
    });
    if (!res.ok) {
      await ctx.supabase.from("transactions").delete().eq("id", data.id);
      return { ok: false, erro: res.error };
    }
    await ctx.supabase
      .from("transactions")
      .update({ valor_pessoal: centavosParaReais(res.minhaParteCentavos) })
      .eq("id", data.id);
  }

  return { ok: true, id: data.id, statementId };
}

/**
 * Exclui o lançamento. É o `undo` declarado de `lancarTransacao`.
 *
 * ⚠️ O que some junto é responsabilidade do BANCO, não desta função: `shared_expenses` e
 * `receivables` são `on delete cascade` da transação. Apagar aqui, na mão, uma parte da
 * cadeia deixaria o resto órfão — e a soma de recebíveis do terceiro passaria a divergir da
 * fatura, que é a classe de bug que a Fase 05 gastou mais tempo consertando.
 *
 * ⚠️ E ele NÃO cobre transferência: `deleteTransaction` (a action) apaga o grupo inteiro por
 * `transfer_group_id`. Como a ferramenta da IA não lança transferência, o desfazer dela nunca
 * alcança uma — e é por isso que esta função é deliberadamente a versão simples.
 */
export async function excluirTransacaoSimples(
  ctx: FinanceServiceContext,
  id: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { data: existente } = await ctx.supabase
    .from("transactions")
    .select("id, transfer_group_id")
    .eq("id", id)
    .maybeSingle();

  if (!existente) return { ok: false, erro: "O lançamento não existe mais (ou não é seu)." };
  if (existente.transfer_group_id) {
    return {
      ok: false,
      erro: "Este lançamento é uma transferência e não pode ser desfeito por aqui.",
    };
  }

  const { error } = await ctx.supabase.from("transactions").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir o lançamento." };
  return { ok: true };
}
