import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · O command de Financeiro. O ÚLTIMO, e o de maior risco.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ESTE FOI DEIXADO PARA O FIM — a matriz da 18-C fixou a ordem, e o motivo é     ║
 * ║ concreto: este é o único módulo do sistema em que um erro de gravação já aconteceu de  ║
 * ║ verdade e custou dinheiro contado errado. O lançamento em dobro na importação          ║
 * ║ (2026-08-06) é o bug que sustenta o claim-first do Bloco 3: a vaga em                  ║
 * ║ `ai_action_executions` é reservada ANTES de chamar o command, e uma queda no meio      ║
 * ║ deixa `executando` — erra para "pode não ter acontecido", nunca para "pode ter         ║
 * ║ acontecido duas vezes".                                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `executar` chama `finance/services.ts`, exatamente o que `createTransaction` chama.
 */

import { criarTransacao, excluirTransacaoSimples } from "@/lib/finance/services";
import { desfazerPeloId, type Command } from "../contracts";
import {
  excluirTransacaoEntrada,
  lancarTransacaoEntrada,
  paraOSchemaDoFormulario,
  parseComTransacao,
  preverExcluirTransacao,
  preverLancarTransacao,
  resolverTransacao,
  rotaDoLancamento,
  type ExcluirTransacaoEntrada,
  type LancarTransacaoEntrada,
} from "./finance-preview";

/* ══════════════════════════════════════════════════════════════════════════════════════
   1 · lancarTransacao — risco 3
   ══════════════════════════════════════════════════════════════════════════════════════ */

export const lancarTransacao: Command = {
  name: "lancarTransacao",
  module: "finance",
  risk: 3,
  revalidar: [
    "/financeiro",
    "/financeiro/lancamentos",
    "/financeiro/contas",
    "/cartoes",
    "/faturas",
    "/dashboard",
  ],
  /**
   * §3.6 — os campos que ESTA ação detalha. `amount` entra porque é o número que o dono
   * confirmou, e ele precisa poder conferir na auditoria que foi esse que gravou. `notes` e
   * `tags` não entram em allowlist nenhuma.
   */
  camposAuditaveis: ["type", "amount", "description", "purchase_date", "account_or_card"],
  desfazer: {
    kind: "command",
    command: "excluirTransacao",
    payload: desfazerPeloId("transacao_id"),
  },

  parse: parseComTransacao(lancarTransacaoEntrada),
  prever: (_ctx, payload) => preverLancarTransacao(payload),

  async executar(ctx, payload) {
    const d = payload as LancarTransacaoEntrada;

    /**
     * ⚠️ RESOLVE DE NOVO, e aqui isso tem uma consequência extra: `resolverTransacao` é
     * também quem RECUSA fatura já paga. Se o dono pagou a fatura nos 10 minutos entre propor
     * e confirmar, a execução para aqui — antes de tocar em `transactions`.
     */
    const r = await resolverTransacao(d);
    const dados = paraOSchemaDoFormulario(d, r);

    const gravado = await criarTransacao(ctx, dados);
    if (!gravado.ok) throw new Error(gravado.erro);

    return {
      targetId: gravado.id,
      targetRoute: rotaDoLancamento(),
      alterados: {
        type: d.tipo,
        amount: d.valor,
        description: d.descricao,
        purchase_date: r.data,
        account_or_card: r.cartao?.nome ?? r.conta?.nome ?? null,
      },
      itens: [],
    };
  },
};

/* ══════════════════════════════════════════════════════════════════════════════════════
   2 · excluirTransacao — o DESFAZER (§3.7)
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⛔ NÃO ESTÁ NO TOOL REGISTRY, e neste módulo isso pesa mais que nos outros: "apague o
 * lançamento X" dito em linguagem natural, com um id resolvido por semelhança de texto, é a
 * receita para apagar o lançamento errado. Excluir é risco 4 e está fora da 18-C. Quem alcança
 * este command é o botão de desfazer da tela, sobre uma linha que a própria IA acabou de criar.
 */
export const excluirTransacao: Command = {
  name: "excluirTransacao",
  module: "finance",
  risk: 3,
  revalidar: [
    "/financeiro",
    "/financeiro/lancamentos",
    "/financeiro/contas",
    "/cartoes",
    "/faturas",
    "/dashboard",
  ],
  camposAuditaveis: ["description"],
  desfazer: {
    kind: "nao-ha",
    porque:
      "O lançamento foi excluído. Lançar de novo é uma ação, com a sua própria confirmação — e a fatura em que a nova compra cairia seria resolvida com a data de hoje, não com a da original.",
  },

  parse: parseComTransacao(excluirTransacaoEntrada),
  prever: (_ctx, payload) => preverExcluirTransacao(payload),

  async executar(ctx, payload) {
    const { transacao_id } = payload as ExcluirTransacaoEntrada;

    const r = await excluirTransacaoSimples(ctx, transacao_id);
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: transacao_id,
      targetRoute: null,
      // O que sobra na auditoria é que houve exclusão e qual id. A descrição já foi mostrada
      // na proposta que o dono confirmou; repeti-la aqui não acrescenta e duplica o dado.
      alterados: {},
      itens: [],
    };
  },
};
