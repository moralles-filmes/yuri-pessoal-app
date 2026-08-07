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
import { TODO_PROMPT, TODO_PROMPT_VERSION } from "./prompts/todo";
import { HABITOS_PROMPT, HABITOS_PROMPT_VERSION } from "./prompts/habitos";
import { ESTUDOS_PROMPT, ESTUDOS_PROMPT_VERSION } from "./prompts/estudos";
import { AGENDA_PROMPT, AGENDA_PROMPT_VERSION } from "./prompts/agenda";
import { TAREFAS_PROMPT, TAREFAS_PROMPT_VERSION } from "./prompts/tarefas";
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
export const TODO_AGENT_ID = "todo";
export const HABITOS_AGENT_ID = "habitos";
export const ESTUDOS_AGENT_ID = "estudos";
export const AGENDA_AGENT_ID = "agenda";
export const TAREFAS_AGENT_ID = "tarefas";

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
      /**
       * ⚠️ 18-C · Lote 2 — as medidas corporais entram AQUI porque `body_*` é módulo central
       * sem tela própria, e Treinos já é seu consumidor desde a 17-E (`getLatestWeight`
       * pré-preenche o peso da sessão). A permissão exigida continua sendo `allow_body`, que
       * é separada de `allow_training`: ligar Treinos NÃO libera as medidas.
       *
       * O agente de Dieta entra nesta mesma dupla no Lote 3 — e ele não duplica a ferramenta,
       * só acrescenta o próprio id em `allowedAgents`. Duas tabelas de peso corporal nunca; e
       * duas FERRAMENTAS para o mesmo dado, pelo mesmo motivo, também não.
       */
      "body.get_latest",
      "body.get_series",
    ],
  },
  {
    id: TODO_AGENT_ID,
    label: "TO-DO",
    description:
      "Consulta suas tarefas: o que está atrasado, o que é para hoje, o que vem a seguir e os projetos. Só lê — não altera nada.",
    promptVersion: TODO_PROMPT_VERSION,
    prompt: TODO_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: ["todo.get_agenda", "todo.search_tasks", "todo.get_projects"],
  },
  {
    id: HABITOS_AGENT_ID,
    label: "Hábitos",
    description:
      "Consulta seus hábitos: a situação de hoje, as sequências e a consistência. Só lê — não altera nada.",
    promptVersion: HABITOS_PROMPT_VERSION,
    prompt: HABITOS_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: ["habits.get_today", "habits.get_streaks"],
  },
  {
    id: ESTUDOS_AGENT_ID,
    label: "Estudos",
    description:
      "Consulta seus cursos e o tempo de estudo: progresso, próxima aula e sequência de dias. Só lê — não altera nada.",
    promptVersion: ESTUDOS_PROMPT_VERSION,
    prompt: ESTUDOS_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: ["studies.get_courses", "studies.get_study_time"],
  },
  {
    id: AGENDA_AGENT_ID,
    label: "Agenda",
    description:
      "Consulta seus compromissos: os próximos e os de um dia específico. Só lê — não cria, não altera e não cancela nada.",
    promptVersion: AGENDA_PROMPT_VERSION,
    prompt: AGENDA_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: ["calendar.get_upcoming", "calendar.get_day"],
  },
  {
    id: TAREFAS_AGENT_ID,
    label: "Tarefas e Rotinas",
    description:
      "Consulta o módulo legado de tarefas e as rotinas com check-in diário — que NÃO é o TO-DO. Só lê.",
    promptVersion: TAREFAS_PROMPT_VERSION,
    prompt: TAREFAS_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: ["tasks.get_pending", "tasks.get_routines_today"],
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
