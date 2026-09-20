import "server-only";

/**
 * Fase 18-F · Bloco 3 — IA · Os commands de Memória. A metade que ESCREVE.
 *
 * `executar` chama `memory/services.ts` — exatamente o que as Server Actions da tela chamam.
 * Nenhuma regra reescrita: a validação de forma e o registro do evento acontecem lá dentro,
 * uma vez só (invariante 41).
 */

import { saoPauloWallClockToInstant } from "@/lib/format";
import { criarMemoria, esquecerMemoria } from "@/lib/ai/memory/services";
import { type Command } from "../contracts";
import {
  esquecerPreferenciaEntrada,
  lembrarPreferenciaEntrada,
  parseComMemoria,
  preverEsquecerPreferencia,
  preverLembrarPreferencia,
  type EsquecerPreferenciaEntrada,
  type LembrarPreferenciaEntrada,
} from "./memory-preview";

const ROTA_DO_PAINEL = "/ia/memoria";

/**
 * O prazo informado é uma DATA, e ela vale até o FIM daquele dia em Brasília.
 *
 * ⛔ `new Date("2026-12-31")` seria interpretado como meia-noite UTC, ou seja, 21h do dia 30
 * em Brasília: a memória venceria um dia antes do que o dono pediu, e ele não teria como
 * descobrir por quê. A regra de fuso do projeto, no único `timestamptz` deste bloco.
 */
function fimDoDiaEmBrasilia(data: string): string {
  return saoPauloWallClockToInstant(data, "23:59").toISOString();
}

export const lembrarPreferencia: Command = {
  name: "lembrarPreferencia",
  module: "memory",
  risk: 2,
  revalidar: [ROTA_DO_PAINEL, "/ia"],
  /**
   * §3.6 — os campos que ESTE command pode detalhar. `modulo` e `expires_at` são escalares
   * curtos e a tela de ações os mostra.
   *
   * ⛔ `content` FICA DE FORA, e a ausência é decisão. `ai_action_executions.changed_fields` é
   * auditoria permanente e NÃO some com a conversa (invariante 38): pôr o texto ali faria o
   * "apagar a memória" da tela deixar a frase viva num lugar que o dono não sabe que existe —
   * exatamente o que `ai_memory_events` evita não guardando conteúdo. O resumo da PROPOSTA já
   * mostra a frase no momento em que ele decide, que é onde ela precisa ser lida.
   */
  camposAuditaveis: ["modulo", "expires_at"],
  /**
   * ⚠️ O INVERSO É `esquecerPreferencia`, NÃO uma exclusão. Invariante 48: o botão de desfazer
   * PROPÕE, e o que ele propõe tem de ser proporcional — desfazer um "lembrar" não pode apagar
   * uma linha que o dono talvez queira reler. Esquecer tira a preferência do prompt e a deixa
   * legível; apagar de vez continua sendo um botão da tela, só dele.
   */
  desfazer: {
    kind: "command",
    command: "esquecerPreferencia",
    payload: (fatos) => (fatos.targetId ? { memoria_id: fatos.targetId } : null),
  },

  parse: parseComMemoria(lembrarPreferenciaEntrada),
  prever: (ctx, payload) => preverLembrarPreferencia(ctx, payload),

  async executar(ctx, payload) {
    const d = payload as LembrarPreferenciaEntrada;
    const expiraEm = d.expira_em ? fimDoDiaEmBrasilia(d.expira_em) : null;

    const r = await criarMemoria(
      ctx,
      { conteudo: d.conteudo, modulo: d.modulo ?? null, expiraEm },
      // ⚠️ `ia` porque a PROPOSTA nasceu de uma ferramenta — e mesmo assim só chegou aqui
      // depois de o dono confirmar na tela. A origem conta de onde veio a ideia, não quem
      // decidiu: quem decidiu foi ele, sempre.
      "ia",
    );
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: r.id,
      targetRoute: ROTA_DO_PAINEL,
      alterados: { modulo: d.modulo ?? null, expires_at: expiraEm },
      itens: [],
    };
  },
};

/**
 * O desfazer. Como os outros seis `undo`, NÃO está no Tool Registry: o modelo não pode propor
 * "esqueça o que eu disse". Quem o alcança é o botão de desfazer de `/ia/acoes`, sobre uma
 * memória que a própria IA acabou de propor — e mesmo ali ele PROPÕE.
 */
export const esquecerPreferencia: Command = {
  name: "esquecerPreferencia",
  module: "memory",
  risk: 2,
  revalidar: [ROTA_DO_PAINEL, "/ia"],
  camposAuditaveis: [],
  desfazer: {
    kind: "nao-ha",
    porque:
      "A preferência parou de orientar o assistente e continua legível em IA · Memória. Reativá-la é um clique seu naquela tela — não o desfazer desta ação.",
  },

  parse: parseComMemoria(esquecerPreferenciaEntrada),
  prever: (ctx, payload) => preverEsquecerPreferencia(ctx, payload),

  async executar(ctx, payload) {
    const d = payload as EsquecerPreferenciaEntrada;
    const r = await esquecerMemoria(ctx, d.memoria_id, "ia");
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: d.memoria_id,
      targetRoute: ROTA_DO_PAINEL,
      alterados: {},
      itens: [],
    };
  },
};
