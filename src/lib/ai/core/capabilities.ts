/**
 * Fase 18-A — IA · Matriz de capacidades.
 *
 * Capacidade é CONTRATO DE CHAMADA, não rótulo — a mesma ideia de `tracking_type` no módulo
 * Treinos (17-A). Mandar imagem para um modelo sem visão, ou ferramenta para um modelo sem
 * tool calling, produz erro do provedor DEPOIS de já ter gasto a chamada. Aqui a recusa
 * acontece antes, de graça, com erro tipado.
 *
 * Puro. Nenhum I/O.
 */

import { aiError, type AiError } from "./errors";

export const AI_CAPABILITIES = [
  "texto",
  "streaming",
  "visao",
  "arquivo",
  "tool_calling",
  "saida_estruturada",
  "audio",
  "busca_web",
] as const;

export type AiCapability = (typeof AI_CAPABILITIES)[number];

/** Rótulos pt-BR para a tela de Configurações. */
export const AI_CAPABILITY_LABEL: Record<AiCapability, string> = {
  texto: "Texto",
  streaming: "Streaming",
  visao: "Visão (imagens)",
  arquivo: "Arquivos",
  tool_calling: "Ferramentas",
  saida_estruturada: "Saída estruturada",
  audio: "Áudio",
  busca_web: "Busca na web",
};

export function hasCapability(
  capabilities: readonly AiCapability[],
  wanted: AiCapability,
): boolean {
  return capabilities.includes(wanted);
}

export function hasAllCapabilities(
  capabilities: readonly AiCapability[],
  wanted: readonly AiCapability[],
): boolean {
  return wanted.every((c) => capabilities.includes(c));
}

/**
 * Devolve as capacidades exigidas que o modelo NÃO tem. Lista vazia = compatível.
 * Devolver a lista (em vez de um booleano) é o que permite a tela dizer o que falta.
 */
export function missingCapabilities(
  capabilities: readonly AiCapability[],
  required: readonly AiCapability[],
): AiCapability[] {
  return required.filter((c) => !capabilities.includes(c));
}

/**
 * Erro tipado de incompatibilidade, com a lista do que falta já no texto — o usuário
 * precisa saber POR QUE o modelo foi recusado, senão só resta tentar de novo às cegas.
 */
export function capabilityError(
  modelId: string,
  missing: readonly AiCapability[],
): AiError {
  const nomes = missing.map((c) => AI_CAPABILITY_LABEL[c]).join(", ");
  return aiError(
    "MODELO_INDISPONIVEL",
    "CAPABILITY_MISSING",
    `O modelo ${modelId} não oferece: ${nomes}.`,
  );
}
