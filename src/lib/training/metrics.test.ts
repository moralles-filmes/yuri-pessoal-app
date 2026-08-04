/**
 * Fase 17-D — Testes de `metrics.ts`.
 *
 * O que estes testes protegem, em uma frase: **o módulo não pode somar quilos com segundos** —
 * e um dado ausente não pode virar zero e inflar (ou esvaziar) um gráfico em silêncio.
 */
import { describe, expect, it } from "vitest";
import {
  aggregateSessions,
  dropSetBlocks,
  exerciseMetrics,
  formatVolumeKg,
  frequencyMetrics,
  metricsByKey,
  metricsByMonth,
  metricsByWeek,
  mergeTotals,
  partialExplanation,
  sessionMetrics,
  setContribution,
  setCountsForVolume,
  volumeRuleLabel,
  type MetricExercise,
  type MetricSession,
  type MetricSet,
} from "./metrics";
import type { TrackingType } from "./constants";

/* ───────────────────────────── Fábricas ───────────────────────────── */

function makeSet(overrides: Partial<MetricSet> = {}): MetricSet {
  return {
    setNumber: 1,
    status: "concluida",
    setType: "trabalho",
    isWarmup: false,
    countsInVolume: true,
    reps: 10,
    weightKg: 50,
    additionalWeightKg: null,
    assistanceWeightKg: null,
    durationSeconds: null,
    distanceM: null,
    calories: null,
    ...overrides,
  };
}

function makeExercise(overrides: Partial<MetricExercise> = {}): MetricExercise {
  return {
    id: "ex-1",
    exerciseId: "cat-1",
    exerciseName: "Supino reto com barra",
    trackingType: "peso_reps",
    laterality: "bilateral",
    muscleGroup: "Peitoral",
    countsInVolume: true,
    sets: [makeSet()],
    ...overrides,
  };
}

function makeSession(overrides: Partial<MetricSession> = {}): MetricSession {
  return {
    id: "s-1",
    sessionDate: "2026-08-03",
    status: "concluida",
    workoutId: "w-1",
    workoutName: "Treino A",
    programId: "p-1",
    programName: "ABC",
    bodyWeightKg: 80,
    totalSeconds: 3600,
    activeSeconds: 2400,
    exercises: [makeExercise()],
    ...overrides,
  };
}

const single = (trackingType: TrackingType, set: Partial<MetricSet>, bodyWeightKg: number | null = 80) =>
  exerciseMetrics(
    makeExercise({ trackingType, sets: [makeSet(set)] }),
    bodyWeightKg,
  );

/* ═══════════════════════════ Volume por tipo de acompanhamento ═══════════════════════════ */

describe("volume — cada tipo de acompanhamento na sua unidade", () => {
  it("peso_reps: peso × repetições, em kg", () => {
    const metrics = single("peso_reps", { weightKg: 100, reps: 8 });
    expect(metrics.unit).toBe("kg");
    expect(metrics.totals.volumeKg).toBe(800);
    expect(metrics.totals.reps).toBe(8);
    expect(metrics.totals.quality).toBe("exato");
  });

  it("peso_corporal_reps: peso corporal do dia × repetições", () => {
    const metrics = single("peso_corporal_reps", { weightKg: null, reps: 12 }, 80);
    expect(metrics.totals.volumeKg).toBe(960);
  });

  it("peso_corporal_adicional SOMA a carga extra", () => {
    const metrics = single(
      "peso_corporal_adicional",
      { weightKg: null, reps: 6, additionalWeightKg: 20 },
      80,
    );
    expect(metrics.totals.volumeKg).toBe(600); // (80 + 20) × 6
  });

  it("peso_corporal_assistido SUBTRAI a assistência (o sinal jamais se inverte)", () => {
    const metrics = single(
      "peso_corporal_assistido",
      { weightKg: null, reps: 10, assistanceWeightKg: 30 },
      80,
    );
    expect(metrics.totals.volumeKg).toBe(500); // (80 − 30) × 10
  });

  it("reps_sem_carga não gera volume em kg — conta em repetições", () => {
    const metrics = single("reps_sem_carga", { weightKg: null, reps: 25 });
    expect(metrics.unit).toBe("reps");
    expect(metrics.totals.volumeKg).toBe(0);
    expect(metrics.totals.reps).toBe(25);
    expect(metrics.totals.quality).toBe("exato");
  });

  it("duracao conta em segundos, nunca em kg", () => {
    const metrics = single("duracao", { weightKg: null, reps: null, durationSeconds: 60 });
    expect(metrics.unit).toBe("segundos");
    expect(metrics.totals.durationSeconds).toBe(60);
    expect(metrics.totals.volumeKg).toBe(0);
  });

  it("isometria conta em segundos mesmo com carga informada", () => {
    const metrics = single("isometria", { weightKg: 20, reps: null, durationSeconds: 45 });
    expect(metrics.unit).toBe("segundos");
    expect(metrics.totals.durationSeconds).toBe(45);
    expect(metrics.totals.volumeKg).toBe(0);
  });

  it("distancia_duracao conta distância e tempo", () => {
    const metrics = single("distancia_duracao", {
      weightKg: null,
      reps: null,
      distanceM: 3000,
      durationSeconds: 1200,
    });
    expect(metrics.unit).toBe("distancia");
    expect(metrics.totals.distanceM).toBe(3000);
    expect(metrics.totals.durationSeconds).toBe(1200);
    expect(metrics.totals.volumeKg).toBe(0);
  });

  it("calorias ficam isoladas — estimativa do painel do aparelho", () => {
    const metrics = single("calorias", { weightKg: null, reps: null, calories: 220 });
    expect(metrics.unit).toBe("calorias");
    expect(metrics.totals.calories).toBe(220);
    expect(metrics.totals.volumeKg).toBe(0);
  });

  it("quilos e segundos não se somam num total único", () => {
    const session = makeSession({
      exercises: [
        makeExercise({ id: "a", sets: [makeSet({ weightKg: 100, reps: 10 })] }),
        makeExercise({
          id: "b",
          trackingType: "duracao",
          exerciseName: "Prancha",
          sets: [makeSet({ weightKg: null, reps: null, durationSeconds: 60 })],
        }),
      ],
    });
    const metrics = sessionMetrics(session);
    expect(metrics.totals.volumeKg).toBe(1000);
    expect(metrics.totals.durationSeconds).toBe(60);
    expect(metrics.totals.units.sort()).toEqual(["kg", "segundos"]);
  });
});

/* ═══════════════════════════ Ausência de dado ═══════════════════════════ */

describe("ausência de dado não é zero", () => {
  it("sem peso corporal do dia, a série de peso corporal fica de fora e o total é PARCIAL", () => {
    const metrics = single("peso_corporal_reps", { weightKg: null, reps: 12 }, null);
    expect(metrics.totals.volumeKg).toBe(0);
    expect(metrics.totals.quality).toBe("parcial");
    expect(metrics.totals.gaps).toEqual([{ reason: "sem_peso_corporal", sets: 1 }]);
    expect(partialExplanation(metrics.totals)).toContain("peso corporal");
  });

  it("carga não informada não vira 0 kg", () => {
    const metrics = single("peso_reps", { weightKg: null, reps: 10 });
    expect(metrics.totals.volumeKg).toBe(0);
    expect(metrics.totals.gaps).toEqual([{ reason: "carga_nao_informada", sets: 1 }]);
  });

  it("repetições não informadas não viram 0 repetições", () => {
    const metrics = single("peso_reps", { weightKg: 60, reps: null });
    expect(metrics.totals.quality).toBe("parcial");
    expect(metrics.totals.gaps).toEqual([{ reason: "reps_nao_informadas", sets: 1 }]);
  });

  it("o 'parcial' se propaga da série para a sessão e para o período", () => {
    const session = makeSession({
      bodyWeightKg: null,
      exercises: [
        makeExercise({ id: "a", sets: [makeSet({ weightKg: 100, reps: 10 })] }),
        makeExercise({
          id: "b",
          trackingType: "peso_corporal_reps",
          exerciseName: "Flexão",
          sets: [makeSet({ weightKg: null, reps: 20 })],
        }),
      ],
    });

    const perSession = sessionMetrics(session);
    expect(perSession.totals.volumeKg).toBe(1000);
    expect(perSession.totals.quality).toBe("parcial");

    const period = aggregateSessions([session, session]);
    expect(period.totals.quality).toBe("parcial");
    expect(period.totals.gaps).toEqual([{ reason: "sem_peso_corporal", sets: 2 }]);
  });

  it("exato + parcial = parcial (mergeTotals nunca 'promove' qualidade)", () => {
    const exato = single("peso_reps", { weightKg: 50, reps: 10 }).totals;
    const parcial = single("peso_reps", { weightKg: null, reps: 10 }).totals;
    expect(mergeTotals(exato, parcial).quality).toBe("parcial");
    expect(mergeTotals(exato, exato).quality).toBe("exato");
  });
});

/* ═══════════════════════════ Aquecimento ═══════════════════════════ */

describe("aquecimento", () => {
  const exercise = makeExercise({
    sets: [
      makeSet({ setNumber: 1, isWarmup: true, weightKg: 40, reps: 10 }),
      makeSet({ setNumber: 2, weightKg: 100, reps: 8 }),
    ],
  });

  it("fica fora do volume por padrão", () => {
    const metrics = exerciseMetrics(exercise, 80);
    expect(metrics.totals.volumeKg).toBe(800);
    expect(metrics.totals.sets).toBe(1);
    expect(metrics.totals.warmupSets).toBe(0);
  });

  it("entra quando o usuário escolhe incluir", () => {
    const metrics = exerciseMetrics(exercise, 80, { includeWarmup: true });
    expect(metrics.totals.volumeKg).toBe(1200);
    expect(metrics.totals.sets).toBe(2);
    expect(metrics.totals.warmupSets).toBe(1);
    expect(metrics.totals.workingSets).toBe(1);
  });

  it("a regra vigente é exibível junto do número", () => {
    expect(volumeRuleLabel({ includeWarmup: true })).toContain("incluído");
    expect(volumeRuleLabel()).toContain("fora");
    expect(volumeRuleLabel({ unilateralRule: "por_lado" })).toContain("cada lado");
  });
});

/* ═══════════════════════════ Séries que não contam ═══════════════════════════ */

describe("só série feita conta", () => {
  it.each(["pendente", "pulada", "cancelada"] as const)("série %s fica de fora", (status) => {
    const metrics = exerciseMetrics(
      makeExercise({ sets: [makeSet({ status })] }),
      80,
    );
    expect(metrics.totals.sets).toBe(0);
    expect(metrics.totals.volumeKg).toBe(0);
  });

  it("série até a falha CONTA (foi executada)", () => {
    const metrics = exerciseMetrics(
      makeExercise({ sets: [makeSet({ status: "falhou", weightKg: 100, reps: 5 })] }),
      80,
    );
    expect(metrics.totals.volumeKg).toBe(500);
  });

  it("série marcada para não contar no volume fica de fora", () => {
    expect(setCountsForVolume(makeSet({ countsInVolume: false }), true)).toBe(false);
    expect(setCountsForVolume(makeSet(), false)).toBe(false);
    expect(setCountsForVolume(makeSet(), true)).toBe(true);
  });

  it("sessão cancelada não entra em agregado nenhum", () => {
    const period = aggregateSessions([
      makeSession({ id: "ok" }),
      makeSession({ id: "cancelada", status: "cancelada" }),
    ]);
    expect(period.sessionCount).toBe(1);
    expect(period.totals.volumeKg).toBe(500);
  });
});

/* ═══════════════════════════ Drop set ═══════════════════════════ */

describe("drop set soma os blocos e conta como UMA série", () => {
  const exercise = makeExercise({
    sets: [
      makeSet({ setNumber: 1, weightKg: 100, reps: 8 }),
      makeSet({ setNumber: 2, setType: "drop_set", weightKg: 80, reps: 6 }),
      makeSet({ setNumber: 3, setType: "drop_set", weightKg: 60, reps: 6 }),
    ],
  });

  it("agrupa séries consecutivas de drop set", () => {
    const blocks = dropSetBlocks(exercise.sets);
    expect(blocks).toHaveLength(2);
    expect(blocks[1].isDropSet).toBe(true);
    expect(blocks[1].sets).toHaveLength(2);
  });

  it("o volume soma tudo, mas a contagem de séries é 2 (normal + bloco)", () => {
    const metrics = exerciseMetrics(exercise, 80);
    expect(metrics.totals.volumeKg).toBe(800 + 480 + 360);
    expect(metrics.totals.sets).toBe(2);
  });

  it("drop sets separados por uma série normal são dois blocos", () => {
    const blocks = dropSetBlocks([
      makeSet({ setNumber: 1, setType: "drop_set" }),
      makeSet({ setNumber: 2 }),
      makeSet({ setNumber: 3, setType: "drop_set" }),
    ]);
    expect(blocks).toHaveLength(3);
  });
});

/* ═══════════════════════════ Unilateral ═══════════════════════════ */

describe("unilateral — as três regras", () => {
  const exercise = makeExercise({
    exerciseName: "Rosca unilateral",
    laterality: "unilateral_alternado",
    sets: [makeSet({ weightKg: 20, reps: 10 })],
  });

  it("por_lado: 2 séries, repetições e volume dobrados", () => {
    const metrics = exerciseMetrics(exercise, 80, { unilateralRule: "por_lado" });
    expect(metrics.totals.sets).toBe(2);
    expect(metrics.totals.reps).toBe(20);
    expect(metrics.totals.volumeKg).toBe(400);
  });

  it("soma_dos_lados: 1 série, repetições e volume dobrados", () => {
    const metrics = exerciseMetrics(exercise, 80, { unilateralRule: "soma_dos_lados" });
    expect(metrics.totals.sets).toBe(1);
    expect(metrics.totals.reps).toBe(20);
    expect(metrics.totals.volumeKg).toBe(400);
  });

  it("serie_completa: 1 série, o valor registrado JÁ é a série inteira", () => {
    const metrics = exerciseMetrics(exercise, 80, { unilateralRule: "serie_completa" });
    expect(metrics.totals.sets).toBe(1);
    expect(metrics.totals.reps).toBe(10);
    expect(metrics.totals.volumeKg).toBe(200);
  });

  it("com os lados registrados separadamente, o trabalho executado soma em QUALQUER regra", () => {
    const withSides = makeExercise({
      laterality: "unilateral_alternado",
      sets: [
        makeSet({ weightKg: null, reps: null, repsLeft: 10, repsRight: 8, weightLeftKg: 20, weightRightKg: 22 }),
      ],
    });

    for (const rule of ["por_lado", "soma_dos_lados", "serie_completa"] as const) {
      const metrics = exerciseMetrics(withSides, 80, { unilateralRule: rule });
      expect(metrics.totals.volumeKg).toBe(20 * 10 + 22 * 8);
      expect(metrics.totals.reps).toBe(18);
    }
    expect(exerciseMetrics(withSides, 80, { unilateralRule: "por_lado" }).totals.sets).toBe(2);
    expect(exerciseMetrics(withSides, 80, { unilateralRule: "serie_completa" }).totals.sets).toBe(1);
  });

  it("exercício bilateral ignora a regra unilateral", () => {
    const metrics = exerciseMetrics(makeExercise(), 80, { unilateralRule: "por_lado" });
    expect(metrics.totals.sets).toBe(1);
    expect(metrics.totals.volumeKg).toBe(500);
  });
});

/* ═══════════════════════════ Agregações ═══════════════════════════ */

describe("agregação por sessão, grupo muscular, semana, mês e programa", () => {
  const sessions: MetricSession[] = [
    makeSession({
      id: "s1",
      sessionDate: "2026-08-03", // segunda
      exercises: [
        makeExercise({ id: "a", muscleGroup: "Peitoral", sets: [makeSet({ weightKg: 100, reps: 10 })] }),
        makeExercise({
          id: "b",
          exerciseName: "Tríceps na polia",
          muscleGroup: "Tríceps",
          sets: [makeSet({ weightKg: 30, reps: 12 })],
        }),
      ],
    }),
    makeSession({
      id: "s2",
      sessionDate: "2026-08-05", // quarta, mesma semana
      workoutId: "w-2",
      workoutName: "Treino B",
      exercises: [
        makeExercise({ id: "c", muscleGroup: "Peitoral", sets: [makeSet({ weightKg: 80, reps: 10 })] }),
      ],
    }),
    makeSession({
      id: "s3",
      sessionDate: "2026-09-01", // outro mês
      exercises: [makeExercise({ id: "d", sets: [makeSet({ weightKg: 60, reps: 10 })] })],
    }),
  ];

  it("séries e volume por grupo muscular, sem misturar principal com secundário", () => {
    const metrics = sessionMetrics(sessions[0]);
    expect(metrics.setsByMuscleGroup).toEqual({ Peitoral: 1, Tríceps: 1 });
    expect(metrics.volumeByMuscleGroup).toEqual({ Peitoral: 1000, Tríceps: 360 });
  });

  it("período soma sessões e conta dias treinados", () => {
    const period = aggregateSessions(sessions);
    expect(period.sessionCount).toBe(3);
    expect(period.totals.volumeKg).toBe(1000 + 360 + 800 + 600);
    expect(period.trainedDays).toEqual(["2026-08-03", "2026-08-05", "2026-09-01"]);
  });

  it("semana agrupa pela segunda-feira (primeiro dia configurável)", () => {
    const weeks = metricsByWeek(sessions);
    expect(weeks.map((week) => week.key)).toEqual(["2026-08-03", "2026-08-31"]);
    expect(weeks[0].metrics.sessionCount).toBe(2);
    expect(weeks[0].label).toBe("03/08 a 09/08");
  });

  it("mês agrupa por 'yyyy-MM'", () => {
    const months = metricsByMonth(sessions);
    expect(months.map((month) => month.key)).toEqual(["2026-08", "2026-09"]);
    expect(months[1].label).toBe("set/26");
  });

  it("agrupa por treino e por programa a partir do SNAPSHOT", () => {
    const byWorkout = metricsByKey(sessions, (session) => ({
      key: session.workoutId ?? "avulso",
      label: session.workoutName,
    }));
    expect(byWorkout.map((bucket) => bucket.label)).toContain("Treino A");
    expect(byWorkout.map((bucket) => bucket.label)).toContain("Treino B");

    const byProgram = metricsByKey(sessions, (session) => ({
      key: session.programId ?? "sem-programa",
      label: session.programName ?? "Sem programa",
    }));
    expect(byProgram).toHaveLength(1);
    expect(byProgram[0].metrics.sessionCount).toBe(3);
  });
});

/* ═══════════════════════════ Frequência ═══════════════════════════ */

describe("frequência (com `hoje` injetado, sem Date.now)", () => {
  const weekly = (dates: string[]): MetricSession[] =>
    dates.map((date, index) => makeSession({ id: `s${index}`, sessionDate: date }));

  it("conta dias treinados, sessões e semanas distintas", () => {
    const result = frequencyMetrics(
      weekly(["2026-08-03", "2026-08-03", "2026-08-05", "2026-08-12"]),
      "2026-08-14",
    );
    expect(result.sessions).toBe(4);
    expect(result.trainedDays).toBe(3);
    expect(result.trainedWeeks).toBe(2);
  });

  it("maior sequência de semanas consecutivas", () => {
    const result = frequencyMetrics(
      weekly(["2026-08-03", "2026-08-10", "2026-08-17", "2026-09-07"]),
      "2026-09-10",
    );
    expect(result.longestWeekStreak).toBe(3);
  });

  it("a sequência atual quebra quando a última semana treinada ficou para trás", () => {
    const result = frequencyMetrics(weekly(["2026-08-03", "2026-08-10"]), "2026-09-01");
    expect(result.currentWeekStreak).toBe(0);
    expect(result.longestWeekStreak).toBe(2);
  });

  it("a sequência atual vale se o treino foi na semana passada e a atual ainda não teve treino", () => {
    const result = frequencyMetrics(weekly(["2026-08-03", "2026-08-10"]), "2026-08-18");
    expect(result.currentWeekStreak).toBe(2);
  });
});

/* ═══════════════════════════ Fuso e apresentação ═══════════════════════════ */

describe("data pura e apresentação", () => {
  it("sessão que atravessa a meia-noite fica no dia em que começou", () => {
    // A data é PURA: nenhuma conversão de timestamp acontece aqui.
    const session = makeSession({ sessionDate: "2026-08-03" });
    expect(sessionMetrics(session).sessionDate).toBe("2026-08-03");
    expect(metricsByWeek([session])[0].key).toBe("2026-08-03");
  });

  it("volume é formatado só na apresentação", () => {
    expect(formatVolumeKg(950)).toBe("950 kg");
    expect(formatVolumeKg(12480)).toBe("12,5 t");
  });

  it("setContribution é uma função pura sobre uma série", () => {
    const contribution = setContribution(
      makeSet({ weightKg: 40, reps: 12 }),
      { trackingType: "peso_reps", laterality: "bilateral" },
      null,
    );
    expect(contribution).toMatchObject({ unit: "kg", volumeKg: 480, reps: 12, setCount: 1, ok: true });
  });
});
