/**
 * Fase 18-A — IA · Fallback CLASSIFICADO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ TRÊS CLASSES NUNCA CAEM EM FALLBACK, E ISSO NÃO É CONFIGURÁVEL:                       ║
 * ║                                                                                       ║
 * ║  • AUTENTICACAO_INVALIDA  — a credencial é a MESMA. Tentar outro modelo com uma chave ║
 * ║    que o provedor recusou só queima tempo e confunde o diagnóstico.                   ║
 * ║  • CANCELADO_PELO_USUARIO — o usuário pediu para parar. Chamar outro provedor seria   ║
 * ║    gastar dinheiro contra a vontade explícita dele.                                    ║
 * ║  • CONTEUDO_REJEITADO     — não se contorna política de conteúdo tentando provedores  ║
 * ║    em sequência. Isso é decisão de produto, não limitação técnica.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. Nenhum I/O, nenhum relógio.
 */

import type { AiErrorClass } from "./errors";

export type FallbackVerdict =
  /** Repetir a MESMA chamada (mesmo provedor, mesmo modelo). */
  | { readonly kind: "retry"; readonly motivo: string }
  /** Trocar de provedor/modelo dentro da cadeia autorizada. */
  | { readonly kind: "fallback"; readonly motivo: string }
  /** Encerrar. Nem retry, nem fallback. */
  | { readonly kind: "parar"; readonly motivo: string };

export type FallbackContext = {
  readonly errorClass: AiErrorClass;
  /** Ligado em `ai_provider_configs.fallback_allowed` E em `ai_user_preferences`. */
  readonly fallbackAllowed: boolean;
  /** Quantos destinos ainda restam na cadeia já autorizada na admissão. */
  readonly fallbackTargetsLeft: number;
  readonly retriesUsed: number;
  readonly maxRetries: number;
  /**
   * Sobra da reserva, em USD. Fallback NÃO ganha orçamento novo: se o custo projetado do
   * destino não couber no que restou, o executor recusa mesmo com fallback ligado.
   */
  readonly reservaRestante: number;
  readonly custoProjetadoDoDestino: number;
};

/** As três classes que nunca admitem fallback. Exportada para o teste ler daqui. */
export const NUNCA_FAZ_FALLBACK: readonly AiErrorClass[] = [
  "AUTENTICACAO_INVALIDA",
  "CANCELADO_PELO_USUARIO",
  "CONTEUDO_REJEITADO",
];

/** Classes em que trocar de modelo só faz sentido se o destino for COMPATÍVEL. */
const EXIGE_DESTINO_COMPATIVEL: readonly AiErrorClass[] = [
  "MODELO_INDISPONIVEL",
  "CONTEXTO_EXCEDIDO",
];

/** Classes transitórias: repetir a mesma chamada costuma resolver. */
const TRANSITORIAS: readonly AiErrorClass[] = [
  "RATE_LIMIT",
  "TIMEOUT",
  "ERRO_TEMPORARIO",
];

export function decideFallback(ctx: FallbackContext): FallbackVerdict {
  if (NUNCA_FAZ_FALLBACK.includes(ctx.errorClass)) {
    return {
      kind: "parar",
      motivo: motivoDeParada(ctx.errorClass),
    };
  }

  // Erro de schema: corrigir ou falhar com segurança. Na 18-A não há saída estruturada,
  // então não há o que corrigir — para.
  if (ctx.errorClass === "ERRO_DE_SCHEMA") {
    return {
      kind: "parar",
      motivo: "A resposta veio fora do formato esperado; encerrar é mais seguro que insistir.",
    };
  }

  if (ctx.errorClass === "ERRO_PERMANENTE") {
    return { kind: "parar", motivo: "O provedor recusou de forma definitiva." };
  }

  // Transitório: primeiro esgota os retries do MESMO modelo — é mais barato e mais provável.
  if (TRANSITORIAS.includes(ctx.errorClass) && ctx.retriesUsed < ctx.maxRetries) {
    return {
      kind: "retry",
      motivo: `Falha transitória (${ctx.errorClass}); repetindo a mesma chamada.`,
    };
  }

  if (!ctx.fallbackAllowed) {
    return {
      kind: "parar",
      motivo: "O fallback entre provedores está desligado nas suas configurações.",
    };
  }

  if (ctx.fallbackTargetsLeft <= 0) {
    return { kind: "parar", motivo: "Não há outro provedor autorizado e compatível." };
  }

  // A segunda barreira do orçamento. A reserva já foi calculada pela tarifa do modelo mais
  // caro da cadeia, então isto quase nunca dispara — mas "quase nunca" não é "nunca".
  if (ctx.custoProjetadoDoDestino > ctx.reservaRestante) {
    return {
      kind: "parar",
      motivo: "O provedor alternativo não cabe no orçamento reservado para esta mensagem.",
    };
  }

  if (
    EXIGE_DESTINO_COMPATIVEL.includes(ctx.errorClass) ||
    TRANSITORIAS.includes(ctx.errorClass)
  ) {
    return {
      kind: "fallback",
      motivo: `Trocando de provedor por ${ctx.errorClass}.`,
    };
  }

  return { kind: "parar", motivo: "Classe de erro sem caminho de recuperação definido." };
}

function motivoDeParada(errorClass: AiErrorClass): string {
  switch (errorClass) {
    case "AUTENTICACAO_INVALIDA":
      return "A credencial é a mesma em qualquer tentativa — trocar de modelo não resolveria.";
    case "CANCELADO_PELO_USUARIO":
      return "Você cancelou; nenhuma outra chamada foi feita.";
    case "CONTEUDO_REJEITADO":
      return "O conteúdo foi recusado pelo provedor; este sistema não tenta outros para contornar.";
    default:
      return "Sem caminho de recuperação para esta classe de erro.";
  }
}
