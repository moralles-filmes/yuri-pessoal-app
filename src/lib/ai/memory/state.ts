/**
 * Fase 18-F · Bloco 3 — IA · O ESTADO DE UMA MEMÓRIA É DERIVADO. Puro, `agora` injetado.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `ai_memories` NÃO TEM COLUNA DE STATUS — invariante 35 da 18-C, invariante 70 da 18-E. ║
 * ║                                                                                       ║
 * ║ ⛔ PRECEDÊNCIA: **DECISÃO DO DONO > PRAZO.** Ele desativou; a memória não volta porque ║
 * ║ o prazo ainda não venceu, e não deixa de estar desativada porque venceu. O prazo só    ║
 * ║ decide quando ele não decidiu nada.                                                    ║
 * ║                                                                                       ║
 * ║ ⛔ E EXPIRAR NÃO APAGA: a memória sai do prompt e continua legível na tela, com a data ║
 * ║ em que venceu.                                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { dateInSaoPaulo } from "@/lib/format";
import type { EventoDeMemoria } from "./contracts";

export type EstadoDaMemoria = "vigente" | "expirada" | "desativada" | "esquecida";

export type LinhaDeEventoDeMemoria = {
  readonly evento: EventoDeMemoria;
  /** ISO. A ordem cronológica é o que faz "a última decisão vence". */
  readonly created_at: string;
};

export type EstadoResolvidoDaMemoria = {
  readonly estado: EstadoDaMemoria;
  /** `yyyy-MM-dd` em Brasília. Só em `expirada`. */
  readonly expirouEm?: string;
};

export function estadoDaMemoria(
  expiresAt: string | null,
  eventos: readonly LinhaDeEventoDeMemoria[],
  agora: Date,
): EstadoResolvidoDaMemoria {
  /**
   * ⚠️ Ordenação feita AQUI, não confiada à consulta. A tabela é append-only e a mesma decisão
   * pode aparecer várias vezes; quem manda é a última. Deixar a ordem para o `order by` do
   * PostgREST faria esta função dar respostas diferentes conforme quem a chamou.
   */
  const emOrdem = [...eventos].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );

  // `criada`, `editada` e `excluida` NÃO são decisão de exibição.
  const decisao = emOrdem.find(
    (e) =>
      e.evento === "desativada" || e.evento === "reativada" || e.evento === "esquecida",
  );

  if (decisao?.evento === "desativada") return { estado: "desativada" };
  if (decisao?.evento === "esquecida") return { estado: "esquecida" };
  // `reativada` devolve a palavra ao prazo — ela não é "vigente para sempre".

  if (expiresAt && new Date(expiresAt).getTime() <= agora.getTime()) {
    // ⛔ `dateInSaoPaulo`, nunca `.slice(0,10)`: a coluna é `timestamptz`, e o corte devolveria
    // o dia em UTC — errado entre 21h e 00h BRT, que é quando ninguém está olhando.
    return { estado: "expirada", expirouEm: dateInSaoPaulo(new Date(expiresAt)) };
  }

  return { estado: "vigente" };
}

/** O que de fato chega ao prompt. Tudo o mais continua legível na tela. */
export function entraNoPrompt(estado: EstadoDaMemoria): boolean {
  return estado === "vigente";
}
