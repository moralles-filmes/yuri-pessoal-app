/**
 * Fase 18-A — IA · Tool Registry. **NASCE VAZIO.**
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ VAZIO SIGNIFICA: NENHUMA DEFINIÇÃO DE FERRAMENTA É ENVIADA AO PROVEDOR.               ║
 * ║                                                                                       ║
 * ║ Não é "o modelo tem ferramentas mas foi instruído a não usar". É que o campo `tools`  ║
 * ║ da requisição vai vazio, o modelo não sabe que existe função alguma, e não há executor║
 * ║ habilitado do outro lado.                                                             ║
 * ║                                                                                       ║
 * ║ Se AINDA ASSIM o provedor devolver um evento de tool call, o chat-runner encerra o run║
 * ║ como `failed` com `UNEXPECTED_TOOL_CALL`: não executa, não interpreta como ferramenta ║
 * ║ válida e não deixa o run seguir como se nada tivesse acontecido.                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro.
 */

import type { AiToolDefinition } from "@/lib/ai/core/contracts";
import { isToolDescriptorCoherent, type ToolDescriptor } from "./contracts";

/** 18-A: vazio, e há teste que exige que continue vazio nesta subfase. */
export const AI_TOOL_REGISTRY: readonly ToolDescriptor[] = [];

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
