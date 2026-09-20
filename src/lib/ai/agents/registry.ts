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
import { FINANCEIRO_PROMPT, FINANCEIRO_PROMPT_VERSION } from "./prompts/financeiro";
import { DIETA_PROMPT, DIETA_PROMPT_VERSION } from "./prompts/dieta";
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
export const FINANCEIRO_AGENT_ID = "financeiro";
export const DIETA_AGENT_ID = "dieta";

/**
 * ⚠️ **18-F · BLOCO 3 — "SÓ LÊ" CAIU EM TRÊS DESCRIÇÕES** (Treinos, Estudos e Tarefas), porque
 * `memory.lembrar` entrou nas OITO allowlists.
 *
 * É a quarta vez que uma frase de ausência envelhece neste módulo: `AVISO_SEM_ACESSO` foi
 * reescrito quatro vezes e o prompt-base, três. As descrições de agente nunca tiveram guarda
 * nenhuma — e por isso as três ficaram mentindo por um commit inteiro em cada bloco anterior,
 * sem nada denunciar.
 *
 * ⛔ **DESTA VEZ HÁ TESTE**, e ele é DERIVADO do registry (`registry.test.ts`): agente cuja
 * allowlist contém uma ferramenta de escrita não pode dizer "só lê", e agente que alcança a
 * memória tem de citá-la. Nenhuma lista escrita à mão de "agentes que escrevem" — essa é a
 * lista que ficaria para trás.
 */
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
      // ⚠️ Atualizada na 18-C junto com a allowlist: ela ganhou as medidas corporais, e uma
      // descrição que não as cita mente para o usuário sobre o que a chave dele libera.
      "Consulta seu histórico de treino (último treino, totais do período, recordes) e, com a autorização de medidas, o peso e as circunferências registradas. Não altera nada em Treinos — só prepara preferências para a memória do assistente, quando você pede.",
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
      "memory.lembrar",
    ],
  },
  {
    id: TODO_AGENT_ID,
    label: "TO-DO",
    /**
     * ⚠️ 18-C · Bloco 4 — a descrição dizia "Só lê — não altera nada", e deixou de ser
     * verdade: este agente é o primeiro a alcançar ferramentas de escrita. O que ela promete
     * agora é o que continua sendo garantido, e por construção — a alteração é preparada,
     * mostrada e só acontece com a confirmação do dono.
     */
    description:
      "Consulta suas tarefas: o que está atrasado, o que é para hoje, o que vem a seguir e os projetos. Também prepara tarefas novas, conclusões e mudanças de data — sempre para você confirmar antes. Também prepara preferências para a memória do assistente, quando você pede.",
    promptVersion: TODO_PROMPT_VERSION,
    prompt: TODO_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: [
      "todo.get_agenda",
      "todo.search_tasks",
      "todo.get_projects",
      "todo.criar_tarefa",
      "todo.concluir_tarefa",
      "todo.reagendar_tarefa",
      "memory.lembrar",
    ],
  },
  {
    id: HABITOS_AGENT_ID,
    label: "Hábitos",
    description:
      // ⚠️ 18-C · Bloco 4 — "Só lê" caiu aqui pelo mesmo motivo que caiu no TO-DO.
      "Consulta seus hábitos: a situação de hoje, as sequências e a consistência. Também prepara o registro do dia — sempre para você confirmar antes. Também prepara preferências para a memória do assistente, quando você pede.",
    promptVersion: HABITOS_PROMPT_VERSION,
    prompt: HABITOS_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: [
      "habits.get_today",
      "habits.get_streaks",
      "habits.registrar",
      "memory.lembrar",
    ],
  },
  {
    id: ESTUDOS_AGENT_ID,
    label: "Estudos",
    description:
      "Consulta seus cursos e o tempo de estudo: progresso, próxima aula e sequência de dias. Não altera nada em Estudos — só prepara preferências para a memória do assistente, quando você pede.",
    promptVersion: ESTUDOS_PROMPT_VERSION,
    prompt: ESTUDOS_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: ["studies.get_courses", "studies.get_study_time", "memory.lembrar"],
  },
  {
    id: AGENDA_AGENT_ID,
    label: "Agenda",
    /**
     * ⚠️ 18-C · Bloco 4 — "não cria, não altera e não cancela nada" caiu; "não cancela"
     * ficou, porque continua sendo verdade: `excluirEvento` existe como command e NÃO tem
     * ferramenta, então o modelo não alcança o cancelamento.
     */
    description:
      "Consulta seus compromissos: os próximos e os de um dia específico. Também prepara compromissos novos — sempre para você confirmar antes. Não altera nem cancela compromissos existentes. Também prepara preferências para a memória do assistente, quando você pede.",
    promptVersion: AGENDA_PROMPT_VERSION,
    prompt: AGENDA_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: [
      "calendar.get_upcoming",
      "calendar.get_day",
      "calendar.criar_evento",
      "memory.lembrar",
    ],
  },
  {
    id: TAREFAS_AGENT_ID,
    label: "Tarefas e Rotinas",
    description:
      "Consulta o módulo legado de tarefas e as rotinas com check-in diário — que NÃO é o TO-DO. Não altera nada aqui: só prepara preferências para a memória do assistente, quando você pede.",
    promptVersion: TAREFAS_PROMPT_VERSION,
    prompt: TAREFAS_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: ["tasks.get_pending", "tasks.get_routines_today", "memory.lembrar"],
  },
  {
    id: FINANCEIRO_AGENT_ID,
    label: "Financeiro",
    description:
      /**
       * ⚠️ 18-C · Bloco 4 — "não lança" caiu; "não paga e não altera" FICOU, e continua
       * verdade: não há ferramenta de pagar fatura, de editar nem de excluir. A frase precisa
       * ser exata neste módulo — é a que o dono lê antes de ligar a chave do dinheiro.
       */
      "Consulta suas finanças: saldo das contas, resumo do mês e faturas de cartão. Também prepara lançamentos à vista — sempre para você confirmar antes. Não parcela, não divide com terceiros, não transfere entre contas, não paga fatura e não altera lançamento existente. Também prepara preferências para a memória do assistente, quando você pede.",
    promptVersion: FINANCEIRO_PROMPT_VERSION,
    prompt: FINANCEIRO_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: [
      "finance.get_balances",
      "finance.get_spending",
      "finance.get_invoice",
      "finance.lancar_transacao",
      "memory.lembrar",
    ],
  },
  {
    id: DIETA_AGENT_ID,
    label: "Dieta e Alimentação",
    /**
     * ⚠️ 18-C · Bloco 4 — "Só lê" caiu. O que ficou é o limite exato do que ela passou a
     * poder: preparar um registro no diário. Medidas corporais continuam SÓ LEITURA — não há
     * ferramenta de escrita em `body_*`, e a frase não pode sugerir que haja.
     */
    description:
      "Consulta seu registro alimentar (consumo do dia, do período e as metas) e, com a autorização de medidas, o peso e as circunferências. Também prepara registros no diário alimentar — sempre para você confirmar antes. Não altera metas nem medidas. Também prepara preferências para a memória do assistente, quando você pede.",
    promptVersion: DIETA_PROMPT_VERSION,
    prompt: DIETA_PROMPT,
    requiredCapabilities: ["texto", "streaming"],
    allowedTools: [
      "nutrition.get_day",
      "nutrition.get_period",
      "nutrition.get_goals",
      "nutrition.registrar_consumo",
      // ⚠️ As MESMAS duas ferramentas do agente de Treinos, não cópias: `body_*` é módulo
      // central, e uma segunda ferramenta para o mesmo dado daria duas respostas para o
      // mesmo fato. Elas exigem `allow_body`, que é separada de `allow_nutrition`.
      "body.get_latest",
      "body.get_series",
      "memory.lembrar",
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
