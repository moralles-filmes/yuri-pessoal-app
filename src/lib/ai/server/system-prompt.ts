import "server-only";

/**
 * Chat livre com coordenador · Task 7 — IA · A CONCATENAÇÃO ÚNICA DO SYSTEM PROMPT.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ A MEMÓRIA ENTRA POR ÚLTIMO, E ESTA FUNÇÃO É O ÚNICO LUGAR QUE A PÕE NO PROMPT.       ║
 * ║                                                                                       ║
 * ║ Antes desta função, a ordem vivia escrita no `chat-runner`, e cada caminho novo (o      ║
 * ║ plano, o coordenador, os especialistas) era uma chance de montar o `system` de outro    ║
 * ║ jeito e esquecer a memória — ou pior, pôr a memória ANTES das travas. Centralizar faz   ║
 * ║ a ordem ser propriedade de uma função pura, testável pelo comportamento, e não de uma   ║
 * ║ varredura de fonte que um refactor quebra sem avisar.                                   ║
 * ║                                                                                       ║
 * ║ `memory/prompt.test.ts` prova que `blocoDeMemorias(` aparece em UM arquivo de `server/`, ║
 * ║ e que é este. Quem quiser incluir memória num `system` novo chama `montarSystem`.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type { MemoriaParaPrompt } from "@/lib/ai/memory/contracts";
import { blocoDeMemorias } from "@/lib/ai/memory/prompt";

/**
 * Monta o `system` de um run: a base (o prompt do agente, ou o do plano), os blocos do
 * servidor na ordem recebida (roteamento, caixa de entrada), e só então as preferências.
 *
 * `blocos` é concatenado sem separador, como antes: cada bloco já traz o próprio `\n` ou o
 * próprio separador. Trocar isso por `join("\n")` mudaria o prompt de todo run existente.
 */
export function montarSystem(input: {
  readonly base: string;
  readonly blocos: readonly string[];
  readonly memorias: readonly MemoriaParaPrompt[];
}): string {
  return input.base + input.blocos.join("") + blocoDeMemorias(input.memorias);
}
