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
import { drainQueue } from "./session-queue-drain";

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

/** Limpa o rascunho local de uma sessão encerrada. */
export function clearSessionQueue(sessionId: string) {
  writeQueue(sessionId, []);
}

/** uuid do dispositivo — é ele que faz o retry convergir para uma linha só no servidor. */
export function newMutationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback para navegadores sem `randomUUID` em contexto não seguro.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

export type SessionQueue = {
  state: SyncState;
  pending: number;
  lastError: string | null;
  /** Enfileira e tenta enviar. Devolve o id da mutação (o `client_mutation_id`). */
  enqueue: (kind: string, payload: Record<string, unknown>, id?: string) => string;
  /** Reenvia agora (botão "tentar de novo"). */
  flush: () => void;
};

export function useSessionQueue(
  sessionId: string,
  send: Sender,
  /** Chamado quando a fila esvazia com sucesso — o momento de buscar o estado do servidor. */
  onSettled?: () => void,
): SessionQueue {
  const [queue, setQueue] = React.useState<QueuedMutation[]>(() => readQueue(sessionId));
  const [state, setState] = React.useState<SyncState>("salvo");
  const [lastError, setLastError] = React.useState<string | null>(null);

  // Refs sincronizados em efeito (nunca durante o render): guardam a versão mais recente das
  // funções e da fila para o `drain`, que roda fora do ciclo de render.
  const sendRef = React.useRef(send);
  const settledRef = React.useRef(onSettled);
  React.useEffect(() => {
    sendRef.current = send;
    settledRef.current = onSettled;
  }, [send, onSettled]);

  const runningRef = React.useRef(false);
  // `persist` é o ÚNICO escritor deste ref, então ele nunca fica defasado sem passar por lá.
  const queueRef = React.useRef<QueuedMutation[]>(queue);

  const persist = React.useCallback(
    (next: QueuedMutation[]) => {
      queueRef.current = next;
      writeQueue(sessionId, next);
      setQueue(next);
    },
    [sessionId],
  );

  // O laço mora em `session-queue-drain.ts` (puro, testado em node); aqui só se ligam os refs.
  const drain = React.useCallback(
    () =>
      drainQueue({
        running: runningRef,
        queue: () => queueRef.current,
        persist,
        send: (mutation) => sendRef.current(mutation),
        setState,
        setLastError,
        onSettled: () => settledRef.current?.(),
      }),
    [persist],
  );

  const enqueue = React.useCallback(
    (kind: string, payload: Record<string, unknown>, id?: string) => {
      const mutation: QueuedMutation = {
        id: id ?? newMutationId(),
        kind,
        payload,
        createdAt: Date.now(),
      };
      persist([...queueRef.current, mutation]);
      setState("salvo_no_dispositivo");
      void drain();
      return mutation.id;
    },
    [drain, persist],
  );

  // Reconectar, voltar para a aba ou recarregar dispara o reenvio.
  React.useEffect(() => {
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
  }, [drain]);

  // Avisa antes de fechar a aba com coisa na fila. O navegador mostra o diálogo padrão dele.
  React.useEffect(() => {
    if (queue.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [queue.length]);

  return {
    state,
    pending: queue.length,
    lastError,
    enqueue,
    flush: () => void drain(),
  };
}
