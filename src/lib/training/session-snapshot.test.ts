/**
 * Fase 17-C — Treinos · Testes do congelamento.
 *
 * ⛔ O TESTE QUE A SUBFASE INTEIRA EXISTE PARA GARANTIR está em "editar o modelo depois":
 * o treino-modelo é alterado APÓS o snapshot e a sessão registrada continua idêntica. Se este
 * teste cair, a 17-C foi violada e todo o histórico do módulo passa a mentir.
 */
import { describe, expect, it } from "vitest";
import {
  applyPreparation,
  buildWorkoutSnapshot,
  emptyWorkoutSnapshot,
  parseWorkoutSnapshot,
  snapshotExerciseRow,
  snapshotSetRow,
  summarizeSnapshot,
  type SnapshotSource,
  type SnapshotSourceExercise,
} from "./session-snapshot";

/* ───────────────────────────── Fábricas ───────────────────────────── */

function sourceExercise(patch: Partial<SnapshotSourceExercise> = {}): SnapshotSourceExercise {
  return {
    id: "we-1",
    exerciseId: "ex-1",
    workoutExerciseId: "we-1",
    exerciseName: "Supino reto com barra",
    trackingType: "peso_reps",
    laterality: "bilateral",
    muscleGroup: "Peitoral",
    equipment: "Barra",
    movementPattern: "empurrar_horizontal",
    plannedPosition: 0,
    supersetGroup: null,
    technique: null,
    incrementKg: 2.5,
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

function source(patch: Partial<SnapshotSource> = {}): SnapshotSource {
  return {
    workoutId: "w-1",
    workoutName: "Treino A — Peito e tríceps",
    workoutShortName: "A",
    workoutVersion: 2,
    programId: "p-1",
    programName: "ABC",
    defaultRestSeconds: 90,
    exercises: [sourceExercise()],
    ...patch,
  };
}

/* ═══════════════════════ A regra inegociável ═══════════════════════ */

describe("⛔ editar o modelo depois NÃO muda a sessão", () => {
  it("renomear o exercício no modelo não altera o snapshot já gravado", () => {
    const modelo = sourceExercise();
    const snapshot = buildWorkoutSnapshot(source({ exercises: [modelo] }));

    // O usuário renomeia o exercício no catálogo depois de treinar.
    modelo.exerciseName = "Supino reto (renomeado)";

    expect(snapshot.exercises[0].exerciseName).toBe("Supino reto com barra");
  });

  it("mudar a carga planejada e o número de séries no modelo não altera o snapshot", () => {
    const modelo = sourceExercise();
    const snapshot = buildWorkoutSnapshot(source({ exercises: [modelo] }));

    modelo.plannedWeightKg = 999;
    modelo.defaultSets = 10;
    modelo.targetRepsMin = 1;

    expect(snapshot.exercises[0].sets).toHaveLength(4);
    expect(snapshot.exercises[0].sets[0].plannedWeightKg).toBe(60);
    expect(snapshot.exercises[0].sets[0].targetRepsMin).toBe(8);
  });

  it("acrescentar um exercício ao modelo não altera o snapshot", () => {
    const exercises = [sourceExercise()];
    const snapshot = buildWorkoutSnapshot(source({ exercises }));

    exercises.push(sourceExercise({ id: "we-2", exerciseName: "Crucifixo", plannedPosition: 1 }));

    expect(snapshot.exercises).toHaveLength(1);
  });

  it("excluir o exercício do catálogo (exerciseId nulo) mantém o nome legível", () => {
    const snapshot = buildWorkoutSnapshot(
      source({ exercises: [sourceExercise({ exerciseId: null })] }),
    );
    expect(snapshot.exercises[0].exerciseId).toBeNull();
    expect(snapshot.exercises[0].exerciseName).toBe("Supino reto com barra");
  });
});

/* ═══════════════════════ Construção ═══════════════════════ */

describe("buildWorkoutSnapshot", () => {
  it("congela a identidade do treino", () => {
    const snapshot = buildWorkoutSnapshot(source());
    expect(snapshot).toMatchObject({
      version: 1,
      workoutId: "w-1",
      workoutName: "Treino A — Peito e tríceps",
      workoutVersion: 2,
      programName: "ABC",
    });
  });

  it("usa expandPlannedSets — séries uniformes viram N séries iguais", () => {
    const snapshot = buildWorkoutSnapshot(source());
    const sets = snapshot.exercises[0].sets;
    expect(sets).toHaveLength(4);
    expect(sets.map((set) => set.setNumber)).toEqual([1, 2, 3, 4]);
    expect(sets.every((set) => set.origin === "uniforme")).toBe(true);
  });

  it("séries configuradas uma a uma são a verdade, e a numeração é reescrita 1..N", () => {
    const snapshot = buildWorkoutSnapshot(
      source({
        exercises: [
          sourceExercise({
            defaultSets: 4,
            sets: [
              {
                setNumber: 7,
                setType: "top_set",
                targetRepsMin: 5,
                targetRepsMax: 5,
                targetDurationSeconds: null,
                targetDistanceM: null,
                plannedWeightKg: 90,
                plannedAdditionalWeightKg: null,
                plannedAssistanceWeightKg: null,
                restSeconds: 180,
                targetRir: 1,
                targetRpe: null,
                isWarmup: false,
                countsInVolume: true,
                notes: null,
              },
              {
                setNumber: 9,
                setType: "back_off",
                targetRepsMin: 8,
                targetRepsMax: 10,
                targetDurationSeconds: null,
                targetDistanceM: null,
                plannedWeightKg: 70,
                plannedAdditionalWeightKg: null,
                plannedAssistanceWeightKg: null,
                restSeconds: 120,
                targetRir: null,
                targetRpe: null,
                isWarmup: false,
                countsInVolume: true,
                notes: null,
              },
            ],
          }),
        ],
      }),
    );

    const sets = snapshot.exercises[0].sets;
    expect(sets).toHaveLength(2);
    expect(sets.map((set) => set.setNumber)).toEqual([1, 2]);
    expect(sets[0].plannedWeightKg).toBe(90);
    expect(sets.every((set) => set.origin === "configurada")).toBe(true);
  });

  it("aplica a matriz de medição: exercício de duração não carrega peso planejado", () => {
    const snapshot = buildWorkoutSnapshot(
      source({
        exercises: [
          sourceExercise({
            trackingType: "duracao",
            targetDurationSeconds: 45,
            plannedWeightKg: 60,
          }),
        ],
      }),
    );
    expect(snapshot.exercises[0].sets[0].plannedWeightKg).toBeNull();
    expect(snapshot.exercises[0].sets[0].targetDurationSeconds).toBe(45);
  });

  it("assistência é congelada na coluna certa (nunca vira peso na barra)", () => {
    const snapshot = buildWorkoutSnapshot(
      source({
        exercises: [
          sourceExercise({
            trackingType: "peso_corporal_assistido",
            plannedWeightKg: 50,
            plannedAssistanceWeightKg: 30,
          }),
        ],
      }),
    );
    const set = snapshot.exercises[0].sets[0];
    expect(set.plannedAssistanceWeightKg).toBe(30);
    expect(set.plannedWeightKg).toBeNull();
  });

  it("renumera plannedPosition 0..n-1 mesmo com buraco no modelo", () => {
    const snapshot = buildWorkoutSnapshot(
      source({
        exercises: [
          sourceExercise({ id: "b", workoutExerciseId: "b", plannedPosition: 7 }),
          sourceExercise({ id: "a", workoutExerciseId: "a", plannedPosition: 2 }),
        ],
      }),
    );
    expect(snapshot.exercises.map((e) => e.workoutExerciseId)).toEqual(["a", "b"]);
    expect(snapshot.exercises.map((e) => e.plannedPosition)).toEqual([0, 1]);
  });

  it("nome vazio não vira string vazia na tela", () => {
    expect(buildWorkoutSnapshot(source({ workoutName: "   " })).workoutName).toBe("Treino");
  });

  it("treino vazio nasce sem exercício e com nome do usuário", () => {
    const snapshot = emptyWorkoutSnapshot("Treino livre de sexta", { defaultRestSeconds: 60 });
    expect(snapshot.exercises).toHaveLength(0);
    expect(snapshot.workoutName).toBe("Treino livre de sexta");
    expect(snapshot.defaultRestSeconds).toBe(60);
    expect(snapshot.workoutId).toBeNull();
  });
});

/* ═══════════════════════ Preparação ═══════════════════════ */

describe("applyPreparation", () => {
  it("sem ajuste, o exercício passa intacto", () => {
    const exercises = [sourceExercise()];
    expect(applyPreparation(exercises, [])).toEqual(exercises);
  });

  it("tirar um exercício da sessão de hoje não mexe no modelo", () => {
    const exercises = [
      sourceExercise({ id: "a", workoutExerciseId: "a" }),
      sourceExercise({ id: "b", workoutExerciseId: "b", plannedPosition: 1 }),
    ];
    const result = applyPreparation(exercises, [{ key: "b", include: false }]);
    expect(result).toHaveLength(1);
    expect(exercises).toHaveLength(2);
  });

  it("ajustar séries substitui a lista e vira configuração série a série", () => {
    const result = applyPreparation(
      [sourceExercise()],
      [
        {
          key: "we-1",
          sets: [
            { plannedWeightKg: 70, targetRepsMin: 6, targetRepsMax: 8 },
            { plannedWeightKg: 65, targetRepsMin: 8, targetRepsMax: 10 },
          ],
        },
      ],
    );

    const snapshot = buildWorkoutSnapshot(source({ exercises: result }));
    expect(snapshot.exercises[0].sets).toHaveLength(2);
    expect(snapshot.exercises[0].sets[0].plannedWeightKg).toBe(70);
    expect(snapshot.exercises[0].sets[1].plannedWeightKg).toBe(65);
  });

  it("lista de séries vazia remove o exercício", () => {
    expect(applyPreparation([sourceExercise()], [{ key: "we-1", sets: [] }])).toHaveLength(0);
  });

  it("reordenar na preparação muda a posição planejada", () => {
    const exercises = [
      sourceExercise({ id: "a", workoutExerciseId: "a", plannedPosition: 0 }),
      sourceExercise({ id: "b", workoutExerciseId: "b", plannedPosition: 1 }),
    ];
    const result = applyPreparation(exercises, [
      { key: "a", position: 1 },
      { key: "b", position: 0 },
    ]);
    const snapshot = buildWorkoutSnapshot(source({ exercises: result }));
    expect(snapshot.exercises.map((e) => e.workoutExerciseId)).toEqual(["b", "a"]);
  });

  it("ajustar descanso e superset sem tocar nas séries", () => {
    const result = applyPreparation(
      [sourceExercise()],
      [{ key: "we-1", restSeconds: 120, supersetGroup: "A" }],
    );
    expect(result[0].restSeconds).toBe(120);
    expect(result[0].supersetGroup).toBe("A");
    expect(result[0].defaultSets).toBe(4);
  });

  it("null explícito limpa o campo; ausente preserva", () => {
    const comNull = applyPreparation([sourceExercise()], [{ key: "we-1", restSeconds: null }]);
    expect(comNull[0].restSeconds).toBeNull();

    const semCampo = applyPreparation([sourceExercise()], [{ key: "we-1", notes: "abc" }]);
    expect(semCampo[0].restSeconds).toBe(90);
  });
});

/* ═══════════════════════ Linhas e resumo ═══════════════════════ */

describe("linhas para o banco", () => {
  it("a execução começa na mesma ordem do planejado", () => {
    const snapshot = buildWorkoutSnapshot(source());
    const row = snapshotExerciseRow(snapshot.exercises[0]);
    expect(row.planned_position).toBe(0);
    expect(row.executed_position).toBe(0);
    expect(row.exercise_name_snapshot).toBe("Supino reto com barra");
    expect(row.tracking_type).toBe("peso_reps");
  });

  it("a série sem descanso próprio herda o descanso padrão da sessão", () => {
    const snapshot = buildWorkoutSnapshot(
      source({ defaultRestSeconds: 75, exercises: [sourceExercise({ restSeconds: null })] }),
    );
    const row = snapshotSetRow(snapshot.exercises[0].sets[0], snapshot.defaultRestSeconds);
    expect(row.planned_rest_seconds).toBe(75);
  });

  it("resume exercícios, séries e grupos musculares", () => {
    const snapshot = buildWorkoutSnapshot(
      source({
        exercises: [
          sourceExercise({ defaultSets: 1, isWarmup: true }),
          sourceExercise({
            id: "we-2",
            workoutExerciseId: "we-2",
            plannedPosition: 1,
            defaultSets: 3,
            muscleGroup: "Tríceps",
          }),
        ],
      }),
    );

    expect(summarizeSnapshot(snapshot)).toEqual({
      exerciseCount: 2,
      setCount: 4,
      workingSetCount: 3,
      warmupSetCount: 1,
      muscleGroups: ["Peitoral", "Tríceps"],
    });
  });
});

describe("parseWorkoutSnapshot", () => {
  it("lê de volta o que foi gravado", () => {
    const snapshot = buildWorkoutSnapshot(source());
    expect(parseWorkoutSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("devolve null para conteúdo que não é snapshot", () => {
    expect(parseWorkoutSnapshot(null)).toBeNull();
    expect(parseWorkoutSnapshot({})).toBeNull();
    expect(parseWorkoutSnapshot("texto")).toBeNull();
  });

  it("tolera campos ausentes de uma versão anterior sem quebrar a sessão antiga", () => {
    const parsed = parseWorkoutSnapshot({ exercises: [] });
    expect(parsed).toMatchObject({ workoutName: "Treino", defaultRestSeconds: 90 });
  });
});
