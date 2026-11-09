import "server-only";

/**
 * MOD-ia-005 — O PRAZO GLOBAL DA REQUISIÇÃO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ QUEM ENCERRA A REQUISIÇÃO SOMOS NÓS, NUNCA A PLATAFORMA.                              ║
 * ║                                                                                       ║
 * ║ A função morre aos 60 s (`maxDuration`). Quando ela morre, o `finally` não roda: run  ║
 * ║ e tentativa ficam abertos até a lease da reconciliação, e o consumo real da chamada   ║
 * ║ cortada fica fora da conta. Um timeout POR TENTATIVA (padrão 60 s, configurável até   ║
 * ║ 300 s) não protege nada disso — um retry ou um passo de ferramenta já passava do      ║
 * ║ limite. O prazo é da REQUISIÇÃO: toda chamada recebe o menor entre o timeout          ║
 * ║ configurado e o que resta, e nenhuma é aberta abaixo do piso.                         ║
 * ║                                                                                       ║
 * ║ ⚠️ Os 5 s entre o prazo (55 s) e o `maxDuration` (60 s) são a folga para fechar o     ║
 * ║ estado: fechar a tentativa, fechar o run e responder.                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Aritmética pura: o relógio é sempre de quem chama (`agoraMs` injetado).
 */

export const PRAZO_DA_REQUISICAO_MS = 55_000;

/** Abaixo disto, uma chamada ao provedor não tem como terminar — não se abre nenhuma. */
export const PISO_POR_CHAMADA_MS = 5_000;

export type Prazo = { readonly fimMs: number };

/** Código com que o run fecha quando o prazo não comporta a próxima chamada. */
export const AI_DEADLINE = "AI_DEADLINE";

/** A frase que o dono lê. Informa o que aconteceu; ninguém errou. */
export const MENSAGEM_DO_PRAZO = "A resposta passou do tempo máximo e foi encerrada.";

export function criarPrazo(
  inicioMs: number,
  duracaoMs: number = PRAZO_DA_REQUISICAO_MS,
): Prazo {
  return { fimMs: inicioMs + duracaoMs };
}

/** Quanto ainda resta. Nunca negativo: prazo vencido é zero. */
export function restanteMs(prazo: Prazo, agoraMs: number): number {
  return Math.max(0, prazo.fimMs - agoraMs);
}

/**
 * O timeout da PRÓXIMA chamada: `min(configurado, restante)`, ou `null` quando o restante
 * está abaixo do piso — e `null` significa "não chame", nunca "chame sem timeout".
 */
export function timeoutDaChamada(
  prazo: Prazo,
  agoraMs: number,
  configTimeoutMs: number,
): number | null {
  const restante = restanteMs(prazo, agoraMs);
  if (restante < PISO_POR_CHAMADA_MS) return null;
  return Math.min(configTimeoutMs, restante);
}
