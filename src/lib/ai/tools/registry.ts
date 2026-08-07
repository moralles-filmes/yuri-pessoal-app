/**
 * Fase 18-A/18-B — IA · Tool Registry ESTÁTICO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTA LISTA É A ÚNICA MANEIRA DE UMA FERRAMENTA EXISTIR.                               ║
 * ║                                                                                       ║
 * ║ Nada é montado em runtime, nada nasce de texto do modelo e nada é acrescentado por    ║
 * ║ configuração. O que não está aqui não é oferecido ao provedor e não tem executor do   ║
 * ║ outro lado.                                                                            ║
 * ║                                                                                       ║
 * ║ Se AINDA ASSIM o provedor devolver um evento de tool call fora do que foi oferecido,  ║
 * ║ o chat-runner encerra o run como `failed` com `UNEXPECTED_TOOL_CALL`: não executa,    ║
 * ║ não interpreta como ferramenta válida e não deixa o run seguir como se nada fosse.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A 18-A nasceu VAZIA de propósito — a fronteira ficou pronta e testada antes da primeira
 * leitura. A 18-B povoou com as três ferramentas de Treinos, **todas de leitura**: escrita é
 * 18-C e o `guard` rejeita `kind: "escrita"` até lá.
 *
 * Puro: nenhum I/O, nenhuma função executora. O mapa nome → executor mora em `executors.ts`,
 * que é `server-only`; a bijeção entre os dois é garantida por teste.
 */

import type { AiToolDefinition } from "@/lib/ai/core/contracts";
import {
  isToolDescriptorCoherent,
  type ToolDescriptor,
  type ToolPermission,
} from "./contracts";

export const AI_TOOL_REGISTRY: readonly ToolDescriptor[] = [
  {
    name: "training.get_last_workout",
    version: "1",
    module: "training",
    kind: "leitura",
    risk: 1,
    description:
      "Devolve o último treino registrado, com os totais já calculados pelo sistema (volume, séries, repetições) e a lista de exercícios. Use quando a pergunta for sobre o treino mais recente. Não faça contas: os números já vêm somados.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["treinos"],
    requiredPermission: "allow_training",
    timeoutMs: 8_000,
    maxRecords: 50,
    // Os `itens` desta ferramenta são os EXERCÍCIOS de um treino só — não treinos.
    itemLabel: "exercícios do treino",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "training.get_volume",
    version: "1",
    module: "training",
    kind: "leitura",
    risk: 1,
    description:
      "Totais de treino de um período recente (volume em kg, repetições, tempo sob tensão, séries por grupo muscular), já agregados pelo sistema. Informe `dias` para o tamanho da janela; o padrão é 7. Período sem treino devolve contagem zero e diz que é ausência de registro.",
    inputSchema: {
      type: "object",
      properties: {
        dias: {
          type: "integer",
          minimum: 1,
          maximum: 365,
          description: "Tamanho da janela em dias, terminando hoje. Padrão: 7.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["treinos"],
    requiredPermission: "allow_training",
    timeoutMs: 12_000,
    // 200 é o teto de LISTA; quem manda de verdade num período longo é o orçamento de
    // caracteres do bloco não confiável, aplicado no executor (`MAX_UNTRUSTED_CHARS`).
    maxRecords: 200,
    itemLabel: "sessões de treino",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "training.get_records",
    version: "1",
    module: "training",
    kind: "leitura",
    risk: 1,
    description:
      "Recordes pessoais consolidados, opcionalmente filtrados por nome de exercício. Valores de 1RM são ESTIMATIVA e vêm com a fórmula usada — diga isso ao relatar.",
    inputSchema: {
      type: "object",
      properties: {
        exercicio: {
          type: "string",
          maxLength: 80,
          description: "Parte do nome do exercício, para filtrar.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["treinos"],
    requiredPermission: "allow_training",
    timeoutMs: 8_000,
    maxRecords: 100,
    itemLabel: "recordes",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ───────────────────────────── 18-C · Lote 1 · TO-DO ─────────────────────────────
  {
    name: "todo.get_agenda",
    version: "1",
    module: "todo",
    kind: "leitura",
    risk: 1,
    description:
      "O que está atrasado, o que é para hoje e o que vem nos próximos dias no TO-DO, com os totais já contados pelo sistema. Informe `dias` para a janela dos próximos; o padrão é 7. O status de atraso é calculado na leitura — não faça essa conta.",
    inputSchema: {
      type: "object",
      properties: {
        dias: {
          type: "integer",
          minimum: 1,
          maximum: 90,
          description: "Janela dos próximos dias, a partir de amanhã. Padrão: 7.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["todo"],
    requiredPermission: "allow_todo",
    timeoutMs: 10_000,
    maxRecords: 100,
    itemLabel: "tarefas",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "todo.search_tasks",
    version: "1",
    module: "todo",
    kind: "leitura",
    risk: 1,
    description:
      "Procura tarefas do TO-DO por texto no título ou na descrição. A busca do módulo diferencia acentos — se não achar, diga isso em vez de afirmar que a tarefa não existe. Concluídas só entram com `incluir_concluidas`.",
    inputSchema: {
      type: "object",
      properties: {
        texto: {
          type: "string",
          maxLength: 120,
          description: "Trecho do título ou da descrição.",
        },
        incluir_concluidas: {
          type: "boolean",
          description: "Incluir tarefas já concluídas ou canceladas. Padrão: false.",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["todo"],
    requiredPermission: "allow_todo",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "tarefas",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "todo.get_projects",
    version: "1",
    module: "todo",
    kind: "leitura",
    risk: 1,
    description:
      "Os projetos ativos do TO-DO com as contagens de tarefas abertas, atrasadas e concluídas de cada um, já somadas pelo sistema.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["todo"],
    requiredPermission: "allow_todo",
    timeoutMs: 8_000,
    maxRecords: 60,
    itemLabel: "projetos",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ──────────────────────────── 18-C · Lote 1 · Hábitos ────────────────────────────
  {
    name: "habits.get_today",
    version: "1",
    module: "habits",
    kind: "leitura",
    risk: 1,
    description:
      "Os hábitos ativos e a situação de hoje: quais caem hoje, quais já foram concluídos e quanto falta para a meta do dia. Um hábito que não cai hoje NÃO é uma falha, e um hábito de hoje ainda não feito não é uma falha — o dia está em andamento. A água também é registrada aqui.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["habitos"],
    requiredPermission: "allow_habits",
    timeoutMs: 8_000,
    maxRecords: 60,
    itemLabel: "hábitos",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "habits.get_streaks",
    version: "1",
    module: "habits",
    kind: "leitura",
    risk: 1,
    description:
      "Sequências atuais e recordes de cada hábito, mais a consistência de 7 e 30 dias já calculada. Quando a taxa vier nula, não havia dia agendado na janela — isso não é 0% de conclusão, e dizer que é seria falso.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["habitos"],
    requiredPermission: "allow_habits",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "hábitos",
    requiresConfirmation: false,
    idempotent: true,
  },

  // ──────────────────────────── 18-C · Lote 1 · Estudos ────────────────────────────
  {
    name: "studies.get_courses",
    version: "1",
    module: "studies",
    kind: "leitura",
    risk: 1,
    description:
      "Os cursos com progresso, aulas concluídas, minutos estudados e próxima aula. Curso atrasado vem com o MOTIVO do atraso — passou da data-alvo é diferente de ficar dias sem estudar. Use `apenas_em_andamento` quando a pergunta for sobre o que está sendo estudado agora.",
    inputSchema: {
      type: "object",
      properties: {
        apenas_em_andamento: {
          type: "boolean",
          description: "Trazer só os cursos em andamento. Padrão: false (traz todos).",
        },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object" },
    allowedAgents: ["estudos"],
    requiredPermission: "allow_studies",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "cursos",
    requiresConfirmation: false,
    idempotent: true,
  },
  {
    name: "studies.get_study_time",
    version: "1",
    module: "studies",
    kind: "leitura",
    risk: 1,
    description:
      "Tempo de estudo da semana e do mês, sequência de dias e a série semanal de minutos, já somados pelo sistema. Zero minutos aqui é medição real (não houve sessão), não ausência de dado.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object" },
    allowedAgents: ["estudos"],
    requiredPermission: "allow_studies",
    timeoutMs: 10_000,
    maxRecords: 60,
    itemLabel: "semanas",
    requiresConfirmation: false,
    idempotent: true,
  },
];

export function findTool(name: string): ToolDescriptor | null {
  return AI_TOOL_REGISTRY.find((t) => t.name === name) ?? null;
}

/**
 * As ferramentas que uma flag `allow_*` de fato libera — DERIVADO do registry, nunca uma
 * segunda lista.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ É o que impede a tela de preferências de virar botão fantasma. Ligar `allow_finance`   ║
 * ║ hoje não libera nada: não existe ferramenta de Finanças. Uma lista escrita à mão de    ║
 * ║ "módulos prontos" ficaria para trás no dia em que a 18-C acrescentasse a primeira —    ║
 * ║ e a tela continuaria dizendo "ainda não" sobre uma leitura que já funciona.            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export function toolsForPermission(
  permission: ToolPermission,
): readonly ToolDescriptor[] {
  return AI_TOOL_REGISTRY.filter(
    (t) => t.requiredPermission === permission && isToolDescriptorCoherent(t),
  );
}

/**
 * As definições que vão para o provedor, dada a allowlist do agente.
 *
 * Repare na ordem: a allowlist do agente é aplicada sobre o registry, e o registry é a fonte.
 * Um nome na allowlist que não exista no registry simplesmente não vira ferramenta — não há
 * caminho para uma ferramenta nascer de um nome.
 */
export function toolDefinitionsFor(
  allowedToolNames: readonly string[],
): AiToolDefinition[] {
  return AI_TOOL_REGISTRY.filter(
    (t) => allowedToolNames.includes(t.name) && isToolDescriptorCoherent(t),
  ).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

/** Código de erro do run quando o provedor chama uma ferramenta que não foi oferecida. */
export const UNEXPECTED_TOOL_CALL = "UNEXPECTED_TOOL_CALL";
