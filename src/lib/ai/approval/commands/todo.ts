import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · Os commands do TO-DO. O PRIMEIRO LUGAR EM QUE A IA ESCREVE.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTA PASTA É A SEGUNDA PORTA DECLARADA DO MÓDULO DE IA.                               ║
 * ║                                                                                       ║
 * ║   `tools/adapters/`     — a porta da LEITURA (18-B)                                    ║
 * ║   `approval/commands/`  — a porta da ESCRITA (18-C · Bloco 4)                          ║
 * ║                                                                                       ║
 * ║ `boundaries.test.ts` conhece as duas e não conhece uma terceira: um `import` de        ║
 * ║ `@/lib/todo/...` em `core/`, em `server/` ou em `tools/` continua sendo violação.      ║
 * ║ Abrir a porta foi uma decisão; apagar o teste teria sido outra coisa.                  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ ESTE ARQUIVO É A METADE QUE ESCREVE, e nenhum arquivo alcançável a partir do run chega
 * até ele — ver o cabeçalho de `todo-preview.ts`, que é a metade que só lê.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. `executar` chama `todo/services.ts`, exatamente o que
 * `createTodoTask` chama. Se a criação de tarefa passar a fazer mais uma coisa, ela passa a
 * fazer nos dois caminhos ao mesmo tempo — porque é um caminho só.
 */

import {
  concluirTarefaNoTodo,
  criarTarefaNoTodo,
  excluirTarefaDoTodo,
  reabrirTarefaNoTodo,
  reagendarTarefaNoTodo,
} from "@/lib/todo/services";
import { hojeISO } from "@/lib/format";
import type { Command } from "../contracts";
import {
  carregarTarefa,
  concluirTarefaEntrada,
  criarTarefaEntrada,
  excluirTarefaEntrada,
  paraOSchemaDoFormulario,
  parseCom,
  preverConcluirTarefa,
  preverCriarTarefa,
  preverExcluirTarefa,
  preverReabrirTarefa,
  preverReagendarTarefa,
  reabrirTarefaEntrada,
  reagendarTarefaEntrada,
  resolverProjeto,
  rotaDaTarefa,
  type ConcluirTarefaEntrada,
  type CriarTarefaEntrada,
  type ExcluirTarefaEntrada,
  type ReabrirTarefaEntrada,
  type ReagendarTarefaEntrada,
} from "./todo-preview";

/* ══════════════════════════════════════════════════════════════════════════════════════
   1 · criarTarefaTodo — risco 2
   ══════════════════════════════════════════════════════════════════════════════════════ */

export const criarTarefaTodo: Command = {
  name: "criarTarefaTodo",
  module: "todo",
  risk: 2,
  revalidar: ["/todo", "/dashboard"],
  /**
   * §3.6 — os campos que ESTA ação pode detalhar na auditoria. O título entra porque é o que
   * identifica a tarefa para o dono; descrição, comentário e anexo não entram em allowlist
   * nenhuma, nunca. A FORMA ainda é conferida por `filtrarCamposTocados` depois disto — um
   * título de 300 caracteres não cabe no limite de 200 e vira `undetailed_change`.
   */
  camposAuditaveis: [
    "title",
    "scheduled_date",
    "scheduled_time",
    "deadline_at",
    "priority",
    "project_id",
  ],
  undo: "excluirTarefaTodo",

  parse: parseCom(criarTarefaEntrada),
  prever: (_ctx, payload) => preverCriarTarefa(payload),

  async executar(ctx, payload) {
    const d = payload as CriarTarefaEntrada;
    const projeto = await resolverProjeto(d.projeto, hojeISO());
    const dados = paraOSchemaDoFormulario(d, projeto?.id ?? null);

    const r = await criarTarefaNoTodo(ctx, dados);
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: r.id,
      targetRoute: rotaDaTarefa(r.id),
      alterados: {
        title: dados.title,
        scheduled_date: dados.scheduled_date,
        scheduled_time: dados.scheduled_time,
        deadline_at: dados.deadline_at,
        priority: dados.priority,
        project_id: dados.project_id,
      },
      itens: [],
    };
  },
};

/* ══════════════════════════════════════════════════════════════════════════════════════
   2 · excluirTarefaTodo — o DESFAZER da criação (§3.7)
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ Existe como command PRÓPRIO, e não como um "modo desfazer" do outro.
 *
 * Desfazer é uma ação: passa pelo mesmo Approval Engine, tem a sua própria proposta, o seu
 * próprio hash e a sua própria linha de execução. Um atalho que revertesse sem confirmação
 * seria a única escrita do sistema sem o dono decidindo.
 *
 * ⛔ Ele NÃO está no Tool Registry: o modelo não pode propor "exclua a tarefa X". Quem o
 * alcança é o botão de desfazer da tela, sobre uma execução que a IA acabou de fazer. Excluir
 * por pedido em linguagem natural é risco 4 e está fora da 18-C (Parte 3 da matriz).
 */
export const excluirTarefaTodo: Command = {
  name: "excluirTarefaTodo",
  module: "todo",
  risk: 3,
  revalidar: ["/todo", "/dashboard"],
  camposAuditaveis: ["title"],
  // Não há desfazer do desfazer: a tarefa apagada não volta com o mesmo id, e um "undo" que
  // recriasse outra linha mentiria sobre o que aconteceu.
  undo: null,

  parse: parseCom(excluirTarefaEntrada),
  prever: (_ctx, payload) => preverExcluirTarefa(payload),

  async executar(ctx, payload) {
    const { tarefa_id } = payload as ExcluirTarefaEntrada;
    const { tarefa } = await carregarTarefa(tarefa_id, hojeISO());

    const r = await excluirTarefaDoTodo(ctx, tarefa_id);
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: tarefa_id,
      // Sem rota: o registro não existe mais, e um link para ele daria 404.
      targetRoute: null,
      alterados: { title: tarefa.title },
      itens: [],
    };
  },
};

/* ══════════════════════════════════════════════════════════════════════════════════════
   3 · concluirTarefaTodo — risco 2 · e o desfazer dele
   ══════════════════════════════════════════════════════════════════════════════════════ */

export const concluirTarefaTodo: Command = {
  name: "concluirTarefaTodo",
  module: "todo",
  risk: 2,
  revalidar: ["/todo", "/dashboard"],
  camposAuditaveis: ["status", "scheduled_for", "next_scheduled_date", "recurred"],
  undo: "reabrirTarefaTodo",

  parse: parseCom(concluirTarefaEntrada),
  prever: (_ctx, payload) => preverConcluirTarefa(payload),

  async executar(ctx, payload) {
    const { tarefa_id } = payload as ConcluirTarefaEntrada;
    /**
     * ⚠️ `source: "ia"` distingue esta conclusão na coluna `completion_source` de
     * `todo_completions` — que já separava manual, rápido, massa e notificação. Sem ela, uma
     * conclusão da IA seria indistinguível de um clique do dono no histórico do módulo.
     */
    const r = await concluirTarefaNoTodo(ctx, tarefa_id, hojeISO(), { source: "ia" });
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: tarefa_id,
      targetRoute: rotaDaTarefa(tarefa_id),
      alterados: {
        status: r.recurred ? "pendente" : "concluida",
        scheduled_for: r.scheduledFor,
        next_scheduled_date: r.nextDate,
        recurred: r.recurred,
      },
      itens: [],
    };
  },
};

/**
 * O desfazer de `concluirTarefaTodo`. Como `excluirTarefaTodo`, não está no Tool Registry:
 * o modelo não pode propor "reabra a tarefa X" — quem o alcança é o botão da tela.
 */
export const reabrirTarefaTodo: Command = {
  name: "reabrirTarefaTodo",
  module: "todo",
  risk: 2,
  revalidar: ["/todo", "/dashboard"],
  camposAuditaveis: ["status"],
  // Reabrir o que foi reaberto não faz sentido; e concluir de novo é uma AÇÃO, com proposta
  // própria — não um desfazer.
  undo: null,

  parse: parseCom(reabrirTarefaEntrada),
  prever: (_ctx, payload) => preverReabrirTarefa(payload),

  async executar(ctx, payload) {
    const { tarefa_id } = payload as ReabrirTarefaEntrada;
    const r = await reabrirTarefaNoTodo(ctx, tarefa_id);
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: tarefa_id,
      targetRoute: rotaDaTarefa(tarefa_id),
      alterados: { status: "pendente" },
      itens: [],
    };
  },
};

/* ══════════════════════════════════════════════════════════════════════════════════════
   4 · reagendarTarefaTodo — risco 2
   ══════════════════════════════════════════════════════════════════════════════════════ */

export const reagendarTarefaTodo: Command = {
  name: "reagendarTarefaTodo",
  module: "todo",
  risk: 2,
  revalidar: ["/todo", "/dashboard"],
  camposAuditaveis: ["scheduled_date", "scheduled_date_anterior"],
  /**
   * Sem desfazer DECLARADO, e a tela explica por quê: reverter exigiria um command que
   * recebesse a data anterior como argumento, e essa data viria da linha de execução — o
   * desfazer estaria usando um campo de AUDITORIA como fonte de verdade. A data anterior fica
   * em `changed_fields` para o dono voltar atrás pelo TO-DO sabendo exatamente para onde.
   */
  undo: null,

  parse: parseCom(reagendarTarefaEntrada),
  prever: (_ctx, payload) => preverReagendarTarefa(payload),

  async executar(ctx, payload) {
    const d = payload as ReagendarTarefaEntrada;
    const r = await reagendarTarefaNoTodo(ctx, d.tarefa_id, d.data);
    if (!r.ok) throw new Error(r.erro);

    return {
      targetId: d.tarefa_id,
      targetRoute: rotaDaTarefa(d.tarefa_id),
      alterados: {
        scheduled_date: r.dataNova,
        scheduled_date_anterior: r.dataAnterior,
      },
      itens: [],
    };
  },
};
