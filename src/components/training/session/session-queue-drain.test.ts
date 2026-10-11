/**
 * REDESIGN-07-C · D1 — a fila da sessão não perde o que o dono registrou.
 *
 * Roda o laço de envio REAL (`drainQueue`) e as funções REAIS de armazenamento
 * (`readQueue`/`writeQueue`/`clearSessionQueue`) com um `localStorage` em memória e um envio
 * falso. O projeto não tem teste de componente (invariante 25): `montar()` reproduz o que o
 * hook `useSessionQueue` faz na montagem, no registro, no envio e na desmontagem. As
 * ASSERÇÕES são o contrato; `montar()` acompanha o hook.
 *
 * ⚠️ D1 (1/2): `montar()` reproduz o hook de HOJE (cada instância com a sua cópia da fila,
 * nada interrompe o laço ao desmontar). Os testes de S1/S2 ficam vermelhos pelo motivo
 * certo; o (2/2) troca o hook e, com ele, `montar()`.
 *
 * Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/types/finance";
import { drainQueue } from "./session-queue-drain";
import { podeEncerrar } from "./session-queue-view";
import {
  clearSessionQueue,
  readQueue,
  writeQueue,
  type QueuedMutation,
  type SyncState,
} from "./use-session-queue";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

/** Modo privado / cota estourada: toda leitura e escrita lança. */
class StorageQuebrado {
  getItem(): string | null {
    throw new Error("indisponível");
  }
  setItem() {
    throw new Error("indisponível");
  }
  removeItem() {
    throw new Error("indisponível");
  }
}

const SID = "sessao-sintetica";
const mut = (id: string, kind = "registrar_serie"): QueuedMutation => ({
  id,
  kind,
  payload: {},
  createdAt: 0,
});
const ids = (fila: QueuedMutation[]) => fila.map((m) => m.id);
const tique = () => new Promise((resolve) => setTimeout(resolve, 0));

type Envio = (m: QueuedMutation) => Promise<ActionResult<unknown>>;

/** Uma instância do hook — como `useSessionQueue` (de hoje) monta, envia e desmonta. */
function montar(send: Envio, sessionId = SID) {
  const estado = { atual: "salvo" as SyncState, erro: null as string | null };
  const queueRef = { current: readQueue(sessionId) };
  const running = { current: false };
  const persist = (next: QueuedMutation[]) => {
    queueRef.current = next;
    writeQueue(sessionId, next);
  };
  const drenar = () =>
    drainQueue({
      running,
      queue: () => queueRef.current,
      persist,
      send,
      setState: (s) => (estado.atual = s),
      setLastError: (e) => (estado.erro = e),
      onSettled: () => {},
    });
  return {
    drenar,
    enfileirar: (m: QueuedMutation) => {
      persist([...queueRef.current, m]);
      estado.atual = "salvo_no_dispositivo";
      void drenar();
    },
    // Hoje a desmontagem só limpa o intervalo de 15 s: um laço em andamento segue sozinho.
    desmontar: () => {},
    /** O que a revisão chama depois de finalizar, encerrar ou descartar. */
    limpar: () => clearSessionQueue(sessionId),
    fila: () => queueRef.current,
    estado: () => estado,
  };
}

/** Envio cuja resposta o teste decide quando chega. */
function redeControlada() {
  const chamadas: string[] = [];
  const respostas: Array<(r: ActionResult<unknown>) => void> = [];
  const send: Envio = (m) => {
    chamadas.push(m.id);
    return new Promise<ActionResult<unknown>>((resolve) => respostas.push(resolve));
  };
  const responder = (i: number, r: ActionResult<unknown> = { ok: true, data: null }) =>
    respostas[i](r);
  return { chamadas, send, responder };
}

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: new MemoryStorage() });
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("S2 — a cópia velha da fila não apaga o que foi registrado depois", () => {
  it("remontar no meio de um envio: a nova instância não reenvia o que estava no ar e o registro dela não some", async () => {
    writeQueue(SID, [mut("descanso-1", "iniciar_descanso"), mut("serie-2")]);
    const rede = redeControlada();

    const A = montar(rede.send);
    void A.drenar();
    await tique();
    expect(rede.chamadas).toEqual(["descanso-1"]);

    // O dono foi a outra seção de /treinos e voltou: A desmonta, B monta.
    A.desmontar();
    const B = montar(rede.send);
    void B.drenar();
    await tique();
    // "iniciar descanso" não é idempotente: enviá-lo de novo reinicia o descanso.
    expect(rede.chamadas).toEqual(["descanso-1"]);

    B.enfileirar(mut("serie-3"));
    await tique();
    rede.responder(0);
    await tique();
    expect(ids(readQueue(SID))).toEqual(["serie-2", "serie-3"]);
    expect(rede.chamadas).toEqual(["descanso-1", "serie-2"]);
  });

  it("uma instância só: o registro feito enquanto outro está no ar não some quando ele volta", async () => {
    const rede = redeControlada();
    const A = montar(rede.send);

    A.enfileirar(mut("serie-3"));
    await tique();
    expect(rede.chamadas).toEqual(["serie-3"]);

    A.enfileirar(mut("serie-4")); // confirmada enquanto a 3 ainda está sendo enviada
    await tique();
    rede.responder(0);
    await tique();
    expect(ids(readQueue(SID))).toEqual(["serie-4"]);
    expect(rede.chamadas).toEqual(["serie-3", "serie-4"]);
  });

  it("a instância que desmontou não envia mais nada: sair da sessão pausa o envio", async () => {
    writeQueue(SID, [mut("serie-1"), mut("serie-2")]);
    const rede = redeControlada();
    const A = montar(rede.send);
    void A.drenar();
    await tique();

    A.desmontar();
    rede.responder(0); // o que estava no ar chega e é retirado da fila
    await tique();
    expect(rede.chamadas).toEqual(["serie-1"]);
    expect(ids(readQueue(SID))).toEqual(["serie-2"]);
    expect(A.estado().atual).toBe("salvo_no_dispositivo");
  });
});

describe("S1 — finalizar não apaga o que está só no aparelho", () => {
  it("série presa no aparelho (rede caiu): a revisão assume a fila e não finaliza enquanto ela não chegar", async () => {
    writeQueue(SID, [mut("serie-3")]);
    const send = vi.fn<Envio>(() => Promise.reject(new TypeError("Failed to fetch")));
    const A = montar(send);
    await A.drenar();
    expect(A.estado().atual).toBe("salvo_no_dispositivo");

    A.desmontar();
    const revisao = montar(send);
    expect(podeEncerrar({ pending: revisao.fila().length })).toEqual({
      ok: false,
      motivo: "1 registro deste aparelho ainda não chegou ao servidor.",
    });
    expect(ids(readQueue(SID))).toEqual(["serie-3"]);
  });

  it("limpar a fila com um envio no ar não a faz ressuscitar quando ele volta", async () => {
    writeQueue(SID, [mut("serie-3"), mut("serie-4"), mut("descanso-5", "iniciar_descanso")]);
    const rede = redeControlada();
    const A = montar(rede.send);
    void A.drenar();
    await tique();

    A.limpar(); // descartar (ou finalizar) com a série 3 no ar
    expect(readQueue(SID)).toEqual([]);

    rede.responder(0);
    await tique();
    expect(readQueue(SID)).toEqual([]);
    expect(rede.chamadas).toEqual(["serie-3"]);
  });
});

describe("o que já funciona e não pode regredir", () => {
  it("armazenamento indisponível: a fila vive em memória e é enviada", async () => {
    vi.stubGlobal("window", { localStorage: new StorageQuebrado() });
    const rede = redeControlada();
    const A = montar(rede.send);

    A.enfileirar(mut("serie-1"));
    await tique();
    expect(rede.chamadas).toEqual(["serie-1"]);
    expect(ids(A.fila())).toEqual(["serie-1"]); // ainda em memória enquanto está no ar

    rede.responder(0);
    await tique();
    expect(A.fila()).toEqual([]);
    expect(A.estado().atual).toBe("salvo");
  });

  it("duas sessões na mesma aba: a fila e o estado de uma não aparecem na outra", async () => {
    writeQueue("sessao-a", [mut("a-1")]);
    const send = vi.fn<Envio>(() => Promise.reject(new TypeError("Failed to fetch")));
    const A = montar(send, "sessao-a");
    await A.drenar();

    const B = montar(send, "sessao-b");
    expect(B.fila()).toEqual([]);
    expect(B.estado().atual).toBe("salvo");
    expect(ids(readQueue("sessao-a"))).toEqual(["a-1"]);
  });

  it("recusa do servidor: a mutação sai da fila, o motivo fica e o laço para", async () => {
    writeQueue(SID, [mut("serie-1"), mut("serie-2")]);
    const rede = redeControlada();
    const A = montar(rede.send);
    void A.drenar();
    await tique();

    rede.responder(0, { ok: false, error: "Este treino já foi encerrado." });
    await tique();
    expect(A.estado()).toEqual({ atual: "erro", erro: "Este treino já foi encerrado." });
    expect(ids(readQueue(SID))).toEqual(["serie-2"]);
    expect(rede.chamadas).toEqual(["serie-1"]);
  });
});
