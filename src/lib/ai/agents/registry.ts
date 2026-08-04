/**
 * Fase 18-A — IA · Registry ESTÁTICO de agentes.
 *
 * "Estático" é a palavra que importa: perfis são constantes deste arquivo, não linhas de
 * banco e muito menos algo que o cliente informe. `agent_id` chega do navegador como texto,
 * e é comparado contra esta lista — a função `ai_begin_chat_run` compara de novo, porque o
 * RPC pode ser chamado direto.
 *
 * A 18-A tem UM agente, sem acesso a módulo nenhum. Os especializados (Financeiro, TO-DO,
 * Agenda, Rotinas, Hábitos, Estudos, Dieta, Treinos) são 18-B — e só nascem depois de a
 * camada de leitura existir e estar testada.
 *
 * Puro.
 */

import type { AiCapability } from "@/lib/ai/core/capabilities";
import {
  ASSISTENTE_PESSOAL_PROMPT,
  ASSISTENTE_PESSOAL_PROMPT_VERSION,
} from "./prompts/assistente-pessoal";
import { SECURITY_PROMPT, SECURITY_PROMPT_VERSION } from "./security-prompt";

export type AiAgentProfile = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly promptVersion: string;
  readonly prompt: string;
  readonly requiredCapabilities: readonly AiCapability[];
  /**
   * Nomes de ferramentas autorizadas. 18-A: SEMPRE vazio — e vazio significa que NENHUMA
   * definição é enviada ao provedor, não que o modelo "escolha não usar".
   */
  readonly allowedTools: readonly string[];
};

export const ASSISTENTE_PESSOAL_ID = "assistente-pessoal";

export const AI_AGENT_REGISTRY: readonly AiAgentProfile[] = [
  {
    id: ASSISTENTE_PESSOAL_ID,
    label: "Assistente Pessoal",
    description:
      "Conversa, organiza ideias e ensina a usar o sistema. Nesta versão não consulta nenhum registro seu.",
    promptVersion: ASSISTENTE_PESSOAL_PROMPT_VERSION,
    prompt: ASSISTENTE_PESSOAL_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: [],
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
