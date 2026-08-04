/**
 * Fase 18-A — IA · Rate limit (parte pura).
 *
 * ⚠️ ESTE ARQUIVO NÃO É A GARANTIA. A garantia é `ai_begin_chat_run`, que conta a janela
 * DENTRO da transação, sob advisory lock. Contar aqui e inserir depois é exatamente a
 * corrida que a função existe para fechar: duas requisições veem 9 de 10 e as duas passam.
 *
 * O que este arquivo faz é o resto: descrever a janela, calcular o `Retry-After` e traduzir
 * a recusa em texto pt-BR. Separar a decisão pura da execução é o padrão do projeto — e aqui
 * a decisão pura serve ao teste e à UI, não ao controle.
 *
 * Puro. `agora` sempre injetado.
 */

export type RateWindow = {
  readonly label: string;
  /** Tamanho da janela em segundos. */
  readonly seconds: number;
  readonly limit: number;
};

export type RateCheckInput = {
  readonly window: RateWindow;
  /** Quantos já ocorreram DENTRO da janela. */
  readonly count: number;
  /** Instante do mais antigo dentro da janela, em ms. `null` quando não há nenhum. */
  readonly oldestAtMs: number | null;
  /** `agora` em ms, injetado. Nunca `Date.now()` aqui dentro. */
  readonly agoraMs: number;
};

export type RateCheckResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number; readonly motivo: string };

export function checkRate(input: RateCheckInput): RateCheckResult {
  if (input.count < input.window.limit) return { allowed: true };

  // Quando o mais antigo sair da janela, uma vaga abre. Sem essa informação, o mínimo
  // honesto é esperar a janela inteira — nunca "tente já", que só gera outra recusa.
  const esperaMs =
    input.oldestAtMs === null
      ? input.window.seconds * 1000
      : Math.max(0, input.oldestAtMs + input.window.seconds * 1000 - input.agoraMs);

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil(esperaMs / 1000)),
    motivo: `Limite de ${input.window.limit} mensagens por ${input.window.label} atingido.`,
  };
}

/** Janelas padrão. Os valores reais vêm de `ai_user_preferences`, lidos PELO BANCO. */
export const JANELA_MINUTO: RateWindow = { label: "minuto", seconds: 60, limit: 10 };
export const JANELA_HORA: RateWindow = { label: "hora", seconds: 3600, limit: 120 };

/**
 * Rate limit próprio do TESTE DE CONEXÃO — 6 por hora, por provedor. Separado do chat de
 * propósito: testar credencial não consome tokens, mas bater no endpoint do provedor em
 * laço ainda é abuso, e misturar as duas contagens faria um teste de chave "gastar" uma
 * mensagem de conversa.
 */
export const JANELA_TESTE_CONEXAO: RateWindow = {
  label: "hora (teste de conexão)",
  seconds: 3600,
  limit: 6,
};
