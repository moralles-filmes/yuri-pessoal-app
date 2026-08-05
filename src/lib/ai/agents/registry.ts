/**
 * Fase 18-A — IA · Registry ESTÁTICO de agentes.
 *
 * "Estático" é a palavra que importa: perfis são constantes deste arquivo, não linhas de
 * banco e muito menos algo que o cliente informe. `agent_id` chega do navegador como texto,
 * e é comparado contra esta lista — a função `ai_begin_chat_run` compara de novo, porque o
 * RPC pode ser chamado direto.
 *
 * A 18-A tinha UM agente, sem acesso a módulo nenhum. A 18-B acrescentou o primeiro
 * ESPECIALISTA — Treinos —, e a allowlist dele nasceu junto das ferramentas, no mesmo
 * commit: um agente que aponta para ferramenta inexistente (ou uma ferramenta sem agente
 * autorizado) é uma incoerência que só apareceria em runtime. Os demais (Financeiro, TO-DO,
 * Agenda, Rotinas, Hábitos, Estudos, Dieta) entram pelo mesmo caminho, um a um.
 *
 * Puro.
 */

import type { AiCapability } from "@/lib/ai/core/capabilities";
import {
  ASSISTENTE_PESSOAL_PROMPT,
  ASSISTENTE_PESSOAL_PROMPT_VERSION,
} from "./prompts/assistente-pessoal";
import { TREINOS_PROMPT, TREINOS_PROMPT_VERSION } from "./prompts/treinos";
import { SECURITY_PROMPT, SECURITY_PROMPT_VERSION } from "./security-prompt";

export type AiAgentProfile = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly promptVersion: string;
  readonly prompt: string;
  readonly requiredCapabilities: readonly AiCapability[];
  /**
   * Nomes de ferramentas autorizadas. Vazio significa que NENHUMA definição é enviada ao
   * provedor — não que o modelo "escolha não usar". O que está aqui é filtrado contra o
   * `AI_TOOL_REGISTRY`: um nome que não exista lá não vira ferramenta.
   */
  readonly allowedTools: readonly string[];
};

export const ASSISTENTE_PESSOAL_ID = "assistente-pessoal";
export const TREINOS_AGENT_ID = "treinos";

export const AI_AGENT_REGISTRY: readonly AiAgentProfile[] = [
  {
    id: ASSISTENTE_PESSOAL_ID,
    label: "Assistente Pessoal",
    description:
      "Conversa, organiza ideias e ensina a usar o sistema. Encaminha para o assistente do módulo quando a pergunta for sobre seus registros.",
    promptVersion: ASSISTENTE_PESSOAL_PROMPT_VERSION,
    prompt: ASSISTENTE_PESSOAL_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    // O ORQUESTRADOR não lê módulo nenhum: quem lê Treinos é o especialista de Treinos.
    allowedTools: [],
  },
  {
    id: TREINOS_AGENT_ID,
    label: "Treinos",
    description:
      "Consulta seu histórico de treino: último treino, totais do período e recordes. Só lê — não altera nada.",
    promptVersion: TREINOS_PROMPT_VERSION,
    prompt: TREINOS_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: [
      "training.get_last_workout",
      "training.get_volume",
      "training.get_records",
    ],
  },
];

export function findAgent(agentId: string): AiAgentProfile | null {
  return AI_AGENT_REGISTRY.find((a) => a.id === agentId) ?? null;
}

/**
 * O prompt de sistema completo: SEGURANÇA PRIMEIRO, sempre. Nenhum perfil substitui o
 * prompt-base — ele é concatenado antes, e o do agente vem depois.
 */
export function buildSystemPrompt(agent: AiAgentProfile): string {
  return `${SECURITY_PROMPT}\n\n---\n\n${agent.prompt}`;
}

/**
 * A versão que vai para `ai_runs.prompt_version`. Carrega AS DUAS partes: trocar só o
 * prompt-base de segurança tem de mudar a versão registrada, senão duas respostas
 * diferentes ficariam indistinguíveis no histórico.
 */
export function promptVersionOf(agent: AiAgentProfile): string {
  return `${SECURITY_PROMPT_VERSION}+${agent.promptVersion}`;
}
