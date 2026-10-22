/**
 * Chat livre com coordenador — quem é OFERECIDO ao modelo, quem é ACEITO e por que se recusa.
 *
 * O coordenador (o agente `assistente-pessoal`) não lê módulo nenhum: ele aciona especialistas,
 * e cada especialista lê o seu módulo pelo Tool Executor de sempre. Este arquivo decide só duas
 * coisas, as duas puras:
 *
 *  1. quais especialistas o modelo VÊ como ferramenta de acionamento;
 *  2. de uma lista de pedidos de acionamento, quais o servidor ACEITA.
 *
 * ⛔ A oferta é DERIVADA de `toolDefinitionsFor`, nunca de uma lista escrita à mão: um
 * especialista só é oferecido quando ao menos uma ferramenta de LEITURA dele sobrevive às chaves
 * do dono. Lista à mão ficaria para trás no dia em que um módulo ganhasse a primeira ferramenta
 * — ou ofereceria um especialista que a chave vai recusar, e o modelo o pediria a cada mensagem.
 * Ferramenta de escrita não conta: `memory.lembrar` está nas oito allowlists e, sozinha, não faz
 * de ninguém um especialista que lê.
 *
 * ⚠️ O orquestrador NUNCA é oferecido: acionar a si mesmo seria um laço sem módulo nenhum por
 * trás.
 *
 * Puro: sem banco, sem provedor, sem `agora`.
 */

import { z } from "zod";
import type { AiToolDefinition } from "@/lib/ai/core/contracts";
import type { ToolPermission, ToolWritePermission } from "@/lib/ai/tools/contracts";
import type { ToolRejectionReason } from "@/lib/ai/tools/guard";
import { findTool, toolDefinitionsFor } from "@/lib/ai/tools/registry";
import { AI_AGENT_REGISTRY, ASSISTENTE_PESSOAL_ID } from "./registry";

/** Quantos especialistas distintos uma mensagem aciona, no máximo. É o teto da trilha no banco. */
export const MAX_ESPECIALISTAS = 6;

/** Tamanho máximo do pedido que o coordenador escreve para o especialista. */
export const MAX_TAREFA_CHARS = 1500;

/**
 * O nome que a AUDITORIA grava para um acionamento. Nunca vai ao provedor: lá o modelo vê
 * `acionar_<especialista>`.
 */
export const TOOL_NAME_ACIONAMENTO = "coordenador.acionar";

export type EspecialistaOferecido = {
  /** "financeiro" */
  readonly agentId: string;
  /** `AiAgentProfile.label` — o que o dono lê na tela. */
  readonly rotulo: string;
  /** "acionar_financeiro" — só `[a-z0-9_]`, válido em todo provedor. */
  readonly ferramenta: string;
};

/** O id do agente vira nome de ferramenta aceito por qualquer provedor. */
function nomeDaFerramenta(agentId: string): string {
  return `acionar_${agentId.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

export function catalogoDeEspecialistas(
  permissions: Readonly<Partial<Record<ToolPermission, boolean>>>,
  writePermissions: Readonly<Partial<Record<ToolWritePermission, boolean>>>,
): { readonly ofertas: readonly EspecialistaOferecido[]; readonly desligados: readonly string[] } {
  const ofertas: EspecialistaOferecido[] = [];
  const desligados: string[] = [];

  for (const agente of AI_AGENT_REGISTRY) {
    if (agente.id === ASSISTENTE_PESSOAL_ID) continue;
    const lê = toolDefinitionsFor(agente.allowedTools, permissions, writePermissions).some(
      (def) => findTool(def.name)?.kind === "leitura",
    );
    if (lê) {
      ofertas.push({
        agentId: agente.id,
        rotulo: agente.label,
        ferramenta: nomeDaFerramenta(agente.id),
      });
    } else {
      desligados.push(agente.label);
    }
  }

  return { ofertas, desligados };
}

/**
 * A tarefa que o coordenador entrega ao especialista: texto aparado, de 1 a `MAX_TAREFA_CHARS`,
 * e NENHUM campo a mais. `.strict()` é o que impede o modelo de mandar `userId` ou `agentId`.
 */
const tarefaSchema = z.object({ tarefa: z.string().trim().min(1).max(MAX_TAREFA_CHARS) }).strict();

export function definicoesDeAcionamento(
  ofertas: readonly EspecialistaOferecido[],
): AiToolDefinition[] {
  return ofertas.map((o) => {
    const agente = AI_AGENT_REGISTRY.find((a) => a.id === o.agentId);
    return {
      name: o.ferramenta,
      description:
        `Aciona o especialista ${o.rotulo}. ${agente?.description ?? ""} ` +
        "Escreva em `tarefa` o pedido completo, com o contexto necessário: o especialista não vê a conversa.",
      inputSchema: {
        type: "object",
        properties: {
          tarefa: {
            type: "string",
            minLength: 1,
            maxLength: MAX_TAREFA_CHARS,
            description: "O pedido, em português, para o especialista.",
          },
        },
        required: ["tarefa"],
        additionalProperties: false,
      },
    };
  });
}

export type MotivoDeRecusa =
  | "NAO_OFERECIDO"
  | "REPETIDO"
  | "ACIMA_DO_TETO"
  | "CRUZAR_MODULOS_DESLIGADO"
  | "TAREFA_INVALIDA";

/** O código que a auditoria (`ai_tool_calls.rejection_reason`) grava para cada recusa. */
export const MOTIVO_PARA_AUDITORIA: Record<MotivoDeRecusa, ToolRejectionReason> = {
  NAO_OFERECIDO: "TOOL_NOT_ALLOWED_FOR_AGENT",
  REPETIDO: "TOOL_INCOHERENT",
  ACIMA_DO_TETO: "TOOL_INCOHERENT",
  CRUZAR_MODULOS_DESLIGADO: "TOOL_PERMISSION_DENIED",
  TAREFA_INVALIDA: "TOOL_INVALID_INPUT",
};

export type Acionamento = {
  readonly callId: string;
  readonly agentId: string;
  readonly rotulo: string;
  readonly tarefa: string;
};

export type DecisaoDeAcionamentos = {
  readonly aceitos: readonly Acionamento[];
  readonly recusados: readonly {
    readonly callId: string;
    readonly toolName: string;
    readonly agentId: string | null;
    readonly motivo: MotivoDeRecusa;
  }[];
};

/**
 * Decide, na ordem recebida, quais pedidos de acionamento o servidor aceita. A ordem das
 * recusas, por chamada: nome fora da oferta → tarefa inválida → já aceito antes → cruzar
 * módulos desligado (com 1 aceito) → teto de especialistas.
 */
export function decidirAcionamentos(input: {
  readonly chamadas: readonly {
    readonly callId: string;
    readonly toolName: string;
    readonly input: unknown;
  }[];
  readonly ofertas: readonly EspecialistaOferecido[];
  readonly allowCrossModule: boolean;
}): DecisaoDeAcionamentos {
  const aceitos: Acionamento[] = [];
  const recusados: DecisaoDeAcionamentos["recusados"][number][] = [];

  for (const chamada of input.chamadas) {
    const oferta = input.ofertas.find((o) => o.ferramenta === chamada.toolName);
    const recusar = (motivo: MotivoDeRecusa) =>
      recusados.push({
        callId: chamada.callId,
        toolName: chamada.toolName,
        agentId: oferta?.agentId ?? null,
        motivo,
      });

    if (!oferta) {
      recusar("NAO_OFERECIDO");
      continue;
    }

    const tarefa = tarefaSchema.safeParse(chamada.input);
    if (!tarefa.success) {
      recusar("TAREFA_INVALIDA");
      continue;
    }

    if (aceitos.some((a) => a.agentId === oferta.agentId)) {
      recusar("REPETIDO");
      continue;
    }
    if (!input.allowCrossModule && aceitos.length >= 1) {
      recusar("CRUZAR_MODULOS_DESLIGADO");
      continue;
    }
    if (aceitos.length >= MAX_ESPECIALISTAS) {
      recusar("ACIMA_DO_TETO");
      continue;
    }

    aceitos.push({
      callId: chamada.callId,
      agentId: oferta.agentId,
      rotulo: oferta.rotulo,
      tarefa: tarefa.data.tarefa,
    });
  }

  return { aceitos, recusados };
}
