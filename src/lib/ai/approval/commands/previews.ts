import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · O que o RUN alcança de um command: validar e prever. Só isso.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE É O REGISTRY QUE O TOOL EXECUTOR IMPORTA — e ele é PROPOSITALMENTE mutilado.     ║
 * ║                                                                                       ║
 * ║ Nenhuma entrada aqui tem `executar`, e nenhum arquivo alcançável a partir daqui        ║
 * ║ importa um serviço de escrita. Um `console.log` de qualquer valor deste mapa não        ║
 * ║ revelaria uma função que grava, porque não há uma para revelar.                        ║
 * ║                                                                                       ║
 * ║ O registry INTEIRO (com `executar`) é `commands/index.ts`, e quem o importa é          ║
 * ║ `approval/execute.ts` — que, por sua vez, só é alcançável a partir de                   ║
 * ║ `src/lib/actions/`. Os dois testes de fronteira somados dão a garantia da subfase:      ║
 * ║ **a escrita não acontece dentro do run, e não é por convenção.**                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A chave é o nome da FERRAMENTA (não o do command): é o que o executor tem na mão quando o
 * modelo pede. A bijeção com o registry de ferramentas é garantida por teste, nos dois
 * sentidos — ferramenta de escrita sem entrada aqui, e entrada aqui sem ferramenta.
 */

import type { CommandContext, EfeitoProposto } from "../contracts";
import {
  concluirTarefaEntrada,
  criarTarefaEntrada,
  parseCom,
  preverConcluirTarefa,
  preverCriarTarefa,
  preverReagendarTarefa,
  reagendarTarefaEntrada,
} from "./todo-preview";
import {
  parseComHabito,
  preverRegistrarHabito,
  registrarHabitoEntrada,
} from "./habits-preview";
import {
  lembrarPreferenciaEntrada,
  parseComMemoria,
  preverLembrarPreferencia,
} from "./memory-preview";
import {
  criarEventoEntrada,
  parseComEvento,
  preverCriarEvento,
} from "./calendar-preview";
import {
  parseComConsumo,
  preverRegistrarConsumo,
  registrarConsumoEntrada,
} from "./nutrition-preview";
import {
  lancarTransacaoEntrada,
  parseComTransacao,
  preverLancarTransacao,
} from "./finance-preview";

export type PropostaDeFerramenta = {
  /** Zod `.strict()` — o MESMO que o command usa na execução. */
  readonly parse: (payload: unknown) => { ok: true; valor: unknown } | { ok: false };
  /**
   * `ctx` está na assinatura e hoje nenhuma previsão do TO-DO precisa dele: as consultas do
   * módulo abrem o próprio client de sessão. Ele fica porque a previsão de Finanças (Bloco
   * 4, último command) vai precisar, e mudar a assinatura depois obrigaria a mexer em todas.
   */
  readonly prever: (ctx: CommandContext, payload: unknown) => Promise<EfeitoProposto>;
};

export const PROPOSTAS_POR_FERRAMENTA: Readonly<Record<string, PropostaDeFerramenta>> = {
  "todo.criar_tarefa": {
    parse: parseCom(criarTarefaEntrada),
    prever: (_ctx, payload) => preverCriarTarefa(payload),
  },
  "todo.concluir_tarefa": {
    parse: parseCom(concluirTarefaEntrada),
    prever: (_ctx, payload) => preverConcluirTarefa(payload),
  },
  "todo.reagendar_tarefa": {
    parse: parseCom(reagendarTarefaEntrada),
    prever: (_ctx, payload) => preverReagendarTarefa(payload),
  },
  "habits.registrar": {
    parse: parseComHabito(registrarHabitoEntrada),
    prever: (_ctx, payload) => preverRegistrarHabito(payload),
  },
  "calendar.criar_evento": {
    parse: parseComEvento(criarEventoEntrada),
    prever: (_ctx, payload) => preverCriarEvento(payload),
  },
  "nutrition.registrar_consumo": {
    parse: parseComConsumo(registrarConsumoEntrada),
    prever: (_ctx, payload) => preverRegistrarConsumo(payload),
  },
  "finance.lancar_transacao": {
    parse: parseComTransacao(lancarTransacaoEntrada),
    prever: (_ctx, payload) => preverLancarTransacao(payload),
  },
  // 18-F Bloco 3. A previsão precisa do DONO para ler as memórias que já existem (e recusar a
  // repetida), então esta é a primeira que usa o `ctx` em vez de ignorá-lo.
  "memory.lembrar": {
    parse: parseComMemoria(lembrarPreferenciaEntrada),
    prever: (ctx, payload) => preverLembrarPreferencia(ctx, payload),
  },
  // ⛔ OS `undo` NÃO TÊM FERRAMENTA, e a ausência é a trava: sem entrada aqui, o modelo não
  // tem como propor uma exclusão, uma reabertura, o apagamento de um registro nem o
  // cancelamento de um compromisso. Eles são alcançados só pelo desfazer da tela, sobre algo
  // que a própria IA acabou de fazer.
};

export function propostaDaFerramenta(toolName: string): PropostaDeFerramenta | null {
  return Object.hasOwn(PROPOSTAS_POR_FERRAMENTA, toolName)
    ? PROPOSTAS_POR_FERRAMENTA[toolName]
    : null;
}
