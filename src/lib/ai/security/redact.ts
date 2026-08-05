/**
 * Fase 18-A — IA · Saneamento. ÚNICO caminho de saída de erro do módulo.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ PROIBIDO SAIR DAQUI: corpo bruto da resposta do provedor · headers · qualquer eco da  ║
 * ║ chave · stack trace · URL com credencial · nome de arquivo do servidor.               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A defesa é em duas camadas, e as duas importam:
 *
 *   1. ALLOWLIST — o erro que chega ao usuário é sempre uma mensagem NOSSA, escolhida pela
 *      classe. O texto do provedor não é repassado, nem "limpo e repassado".
 *   2. VARREDURA — mesmo assim, tudo que sai passa por `redactSecrets`, porque a camada 1
 *      depende de todo mundo se lembrar de usá-la, e um dia alguém não vai lembrar.
 *
 * Puro. Nenhum I/O.
 */

import { defaultMessageFor, type AiError } from "@/lib/ai/core/errors";

/**
 * Padrões de segredo conhecidos. Não é lista exaustiva — é a segunda camada, e uma segunda
 * camada que pega os casos comuns vale mais que nenhuma.
 *
 * Repare que os padrões são deliberadamente amplos: preferimos mascarar algo inofensivo a
 * deixar passar uma chave.
 */
const PADROES_DE_SEGREDO: readonly RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}/g, // OpenAI / xAI
  /\bsk-ant-[A-Za-z0-9_-]{12,}/g, // Anthropic
  /\bAIza[0-9A-Za-z_-]{20,}/g, // Google
  /\bxai-[A-Za-z0-9_-]{12,}/g, // xAI
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
  /\beyJ[A-Za-z0-9._-]{20,}/g, // JWT
  /("?(?:api[_-]?key|authorization|token|secret|password)"?\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi,
];

export const REDACTED = "[removido]";

/** Mascara segredos em qualquer texto. Idempotente. */
export function redactSecrets(texto: string): string {
  let saida = texto;
  for (const padrao of PADROES_DE_SEGREDO) {
    saida = saida.replace(padrao, (match, prefixo?: string) =>
      typeof prefixo === "string" ? `${prefixo}${REDACTED}` : REDACTED,
    );
  }
  return saida;
}

/**
 * Limite de tamanho da mensagem que chega ao usuário. Erro gigante quase sempre é dump —
 * e dump é justamente o que não pode sair.
 */
const MAX_MENSAGEM = 300;

/**
 * A mensagem que a interface pode mostrar. Repare: quando `error.message` não é a nossa
 * mensagem padrão da classe, ele ainda passa pela varredura e pelo corte. Nunca há caminho
 * em que o texto cru do provedor chegue inteiro à tela.
 */
export function safeUserMessage(error: AiError): string {
  const base = error.message?.trim() ? error.message : defaultMessageFor(error.class);
  const limpo = redactSecrets(base).replace(/\s+/g, " ").trim();
  return limpo.length > MAX_MENSAGEM ? `${limpo.slice(0, MAX_MENSAGEM - 1)}…` : limpo;
}

/**
 * O que pode ir para `ai_runs.error_message_sanitized`. Mesma disciplina do
 * `training_calendar_sync.last_error` (17-F): mensagem curta, sem token e sem corpo de
 * resposta do provedor.
 */
export function sanitizedForStorage(error: AiError): string {
  return safeUserMessage(error);
}

/**
 * Fase 18-B — o que pode ir para uma coluna `jsonb` de auditoria (hoje,
 * `ai_tool_calls.arguments_sanitized`).
 *
 * Mora AQUI, e não dentro de `tools/`, porque este arquivo é o único caminho de saída
 * sanitizada do módulo: uma segunda sanitização local nasceria desatualizada no dia em que
 * um padrão novo entrasse em `PADROES_DE_SEGREDO`.
 *
 * Duas garantias, as duas exigidas pelo banco e pela disciplina do módulo:
 *  • Devolve SEMPRE um objeto — a constraint `jsonb_typeof(...) = 'object'` recusa escalar.
 *  • O argumento veio do MODELO. Ele passa pela mesma varredura do erro, porque nada impede
 *    o usuário de colar uma chave na conversa e o modelo de repeti-la num argumento.
 */
/**
 * O mesmo formato de `Json` dos tipos gerados do Supabase, declarado AQUI para a camada de
 * segurança não depender do arquivo gerado. A compatibilidade é estrutural: o retorno de
 * `sanitizedJson` entra direto numa coluna `jsonb`.
 */
export type SanitizedJson =
  | string
  | number
  | boolean
  | null
  | { [chave: string]: SanitizedJson | undefined }
  | SanitizedJson[];

const CHAVE_SENSIVEL = /^(api[_-]?key|authorization|token|secret|password|senha)$/i;
const PROFUNDIDADE_MAXIMA = 8;
const NAO_SERIALIZAVEL = "[não serializável]";

/**
 * A varredura é feita CAMPO A CAMPO, não sobre o JSON serializado: aplicar as regex ao texto
 * do JSON quebra o próprio JSON (o padrão `"api_key": "…"` engole as aspas do valor), e um
 * `JSON.parse` que falha viraria auditoria perdida.
 */
function varrer(
  valor: unknown,
  vistos: WeakSet<object>,
  nivel: number,
): SanitizedJson | undefined {
  if (typeof valor === "string") return redactSecrets(valor);
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "boolean" || valor === null) return valor;
  if (typeof valor !== "object") return undefined;

  if (nivel >= PROFUNDIDADE_MAXIMA) return NAO_SERIALIZAVEL;
  if (vistos.has(valor as object)) return NAO_SERIALIZAVEL;
  vistos.add(valor as object);

  if (Array.isArray(valor)) {
    return valor.map((item) => varrer(item, vistos, nivel + 1) ?? null);
  }

  const saida: { [chave: string]: SanitizedJson | undefined } = {};
  for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
    if (CHAVE_SENSIVEL.test(chave)) {
      saida[chave] = REDACTED;
      continue;
    }
    const limpo = varrer(item, vistos, nivel + 1);
    if (limpo !== undefined) saida[chave] = limpo;
  }
  return saida;
}

export function sanitizedJson(value: unknown): {
  [chave: string]: SanitizedJson | undefined;
} {
  const limpo = varrer(value, new WeakSet(), 0);
  if (limpo === null || limpo === undefined) return {};
  if (typeof limpo !== "object" || Array.isArray(limpo)) return { valor: limpo };
  return limpo;
}

/**
 * O que pode ir para log operacional. NÃO inclui a mensagem: só classe, código e
 * correlação — o suficiente para investigar, insuficiente para vazar.
 */
export function safeLogFields(
  error: AiError,
  correlationId: string,
): Record<string, string | boolean> {
  return {
    correlation_id: correlationId,
    error_class: error.class,
    error_code: error.code,
    retryable: error.retryable,
  };
}
