/** Permissões e módulo dos especialistas. A escolha do coordenador é validada no servidor. */
import type { ToolPermission } from "@/lib/ai/tools/contracts";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/registry";
import {
  TREINOS_AGENT_ID, TODO_AGENT_ID, HABITOS_AGENT_ID, ESTUDOS_AGENT_ID,
  AGENDA_AGENT_ID, TAREFAS_AGENT_ID, FINANCEIRO_AGENT_ID, DIETA_AGENT_ID,
} from "./registry";
export {
  TREINOS_AGENT_ID, TODO_AGENT_ID, HABITOS_AGENT_ID, ESTUDOS_AGENT_ID,
  AGENDA_AGENT_ID, TAREFAS_AGENT_ID, FINANCEIRO_AGENT_ID, DIETA_AGENT_ID,
} from "./registry";

export const AGENT_PERMISSION: Record<string, ToolPermission | undefined> = {
  [TREINOS_AGENT_ID]: "allow_training",
  [TODO_AGENT_ID]: "allow_todo",
  [HABITOS_AGENT_ID]: "allow_habits",
  [ESTUDOS_AGENT_ID]: "allow_studies",
  [AGENDA_AGENT_ID]: "allow_calendar",
  [TAREFAS_AGENT_ID]: "allow_tasks",
  [FINANCEIRO_AGENT_ID]: "allow_finance",
  [DIETA_AGENT_ID]: "allow_nutrition",
};

/**
 * Módulo (o mesmo vocabulário de `ToolDescriptor.module`) → agente especializado.
 *
 * ⚠️ `body` é o caso que quebra a simetria "1 módulo = 1 agente = 1 flag": ele é MÓDULO
 * CENTRAL, sem tela e sem agente próprios, e o mesmo dado aparece em Dieta e em Treinos.
 * O destino é o agente de Treinos (que já consome peso corporal desde a 17-E), mas a
 * permissão exigida continua sendo `allow_body` — ver `permissaoDoModulo`.
 */
const AGENTE_DO_MODULO: Record<string, string | undefined> = {
  training: TREINOS_AGENT_ID,
  todo: TODO_AGENT_ID,
  habits: HABITOS_AGENT_ID,
  studies: ESTUDOS_AGENT_ID,
  calendar: AGENDA_AGENT_ID,
  tasks: TAREFAS_AGENT_ID,
  finance: FINANCEIRO_AGENT_ID,
  nutrition: DIETA_AGENT_ID,
  /**
   * ⚠️ `body` aponta para TREINOS, e não para Dieta, embora os dois agentes tenham as
   * ferramentas. A escolha é arbitrária por natureza — o dado é o mesmo e a permissão
   * exigida (`allow_body`) também. Treinos ficou porque é quem consome peso corporal como
   * insumo (o peso da sessão, desde a 17-E), então é o destino em que a conversa tende a
   * continuar.
   */
  body: TREINOS_AGENT_ID,
};

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A PERMISSÃO É DO MÓDULO PEDIDO, NÃO DO AGENTE QUE ATENDE — e é DERIVADA do registry.  ║
 * ║                                                                                       ║
 * ║ Enquanto cada agente servia um módulo só, `AGENT_PERMISSION` bastava. `body` desfaz    ║
 * ║ isso: quem atende é o agente de Treinos, mas exigir `allow_training` de quem pergunta  ║
 * ║ o próprio peso recusaria a leitura de alguém que ligou `allow_body` e só ela — e o     ║
 * ║ inverso deixaria a pergunta cair no orquestrador, que não tem ferramenta nenhuma.      ║
 * ║                                                                                       ║
 * ║ Derivar do registry em vez de escrever uma segunda tabela é o que impede as duas de    ║
 * ║ divergirem: a permissão que o roteador exige é, por construção, a MESMA que o guard    ║
 * ║ vai exigir da ferramenta depois.                                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export function permissaoDoModulo(modulo: string): ToolPermission | null {
  return AI_TOOL_REGISTRY.find((t) => t.module === modulo)?.requiredPermission ?? null;
}

/**
 * 18-F Bloco 3 — o inverso de `AGENTE_DO_MODULO`, DERIVADO dele.
 *
 * Responde "que módulo este agente serve", que é o que a seção de memória precisa saber para
 * decidir qual preferência amarrada a módulo pode entrar nesta conversa.
 *
 * ⚠️ `body` e `training` apontam para o MESMO agente, então o inverso não é função: a primeira
 * entrada vence, e é `training`. Está certo para o uso que tem — uma preferência de medida
 * corporal amarrada ao agente de Treinos seria arbitrária nos dois sentidos, e quem quiser que
 * ela valha sempre deixa o módulo em branco.
 */
export function moduloDoAgente(agentId: string): string | null {
  return Object.entries(AGENTE_DO_MODULO).find(([, id]) => id === agentId)?.[0] ?? null;
}
