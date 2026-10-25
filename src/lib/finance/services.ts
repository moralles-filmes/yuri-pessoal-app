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
import { receitaResponsabilidadeSchema, splitSchema } from "@/lib/validators/split";
import { ehErroDeLeitura } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import {
  getOrCreateStatementForCompetencia,
  resolveOrCreateStatement,
} from "@/lib/finance/statements";
import { applySplit } from "@/lib/finance/split-persist";
import { protecaoDosRecebiveis } from "@/lib/finance/recebimentos-leitura";
import { motivoParaNaoApagar } from "@/lib/finance/protecao-do-recebivel";
import {
  colunasDaReceita,
  decidirResponsabilidadeDaReceita,
} from "@/lib/finance/responsabilidade-da-receita";
import type { Classificacao } from "@/lib/finance/constants";
import {
  dataDeLiquidacaoAGravar,
  dataDePagamentoFutura,
  MSG_DATA_PAGAMENTO_FUTURA,
} from "@/lib/finance/caixa";
import { centavosParaReais, hojeISO, reaisParaCentavos } from "@/lib/format";

export type FinanceServiceContext = AuthContext;

export type ColunasDaResponsabilidade = {
  classificacao: Classificacao;
  valor_pessoal: number | null;
};

/**
 * REDESIGN-03-C · A2 — a responsabilidade de uma RECEITA, lida do payload cru e decidida pela
 * A1. Criar e editar chamam esta função, ANTES de qualquer escrita: a recusa volta como erro
 * de campo (`receita_minha_parte`) e nada é gravado.
 *
 * ⛔ Lê só as chaves PRÓPRIAS da receita (`receita_classificacao`, `receita_minha_parte`).
 * A chave `classificacao` do mesmo payload é da despesa e continua ignorada aqui — é o que
 * mantém a importação (que pode mandá-la numa linha virada receita) e a IA gravando `pessoal`.
 */
export function lerResponsabilidadeDaReceita(
  input: unknown,
  amountReais: number,
):
  | { ok: true; colunas: ColunasDaResponsabilidade }
  | { ok: false; fieldErrors: Record<string, string[] | undefined> } {
  const parsed = receitaResponsabilidadeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const parte = parsed.data.receita_minha_parte;
  const decisao = decidirResponsabilidadeDaReceita({
    classificacao: parsed.data.receita_classificacao,
    minhaParteCentavos: parte == null ? null : reaisParaCentavos(parte),
    valorCentavos: reaisParaCentavos(amountReais),
  });
  if (!decisao.ok) return { ok: false, fieldErrors: { [decisao.campo]: [decisao.mensagem] } };
  return { ok: true, colunas: colunasDaReceita(decisao.responsabilidade) };
}

export type CriarTransacaoResultado =
  | { readonly ok: true; readonly id: string; readonly statementId: string | null }
  | {
      readonly ok: false;
      readonly erro: string;
      readonly fieldErrors?: Record<string, string[] | undefined>;
      /**
       * 03-G — a leitura que falhou (o rótulo), quando a falha foi de leitura. `erro` diz "Nada
       * foi alterado." porque, NESTE serviço, nenhuma escrita veio antes; quem chama depois de
       * já ter escrito (a transferência editada, que apaga antes de recriar) usa o rótulo para
       * dizer a frase de "depois".
       */
      readonly leituraFalhou?: string;
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

  // REDESIGN-03-E · A3 (P8) — data do pagamento futura é previsão, não caixa: recusa ANTES de
  // qualquer escrita, como erro do campo. O schema não tem `hoje` injetado, por isso é aqui.
  if (dataDePagamentoFutura(d.liquidado_em, hojeISO())) {
    return {
      ok: false,
      erro: "Verifique os campos destacados.",
      fieldErrors: { liquidado_em: [MSG_DATA_PAGAMENTO_FUTURA] },
    };
  }

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
        // K0: a transferência nunca tem cartão; só liquidada guarda a data.
        liquidado_em: dataDeLiquidacaoAGravar({
          status: d.status,
          card_id: null,
          liquidado_em: d.liquidado_em,
        }),
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

  // REDESIGN-03-C · A2 — a receita decide de quem é o dinheiro ANTES de qualquer escrita.
  let colunasDaReceitaDecididas: ColunasDaResponsabilidade | null = null;
  if (d.type === "receita") {
    const r = lerResponsabilidadeDaReceita(input, d.amount);
    if (!r.ok) {
      return { ok: false, erro: "Verifique os campos destacados.", fieldErrors: r.fieldErrors };
    }
    colunasDaReceitaDecididas = r.colunas;
  }

  // Compra no cartão (Fase 03): resolve/cria a fatura e vincula statement_id. Na importação,
  // `statement_competencia` força a fatura sendo importada (evita derivar de uma data antiga).
  let cardId: string | null = null;
  let statementId: string | null = null;
  if (d.type === "despesa" && d.payment_method === "cartao_credito" && d.card_id) {
    cardId = d.card_id;
    // 03-G (D-G26): o ErroDeLeitura do busca-ou-cria vira a falha deste serviço; nenhuma escrita
    // DESTE serviço veio antes dele, então "Nada foi alterado" é verdade aqui. Quem chama depois de
    // ter escrito lê `leituraFalhou` e escolhe a frase (ver `updateTransaction`).
    try {
      statementId = d.statement_competencia
        ? await getOrCreateStatementForCompetencia(ctx, d.card_id, d.statement_competencia)
        : await resolveOrCreateStatement(ctx, d.card_id, d.purchase_date);
    } catch (e) {
      if (!ehErroDeLeitura(e)) throw e;
      return {
        ok: false,
        erro: `Não foi possível ler ${ROTULOS_DE_LEITURA.fatura}. Nada foi alterado.`,
        leituraFalhou: ROTULOS_DE_LEITURA.fatura,
      };
    }
    if (!statementId) {
      return { ok: false, erro: "Não foi possível resolver a fatura do cartão." };
    }
  }

  // Divisão (Fase 05): a máquina de divisão é só da DESPESA. A receita tem responsabilidade
  // própria (03-C, decidida acima), lida de chaves próprias — a chave `classificacao` do payload
  // continua sendo só da despesa, e por isso a importação (que pode mandá-la numa linha que
  // virou receita, imports.ts) e a IA continuam gravando receita `pessoal`. Ajuste fica pessoal.
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
      // K0: compra de cartão nunca guarda a data; fora de pago/recebido também é nulo.
      liquidado_em: dataDeLiquidacaoAGravar({
        status: d.status,
        card_id: cardId,
        liquidado_em: d.liquidado_em,
      }),
      // Despesa e ajuste: o objeto de sempre (sem `valor_pessoal`, que a divisão deriva depois).
      // Receita: as duas colunas da A1.
      ...(colunasDaReceitaDecididas ?? { classificacao }),
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
  // 03-G (D-G19): erro de leitura não é "não existe" — recusa antes de qualquer escrita.
  const res = await ctx.supabase
    .from("transactions")
    .select("id, transfer_group_id")
    .eq("id", id)
    .maybeSingle();
  if (res.error) {
    return { ok: false, erro: `Não foi possível ler ${ROTULOS_DE_LEITURA.lancamento}. Nada foi alterado.` };
  }
  const existente = res.data;

  if (!existente) return { ok: false, erro: "O lançamento não existe mais (ou não é seu)." };
  if (existente.transfer_group_id) {
    return {
      ok: false,
      erro: "Este lançamento é uma transferência e não pode ser desfeito por aqui.",
    };
  }

  const protecao = await protecaoDosRecebiveis(ctx.supabase, { transactionIds: [id] });
  if (protecao.erro) return { ok: false, erro: "Não foi possível conferir os recebíveis deste lançamento." };
  const motivo = motivoParaNaoApagar(protecao.recebiveis, "so-dinheiro-registrado", "excluir o lançamento");
  if (motivo) return { ok: false, erro: motivo };

  const { error } = await ctx.supabase.from("transactions").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir o lançamento." };
  return { ok: true };
}
