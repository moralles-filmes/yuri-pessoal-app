import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · O REGISTRY DE COMMANDS. Estático, literal, fechado.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ELE NASCEU VAZIO NO BLOCO 3, E DEIXOU DE ESTAR. É A TERCEIRA DAS TRÊS TRAVAS.         ║
 * ║                                                                                       ║
 * ║ As outras duas continuam de pé e são independentes desta:                              ║
 * ║   • a ferramenta de escrita precisa existir no Tool Registry, com `kind: "escrita"`;   ║
 * ║   • a chave `allow_write_*` do módulo precisa estar LIGADA (e ela nasce `false`).      ║
 * ║                                                                                       ║
 * ║ Acrescentar um nome a esta lista é o gesto que dá à IA um poder novo sobre os dados do ║
 * ║ dono. Que ele continue sendo um gesto explícito, num arquivo que só serve para isso.   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ Nada é registrado em runtime. Não há `register()`, não há varredura de pasta, não há
 * nome montado a partir de texto — pelo mesmo motivo que o Tool Registry é uma lista literal.
 */

import type { Command } from "../contracts";
import {
  concluirTarefaTodo,
  criarTarefaTodo,
  excluirTarefaTodo,
  reabrirTarefaTodo,
  reagendarTarefaTodo,
} from "./todo";
import { desfazerHabito, registrarHabito } from "./habits";
import { criarEvento, excluirEvento } from "./calendar";
import { desfazerConsumo, registrarConsumo } from "./nutrition";
import { excluirTransacao, lancarTransacao } from "./finance";
import { esquecerPreferencia, lembrarPreferencia } from "./memory";

/**
 * ⚠️ Nem todo command tem ferramenta. Os `undo` (`excluirTarefaTodo`, `reabrirTarefaTodo`,
 * `desfazerHabito`, `excluirEvento`) existem aqui e NÃO existem no Tool Registry: o modelo
 * não pode propor "exclua", "reabra", "apague o registro" nem "cancele o compromisso". Quem
 * os alcança é o botão de desfazer da tela, sobre uma execução que a própria IA fez.
 *
 * A ausência é a trava. Um teste confere que cada ferramenta de escrita aponta para um
 * command existente; o inverso NÃO é exigido, e é de propósito.
 */
export const ACTION_COMMANDS: readonly Command[] = [
  // TO-DO
  criarTarefaTodo,
  excluirTarefaTodo,
  concluirTarefaTodo,
  reabrirTarefaTodo,
  reagendarTarefaTodo,
  // Hábitos
  registrarHabito,
  desfazerHabito,
  // Agenda
  criarEvento,
  excluirEvento,
  // Dieta
  registrarConsumo,
  desfazerConsumo,
  // Financeiro — o de maior risco
  lancarTransacao,
  excluirTransacao,
  // Memória (18-F Bloco 3). `esquecerPreferencia` é o 6º `undo` sem ferramenta — e o único
  // cujo inverso NÃO apaga nada: ele tira a preferência do prompt e a deixa legível.
  lembrarPreferencia,
  esquecerPreferencia,
];

export function nomesDeCommands(): readonly string[] {
  return ACTION_COMMANDS.map((c) => c.name);
}

export function findCommand(name: string): Command | null {
  return ACTION_COMMANDS.find((c) => c.name === name) ?? null;
}
