/**
 * Fase 18-B — IA · A DECISÃO de admitir ou rejeitar uma chamada de ferramenta.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ PURO DE PROPÓSITO. A decisão de deixar uma ferramenta rodar não pode depender de       ║
 * ║ banco, de rede nem de ordem de `await` — senão ela é intestável, e uma trava           ║
 * ║ intestável é uma trava que ninguém sabe se funciona.                                   ║
 * ║                                                                                       ║
 * ║ A ORDEM DAS CHECAGENS NÃO É ESTILO:                                                    ║
 * ║  1. registry   — o nome existe?                                                        ║
 * ║  2. allowlist  — este agente pode ver esta ferramenta? (antes de tudo o mais, para a   ║
 * ║                  mensagem de erro não revelar se ela é de escrita nem se a flag do     ║
 * ║                  usuário está ligada)                                                  ║
 * ║  3. coerência  — o descriptor faz sentido?                                             ║
 * ║  4. kind       — escrita continua indisponível na 18-B                                 ║
 * ║  5. permissão  — a flag `allow_*` do usuário está ligada?                              ║
 * ║                                                                                       ║
 * ║ A ORDEM SOZINHA NÃO BASTA. Ela decide QUAL motivo sai; o que chega ao modelo é o       ║
 * ║ motivo PÚBLICO (`PUBLIC_REJECTION_CODE`), e "não existe" e "existe mas não é sua"      ║
 * ║ saem com código e texto IDÊNTICOS. Com códigos distintos, bastava o modelo chamar      ║
 * ║ nome por nome e comparar as respostas para mapear ferramentas de outros agentes. O     ║
 * ║ motivo verdadeiro continua inteiro na auditoria, que é onde ele serve para algo.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A validação Zod da ENTRADA não mora aqui: o schema Zod vive junto do adapter, que é
 * `server-only`. Ela é o passo seguinte, no executor.
 */

import {
  isToolDescriptorCoherent,
  type ToolDescriptor,
  type ToolPermission,
} from "./contracts";

export type ToolRejectionReason =
  | "TOOL_UNKNOWN"
  | "TOOL_NOT_ALLOWED_FOR_AGENT"
  | "TOOL_INCOHERENT"
  | "TOOL_WRITE_DISABLED"
  | "TOOL_PERMISSION_DENIED"
  | "TOOL_INVALID_INPUT"
  | "TOOL_TIMEOUT"
  | "TOOL_FAILED";

/**
 * O texto que volta AO MODELO como `tool-result` de erro. Ele é lido pelo modelo e pode
 * chegar ao usuário, então: pt-BR, sem jargão, sem nome de coluna, sem stack.
 */
const INDISPONIVEL =
  "Esta ferramenta não está disponível. Responda sem ela e diga o que não conseguiu consultar.";

export const REJECTION_MESSAGE: Record<ToolRejectionReason, string> = {
  // ⚠️ MESMO TEXTO de propósito — ver o cabeçalho. Um texto diferente para "não existe" e
  // para "existe e não é sua" é um oráculo: 20 chamadas mapeiam o registry inteiro.
  TOOL_UNKNOWN: INDISPONIVEL,
  TOOL_NOT_ALLOWED_FOR_AGENT: INDISPONIVEL,
  TOOL_INCOHERENT:
    "Esta ferramenta está indisponível por uma inconsistência de configuração. Responda sem ela.",
  TOOL_WRITE_DISABLED:
    "Esta versão do assistente só consulta informações — não cria, altera nem apaga nada.",
  TOOL_PERMISSION_DENIED:
    "O usuário ainda não autorizou a leitura deste módulo. Explique isso e diga que a autorização fica nas preferências de IA.",
  TOOL_INVALID_INPUT:
    "Os argumentos enviados não são válidos para esta ferramenta. Revise e tente uma única vez com argumentos corretos.",
  TOOL_TIMEOUT:
    "A consulta demorou demais e foi interrompida. Diga que não conseguiu obter o dado.",
  TOOL_FAILED:
    "A consulta falhou. Diga que não conseguiu obter o dado — não estime um valor.",
};

/**
 * O código que o MODELO vê. `TOOL_INDISPONIVEL` cobre os dois motivos que, juntos,
 * revelariam a existência de uma ferramenta de outro agente. Os demais são informativos e
 * ajudam o modelo a agir certo (revisar argumento, não repetir a chamada, apontar as
 * preferências) sem contar nada que ele já não pudesse deduzir da própria chamada.
 *
 * A auditoria grava o `ToolRejectionReason` verdadeiro — nada se perde, só não vaza.
 */
export const PUBLIC_REJECTION_CODE: Record<ToolRejectionReason, string> = {
  TOOL_UNKNOWN: "TOOL_INDISPONIVEL",
  TOOL_NOT_ALLOWED_FOR_AGENT: "TOOL_INDISPONIVEL",
  TOOL_INCOHERENT: "TOOL_INCOHERENT",
  TOOL_WRITE_DISABLED: "TOOL_WRITE_DISABLED",
  TOOL_PERMISSION_DENIED: "TOOL_PERMISSION_DENIED",
  TOOL_INVALID_INPUT: "TOOL_INVALID_INPUT",
  TOOL_TIMEOUT: "TOOL_TIMEOUT",
  TOOL_FAILED: "TOOL_FAILED",
};

export type GuardInput = {
  readonly toolName: string;
  readonly registry: readonly ToolDescriptor[];
  readonly agent: { readonly id: string; readonly allowedTools: readonly string[] };
  readonly permissions: Readonly<Record<ToolPermission, boolean>>;
};

export type GuardResult =
  | { readonly ok: true; readonly tool: ToolDescriptor }
  | {
      readonly ok: false;
      readonly reason: ToolRejectionReason;
      readonly message: string;
    };

function rejeitar(reason: ToolRejectionReason): GuardResult {
  return { ok: false, reason, message: REJECTION_MESSAGE[reason] };
}

export function guardToolCall(input: GuardInput): GuardResult {
  const tool = input.registry.find((t) => t.name === input.toolName);
  if (!tool) return rejeitar("TOOL_UNKNOWN");

  if (!input.agent.allowedTools.includes(tool.name)) {
    return rejeitar("TOOL_NOT_ALLOWED_FOR_AGENT");
  }

  if (!isToolDescriptorCoherent(tool)) return rejeitar("TOOL_INCOHERENT");

  if (tool.kind !== "leitura") return rejeitar("TOOL_WRITE_DISABLED");

  if (input.permissions[tool.requiredPermission] !== true) {
    return rejeitar("TOOL_PERMISSION_DENIED");
  }

  return { ok: true, tool };
}
