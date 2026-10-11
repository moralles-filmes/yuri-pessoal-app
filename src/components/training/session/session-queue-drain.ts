/**
 * Fase 17-C — Treinos · O laço de envio da fila da sessão, fora do React.
 *
 * Extraído de `use-session-queue.ts` na REDESIGN-07-C **sem mudar o comportamento**: o hook
 * continua dono dos refs e do estado; aqui mora só a ordem dos passos, para que um teste em
 * node possa executá-la com armazenamento e envio falsos.
 *
 * ⛔ Uma por vez, em ordem estrita, e `persist` como ÚNICO escritor da fila (ver o hook).
 */
import type { ActionResult } from "@/types/finance";
import type { QueuedMutation, SyncState } from "./use-session-queue";

export type DrainPorts = {
  /** O `runningRef` do hook: impede dois laços na MESMA instância. */
  running: { current: boolean };
  /** Lê o `queueRef` do hook — a fila como ela está agora. */
  queue: () => QueuedMutation[];
  persist: (next: QueuedMutation[]) => void;
  send: (mutation: QueuedMutation) => Promise<ActionResult<unknown>>;
  setState: (state: SyncState) => void;
  setLastError: (error: string | null) => void;
  onSettled: () => void;
};

const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

export async function drainQueue(ports: DrainPorts): Promise<void> {
  if (ports.running.current) return;
  if (ports.queue().length === 0) {
    ports.setState("salvo");
    return;
  }

  if (offline()) {
    ports.setState("aguardando_conexao");
    return;
  }

  ports.running.current = true;
  ports.setState("salvando");

  try {
    // Uma por vez, em ordem: fora de ordem, uma correção poderia ser sobrescrita pelo
    // registro original que ficou preso na fila.
    while (ports.queue().length > 0) {
      const [next, ...rest] = ports.queue();

      let result: ActionResult<unknown>;
      try {
        result = await ports.send(next);
      } catch {
        // Falha de rede: a mutação FICA na fila e tentamos de novo quando voltar.
        ports.setState(offline() ? "aguardando_conexao" : "salvo_no_dispositivo");
        return;
      }

      if (!result.ok) {
        // Recusa do servidor (regra de negócio) não é problema de rede: insistir só
        // repetiria o erro. A mutação sai da fila e o motivo aparece na tela.
        ports.persist(rest);
        ports.setLastError(result.error);
        ports.setState("erro");
        return;
      }

      ports.persist(rest);
      ports.setLastError(null);
    }

    ports.setState("salvo");
    ports.onSettled();
  } finally {
    ports.running.current = false;
  }
}
