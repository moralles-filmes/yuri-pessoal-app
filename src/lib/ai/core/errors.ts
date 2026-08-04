/**
 * Fase 18-A — IA · As 10 classes normalizadas de erro.
 *
 * ═══════════════════════ POR QUE CLASSIFICAR, E NÃO SÓ "DEU ERRO" ═══════════════════════
 *
 * A classe do erro é o que decide se cabe fallback. Sem ela, o sistema faria a coisa errada
 * nos dois sentidos: insistiria com uma chave inválida (que nunca vai funcionar em provedor
 * nenhum) e desistiria de um timeout (que quase sempre funciona na segunda). Pior: tentar
 * provedores em sequência depois de CONTEUDO_REJEITADO é contornar política — e isso o
 * módulo não faz, por decisão, não por limitação.
 *
 * ═══════════════════════ A MENSAGEM É PARA O USUÁRIO, EM pt-BR ═══════════════════════
 *
 * `message` é texto pronto para a tela: sem stack, sem corpo de resposta do provedor, sem
 * header, sem URL com credencial, sem eco da chave. Quem produz `AiError` é sempre
 * `providers/ai-sdk/error-map.ts`, e a saída passa por `security/redact.ts`.
 */

/** As 10 classes. A ordem aqui é a mesma da documentação da fase. */
export const AI_ERROR_CLASSES = [
  "AUTENTICACAO_INVALIDA",
  "MODELO_INDISPONIVEL",
  "RATE_LIMIT",
  "TIMEOUT",
  "ERRO_TEMPORARIO",
  "CONTEUDO_REJEITADO",
  "CONTEXTO_EXCEDIDO",
  "ERRO_DE_SCHEMA",
  "ERRO_PERMANENTE",
  "CANCELADO_PELO_USUARIO",
] as const;

export type AiErrorClass = (typeof AI_ERROR_CLASSES)[number];

export type AiError = {
  /** Uma das 10. É ela que o `fallback.ts` consulta. */
  readonly class: AiErrorClass;
  /** Código curto e estável, para log e telemetria. Nunca contém segredo. */
  readonly code: string;
  /** Texto pt-BR pronto para a tela. Já sanitizado. */
  readonly message: string;
  /** Verdadeiro quando repetir a MESMA chamada pode dar certo. */
  readonly retryable: boolean;
};

/** Mensagens padrão por classe — pt-BR, sem culpar o usuário e sem detalhe sensível. */
const DEFAULT_MESSAGE: Record<AiErrorClass, string> = {
  AUTENTICACAO_INVALIDA:
    "A chave de API deste provedor não foi aceita. Revise a credencial em Configurações.",
  MODELO_INDISPONIVEL:
    "O modelo escolhido não está disponível neste provedor agora.",
  RATE_LIMIT:
    "O provedor recusou por excesso de requisições. Tente novamente em instantes.",
  TIMEOUT: "O provedor demorou mais que o limite configurado e a chamada foi encerrada.",
  ERRO_TEMPORARIO: "O provedor teve uma falha temporária. Tente novamente.",
  CONTEUDO_REJEITADO: "O provedor recusou o conteúdo desta mensagem.",
  CONTEXTO_EXCEDIDO:
    "A conversa ficou maior que a janela de contexto do modelo escolhido.",
  ERRO_DE_SCHEMA: "A resposta do provedor não veio no formato esperado.",
  ERRO_PERMANENTE: "O provedor recusou a chamada de forma definitiva.",
  CANCELADO_PELO_USUARIO: "Resposta cancelada.",
};

/**
 * `retryable` diz se REPETIR A MESMA CHAMADA pode dar certo — é diferente de "cabe
 * fallback", que é decisão de `fallback.ts`. Chave inválida não é retryable nem admite
 * fallback; contexto excedido não é retryable, mas admite fallback para um modelo maior.
 */
const RETRYABLE: Record<AiErrorClass, boolean> = {
  AUTENTICACAO_INVALIDA: false,
  MODELO_INDISPONIVEL: false,
  RATE_LIMIT: true,
  TIMEOUT: true,
  ERRO_TEMPORARIO: true,
  CONTEUDO_REJEITADO: false,
  CONTEXTO_EXCEDIDO: false,
  ERRO_DE_SCHEMA: false,
  ERRO_PERMANENTE: false,
  CANCELADO_PELO_USUARIO: false,
};

export function aiError(
  errorClass: AiErrorClass,
  code: string,
  message?: string,
): AiError {
  return {
    class: errorClass,
    code,
    message: message ?? DEFAULT_MESSAGE[errorClass],
    retryable: RETRYABLE[errorClass],
  };
}

export function isAiErrorClass(value: unknown): value is AiErrorClass {
  return (
    typeof value === "string" &&
    (AI_ERROR_CLASSES as readonly string[]).includes(value)
  );
}

export function defaultMessageFor(errorClass: AiErrorClass): string {
  return DEFAULT_MESSAGE[errorClass];
}
