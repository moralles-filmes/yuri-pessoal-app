import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · Os commands da Agenda. A metade que ESCREVE.
 *
 * ⚠️ ESTE É O PRIMEIRO COMMAND CUJO EFEITO SAI DO SISTEMA. Com a conta Google conectada, o
 * compromisso não fica só no banco do dono: ele é criado no calendário dele lá fora e chega
 * aos aparelhos sincronizados. A previsão diz isso antes de ele confirmar — ver
 * `calendar-preview.ts` — e o serviço mantém a regra da 17-F: falha do Google nunca derruba a
 * ação, e nunca é relatada como sucesso.
 *
 * `executar` chama `calendar/services.ts`, exatamente o que `createEvent` chama.
 */

import { criarEventoNaAgenda, excluirEventoDaAgenda } from "@/lib/calendar/services";
import { desfazerPeloId, type Command } from "../contracts";
import {
  carregarEvento,
  criarEventoEntrada,
  excluirEventoEntrada,
  paraOSchemaDoFormulario,
  parseComEvento,
  preverCriarEvento,
  preverExcluirEvento,
  resolverHorario,
  rotaDoDia,
  type CriarEventoEntrada,
  type ExcluirEventoEntrada,
} from "./calendar-preview";

/* ══════════════════════════════════════════════════════════════════════════════════════
   1 · criarEvento — risco 3
   ══════════════════════════════════════════════════════════════════════════════════════ */

export const criarEvento: Command = {
  name: "criarEvento",
  module: "calendar",
  /**
   * ⚠️ RISCO 3, e não 2 como criar tarefa — a matriz da 18-C já previa isso. A diferença não é
   * a importância do registro: é que este efeito atravessa a fronteira do sistema. Uma tarefa
   * criada por engano é uma linha a apagar; um compromisso criado por engano com o Google
   * conectado já foi para o celular do dono e para quem compartilhe aquele calendário.
   */
  risk: 3,
  revalidar: ["/agenda", "/dashboard"],
  camposAuditaveis: ["title", "start_at", "end_at", "all_day", "tipo"],
  desfazer: {
    kind: "command",
    command: "excluirEvento",
    payload: desfazerPeloId("evento_id"),
  },

  parse: parseComEvento(criarEventoEntrada),
  prever: (_ctx, payload) => preverCriarEvento(payload),

  async executar(ctx, payload) {
    const d = payload as CriarEventoEntrada;
    /**
     * ⚠️ `resolverHorario` roda DE NOVO aqui, e não vem carregado da previsão. Ele é puro
     * (nenhum `Date.now()`, nenhuma leitura), então o resultado é o mesmo — e quem garantiu
     * que a previsão lida pelo dono continua valendo foi a revalidação por hash, antes desta
     * linha. Carregar da previsão significaria confiar num jsonb para montar o efeito.
     */
    const horario = resolverHorario(d);
    const dados = paraOSchemaDoFormulario(d, horario);

    const r = await criarEventoNaAgenda(ctx, dados);
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: r.id,
      targetRoute: rotaDoDia(dados.start_at),
      alterados: {
        title: dados.title,
        start_at: dados.start_at,
        end_at: dados.end_at,
        all_day: dados.all_day,
        tipo: dados.tipo,
      },
      itens: [],
    };
  },
};

/* ══════════════════════════════════════════════════════════════════════════════════════
   2 · excluirEvento — o DESFAZER da criação (§3.7)
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⛔ NÃO ESTÁ NO TOOL REGISTRY, como os outros `undo`. O modelo não pode propor "cancele o
 * compromisso X" — cancelar por pedido em linguagem natural é risco 4 e está fora da 18-C.
 * Quem alcança este command é o botão de desfazer da tela, sobre um evento que a própria IA
 * acabou de criar.
 */
export const excluirEvento: Command = {
  name: "excluirEvento",
  module: "calendar",
  risk: 3,
  revalidar: ["/agenda", "/dashboard"],
  camposAuditaveis: ["title"],
  desfazer: {
    kind: "nao-ha",
    porque:
      "O compromisso foi apagado aqui e, com a conta Google conectada, também lá fora. Recriá-lo geraria outro evento, com outro id nos dois lados — quem já tinha o convite não voltaria a tê-lo.",
  },

  parse: parseComEvento(excluirEventoEntrada),
  prever: (_ctx, payload) => preverExcluirEvento(payload),

  async executar(ctx, payload) {
    const { evento_id } = payload as ExcluirEventoEntrada;
    const evento = await carregarEvento(evento_id);

    const r = await excluirEventoDaAgenda(ctx, evento_id);
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: evento_id,
      // Sem rota para o registro: ele não existe mais. A rota do DIA continuaria válida, mas
      // levaria o dono a procurar na tela um compromisso que ele acabou de mandar excluir.
      targetRoute: null,
      alterados: { title: evento.title },
      itens: [],
    };
  },
};
