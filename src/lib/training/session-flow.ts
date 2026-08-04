/**
 * Fase 17-C — Treinos · O que vem agora (PURO, sem I/O, sem `Date.now()`).
 *
 * ═══════════════════ A REGRA QUE ESTE ARQUIVO EXISTE PARA GARANTIR ═══════════════════
 *
 *   **Concluir a 3ª de 4 séries leva para a 4ª SÉRIE — não para outro exercício.**
 *
 * É um critério de aceite literal, e é o erro mais fácil de cometer: quem pensa a tela como
 * "lista de exercícios" avança o cursor da lista a cada registro. O sistema **não** troca de
 * exercício enquanto houver série pendente no exercício atual, salvo escolha manual explícita.
 *
 * ═══════════════════ SUPERSET ALTERNA ANTES DE REPETIR A RODADA ═══════════════════
 *
 * Num bloco A/B, a ordem é A1 → B1 → A2 → B2 — não A1 → A2 → A3 → B1. A regra usada aqui:
 * dentro do bloco, o próximo é o exercício cuja **próxima série pendente tem o menor número**;
 * empate resolve pela ordem, começando depois do exercício atual (é o que faz alternar em vez
 * de repetir). Circuito de três ou mais exercícios sai da mesma regra, sem caso especial.
 *
 * ═══════════════════ NADA SE PERDE AO REORDENAR ═══════════════════
 *
 * As funções de ordem devolvem novas `executedPosition` e **nunca tocam em `plannedPosition`**
 * nem nas séries: as séries pertencem ao exercício, não à posição.
 */
import {
  hasPendingSets,
  isSetDone,
  isSetPending,
  isSetResolved,
  type SetLike,
} from "./session-machine";
import type { SessionExerciseStatus, SessionSetStatus } from "./constants";

/* ───────────────────────────── Entradas mínimas ───────────────────────────── */

export type FlowSet = {
  id: string;
  setNumber: number;
  status: SessionSetStatus;
  isWarmup?: boolean;
};

export type FlowExercise = {
  id: string;
  executedPosition: number;
  status: SessionExerciseStatus;
  supersetGroup: string | null;
  sets: FlowSet[];
};

/* ───────────────────────────── O próximo passo ───────────────────────────── */

export type FlowReason =
  | "serie_do_mesmo_exercicio"
  | "alternancia_de_superset"
  | "proximo_exercicio"
  | "exercicio_anterior_em_aberto";

export const FLOW_REASON_LABELS: Record<FlowReason, string> = {
  serie_do_mesmo_exercicio: "Próxima série deste exercício",
  alternancia_de_superset: "Próximo exercício do bloco",
  proximo_exercicio: "Próximo exercício",
  exercicio_anterior_em_aberto: "Exercício que ficou em aberto",
};

export type FlowStep =
  | {
      kind: "serie";
      exerciseId: string;
      setId: string;
      setNumber: number;
      executedPosition: number;
      reason: FlowReason;
    }
  | { kind: "fim"; reason: "tudo_resolvido" };

/** A próxima série pendente de um exercício (a de menor número). `null` quando não há. */
export function nextPendingSet(exercise: FlowExercise): FlowSet | null {
  if (exercise.status === "pulado" || exercise.status === "substituido") return null;
  return (
    [...exercise.sets]
      .filter((set) => isSetPending(set.status))
      .sort((a, b) => a.setNumber - b.setNumber)[0] ?? null
  );
}

/** Exercícios na ordem executada (empate: ordem de chegada, para o resultado ser estável). */
export function orderedExercises(exercises: FlowExercise[]): FlowExercise[] {
  return [...exercises]
    .map((exercise, index) => ({ exercise, index }))
    .sort((a, b) => a.exercise.executedPosition - b.exercise.executedPosition || a.index - b.index)
    .map(({ exercise }) => exercise);
}

/** Os exercícios do bloco de superset ao qual `exercise` pertence (posições CONTÍGUAS). */
export function supersetPeers(
  exercises: FlowExercise[],
  exerciseId: string,
): FlowExercise[] {
  const ordered = orderedExercises(exercises);
  const index = ordered.findIndex((item) => item.id === exerciseId);
  if (index < 0) return [];

  const group = ordered[index].supersetGroup?.trim() || null;
  if (!group) return [];

  // Expande para trás e para frente enquanto o grupo for o mesmo: um "A" isolado longe do bloco
  // não entra, exatamente como `validateSupersets` (17-B) já recusa no construtor.
  let start = index;
  while (start > 0 && (ordered[start - 1].supersetGroup?.trim() || null) === group) start -= 1;
  let end = index;
  while (end < ordered.length - 1 && (ordered[end + 1].supersetGroup?.trim() || null) === group) {
    end += 1;
  }

  const block = ordered.slice(start, end + 1);
  return block.length >= 2 ? block : [];
}

/**
 * O próximo passo da sessão.
 *
 * @param current id do exercício em foco. `null` = começar do início (retomada de sessão).
 */
export function nextStep(exercises: FlowExercise[], current: string | null): FlowStep {
  const ordered = orderedExercises(exercises);
  if (ordered.length === 0) return { kind: "fim", reason: "tudo_resolvido" };

  const currentExercise = current ? ordered.find((item) => item.id === current) : undefined;

  if (currentExercise) {
    const peers = supersetPeers(ordered, currentExercise.id);

    if (peers.length >= 2) {
      const inBlock = nextInSuperset(peers, currentExercise.id);
      if (inBlock) return inBlock;
      // Bloco inteiro resolvido: segue para o próximo exercício depois do bloco.
      const lastOfBlock = peers[peers.length - 1];
      const after = nextAvailableAfter(ordered, lastOfBlock.executedPosition);
      if (after) return after;
    } else {
      // ⛔ A REGRA: série pendente no exercício atual vence qualquer avanço de lista.
      const pending = nextPendingSet(currentExercise);
      if (pending) {
        return {
          kind: "serie",
          exerciseId: currentExercise.id,
          setId: pending.id,
          setNumber: pending.setNumber,
          executedPosition: currentExercise.executedPosition,
          reason: "serie_do_mesmo_exercicio",
        };
      }
      const after = nextAvailableAfter(ordered, currentExercise.executedPosition);
      if (after) return after;
    }
  }

  // Sem foco (ou nada à frente): o primeiro exercício em aberto, do começo.
  const first = ordered.find((exercise) => nextPendingSet(exercise) !== null);
  if (!first) return { kind: "fim", reason: "tudo_resolvido" };

  const pending = nextPendingSet(first)!;
  return {
    kind: "serie",
    exerciseId: first.id,
    setId: pending.id,
    setNumber: pending.setNumber,
    executedPosition: first.executedPosition,
    // Quando havia foco e voltamos para trás, é porque um exercício ficou em aberto.
    reason: currentExercise ? "exercicio_anterior_em_aberto" : "proximo_exercicio",
  };
}

/** Alternância dentro do bloco: menor número de série pendente; empate, o próximo da ordem. */
function nextInSuperset(block: FlowExercise[], currentId: string): FlowStep | null {
  const currentIndex = block.findIndex((item) => item.id === currentId);
  if (currentIndex < 0) return null;

  // Rotaciona para começar DEPOIS do atual: é o que faz A1 → B1 em vez de A1 → A2.
  const rotated = [
    ...block.slice(currentIndex + 1),
    ...block.slice(0, currentIndex + 1),
  ];

  let best: { exercise: FlowExercise; set: FlowSet } | null = null;
  for (const exercise of rotated) {
    const set = nextPendingSet(exercise);
    if (!set) continue;
    if (!best || set.setNumber < best.set.setNumber) best = { exercise, set };
  }
  if (!best) return null;

  return {
    kind: "serie",
    exerciseId: best.exercise.id,
    setId: best.set.id,
    setNumber: best.set.setNumber,
    executedPosition: best.exercise.executedPosition,
    reason: best.exercise.id === currentId ? "serie_do_mesmo_exercicio" : "alternancia_de_superset",
  };
}

/** O primeiro exercício com série pendente depois de uma posição. */
function nextAvailableAfter(ordered: FlowExercise[], position: number): FlowStep | null {
  for (const exercise of ordered) {
    if (exercise.executedPosition <= position) continue;
    const set = nextPendingSet(exercise);
    if (!set) continue;
    return {
      kind: "serie",
      exerciseId: exercise.id,
      setId: set.id,
      setNumber: set.setNumber,
      executedPosition: exercise.executedPosition,
      reason: "proximo_exercicio",
    };
  }
  return null;
}

/* ───────────────────────────── Progresso ───────────────────────────── */

export type FlowProgress = {
  exercisesTotal: number;
  exercisesDone: number;
  /** Exercícios que ainda esperam alguma coisa (nem pulados, nem substituídos, nem resolvidos). */
  exercisesOpen: number;
  setsTotal: number;
  setsDone: number;
  setsPending: number;
  setsSkipped: number;
  warmupDone: number;
  /** 0..1. `null` quando não há série nenhuma — e não 0%, que sugeriria "começou e não fez nada". */
  ratio: number | null;
};

export function summarizeFlow(exercises: FlowExercise[]): FlowProgress {
  let setsTotal = 0;
  let setsDone = 0;
  let setsPending = 0;
  let setsSkipped = 0;
  let warmupDone = 0;
  let exercisesDone = 0;
  let exercisesOpen = 0;

  for (const exercise of exercises) {
    const active = exercise.status !== "pulado" && exercise.status !== "substituido";
    let pendingHere = 0;

    for (const set of exercise.sets) {
      setsTotal += 1;
      if (isSetDone(set.status)) {
        setsDone += 1;
        if (set.isWarmup) warmupDone += 1;
      } else if (set.status === "pulada" || set.status === "cancelada") {
        setsSkipped += 1;
      }
      if (isSetPending(set.status)) {
        setsPending += 1;
        if (active) pendingHere += 1;
      }
    }

    if (!active) continue;
    if (exercise.sets.length > 0 && exercise.sets.every((set) => isSetResolved(set.status))) {
      exercisesDone += 1;
    } else if (pendingHere > 0) {
      exercisesOpen += 1;
    }
  }

  return {
    exercisesTotal: exercises.length,
    exercisesDone,
    exercisesOpen,
    setsTotal,
    setsDone,
    setsPending,
    setsSkipped,
    warmupDone,
    ratio: setsTotal === 0 ? null : (setsDone + setsSkipped) / setsTotal,
  };
}

/** A sessão pode ser dada como terminada sem deixar nada para trás? */
export const isFlowComplete = (exercises: FlowExercise[]): boolean =>
  exercises.every((exercise) => !hasPendingSets(exercise.status, exercise.sets as SetLike[]));

/* ───────────────────────────── Reordenação ─────────────────────────────
 * Todas devolvem a lista com `executedPosition` renumerada de 0..n-1. Nenhuma toca em
 * `plannedPosition` nem nas séries — reordenar não pode perder nada.
 */

export type Reorderable = { id: string; executedPosition: number };

const renumber = <T extends Reorderable>(items: T[]): T[] =>
  items.map((item, index) => ({ ...item, executedPosition: index }));

const sorted = <T extends Reorderable>(items: T[]): T[] =>
  [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.executedPosition - b.item.executedPosition || a.index - b.index)
    .map(({ item }) => item);

/** Aplica uma ordem vinda da tela (ids). Quem ficou de fora vai para o fim, na ordem antiga. */
export function applyExecutedOrder<T extends Reorderable>(items: T[], orderedIds: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const result: T[] = [];

  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item) {
      result.push(item);
      byId.delete(id);
    }
  }
  for (const item of sorted([...byId.values()])) result.push(item);

  return renumber(result);
}

/** Move um item uma casa (alternativa por teclado ao arrastar — acessibilidade). */
export function moveExercise<T extends Reorderable>(items: T[], id: string, offset: number): T[] {
  const ordered = sorted(items);
  const from = ordered.findIndex((item) => item.id === id);
  if (from < 0) return renumber(ordered);

  const to = Math.min(ordered.length - 1, Math.max(0, from + offset));
  if (to === from) return renumber(ordered);

  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return renumber(next);
}

/** "Fazer este agora": traz o exercício para logo depois do atual, sem embaralhar o resto. */
export function makeNext<T extends Reorderable>(
  items: T[],
  targetId: string,
  currentId: string | null,
): T[] {
  const ordered = sorted(items);
  const targetIndex = ordered.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return renumber(ordered);

  const currentIndex = currentId ? ordered.findIndex((item) => item.id === currentId) : -1;
  const destination = currentIndex < 0 ? 0 : currentIndex + 1;
  if (targetIndex === destination) return renumber(ordered);

  const next = [...ordered];
  const [moved] = next.splice(targetIndex, 1);
  // Remover antes desloca o destino em uma casa quando o alvo estava à esquerda.
  const insertAt = targetIndex < destination ? destination - 1 : destination;
  next.splice(insertAt, 0, moved);
  return renumber(next);
}

/** "Deixar para o fim" — o caso do aparelho ocupado. */
export function moveToEnd<T extends Reorderable>(items: T[], id: string): T[] {
  const ordered = sorted(items);
  const index = ordered.findIndex((item) => item.id === id);
  if (index < 0 || index === ordered.length - 1) return renumber(ordered);

  const next = [...ordered];
  const [moved] = next.splice(index, 1);
  next.push(moved);
  return renumber(next);
}
