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
import { isToolDescriptorCoherent, type ToolDescriptor } from "./contracts";

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
];

export function findTool(name: string): ToolDescriptor | null {
  return AI_TOOL_REGISTRY.find((t) => t.name === name) ?? null;
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
