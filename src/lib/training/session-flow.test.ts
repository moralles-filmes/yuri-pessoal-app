/**
 * Fase 17-C — Treinos · Testes do fluxo da sessão.
 *
 * O teste central deste arquivo é literal do critério de aceite:
 *
 *   **concluir a 3ª de 4 séries leva para a 4ª SÉRIE, não para outro exercício.**
 *
 * Ele parece óbvio até alguém modelar a tela como "lista de exercícios" e avançar o cursor da
 * lista a cada registro. Por isso ele está aqui, isolado, com nome explícito.
 */
import { describe, expect, it } from "vitest";
import {
  applyExecutedOrder,
  isFlowComplete,
  makeNext,
  moveExercise,
  moveToEnd,
  nextPendingSet,
  nextStep,
  orderedExercises,
  summarizeFlow,
  supersetPeers,
  type FlowExercise,
  type FlowSet,
} from "./session-flow";
import type { SessionSetStatus } from "./constants";

/* ───────────────────────────── Fábricas ───────────────────────────── */

function makeSets(exerciseId: string, statuses: SessionSetStatus[], warmup = 0): FlowSet[] {
  return statuses.map((status, index) => ({
    id: `${exerciseId}-s${index + 1}`,
    setNumber: index + 1,
    status,
    isWarmup: index < warmup,
  }));
}

function makeExercise(
  id: string,
  position: number,
  statuses: SessionSetStatus[],
  patch: Partial<FlowExercise> = {},
): FlowExercise {
  return {
    id,
    executedPosition: position,
    status: "pendente",
    supersetGroup: null,
    sets: makeSets(id, statuses),
    ...patch,
  };
}

const P = "pendente" as const;
const C = "concluida" as const;

/* ═══════════════════════ A regra literal ═══════════════════════ */

describe("nextStep — série pendente vence avanço de exercício", () => {
  it("concluir a 3ª de 4 séries leva para a 4ª SÉRIE do mesmo exercício", () => {
    const exercises = [
      makeExercise("a", 0, [C, C, C, P]),
      makeExercise("b", 1, [P, P, P]),
    ];

    const step = nextStep(exercises, "a");
    expect(step.kind).toBe("serie");
    if (step.kind !== "serie") return;

    expect(step.exerciseId).toBe("a");
    expect(step.setNumber).toBe(4);
    expect(step.reason).toBe("serie_do_mesmo_exercicio");
  });

  it("1 → 2 no mesmo exercício", () => {
    const step = nextStep([makeExercise("a", 0, [C, P, P])], "a");
    expect(step.kind === "serie" && step.setNumber).toBe(2);
  });

  it("concluir a ÚLTIMA série leva para o próximo exercício", () => {
    const exercises = [
      makeExercise("a", 0, [C, C, C, C]),
      makeExercise("b", 1, [P, P, P]),
    ];

    const step = nextStep(exercises, "a");
    expect(step.kind).toBe("serie");
    if (step.kind !== "serie") return;
    expect(step.exerciseId).toBe("b");
    expect(step.setNumber).toBe(1);
    expect(step.reason).toBe("proximo_exercicio");
  });

  it("série pulada não segura o exercício — a próxima pendente é a seguinte", () => {
    const step = nextStep([makeExercise("a", 0, [C, "pulada", P, P])], "a");
    expect(step.kind === "serie" && step.setNumber).toBe(3);
  });

  it("série até a falha conta como feita e libera a próxima", () => {
    const step = nextStep([makeExercise("a", 0, ["falhou", P])], "a");
    expect(step.kind === "serie" && step.setNumber).toBe(2);
  });

  it("exercício sem série pendente é pulado corretamente na busca do próximo", () => {
    const exercises = [
      makeExercise("a", 0, [C]),
      makeExercise("b", 1, [C, C]),
      makeExercise("c", 2, [P]),
    ];
    const step = nextStep(exercises, "a");
    expect(step.kind === "serie" && step.exerciseId).toBe("c");
  });

  it("exercício pulado é ignorado mesmo com séries pendentes", () => {
    const exercises = [
      makeExercise("a", 0, [C]),
      makeExercise("b", 1, [P, P], { status: "pulado" }),
      makeExercise("c", 2, [P]),
    ];
    expect(nextStep(exercises, "a").kind === "serie" && nextStep(exercises, "a")).toMatchObject({
      exerciseId: "c",
    });
  });

  it("exercício substituído é ignorado", () => {
    const exercises = [
      makeExercise("a", 0, [C]),
      makeExercise("b", 1, [P], { status: "substituido" }),
      makeExercise("c", 2, [P]),
    ];
    expect(nextStep(exercises, "a")).toMatchObject({ exerciseId: "c" });
  });

  it("volta para um exercício que ficou em aberto quando não há nada à frente", () => {
    const exercises = [
      makeExercise("a", 0, [C, P]),
      makeExercise("b", 1, [C, C]),
    ];
    const step = nextStep(exercises, "b");
    expect(step).toMatchObject({
      exerciseId: "a",
      setNumber: 2,
      reason: "exercicio_anterior_em_aberto",
    });
  });

  it("sem foco começa do primeiro exercício em aberto (retomada de sessão)", () => {
    const exercises = [
      makeExercise("a", 0, [C, C]),
      makeExercise("b", 1, [C, P]),
    ];
    const step = nextStep(exercises, null);
    expect(step).toMatchObject({ exerciseId: "b", setNumber: 2, reason: "proximo_exercicio" });
  });

  it("tudo resolvido devolve fim", () => {
    const exercises = [makeExercise("a", 0, [C, C]), makeExercise("b", 1, [C, "pulada"])];
    expect(nextStep(exercises, "b")).toEqual({ kind: "fim", reason: "tudo_resolvido" });
    expect(isFlowComplete(exercises)).toBe(true);
  });

  it("sessão sem exercício nenhum devolve fim", () => {
    expect(nextStep([], null)).toEqual({ kind: "fim", reason: "tudo_resolvido" });
  });

  it("exercício por duração segue a mesma regra de série a série", () => {
    const step = nextStep([makeExercise("prancha", 0, [C, P, P])], "prancha");
    expect(step).toMatchObject({ exerciseId: "prancha", setNumber: 2 });
  });
});

/* ═══════════════════════ Superset e circuito ═══════════════════════ */

describe("nextStep — superset alterna antes de repetir a rodada", () => {
  const block = (aStatuses: SessionSetStatus[], bStatuses: SessionSetStatus[]) => [
    makeExercise("a", 0, aStatuses, { supersetGroup: "A" }),
    makeExercise("b", 1, bStatuses, { supersetGroup: "A" }),
    makeExercise("c", 2, [P, P]),
  ];

  it("A1 → B1", () => {
    expect(nextStep(block([C, P, P], [P, P, P]), "a")).toMatchObject({
      exerciseId: "b",
      setNumber: 1,
      reason: "alternancia_de_superset",
    });
  });

  it("B1 → A2 (a rodada avança, não o exercício)", () => {
    expect(nextStep(block([C, P, P], [C, P, P]), "b")).toMatchObject({
      exerciseId: "a",
      setNumber: 2,
    });
  });

  it("A2 → B2", () => {
    expect(nextStep(block([C, C, P], [C, P, P]), "a")).toMatchObject({
      exerciseId: "b",
      setNumber: 2,
    });
  });

  it("bloco inteiro concluído segue para o exercício depois do bloco", () => {
    expect(nextStep(block([C, C, C], [C, C, C]), "b")).toMatchObject({
      exerciseId: "c",
      reason: "proximo_exercicio",
    });
  });

  it("quando o par do bloco acabou, continua no mesmo exercício", () => {
    // B tem 1 série só, já feita; A ainda tem a 2ª.
    const exercises = [
      makeExercise("a", 0, [C, P], { supersetGroup: "A" }),
      makeExercise("b", 1, [C], { supersetGroup: "A" }),
    ];
    expect(nextStep(exercises, "a")).toMatchObject({
      exerciseId: "a",
      setNumber: 2,
      reason: "serie_do_mesmo_exercicio",
    });
  });

  it("circuito de três exercícios roda A1 → B1 → C1 → A2", () => {
    const circuito = (a: SessionSetStatus[], b: SessionSetStatus[], c: SessionSetStatus[]) => [
      makeExercise("a", 0, a, { supersetGroup: "B" }),
      makeExercise("b", 1, b, { supersetGroup: "B" }),
      makeExercise("c", 2, c, { supersetGroup: "B" }),
    ];

    expect(nextStep(circuito([C, P], [P, P], [P, P]), "a")).toMatchObject({ exerciseId: "b" });
    expect(nextStep(circuito([C, P], [C, P], [P, P]), "b")).toMatchObject({ exerciseId: "c" });
    expect(nextStep(circuito([C, P], [C, P], [C, P]), "c")).toMatchObject({
      exerciseId: "a",
      setNumber: 2,
    });
  });

  it("marcação de superset solta não forma bloco (não é contígua com par)", () => {
    const exercises = [
      makeExercise("a", 0, [C, P], { supersetGroup: "A" }),
      makeExercise("b", 1, [P, P]),
    ];
    expect(supersetPeers(exercises, "a")).toHaveLength(0);
    // Sem bloco, vale a regra normal: continua no mesmo exercício.
    expect(nextStep(exercises, "a")).toMatchObject({ exerciseId: "a", setNumber: 2 });
  });

  it("grupos iguais mas separados não viram um bloco só", () => {
    const exercises = [
      makeExercise("a", 0, [P], { supersetGroup: "A" }),
      makeExercise("b", 1, [P]),
      makeExercise("c", 2, [P], { supersetGroup: "A" }),
    ];
    expect(supersetPeers(exercises, "a")).toHaveLength(0);
  });
});

/* ═══════════════════════ Progresso ═══════════════════════ */

describe("summarizeFlow", () => {
  it("conta séries feitas, pendentes, puladas e aquecimento", () => {
    const exercises: FlowExercise[] = [
      {
        id: "a",
        executedPosition: 0,
        status: "ativo",
        supersetGroup: null,
        sets: [
          { id: "a1", setNumber: 1, status: "concluida", isWarmup: true },
          { id: "a2", setNumber: 2, status: "concluida", isWarmup: false },
          { id: "a3", setNumber: 3, status: "pulada", isWarmup: false },
        ],
      },
      makeExercise("b", 1, [P, P]),
    ];

    const summary = summarizeFlow(exercises);
    expect(summary).toMatchObject({
      exercisesTotal: 2,
      exercisesDone: 1,
      exercisesOpen: 1,
      setsTotal: 5,
      setsDone: 2,
      setsPending: 2,
      setsSkipped: 1,
      warmupDone: 1,
    });
    expect(summary.ratio).toBeCloseTo(3 / 5);
  });

  it("sem série nenhuma a proporção é null, não 0%", () => {
    expect(summarizeFlow([]).ratio).toBeNull();
  });

  it("exercício pulado não conta como aberto nem como concluído", () => {
    const exercises = [makeExercise("a", 0, [P, P], { status: "pulado" })];
    const summary = summarizeFlow(exercises);
    expect(summary.exercisesOpen).toBe(0);
    expect(summary.exercisesDone).toBe(0);
  });
});

/* ═══════════════════════ Reordenação ═══════════════════════ */

describe("reordenação preserva tudo", () => {
  const base = () => [
    makeExercise("a", 0, [C, P]),
    makeExercise("b", 1, [C, C]),
    makeExercise("c", 2, [P, P]),
  ];

  it("applyExecutedOrder renumera 0..n-1 e não perde exercício", () => {
    const result = applyExecutedOrder(base(), ["c", "a"]);
    expect(result.map((item) => item.id)).toEqual(["c", "a", "b"]);
    expect(result.map((item) => item.executedPosition)).toEqual([0, 1, 2]);
  });

  it("ids desconhecidos são ignorados", () => {
    const result = applyExecutedOrder(base(), ["zzz", "b"]);
    expect(result.map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("as séries registradas sobrevivem à reordenação", () => {
    const result = applyExecutedOrder(base(), ["c", "b", "a"]);
    const a = result.find((item) => item.id === "a")!;
    expect(a.sets.filter((set) => set.status === "concluida")).toHaveLength(1);
    expect(a.sets).toHaveLength(2);
  });

  it("moveExercise anda uma casa e respeita as bordas", () => {
    expect(moveExercise(base(), "a", -1).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(moveExercise(base(), "a", 1).map((i) => i.id)).toEqual(["b", "a", "c"]);
    expect(moveExercise(base(), "c", 5).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("makeNext traz o exercício para logo depois do atual", () => {
    expect(makeNext(base(), "c", "a").map((i) => i.id)).toEqual(["a", "c", "b"]);
  });

  it("makeNext sem exercício atual leva para o começo", () => {
    expect(makeNext(base(), "c", null).map((i) => i.id)).toEqual(["c", "a", "b"]);
  });

  it("makeNext de quem já está na posição não muda nada", () => {
    expect(makeNext(base(), "b", "a").map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("moveToEnd manda para o fim (aparelho ocupado)", () => {
    expect(moveToEnd(base(), "a").map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(moveToEnd(base(), "c").map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("o fluxo depois de mover para o fim respeita a nova ordem", () => {
    const reordered = moveToEnd(base(), "a") as FlowExercise[];
    // 'b' está concluído; o próximo em aberto passa a ser 'c', e 'a' ficou para o fim.
    expect(nextStep(reordered, "b")).toMatchObject({ exerciseId: "c" });
  });

  it("orderedExercises é estável em empate de posição", () => {
    const items = [makeExercise("x", 1, [P]), makeExercise("y", 1, [P])];
    expect(orderedExercises(items).map((i) => i.id)).toEqual(["x", "y"]);
  });

  it("nextPendingSet devolve a de menor número, não a primeira do array", () => {
    const exercise: FlowExercise = {
      id: "a",
      executedPosition: 0,
      status: "pendente",
      supersetGroup: null,
      sets: [
        { id: "s3", setNumber: 3, status: "pendente" },
        { id: "s2", setNumber: 2, status: "pendente" },
      ],
    };
    expect(nextPendingSet(exercise)?.setNumber).toBe(2);
  });
});
