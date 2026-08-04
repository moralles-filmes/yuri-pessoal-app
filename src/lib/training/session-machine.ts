/**
 * Fase 17-C — Treinos · Máquina de estados da sessão (PURO, sem I/O, sem `Date.now()`).
 *
 * ═══════════════════ ESTE É O ÚNICO LUGAR QUE DECIDE O QUE PODE ACONTECER ═══════════════════
 *
 * Sessão    rascunho → pronta → ativa ⇄ descansando ⇄ pausada → concluida
 *                                                             ↘ abandonada / cancelada
 * Exercício pendente → ativo → parcial → concluido
 *                            ↘ pulado / substituido
 * Série     pendente → ativa → concluida
 *                            ↘ pulada / falhou / cancelada
 *
 * Por que uma máquina explícita, e não `if` espalhado pelas actions: a tela ao vivo é usada com
 * uma mão, no celular, com a conexão caindo. Uma fila que reenvia uma mutação atrasada pode
 * chegar depois de a sessão já ter sido concluída — e a resposta certa é **recusar com motivo**,
 * não aplicar por cima. Com as transições num lugar só, essa recusa é a mesma no servidor, no
 * cliente e no teste.
 *
 * ═══════════════════ O QUE É GRAVADO × O QUE É DERIVADO ═══════════════════
 *
 * O status da SESSÃO é gravado: é ele que sustenta o índice único de "nunca duas ativas".
 *
 * O status do EXERCÍCIO grava só DECISÃO (`pendente`, `ativo`, `pulado`, `substituido`).
 * **`parcial` e `concluido` nascem da contagem das séries** (`deriveExerciseStatus`) — mesma
 * disciplina de `atrasada` no TO-DO e do status da fatura. Gravá-los faria o exercício continuar
 * "concluído" depois de o usuário desfazer a última série.
 */
import type {
  DerivedExerciseStatus,
  SessionExerciseStatus,
  SessionSetStatus,
  SessionStatus,
} from "./constants";

/* ───────────────────────────── Resultado de uma transição ───────────────────────────── */

export type TransitionRefusal =
  | "estado_final"
  | "transicao_invalida"
  | "exige_confirmacao"
  | "mesmo_estado";

export type TransitionResult<T extends string> =
  | { ok: true; state: T; changed: boolean }
  | { ok: false; reason: TransitionRefusal; message: string };

export const TRANSITION_MESSAGES: Record<TransitionRefusal, string> = {
  estado_final: "Este treino já foi encerrado.",
  transicao_invalida: "Essa mudança não é possível a partir do estado atual.",
  exige_confirmacao: "Reabrir um treino concluído precisa de confirmação explícita.",
  mesmo_estado: "Nada mudou.",
};

/* ═════════════════════════════════ Sessão ═════════════════════════════════ */

/** Transições normais. O que não está aqui é recusado — a lista é a regra. */
export const SESSION_TRANSITIONS: Record<SessionStatus, readonly SessionStatus[]> = {
  rascunho: ["pronta", "ativa", "cancelada"],
  pronta: ["ativa", "rascunho", "cancelada"],
  ativa: ["descansando", "pausada", "concluida", "abandonada", "cancelada"],
  descansando: ["ativa", "pausada", "concluida", "abandonada", "cancelada"],
  pausada: ["ativa", "descansando", "concluida", "abandonada", "cancelada"],
  // Estados finais: só saem por REABERTURA explícita (abaixo).
  concluida: [],
  abandonada: [],
  cancelada: [],
};

/**
 * Reabertura: existe, mas **nunca acontece por acidente**.
 *
 * "Sessão concluída não volta a ativa sem fluxo explícito" — por isso a saída não está no mapa
 * normal e exige `explicit: true`, que na interface é um diálogo de confirmação, não um botão
 * solto ao lado de "Finalizar".
 */
export const SESSION_REOPEN_TRANSITIONS: Record<string, readonly SessionStatus[]> = {
  concluida: ["ativa"],
  abandonada: ["ativa"],
};

export const FINAL_SESSION_STATUSES: readonly SessionStatus[] = [
  "concluida",
  "abandonada",
  "cancelada",
];

/** A sessão está em execução? É o conjunto que o índice único do banco protege. */
export const RUNNING_SESSION_STATUSES: readonly SessionStatus[] = [
  "ativa",
  "descansando",
  "pausada",
];

export const isSessionRunning = (status: SessionStatus): boolean =>
  RUNNING_SESSION_STATUSES.includes(status);

export const isSessionFinal = (status: SessionStatus): boolean =>
  FINAL_SESSION_STATUSES.includes(status);

/** A sessão ainda está sendo preparada (nada foi executado)? */
export const isSessionDraft = (status: SessionStatus): boolean =>
  status === "rascunho" || status === "pronta";

export function canTransitionSession(
  from: SessionStatus,
  to: SessionStatus,
  options: { explicit?: boolean } = {},
): boolean {
  if (SESSION_TRANSITIONS[from].includes(to)) return true;
  return Boolean(options.explicit) && (SESSION_REOPEN_TRANSITIONS[from] ?? []).includes(to);
}

export function transitionSession(
  from: SessionStatus,
  to: SessionStatus,
  options: { explicit?: boolean } = {},
): TransitionResult<SessionStatus> {
  if (from === to) {
    // Idempotência: a fila local pode reenviar "pausar" duas vezes. Não é erro, mas também
    // não é mudança — quem chama decide se grava (não precisa).
    return { ok: true, state: to, changed: false };
  }
  if (SESSION_TRANSITIONS[from].includes(to)) return { ok: true, state: to, changed: true };

  const reopenable = (SESSION_REOPEN_TRANSITIONS[from] ?? []).includes(to);
  if (reopenable && options.explicit) return { ok: true, state: to, changed: true };
  if (reopenable) {
    return {
      ok: false,
      reason: "exige_confirmacao",
      message: TRANSITION_MESSAGES.exige_confirmacao,
    };
  }
  if (isSessionFinal(from)) {
    return { ok: false, reason: "estado_final", message: TRANSITION_MESSAGES.estado_final };
  }
  return {
    ok: false,
    reason: "transicao_invalida",
    message: TRANSITION_MESSAGES.transicao_invalida,
  };
}

/**
 * A sessão aceita registrar/alterar séries agora?
 *
 * Durante o descanso e durante a pausa, SIM: o usuário corrige o peso que digitou errado
 * enquanto espera, e travar isso transformaria uma correção de três segundos numa sequência de
 * "retomar → corrigir → pausar de novo".
 */
export const acceptsSetWrites = (status: SessionStatus): boolean =>
  isSessionRunning(status) || isSessionDraft(status);

/* ═════════════════════════════════ Exercício ═════════════════════════════════ */

export const EXERCISE_TRANSITIONS: Record<SessionExerciseStatus, readonly SessionExerciseStatus[]> =
  {
    pendente: ["ativo", "pulado", "substituido"],
    // Volta a `pendente` quando o usuário sai do exercício sem registrar nada.
    ativo: ["pendente", "pulado", "substituido"],
    // "Pulei, mas voltei depois" é um critério de aceite literal.
    pulado: ["pendente", "ativo"],
    // Substituído é o fim da linha daquela linha: o substituto é outro exercício da sessão.
    substituido: [],
  };

export function canTransitionExercise(
  from: SessionExerciseStatus,
  to: SessionExerciseStatus,
): boolean {
  return EXERCISE_TRANSITIONS[from].includes(to);
}

export function transitionExercise(
  from: SessionExerciseStatus,
  to: SessionExerciseStatus,
): TransitionResult<SessionExerciseStatus> {
  if (from === to) return { ok: true, state: to, changed: false };
  if (EXERCISE_TRANSITIONS[from].includes(to)) return { ok: true, state: to, changed: true };
  if (from === "substituido") {
    return { ok: false, reason: "estado_final", message: "Este exercício foi substituído." };
  }
  return {
    ok: false,
    reason: "transicao_invalida",
    message: TRANSITION_MESSAGES.transicao_invalida,
  };
}

/* ═════════════════════════════════ Série ═════════════════════════════════ */

export const SET_TRANSITIONS: Record<SessionSetStatus, readonly SessionSetStatus[]> = {
  // Registrar direto (sem passar por "ativa") é o caminho comum: o usuário faz a série e
  // digita o resultado. "ativa" existe para exercício por tempo, que tem começo e fim.
  pendente: ["ativa", "concluida", "falhou", "pulada", "cancelada"],
  ativa: ["concluida", "falhou", "pulada", "cancelada", "pendente"],
  // Desfazer é essencial: digitou 100 em vez de 10 e percebeu depois de salvar.
  concluida: ["pendente", "ativa", "falhou"],
  falhou: ["pendente", "concluida"],
  pulada: ["pendente", "ativa", "concluida"],
  cancelada: ["pendente"],
};

/** Séries que contam como "feitas" para derivar o estado do exercício e o próximo passo. */
export const DONE_SET_STATUSES: readonly SessionSetStatus[] = ["concluida", "falhou"];

/** Séries que não esperam mais nada do usuário (feitas ou descartadas). */
export const RESOLVED_SET_STATUSES: readonly SessionSetStatus[] = [
  "concluida",
  "falhou",
  "pulada",
  "cancelada",
];

export const isSetDone = (status: SessionSetStatus): boolean =>
  DONE_SET_STATUSES.includes(status);

export const isSetResolved = (status: SessionSetStatus): boolean =>
  RESOLVED_SET_STATUSES.includes(status);

export const isSetPending = (status: SessionSetStatus): boolean => !isSetResolved(status);

export function canTransitionSet(from: SessionSetStatus, to: SessionSetStatus): boolean {
  return SET_TRANSITIONS[from].includes(to);
}

export function transitionSet(
  from: SessionSetStatus,
  to: SessionSetStatus,
): TransitionResult<SessionSetStatus> {
  if (from === to) return { ok: true, state: to, changed: false };
  if (SET_TRANSITIONS[from].includes(to)) return { ok: true, state: to, changed: true };
  return {
    ok: false,
    reason: "transicao_invalida",
    message: TRANSITION_MESSAGES.transicao_invalida,
  };
}

/* ═════════════════════════ Status derivado do exercício ═════════════════════════ */

export type SetLike = { status: SessionSetStatus };

/**
 * O status APRESENTADO de um exercício da sessão.
 *
 * Decisão do usuário (`pulado`, `substituido`) sempre vence — um exercício pulado com uma série
 * solta registrada continua pulado, porque foi isso que ele decidiu.
 *
 * Fora disso, a contagem manda:
 *   • nenhuma série feita        → o status gravado (`pendente` ou `ativo`)
 *   • todas as séries resolvidas → `concluido`
 *   • algumas feitas             → `parcial`
 *
 * "Resolvidas" inclui pulada e cancelada: um exercício com 3 séries feitas e 1 pulada está
 * encerrado — não fica eternamente "parcial" esperando algo que o usuário já dispensou.
 */
export function deriveExerciseStatus(
  stored: SessionExerciseStatus,
  sets: SetLike[],
): DerivedExerciseStatus {
  if (stored === "pulado" || stored === "substituido") return stored;
  if (sets.length === 0) return stored;

  const done = sets.filter((set) => isSetDone(set.status)).length;
  const resolved = sets.filter((set) => isSetResolved(set.status)).length;

  if (done === 0) return stored;
  if (resolved === sets.length) return "concluido";
  return "parcial";
}

/** O exercício ainda tem série esperando o usuário? */
export function hasPendingSets(stored: SessionExerciseStatus, sets: SetLike[]): boolean {
  if (stored === "pulado" || stored === "substituido") return false;
  return sets.some((set) => isSetPending(set.status));
}

/* ═════════════════════════ Guardas de fluxo da sessão ═════════════════════════
 * Regras que a interface e as actions consultam ANTES de agir, para a recusa vir com motivo em
 * pt-BR em vez de erro de banco.
 */

export type SessionGuard = { allowed: boolean; message?: string };

/** Não iniciar descanso para série não concluída, salvo comando explícito do usuário. */
export function canStartRest(
  setStatus: SessionSetStatus | null,
  options: { explicit?: boolean } = {},
): SessionGuard {
  if (options.explicit) return { allowed: true };
  if (setStatus === null) {
    return {
      allowed: false,
      message: "Escolha a série que acabou de fazer, ou inicie o descanso manualmente.",
    };
  }
  if (!isSetDone(setStatus)) {
    return {
      allowed: false,
      message: "Esta série ainda não foi concluída. Registre a série ou inicie o descanso manualmente.",
    };
  }
  return { allowed: true };
}

/** Não finalizar sessão com série ativa sem confirmação. */
export function canFinishSession(
  sets: SetLike[],
  options: { confirmed?: boolean } = {},
): SessionGuard {
  const active = sets.filter((set) => set.status === "ativa").length;
  if (active === 0 || options.confirmed) return { allowed: true };
  return {
    allowed: false,
    message:
      active === 1
        ? "Há uma série em andamento. Confirme para finalizar mesmo assim."
        : `Há ${active} séries em andamento. Confirme para finalizar mesmo assim.`,
  };
}

/**
 * Só uma sessão em execução por vez.
 *
 * A recusa não é uma parede: a interface oferece continuar a anterior, finalizá-la ou
 * descartá-la. O que não existe é começar a segunda em silêncio e deixar duas sessões abertas.
 */
export function canStartNewSession(runningCount: number): SessionGuard {
  if (runningCount === 0) return { allowed: true };
  return {
    allowed: false,
    message: "Você já tem um treino em andamento. Continue, finalize ou descarte antes de começar outro.",
  };
}
