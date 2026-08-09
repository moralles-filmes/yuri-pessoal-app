/**
 * Fase 18-E — IA · O ESTADO DE UM INSIGHT É DERIVADO. Puro, `agora` injetado.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `ai_insights` NÃO TEM COLUNA DE STATUS — invariante 35 da 18-C aplicada aqui.         ║
 * ║                                                                                       ║
 * ║ `vigente`, `expirado`, `dispensado`, `adiado` e `oculto` saem de `expires_at` mais as  ║
 * ║ linhas de `ai_insight_feedback`. Gravar o estado criaria uma segunda verdade que       ║
 * ║ envelhece sozinha: um insight "vigente" na coluna e vencido no prazo, e nenhuma das    ║
 * ║ duas leituras errada isoladamente.                                                     ║
 * ║                                                                                       ║
 * ║ ⛔ PRECEDÊNCIA: **DECISÃO DO DONO > PRAZO.** Ele dispensou; o insight não volta porque ║
 * ║ ainda não venceu, e não deixa de estar dispensado porque venceu. O prazo só decide      ║
 * ║ quando ele não decidiu nada.                                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { dateInSaoPaulo } from "@/lib/format";

export type EstadoDoInsight =
  | "vigente"
  | "expirado"
  | "dispensado"
  | "adiado"
  | "oculto";

export type DecisaoDoDono = "util" | "inutil" | "dispensado" | "adiado" | "nao_mostrar";

export type LinhaDeFeedback = {
  readonly decisao: DecisaoDoDono;
  /** `yyyy-MM-dd`. Obrigatório em `adiado`, ausente nas outras — o CHECK garante no banco. */
  readonly adiado_ate?: string | null;
  /** ISO. A ordem cronológica é o que faz "a última decisão vence". */
  readonly created_at: string;
};

export type EstadoResolvido = {
  readonly estado: EstadoDoInsight;
  /** Preenchido em `adiado`: a data em que ele volta. */
  readonly voltaEm?: string;
  /**
   * `util`/`inutil` NÃO mudam o estado — são sinal para quem lê, não decisão sobre exibir.
   * Vem separado para a tela poder mostrar o polegar sem confundi-lo com dispensar.
   */
  readonly avaliacao?: "util" | "inutil";
};

/**
 * O estado de um insight, agora.
 *
 * @param expiresAt  ISO, de `ai_insights.expires_at`
 * @param feedback   as linhas de `ai_insight_feedback` deste insight, em qualquer ordem
 * @param agora      injetado — nunca `new Date()` aqui dentro
 */
export function estadoDoInsight(
  expiresAt: string,
  feedback: readonly LinhaDeFeedback[],
  agora: Date,
): EstadoResolvido {
  /**
   * ⚠️ Ordenação por `created_at` DECRESCENTE, feita aqui e não confiada à consulta. A tabela
   * é append-only e a mesma decisão pode aparecer várias vezes; quem manda é a última. Deixar
   * a ordem para o `order by` do PostgREST faria esta função dar respostas diferentes
   * conforme quem a chamou — e ela é a que a tela e o card usam.
   */
  const emOrdem = [...feedback].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );

  const avaliacaoLinha = emOrdem.find(
    (f) => f.decisao === "util" || f.decisao === "inutil",
  );
  const avaliacao =
    avaliacaoLinha?.decisao === "util" || avaliacaoLinha?.decisao === "inutil"
      ? avaliacaoLinha.decisao
      : undefined;
  const comAvaliacao = (r: Omit<EstadoResolvido, "avaliacao">): EstadoResolvido =>
    avaliacao ? { ...r, avaliacao } : r;

  // A última decisão de EXIBIÇÃO. `util`/`inutil` não são decisão de exibição.
  const decisao = emOrdem.find(
    (f) =>
      f.decisao === "dispensado" ||
      f.decisao === "adiado" ||
      f.decisao === "nao_mostrar",
  );

  if (decisao?.decisao === "nao_mostrar") return comAvaliacao({ estado: "oculto" });
  if (decisao?.decisao === "dispensado") return comAvaliacao({ estado: "dispensado" });

  if (decisao?.decisao === "adiado" && decisao.adiado_ate) {
    // Data PURA comparada como TEXTO, contra o "hoje" de Brasília. Converter para `Date` só
    // para comparar é como se perde um dia entre 21h e 00h.
    const hoje = dateInSaoPaulo(agora);
    if (decisao.adiado_ate > hoje) {
      return comAvaliacao({ estado: "adiado", voltaEm: decisao.adiado_ate });
    }
    // Adiamento vencido: a decisão do dono se cumpriu e sai de cena. O prazo volta a mandar.
  }

  return comAvaliacao({
    estado: new Date(expiresAt).getTime() <= agora.getTime() ? "expirado" : "vigente",
  });
}

/** O que aparece na lista de vigentes e no card do dashboard. */
export function estaVisivel(estado: EstadoDoInsight): boolean {
  return estado === "vigente";
}
