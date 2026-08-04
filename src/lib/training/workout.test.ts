/**
 * Fase 17-B — Treinos · Testes do treino-modelo.
 *
 * O teste mais importante do arquivo é o de `expandPlannedSets`: ele prova que os DOIS jeitos
 * de configurar séries (uniforme e série a série) saem no MESMO formato. É esse contrato que
 * a sessão ao vivo (17-C) vai consumir — se ele quebrar, a sessão precisa aprender dois
 * caminhos e o histórico começa a discordar do modelo.
 */
import { describe, expect, it } from "vitest";
import {
  applyOrder,
  canonicalOrder,
  countSets,
  countSetsByMuscleGroup,
  estimateWorkoutDuration,
  expandPlannedSets,
  moveByOffset,
  plannedLoadForSet,
  repRangeLabel,
  secondsLabel,
  summarizeWorkout,
  supersetBlocks,
  validateSupersets,
  type PlannableExercise,
  type PlannedSetSource,
} from "./workout";

/* ───────────────────────────── Fábricas ───────────────────────────── */

function exercise(patch: Partial<PlannableExercise> = {}): PlannableExercise {
  return {
    id: "ex-1",
    trackingType: "peso_reps",
    laterality: "bilateral",
    defaultSets: 4,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetDurationSeconds: null,
    targetDistanceM: null,
    plannedWeightKg: 60,
    plannedAdditionalWeightKg: null,
    plannedAssistanceWeightKg: null,
    restSeconds: 90,
    targetRir: 2,
    targetRpe: null,
    setType: "trabalho",
    isWarmup: false,
    countsInVolume: true,
    notes: null,
    ...patch,
  };
}

function setRow(patch: Partial<PlannedSetSource> & { setNumber: number }): PlannedSetSource {
  return {
    setType: "trabalho",
    targetRepsMin: null,
    targetRepsMax: null,
    targetDurationSeconds: null,
    targetDistanceM: null,
    plannedWeightKg: null,
    plannedAdditionalWeightKg: null,
    plannedAssistanceWeightKg: null,
    restSeconds: null,
    targetRir: null,
    targetRpe: null,
    isWarmup: false,
    countsInVolume: true,
    notes: null,
    ...patch,
  };
}

/* ═══════════════════════════ expandPlannedSets ═══════════════════════════ */

describe("expandPlannedSets — séries uniformes", () => {
  it("expande default_sets em séries numeradas de 1 a N", () => {
    const sets = expandPlannedSets(exercise({ defaultSets: 4 }));

    expect(sets).toHaveLength(4);
    expect(sets.map((s) => s.setNumber)).toEqual([1, 2, 3, 4]);
    expect(sets.every((s) => s.origin === "uniforme")).toBe(true);
  });

  it("repete a configuração do exercício em todas as séries", () => {
    const sets = expandPlannedSets(exercise({ defaultSets: 3 }));

    for (const set of sets) {
      expect(set.targetRepsMin).toBe(8);
      expect(set.targetRepsMax).toBe(12);
      expect(set.plannedWeightKg).toBe(60);
      expect(set.restSeconds).toBe(90);
      expect(set.targetRir).toBe(2);
    }
  });

  it("nunca devolve lista vazia: default_sets inválido vira uma série", () => {
    expect(expandPlannedSets(exercise({ defaultSets: 0 }))).toHaveLength(1);
    expect(expandPlannedSets(exercise({ defaultSets: -3 }))).toHaveLength(1);
  });
});

describe("expandPlannedSets — séries configuradas uma a uma", () => {
  it("a configuração por série vence default_sets", () => {
    const sets = expandPlannedSets(
      exercise({
        defaultSets: 4,
        sets: [
          setRow({ setNumber: 1, setType: "top_set", plannedWeightKg: 100, targetRepsMax: 5 }),
          setRow({ setNumber: 2, setType: "back_off", plannedWeightKg: 80, targetRepsMax: 10 }),
        ],
      }),
    );

    expect(sets).toHaveLength(2);
    expect(sets.map((s) => s.setType)).toEqual(["top_set", "back_off"]);
    expect(sets.map((s) => s.plannedWeightKg)).toEqual([100, 80]);
    expect(sets.every((s) => s.origin === "configurada")).toBe(true);
  });

  it("null na série herda o valor do exercício", () => {
    const sets = expandPlannedSets(
      exercise({
        restSeconds: 120,
        targetRepsMin: 8,
        sets: [setRow({ setNumber: 1, plannedWeightKg: 90 }), setRow({ setNumber: 2, restSeconds: 30 })],
      }),
    );

    expect(sets[0].restSeconds).toBe(120); // herdou
    expect(sets[1].restSeconds).toBe(30); // sobrescreveu
    expect(sets[0].targetRepsMin).toBe(8); // herdou
  });

  it("zero na série NÃO é tratado como ausência (0s de descanso é uma escolha)", () => {
    const sets = expandPlannedSets(
      exercise({ restSeconds: 90, sets: [setRow({ setNumber: 1, restSeconds: 0 })] }),
    );
    expect(sets[0].restSeconds).toBe(0);
  });

  it("renumera 1..N mesmo com numeração torta ou fora de ordem", () => {
    const sets = expandPlannedSets(
      exercise({
        sets: [setRow({ setNumber: 7 }), setRow({ setNumber: 2 }), setRow({ setNumber: 5 })],
      }),
    );
    expect(sets.map((s) => s.setNumber)).toEqual([1, 2, 3]);
  });

  it("os dois formatos produzem exatamente as mesmas chaves (contrato da 17-C)", () => {
    const uniforme = expandPlannedSets(exercise({ defaultSets: 1 }))[0];
    const configurada = expandPlannedSets(exercise({ sets: [setRow({ setNumber: 1 })] }))[0];

    expect(Object.keys(uniforme).sort()).toEqual(Object.keys(configurada).sort());
  });

  it("tipo 'aquecimento' marca a série como aquecimento mesmo sem o interruptor", () => {
    const sets = expandPlannedSets(
      exercise({ sets: [setRow({ setNumber: 1, setType: "aquecimento", isWarmup: false })] }),
    );
    expect(sets[0].isWarmup).toBe(true);
  });
});

describe("expandPlannedSets — respeita a matriz de tracking.ts", () => {
  it("exercício de duração não carrega peso nem repetições planejadas", () => {
    const sets = expandPlannedSets(
      exercise({
        trackingType: "duracao",
        targetDurationSeconds: 45,
        plannedWeightKg: 60,
        targetRepsMin: 8,
        targetRepsMax: 12,
        defaultSets: 3,
      }),
    );

    expect(sets[0].targetDurationSeconds).toBe(45);
    expect(sets[0].plannedWeightKg).toBeNull();
    expect(sets[0].targetRepsMin).toBeNull();
    expect(sets[0].targetRepsMax).toBeNull();
  });

  it("exercício assistido guarda a assistência e descarta o peso na barra", () => {
    const sets = expandPlannedSets(
      exercise({
        trackingType: "peso_corporal_assistido",
        plannedWeightKg: 40,
        plannedAssistanceWeightKg: 30,
        defaultSets: 1,
      }),
    );

    expect(sets[0].plannedAssistanceWeightKg).toBe(30);
    expect(sets[0].plannedWeightKg).toBeNull();
  });

  it("peso corporal com carga adicional mantém a carga adicional", () => {
    const sets = expandPlannedSets(
      exercise({
        trackingType: "peso_corporal_adicional",
        plannedAdditionalWeightKg: 15,
        plannedWeightKg: 99,
        defaultSets: 1,
      }),
    );

    expect(sets[0].plannedAdditionalWeightKg).toBe(15);
    expect(sets[0].plannedWeightKg).toBeNull();
  });

  it("cardio guarda distância e duração", () => {
    const sets = expandPlannedSets(
      exercise({
        trackingType: "distancia_duracao",
        targetDistanceM: 3000,
        targetDurationSeconds: 1200,
        plannedWeightKg: 10,
        defaultSets: 1,
      }),
    );

    expect(sets[0].targetDistanceM).toBe(3000);
    expect(sets[0].targetDurationSeconds).toBe(1200);
    expect(sets[0].plannedWeightKg).toBeNull();
  });
});

/* ═══════════════════════════ Carga efetiva planejada ═══════════════════════════ */

describe("plannedLoadForSet — delega a tracking.ts, sem inventar número", () => {
  it("peso e repetições devolve a carga digitada", () => {
    const [set] = expandPlannedSets(exercise({ defaultSets: 1, plannedWeightKg: 80 }));
    expect(plannedLoadForSet(set, "peso_reps")).toEqual({ ok: true, kg: 80 });
  });

  it("sem peso corporal registrado a carga é INDISPONÍVEL, nunca zero", () => {
    const [set] = expandPlannedSets(
      exercise({ trackingType: "peso_corporal_reps", defaultSets: 1 }),
    );
    expect(plannedLoadForSet(set, "peso_corporal_reps", null)).toEqual({
      ok: false,
      reason: "sem_peso_corporal",
    });
  });

  it("assistência SUBTRAI do peso corporal", () => {
    const [set] = expandPlannedSets(
      exercise({
        trackingType: "peso_corporal_assistido",
        plannedAssistanceWeightKg: 30,
        defaultSets: 1,
      }),
    );
    expect(plannedLoadForSet(set, "peso_corporal_assistido", 80)).toEqual({ ok: true, kg: 50 });
  });

  it("carga adicional SOMA ao peso corporal", () => {
    const [set] = expandPlannedSets(
      exercise({
        trackingType: "peso_corporal_adicional",
        plannedAdditionalWeightKg: 20,
        defaultSets: 1,
      }),
    );
    expect(plannedLoadForSet(set, "peso_corporal_adicional", 80)).toEqual({ ok: true, kg: 100 });
  });
});

/* ═══════════════════════════ Contagem de séries ═══════════════════════════ */

describe("countSets", () => {
  it("soma as séries dos dois formatos no mesmo treino", () => {
    const counts = countSets([
      exercise({ id: "a", defaultSets: 4 }),
      exercise({ id: "b", sets: [setRow({ setNumber: 1 }), setRow({ setNumber: 2 })] }),
    ]);

    expect(counts.total).toBe(6);
    expect(counts.working).toBe(6);
    expect(counts.warmup).toBe(0);
  });

  it("separa aquecimento de série de trabalho", () => {
    const counts = countSets([
      exercise({
        id: "a",
        sets: [
          setRow({ setNumber: 1, isWarmup: true }),
          setRow({ setNumber: 2, setType: "aquecimento" }),
          setRow({ setNumber: 3 }),
          setRow({ setNumber: 4 }),
        ],
      }),
    ]);

    expect(counts.total).toBe(4);
    expect(counts.warmup).toBe(2);
    expect(counts.working).toBe(2);
  });
});

describe("countSetsByMuscleGroup — principal e secundário contados à parte", () => {
  const remada = {
    ...exercise({ id: "remada", defaultSets: 4 }),
    primaryMuscleGroupId: "costas",
    secondaryMuscleGroupIds: ["biceps"],
    supersetGroup: null,
  };
  const rosca = {
    ...exercise({ id: "rosca", defaultSets: 3 }),
    primaryMuscleGroupId: "biceps",
    secondaryMuscleGroupIds: [],
    supersetGroup: null,
  };

  it("não mistura as duas contagens", () => {
    const counts = countSetsByMuscleGroup([remada, rosca]);

    expect(counts.primary).toEqual({ costas: 4, biceps: 3 });
    expect(counts.secondary).toEqual({ biceps: 4 });
  });

  it("ignora aquecimento por padrão e o inclui quando pedido", () => {
    const comAquecimento = {
      ...exercise({
        id: "supino",
        sets: [setRow({ setNumber: 1, isWarmup: true }), setRow({ setNumber: 2 })],
      }),
      primaryMuscleGroupId: "peito",
      secondaryMuscleGroupIds: [],
      supersetGroup: null,
    };

    expect(countSetsByMuscleGroup([comAquecimento]).primary).toEqual({ peito: 1 });
    expect(countSetsByMuscleGroup([comAquecimento], { includeWarmup: true }).primary).toEqual({
      peito: 2,
    });
  });

  it("um grupo que é principal não é contado também como secundário", () => {
    const estranho = {
      ...exercise({ id: "x", defaultSets: 2 }),
      primaryMuscleGroupId: "peito",
      secondaryMuscleGroupIds: ["peito", "triceps"],
      supersetGroup: null,
    };
    const counts = countSetsByMuscleGroup([estranho]);

    expect(counts.primary).toEqual({ peito: 2 });
    expect(counts.secondary).toEqual({ triceps: 2 });
  });
});

/* ═══════════════════════════ Duração estimada ═══════════════════════════ */

describe("estimateWorkoutDuration — execução + descanso", () => {
  it("soma execução e descanso, sem contar o descanso da última série", () => {
    // 3 séries × 10 reps × 3 s = 90 s de execução; 2 descansos de 60 s = 120 s.
    const estimate = estimateWorkoutDuration([
      exercise({ defaultSets: 3, targetRepsMin: 10, targetRepsMax: 10, restSeconds: 60 }),
    ]);

    expect(estimate.executionSeconds).toBe(90);
    expect(estimate.restSeconds).toBe(120);
    expect(estimate.totalSeconds).toBe(210);
    expect(estimate.isPartial).toBe(false);
  });

  it("usa o topo da faixa de repetições", () => {
    const estimate = estimateWorkoutDuration([
      exercise({ defaultSets: 1, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 0 }),
    ]);
    expect(estimate.executionSeconds).toBe(36);
  });

  it("exercício por tempo usa a duração alvo direto", () => {
    const estimate = estimateWorkoutDuration([
      exercise({
        trackingType: "duracao",
        defaultSets: 3,
        targetDurationSeconds: 60,
        restSeconds: 30,
      }),
    ]);

    expect(estimate.executionSeconds).toBe(180);
    expect(estimate.restSeconds).toBe(60);
  });

  it("marca PARCIAL quando alguma série não tem alvo nenhum", () => {
    const estimate = estimateWorkoutDuration([
      exercise({ defaultSets: 2, targetRepsMin: null, targetRepsMax: null, restSeconds: 60 }),
    ]);

    expect(estimate.executionSeconds).toBe(0);
    expect(estimate.isPartial).toBe(true);
  });

  it("usa o descanso padrão do módulo quando o exercício não define um", () => {
    const estimate = estimateWorkoutDuration(
      [exercise({ defaultSets: 2, targetRepsMax: 10, targetRepsMin: 10, restSeconds: null })],
      { defaultRestSeconds: 90 },
    );
    expect(estimate.restSeconds).toBe(90);
  });

  it("soma o descanso entre exercícios diferentes", () => {
    const estimate = estimateWorkoutDuration([
      exercise({ id: "a", defaultSets: 1, targetRepsMin: 10, targetRepsMax: 10, restSeconds: 60 }),
      exercise({ id: "b", defaultSets: 1, targetRepsMin: 10, targetRepsMax: 10, restSeconds: 60 }),
    ]);
    // Só um descanso: o da última série do último exercício não conta.
    expect(estimate.restSeconds).toBe(60);
  });
});

/* ═══════════════════════════ Superset ═══════════════════════════ */

describe("validateSupersets", () => {
  const withGroups = (groups: (string | null)[]) => groups.map((supersetGroup) => ({ supersetGroup }));

  it("aceita um bloco contíguo", () => {
    const result = validateSupersets(withGroups([null, "A", "A", null]));
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("aceita dois blocos contíguos diferentes", () => {
    expect(validateSupersets(withGroups(["A", "A", "B", "B"])).ok).toBe(true);
  });

  it("aceita um tri-set (três exercícios no mesmo bloco)", () => {
    expect(validateSupersets(withGroups(["A", "A", "A"])).ok).toBe(true);
  });

  it("recusa bloco NÃO contíguo", () => {
    const result = validateSupersets(withGroups(["A", "B", "A"]));

    expect(result.ok).toBe(false);
    const naoContiguo = result.issues.find((issue) => issue.kind === "nao_contiguo");
    expect(naoContiguo?.group).toBe("A");
    expect(naoContiguo?.positions).toEqual([0, 2]);
  });

  it("recusa bloco com um exercício só", () => {
    const result = validateSupersets(withGroups(["A", null, null]));

    expect(result.ok).toBe(false);
    expect(result.issues[0].kind).toBe("sozinho");
  });

  it("treino sem nenhum superset é válido", () => {
    expect(validateSupersets(withGroups([null, null, null])).ok).toBe(true);
  });

  it("ignora grupo em branco (só espaços)", () => {
    expect(validateSupersets(withGroups(["  ", null])).ok).toBe(true);
  });
});

describe("supersetBlocks", () => {
  it("devolve os blocos reais, na ordem do treino", () => {
    const blocks = supersetBlocks(
      [null, "A", "A", null, "B", "B", "B"].map((supersetGroup) => ({ supersetGroup })),
    );

    expect(blocks).toEqual([
      { group: "A", positions: [1, 2] },
      { group: "B", positions: [4, 5, 6] },
    ]);
  });

  it("não devolve bloco furado como se fosse válido", () => {
    expect(supersetBlocks(["A", "B", "A"].map((supersetGroup) => ({ supersetGroup })))).toEqual([]);
  });
});

/* ═══════════════════════════ Ordem canônica ═══════════════════════════ */

describe("ordem canônica e reordenação", () => {
  const items = [
    { id: "a", position: 5 },
    { id: "b", position: 1 },
    { id: "c", position: 3 },
  ];

  it("canonicalOrder ordena e renumera sem buracos", () => {
    expect(canonicalOrder(items)).toEqual([
      { id: "b", position: 0 },
      { id: "c", position: 1 },
      { id: "a", position: 2 },
    ]);
  });

  it("applyOrder respeita a ordem vinda da interface", () => {
    expect(applyOrder(items, ["c", "a", "b"])).toEqual([
      { id: "c", position: 0 },
      { id: "a", position: 1 },
      { id: "b", position: 2 },
    ]);
  });

  it("applyOrder nunca perde um item que ficou de fora da lista", () => {
    const result = applyOrder(items, ["c"]);

    expect(result.map((item) => item.id)).toEqual(["c", "b", "a"]);
    expect(result).toHaveLength(3);
  });

  it("applyOrder ignora id desconhecido", () => {
    const result = applyOrder(items, ["fantasma", "a", "b", "c"]);
    expect(result.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("moveByOffset é a alternativa por teclado e é reversível", () => {
    const desceu = moveByOffset(items, "b", 1);
    expect(desceu.map((item) => item.id)).toEqual(["c", "b", "a"]);

    const voltou = moveByOffset(desceu, "b", -1);
    expect(voltou.map((item) => item.id)).toEqual(["b", "c", "a"]);
  });

  it("moveByOffset não empurra item para fora da lista", () => {
    expect(moveByOffset(items, "b", -5).map((item) => item.id)).toEqual(["b", "c", "a"]);
    expect(moveByOffset(items, "a", 9).map((item) => item.id)).toEqual(["b", "c", "a"]);
  });
});

/* ═══════════════════════════ Resumo ═══════════════════════════ */

describe("summarizeWorkout", () => {
  it("junta contagem, músculos, duração e validação de superset", () => {
    const summary = summarizeWorkout([
      {
        ...exercise({ id: "a", defaultSets: 4, targetRepsMin: 10, targetRepsMax: 10, restSeconds: 60 }),
        primaryMuscleGroupId: "peito",
        secondaryMuscleGroupIds: ["triceps"],
        supersetGroup: "A",
      },
      {
        ...exercise({ id: "b", defaultSets: 3, targetRepsMin: 12, targetRepsMax: 12, restSeconds: 45 }),
        primaryMuscleGroupId: "triceps",
        secondaryMuscleGroupIds: [],
        supersetGroup: "A",
      },
    ]);

    expect(summary.exerciseCount).toBe(2);
    expect(summary.sets.total).toBe(7);
    expect(summary.muscles.primary).toEqual({ peito: 4, triceps: 3 });
    expect(summary.muscles.secondary).toEqual({ triceps: 4 });
    expect(summary.supersets.ok).toBe(true);
    expect(summary.primaryMuscleGroupIds).toEqual(["peito", "triceps"]);
    expect(summary.duration.totalSeconds).toBeGreaterThan(0);
  });

  it("treino vazio não quebra e não inventa número", () => {
    const summary = summarizeWorkout([]);

    expect(summary.exerciseCount).toBe(0);
    expect(summary.sets.total).toBe(0);
    expect(summary.duration.totalSeconds).toBe(0);
    expect(summary.duration.isPartial).toBe(false);
    expect(summary.supersets.ok).toBe(true);
  });
});

/* ═══════════════════════════ Rótulos ═══════════════════════════ */

describe("rótulos", () => {
  it("repRangeLabel", () => {
    expect(repRangeLabel(8, 12)).toBe("8 a 12");
    expect(repRangeLabel(10, 10)).toBe("10");
    expect(repRangeLabel(10, null)).toBe("10");
    expect(repRangeLabel(null, 12)).toBe("12");
    expect(repRangeLabel(null, null)).toBe("livre");
  });

  it("secondsLabel", () => {
    expect(secondsLabel(45)).toBe("45 s");
    expect(secondsLabel(60)).toBe("1 min");
    expect(secondsLabel(90)).toBe("1 min 30 s");
    expect(secondsLabel(null)).toBe("");
  });
});
