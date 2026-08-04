/**
 * Fase 17-C — Treinos · Testes dos valores da última vez.
 *
 * O ponto mais delicado aqui é o que este arquivo NÃO faz: `suggestFromPrevious` devolve
 * sugestões, e nada nesta camada aplica valor nenhum. O teste "a sugestão não altera o
 * planejado" existe justamente para travar isso.
 */
import { describe, expect, it } from "vitest";
import {
  bestRecentSet,
  compareToPrevious,
  previousPerformance,
  suggestFromPrevious,
  type HistorySet,
} from "./previous";

function record(patch: Partial<HistorySet> = {}): HistorySet {
  return {
    sessionId: "s-1",
    sessionDate: "2026-07-28",
    workoutId: "w-1",
    exerciseId: "ex-1",
    exerciseName: "Supino reto com barra",
    setNumber: 1,
    status: "concluida",
    reps: 10,
    weightKg: 60,
    additionalWeightKg: null,
    assistanceWeightKg: null,
    durationSeconds: null,
    distanceM: null,
    rir: 2,
    rpe: null,
    difficulty: null,
    restSeconds: 90,
    isWarmup: false,
    bodyWeightKg: 80,
    ...patch,
  };
}

/* ═══════════════════════ Última execução ═══════════════════════ */

describe("previousPerformance", () => {
  const history = [
    record({ sessionId: "s-1", sessionDate: "2026-07-20", setNumber: 1, weightKg: 55 }),
    record({ sessionId: "s-1", sessionDate: "2026-07-20", setNumber: 2, weightKg: 55 }),
    record({ sessionId: "s-2", sessionDate: "2026-07-27", setNumber: 1, weightKg: 60 }),
    record({ sessionId: "s-2", sessionDate: "2026-07-27", setNumber: 2, weightKg: 60 }),
  ];

  it("devolve a sessão mais recente, com as séries em ordem", () => {
    const result = previousPerformance(history, {
      exerciseId: "ex-1",
      source: "qualquer_treino",
    });
    expect(result?.sessionId).toBe("s-2");
    expect(result?.sessionDate).toBe("2026-07-27");
    expect(result?.sets.map((set) => set.setNumber)).toEqual([1, 2]);
    expect(result?.setCount).toBe(2);
  });

  it("exercício nunca executado devolve null (a UI diz 'primeira vez')", () => {
    expect(
      previousPerformance(history, { exerciseId: "ex-desconhecido", source: "qualquer_treino" }),
    ).toBeNull();
  });

  it("histórico vazio devolve null", () => {
    expect(previousPerformance([], { exerciseId: "ex-1", source: "qualquer_treino" })).toBeNull();
  });

  it("ignora série pendente, pulada e cancelada", () => {
    const result = previousPerformance(
      [
        record({ sessionId: "s-9", sessionDate: "2026-08-01", status: "pendente" }),
        record({ sessionId: "s-9", sessionDate: "2026-08-01", setNumber: 2, status: "pulada" }),
        record({ sessionId: "s-9", sessionDate: "2026-08-01", setNumber: 3, status: "cancelada" }),
        ...history,
      ],
      { exerciseId: "ex-1", source: "qualquer_treino" },
    );
    expect(result?.sessionId).toBe("s-2");
  });

  it("sessão incompleta entra com o que foi efetivamente registrado", () => {
    const result = previousPerformance(
      [
        ...history,
        record({ sessionId: "s-3", sessionDate: "2026-08-02", setNumber: 1, weightKg: 65 }),
        record({ sessionId: "s-3", sessionDate: "2026-08-02", setNumber: 2, status: "pendente" }),
      ],
      { exerciseId: "ex-1", source: "qualquer_treino" },
    );
    expect(result?.sessionId).toBe("s-3");
    expect(result?.setCount).toBe(1);
  });

  it("ignora aquecimento por padrão e inclui quando pedido", () => {
    const comAquecimento = [
      record({ sessionId: "s-4", sessionDate: "2026-08-03", setNumber: 1, isWarmup: true, weightKg: 20 }),
      record({ sessionId: "s-4", sessionDate: "2026-08-03", setNumber: 2, weightKg: 62 }),
    ];
    expect(
      previousPerformance(comAquecimento, { exerciseId: "ex-1", source: "qualquer_treino" })?.setCount,
    ).toBe(1);
    expect(
      previousPerformance(comAquecimento, {
        exerciseId: "ex-1",
        source: "qualquer_treino",
        includeWarmup: true,
      })?.setCount,
    ).toBe(2);
  });

  it("não devolve a própria sessão atual como 'última vez'", () => {
    const result = previousPerformance(history, {
      exerciseId: "ex-1",
      source: "qualquer_treino",
      excludeSessionId: "s-2",
    });
    expect(result?.sessionId).toBe("s-1");
  });

  describe("fonte escolhida pelo usuário", () => {
    const misto = [
      record({ sessionId: "s-a", sessionDate: "2026-07-25", workoutId: "w-1", weightKg: 60 }),
      record({ sessionId: "s-b", sessionDate: "2026-08-01", workoutId: "w-2", weightKg: 50 }),
    ];

    it("'qualquer treino' pega a mais recente, mesmo de outro modelo", () => {
      expect(
        previousPerformance(misto, { exerciseId: "ex-1", source: "qualquer_treino" })?.sessionId,
      ).toBe("s-b");
    });

    it("'mesmo modelo' filtra pelo treino", () => {
      expect(
        previousPerformance(misto, {
          exerciseId: "ex-1",
          source: "mesmo_modelo",
          workoutId: "w-1",
        })?.sessionId,
      ).toBe("s-a");
    });

    it("'mesmo modelo' sem modelo definido devolve null em vez de fingir", () => {
      expect(
        previousPerformance(misto, { exerciseId: "ex-1", source: "mesmo_modelo", workoutId: null }),
      ).toBeNull();
    });
  });

  it("casa pelo nome congelado quando o exercício saiu do catálogo", () => {
    const orfao = [record({ exerciseId: null, sessionId: "s-x", sessionDate: "2026-08-02" })];
    const result = previousPerformance(orfao, {
      exerciseId: null,
      exerciseName: "Supino reto com barra",
      source: "qualquer_treino",
    });
    expect(result?.sessionId).toBe("s-x");
  });
});

/* ═══════════════════════ Melhor marca ═══════════════════════ */

describe("bestRecentSet", () => {
  it("escolhe a série de maior carga efetiva", () => {
    const { best, isPartial } = bestRecentSet(
      [
        record({ setNumber: 1, weightKg: 60, reps: 10 }),
        record({ setNumber: 2, weightKg: 80, reps: 5 }),
        record({ setNumber: 3, weightKg: 70, reps: 8 }),
      ],
      { exerciseId: "ex-1", source: "qualquer_treino", trackingType: "peso_reps" },
    );
    expect(best?.set.weightKg).toBe(80);
    expect(isPartial).toBe(false);
  });

  it("empate de carga desempata por repetições", () => {
    const { best } = bestRecentSet(
      [
        record({ setNumber: 1, weightKg: 70, reps: 8 }),
        record({ setNumber: 2, weightKg: 70, reps: 11 }),
      ],
      { exerciseId: "ex-1", source: "qualquer_treino", trackingType: "peso_reps" },
    );
    expect(best?.set.reps).toBe(11);
  });

  it("assistência SUBTRAI: mais assistência é carga menor", () => {
    const { best } = bestRecentSet(
      [
        record({ setNumber: 1, weightKg: null, assistanceWeightKg: 30, bodyWeightKg: 80 }),
        record({ setNumber: 2, weightKg: null, assistanceWeightKg: 10, bodyWeightKg: 80 }),
      ],
      {
        exerciseId: "ex-1",
        source: "qualquer_treino",
        trackingType: "peso_corporal_assistido",
      },
    );
    // 80 − 10 = 70 vence 80 − 30 = 50.
    expect(best?.load.ok && best.load.kg).toBe(70);
    expect(best?.set.assistanceWeightKg).toBe(10);
  });

  it("carga adicional SOMA", () => {
    const { best } = bestRecentSet(
      [record({ weightKg: null, additionalWeightKg: 20, bodyWeightKg: 80 })],
      {
        exerciseId: "ex-1",
        source: "qualquer_treino",
        trackingType: "peso_corporal_adicional",
      },
    );
    expect(best?.load.ok && best.load.kg).toBe(100);
  });

  it("sem peso corporal a série é IGNORADA e o agregado fica parcial (nunca vira zero)", () => {
    const { best, isPartial, ignored } = bestRecentSet(
      [
        record({ setNumber: 1, weightKg: null, bodyWeightKg: null }),
        record({ setNumber: 2, weightKg: null, bodyWeightKg: 82 }),
      ],
      { exerciseId: "ex-1", source: "qualquer_treino", trackingType: "peso_corporal_reps" },
    );
    expect(ignored).toBe(1);
    expect(isPartial).toBe(true);
    expect(best?.load.ok && best.load.kg).toBe(82);
  });

  it("exercício de duração não tem carga: nenhuma marca e agregado parcial", () => {
    const { best, isPartial } = bestRecentSet(
      [record({ weightKg: null, durationSeconds: 60 })],
      { exerciseId: "ex-1", source: "qualquer_treino", trackingType: "duracao" },
    );
    expect(best).toBeNull();
    expect(isPartial).toBe(true);
  });
});

/* ═══════════════════════ Sugestão ═══════════════════════ */

describe("suggestFromPrevious", () => {
  const previous = previousPerformance(
    [
      record({ sessionId: "s-1", setNumber: 1, weightKg: 60, reps: 10 }),
      record({ sessionId: "s-1", setNumber: 2, weightKg: 60, reps: 9 }),
      record({ sessionId: "s-1", setNumber: 3, weightKg: 55, reps: 8 }),
    ],
    { exerciseId: "ex-1", source: "qualquer_treino" },
  );

  it("uma sugestão por série, na ordem", () => {
    const suggestions = suggestFromPrevious(previous, 3);
    expect(suggestions.map((s) => s.weightKg)).toEqual([60, 60, 55]);
    expect(suggestions.map((s) => s.reps)).toEqual([10, 9, 8]);
    expect(suggestions[0].fromSessionDate).toBe("2026-07-28");
  });

  it("com MAIS séries hoje, as extras repetem a última conhecida", () => {
    expect(suggestFromPrevious(previous, 5).map((s) => s.weightKg)).toEqual([60, 60, 55, 55, 55]);
  });

  it("com MENOS séries hoje, as extras não aparecem", () => {
    expect(suggestFromPrevious(previous, 2)).toHaveLength(2);
  });

  it("sem execução anterior não há sugestão nenhuma", () => {
    expect(suggestFromPrevious(null, 4)).toEqual([]);
  });

  it("⛔ a sugestão NÃO altera nada: é dado devolvido, não aplicado", () => {
    const planejado = { plannedWeightKg: 50, targetRepsMax: 12 };
    const congelado = { ...planejado };
    suggestFromPrevious(previous, 3);
    expect(planejado).toEqual(congelado);
  });
});

/* ═══════════════════════ Comparação ═══════════════════════ */

describe("compareToPrevious", () => {
  it("descreve o fato, sem julgamento", () => {
    expect(
      compareToPrevious(
        { weightKg: 65, reps: 10, durationSeconds: null },
        { weightKg: 60, reps: 10, durationSeconds: null },
      ),
    ).toMatchObject({ weightDeltaKg: 5, repsDelta: 0, direction: "acima" });

    expect(
      compareToPrevious(
        { weightKg: 55, reps: 10, durationSeconds: null },
        { weightKg: 60, reps: 10, durationSeconds: null },
      ).direction,
    ).toBe("abaixo");

    expect(
      compareToPrevious(
        { weightKg: 60, reps: 10, durationSeconds: null },
        { weightKg: 60, reps: 10, durationSeconds: null },
      ).direction,
    ).toBe("igual");
  });

  it("sem execução anterior a comparação é indisponível, não zero", () => {
    const result = compareToPrevious({ weightKg: 60, reps: 10, durationSeconds: null }, null);
    expect(result.direction).toBe("indisponivel");
    expect(result.weightDeltaKg).toBeNull();
  });

  it("cai para repetições quando não há carga dos dois lados", () => {
    expect(
      compareToPrevious(
        { weightKg: null, reps: 14, durationSeconds: null },
        { weightKg: null, reps: 12, durationSeconds: null },
      ),
    ).toMatchObject({ repsDelta: 2, direction: "acima" });
  });

  it("cai para duração em exercício por tempo", () => {
    expect(
      compareToPrevious(
        { weightKg: null, reps: null, durationSeconds: 70 },
        { weightKg: null, reps: null, durationSeconds: 60 },
      ),
    ).toMatchObject({ durationDeltaSeconds: 10, direction: "acima" });
  });
});
