"use client";

/**
 * Fase 17-C — Treinos · Fila local de mutações da sessão.
 *
 * ═══════════════════ O QUE ISTO É E O QUE NÃO É ═══════════════════
 *
 * **NÃO afirmamos que o app funciona offline.** Não há service worker, não há cache de rotas,
 * recarregar sem rede não abre a tela. O que existe — e é testado — é isto:
 *
 *   • cada mutação é enfileirada e persistida no dispositivo ANTES de ir para o servidor;
 *   • se a rede cair no meio do treino, o usuário continua registrando;
 *   • quando a conexão volta, a fila é reenviada em ordem;
 *   • `client_mutation_id` garante que reenviar não duplica nada.
 *
 * A verdade continua sendo o servidor. O rascunho local guarda só o necessário para
 * reconstruir a fila.
 *
 * ═══════════════════ POR QUE A ORDEM IMPORTA ═══════════════════
 *
 * As mutações são enviadas UMA POR VEZ, em ordem de criação. "Registrar série 3" e "iniciar
 * descanso" fora de ordem produziriam um descanso órfão; e uma correção enviada antes do
 * registro original seria sobrescrita por ele.
 */
import * as React from "react";
import type { ActionResult } from "@/types/finance";
import {
  INSTANTANEO_DO_SERVIDOR,
  criarRegistroDeFilas,
  type InstantaneoDaFila,
} from "./session-queue-drain";
import { estadoExibido } from "./session-queue-view";

export type SyncState =
  | "salvo"
  | "salvando"
  | "salvo_no_dispositivo"
  | "aguardando_conexao"
  | "erro";

export const SYNC_LABELS: Record<SyncState, string> = {
  salvo: "Salvo",
  salvando: "Salvando…",
  salvo_no_dispositivo: "Salvo no dispositivo",
  aguardando_conexao: "Aguardando conexão",
  erro: "Erro ao sincronizar",
};

export type QueuedMutation = {
  /** Identificador da mutação. Vai junto no payload quando a action é idempotente. */
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

type Sender = (mutation: QueuedMutation) => Promise<ActionResult<unknown>>;

const storageKey = (sessionId: string) => `treino:fila:${sessionId}`;

export function readQueue(sessionId: string): QueuedMutation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Armazenamento indisponível (modo privado, cota) não pode derrubar o treino.
    return [];
  }
}

export function writeQueue(sessionId: string, queue: QueuedMutation[]) {
  if (typeof window === "undefined") return;
  try {
    if (queue.length === 0) window.localStorage.removeItem(storageKey(sessionId));
    else window.localStorage.setItem(storageKey(sessionId), JSON.stringify(queue));
  } catch {
    /* sem armazenamento: a fila vive só em memória nesta aba */
  }
}

/**
 * A fila de cada sessão, uma vez só nesta aba (REDESIGN-07-C, D1 — ver
 * `session-queue-drain.ts`). A tela da sessão e a revisão leem e escrevem AQUI; o aparelho é
 * onde ela sobrevive a recarregar.
 */
const filasDaAba = criarRegistroDeFilas({ ler: readQueue, gravar: writeQueue });

/** Limpa a fila de uma sessão encerrada (ou descartada) — na aba e no aparelho. */
export function clearSessionQueue(sessionId: string) {
  filasDaAba.limpar(sessionId);
}

const lerNoServidor = (): InstantaneoDaFila => INSTANTANEO_DO_SERVIDOR;

/** uuid do dispositivo — é ele que faz o retry convergir para uma linha só no servidor. */
export function newMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback para navegadores sem `randomUUID` em contexto não seguro.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

export type SessionQueue = {
  /** Já passa por `estadoExibido`: "salvo" com fila pendente aparece como "salvo no dispositivo". */
  state: SyncState;
  pending: number;
  lastError: string | null;
  /** A fila do aparelho (vazia no servidor e na hidratação; a de verdade no render seguinte). */
  fila: QueuedMutation[];
  /** Enfileira e tenta enviar. Devolve o id da mutação (o `client_mutation_id`). */
  enqueue: (kind: string, payload: Record<string, unknown>, id?: string) => string;
  /** Reenvia agora (botão "tentar de novo" / "enviar agora"). */
  flush: () => void;
};

export function useSessionQueue(
  sessionId: string,
  send: Sender,
  /** Chamado quando a fila esvazia com sucesso — o momento de buscar o estado do servidor. */
  onSettled?: () => void,
  /**
   * `assumir: false` — a tela lê a fila mas não vira dona nem envia (a revisão de um treino já
   * encerrado: não há o que enviar a ele).
   */
  opcoes: { assumir?: boolean } = {},
): SessionQueue {
  const assumir = opcoes.assumir ?? true;

  // Instantâneo de servidor vazio: o servidor não vê o aparelho, e o primeiro render do
  // cliente tem de ser igual ao HTML dele. A fila aparece no render seguinte.
  const assinar = React.useCallback(
    (ouvinte: () => void) => filasDaAba.assinar(sessionId, ouvinte),
    [sessionId],
  );
  const ler = React.useCallback(() => filasDaAba.instantaneo(sessionId), [sessionId]);
  const { fila, estado, ultimoErro } = React.useSyncExternalStore(assinar, ler, lerNoServidor);

  // Refs sincronizados em efeito (nunca durante o render): guardam a versão mais recente das
  // funções para o laço, que roda fora do ciclo de render.
  const sendRef = React.useRef(send);
  const settledRef = React.useRef(onSettled);
  React.useEffect(() => {
    sendRef.current = send;
    settledRef.current = onSettled;
  }, [send, onSettled]);

  // A montagem mais recente é a dona da fila; ao desmontar, solta. Sem dona o laço para antes
  // do próximo envio — nunca duas montagens enviando a mesma fila.
  React.useEffect(() => {
    if (!assumir) return;
    const posse = filasDaAba.assumir(sessionId, {
      send: (mutation) => sendRef.current(mutation),
      onSettled: () => settledRef.current?.(),
    });
    return () => filasDaAba.soltar(sessionId, posse);
  }, [sessionId, assumir]);

  const drain = React.useCallback(
    () => (assumir ? filasDaAba.drenar(sessionId) : Promise.resolve()),
    [sessionId, assumir],
  );

  const enqueue = React.useCallback(
    (kind: string, payload: Record<string, unknown>, id?: string) => {
      const mutation: QueuedMutation = {
        id: id ?? newMutationId(),
        kind,
        payload,
        createdAt: Date.now(),
      };
      filasDaAba.enfileirar(sessionId, mutation);
      void drain();
      return mutation.id;
    },
    [drain, sessionId],
  );

  // Reconectar, voltar para a aba ou recarregar dispara o reenvio.
  React.useEffect(() => {
    if (!assumir) return;
    const retry = () => void drain();

    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", retry);
    const interval = window.setInterval(retry, 15_000);
    // Adiado para fora do corpo do efeito: o `drain` altera estado, e alterar estado
    // sincronamente dentro de um efeito provoca renders em cascata.
    const initial = window.setTimeout(retry, 0);

    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", retry);
      window.clearInterval(interval);
      window.clearTimeout(initial);
    };
  }, [drain, assumir]);

  // Avisa antes de fechar a aba com coisa na fila. O navegador mostra o diálogo padrão dele.
  React.useEffect(() => {
    if (fila.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [fila.length]);

  return {
    state: estadoExibido(estado, fila.length),
    pending: fila.length,
    lastError: ultimoErro,
    fila,
    enqueue,
    flush: () => void drain(),
  };
}
