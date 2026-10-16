/**
 * Fase 17-C — Treinos · O laço de envio da fila da sessão, fora do React.
 *
 * Extraído de `use-session-queue.ts` na REDESIGN-07-C para que um teste em node possa
 * executá-lo com armazenamento e envio falsos (`session-queue-drain.test.ts`).
 *
 * ⛔ Uma por vez, em ordem estrita, e `persist` como ÚNICO escritor da fila.
 *
 * ═══════════ UMA CÓPIA DA FILA POR SESSÃO, NA ABA (REDESIGN-07-C, D1) ═══════════
 *
 * Até a 07-C cada montagem da tela tinha a SUA cópia da fila e o SEU laço. Sair da sessão
 * para outra seção de /treinos e voltar no meio de um envio deixava dois laços: o novo
 * reenviava o que estava no ar ("iniciar descanso" não é idempotente — reiniciava o
 * descanso) e o antigo, ao receber a resposta, gravava no aparelho a cópia DELE, apagando o
 * que o novo tinha registrado. Pior: mesmo com UMA montagem, o laço gravava a cópia da fila
 * tirada ANTES do envio, e a série confirmada enquanto outra estava no ar sumia quando ela
 * voltava.
 *
 * O registro abaixo fecha os dois pela estrutura, não por checagem:
 *   • a fila de uma sessão existe UMA vez na aba (carregada do aparelho no primeiro acesso);
 *     toda montagem lê a mesma, por `useSyncExternalStore`;
 *   • o laço é da sessão, não da montagem — `running` é um só;
 *   • a montagem mais recente é a DONA (`assumir` no efeito de montagem, `soltar` no de
 *     desmontagem), e o laço confere a posse ANTES DE CADA ENVIO: sem dona, ele para;
 *   • o que estava no ar quando a dona saiu termina e é retirado da fila ATUAL — nunca de uma
 *     cópia de antes do envio.
 *
 * ⚠️ Consequência declarada (spec 07-C §6.1): sair da tela da sessão PAUSA o envio até voltar
 * a ela ou abrir a revisão. A fila não se perde — ela está no aparelho e a próxima dona envia.
 * Entre ABAS continuam sendo dois enviadores (o registro é da aba); ali só a idempotência de
 * `registrar_serie`/`adicionar_serie` protege.
 */
import type { ActionResult } from "@/types/finance";
import type { QueuedMutation, SyncState } from "./use-session-queue";

export type DrainPorts = {
  /** Impede dois laços na mesma sessão. */
  running: { current: boolean };
  /** A fila como ela está agora. */
  queue: () => QueuedMutation[];
  persist: (next: QueuedMutation[]) => void;
  /** Há uma tela montada que é dona desta fila? Sem dona, o laço não envia. */
  possui: () => boolean;
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
      // A dona saiu (o dono foi a outra seção de /treinos): para aqui, sem perder nada.
      if (!ports.possui()) {
        ports.setState("salvo_no_dispositivo");
        return;
      }

      const next = ports.queue()[0];
      // Retira a mutação enviada da fila de AGORA: o que foi registrado durante o envio
      // (outra série, um ajuste de descanso) não pode sumir quando a resposta chega.
      const semEla = () => ports.queue().filter((mutation) => mutation.id !== next.id);

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
        ports.persist(semEla());
        ports.setLastError(result.error);
        ports.setState("erro");
        return;
      }

      ports.persist(semEla());
      ports.setLastError(null);
    }

    ports.setState("salvo");
    ports.onSettled();
  } finally {
    ports.running.current = false;
  }
}

/* ───────────────────────────── O registro por sessão ───────────────────────────── */

export type InstantaneoDaFila = {
  fila: QueuedMutation[];
  estado: SyncState;
  ultimoErro: string | null;
};

/**
 * O que o servidor "vê": nada. O aparelho não existe no servidor, então o HTML nasce sem
 * fila e o primeiro render do cliente (hidratação) usa este mesmo valor — a fila de verdade
 * aparece no render seguinte. É o que impede a divergência de hidratação.
 */
export const INSTANTANEO_DO_SERVIDOR: InstantaneoDaFila = Object.freeze({
  fila: [],
  estado: "salvo",
  ultimoErro: null,
}) as InstantaneoDaFila;

export type PortasDaDona = {
  send: (mutation: QueuedMutation) => Promise<ActionResult<unknown>>;
  /** Chamado quando a fila esvazia com sucesso — o momento de buscar o estado do servidor. */
  onSettled?: () => void;
};

/** Onde a fila sobrevive a recarregar (o `localStorage`, no app). */
export type Aparelho = {
  ler: (sessionId: string) => QueuedMutation[];
  gravar: (sessionId: string, fila: QueuedMutation[]) => void;
};

export type RegistroDeFilas = {
  instantaneo: (sessionId: string) => InstantaneoDaFila;
  assinar: (sessionId: string, ouvinte: () => void) => () => void;
  assumir: (sessionId: string, portas: PortasDaDona) => symbol;
  soltar: (sessionId: string, posse: symbol) => void;
  enfileirar: (sessionId: string, mutation: QueuedMutation) => void;
  drenar: (sessionId: string) => Promise<void>;
  limpar: (sessionId: string) => void;
};

type Sessao = {
  instantaneo: InstantaneoDaFila;
  running: { current: boolean };
  dono: { posse: symbol; portas: PortasDaDona } | null;
  /** As portas da última dona — o laço só as usa enquanto houver dona (ver `possui`). */
  portas: PortasDaDona | null;
  ouvintes: Set<() => void>;
};

export function criarRegistroDeFilas(aparelho: Aparelho): RegistroDeFilas {
  const sessoes = new Map<string, Sessao>();

  const garantir = (sessionId: string): Sessao => {
    let sessao = sessoes.get(sessionId);
    if (!sessao) {
      sessao = {
        instantaneo: { fila: aparelho.ler(sessionId), estado: "salvo", ultimoErro: null },
        running: { current: false },
        dono: null,
        portas: null,
        ouvintes: new Set(),
      };
      sessoes.set(sessionId, sessao);
    }
    return sessao;
  };

  const definir = (sessao: Sessao, parcial: Partial<InstantaneoDaFila>) => {
    sessao.instantaneo = { ...sessao.instantaneo, ...parcial };
    for (const ouvinte of sessao.ouvintes) ouvinte();
  };

  // ⛔ O ÚNICO escritor da fila: memória da aba e aparelho juntos.
  const persist = (sessionId: string, sessao: Sessao, fila: QueuedMutation[]) => {
    aparelho.gravar(sessionId, fila);
    definir(sessao, { fila });
  };

  return {
    instantaneo: (sessionId) => garantir(sessionId).instantaneo,

    assinar: (sessionId, ouvinte) => {
      const sessao = garantir(sessionId);
      sessao.ouvintes.add(ouvinte);
      return () => sessao.ouvintes.delete(ouvinte);
    },

    assumir: (sessionId, portas) => {
      const sessao = garantir(sessionId);
      const posse = Symbol(sessionId);
      sessao.dono = { posse, portas };
      sessao.portas = portas;
      return posse;
    },

    soltar: (sessionId, posse) => {
      const sessao = garantir(sessionId);
      if (sessao.dono?.posse === posse) sessao.dono = null;
    },

    enfileirar: (sessionId, mutation) => {
      const sessao = garantir(sessionId);
      persist(sessionId, sessao, [...sessao.instantaneo.fila, mutation]);
      definir(sessao, { estado: "salvo_no_dispositivo" });
    },

    drenar: (sessionId) => {
      const sessao = garantir(sessionId);
      return drainQueue({
        running: sessao.running,
        queue: () => sessao.instantaneo.fila,
        persist: (fila) => persist(sessionId, sessao, fila),
        possui: () => sessao.dono !== null,
        send: (mutation) => {
          if (!sessao.portas) return Promise.reject(new Error("fila sem dona"));
          return sessao.portas.send(mutation);
        },
        setState: (estado) => definir(sessao, { estado }),
        setLastError: (ultimoErro) => definir(sessao, { ultimoErro }),
        onSettled: () => sessao.dono?.portas.onSettled?.(),
      });
    },

    limpar: (sessionId) => {
      const sessao = garantir(sessionId);
      persist(sessionId, sessao, []);
      if (!sessao.running.current) definir(sessao, { estado: "salvo", ultimoErro: null });
    },
  };
}
