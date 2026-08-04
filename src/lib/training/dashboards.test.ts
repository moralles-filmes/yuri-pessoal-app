/**
 * Fase 17-E — Testes de `dashboards.ts`.
 *
 * O que estes testes protegem:
 *  • período sem nenhum treino não divide por zero nem produz `NaN`/`Infinity`;
 *  • a comparação com o período anterior devolve `null` quando não há base;
 *  • a aderência só conta dia planejado que já passou, e descanso não é falta de treino;
 *  • o calendário de consistência distingue treinado, parcial, descanso, planejado e livre;
 *  • nenhum agregado é recalculado — os números batem com `metrics.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  CONSISTENCY_STATE_LABELS,
  CONSISTENCY_STATES,
  adherence,
  buildDashboard,
  compareValues,
  comparePeriods,
  consistencyCalendar,
  dashboardRange,
  deltaLabel,
  muscleGroupShares,
  previousRange,
  rangeLabel,
  sessionsInRange,
  summarizeConsistency,
  topExercises,
  weeklyGoalStreak,
  weeksInRange,
  type PlannedDay,
} from "./dashboards";
import { aggregateSessions, type MetricExercise, type MetricSession, type MetricSet } from "./metrics";

/* ───────────────────────────── Fábricas ───────────────────────────── */

const makeSet = (over: Partial<MetricSet> = {}): MetricSet => ({
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
  ...over,
});

const makeExercise = (over: Partial<MetricExercise> = {}): MetricExercise => ({
  id: "ex-1",
  exerciseId: "cat-1",
  exerciseName: "Supino reto",
  trackingType: "peso_reps",
  laterality: "bilateral",
  muscleGroup: "Peitoral",
  countsInVolume: true,
  sets: [makeSet()],
  ...over,
});

const makeSession = (over: Partial<MetricSession> = {}): MetricSession => ({
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
  ...over,
});

const planned = (date: string, over: Partial<PlannedDay> = {}): PlannedDay => ({
  scheduledDate: date,
  entryKind: "treino",
  status: "planejado",
  ...over,
});

/* ═══════════════════════════ Janelas ═══════════════════════════ */

describe("dashboardRange", () => {
  it("semana começa na segunda por padrão", () => {
    expect(dashboardRange("semana", "2026-08-05")).toEqual({ from: "2026-08-03", to: "2026-08-09" });
  });

  it("semana respeita o primeiro dia configurado", () => {
    expect(dashboardRange("semana", "2026-08-05", 0)).toEqual({
      from: "2026-08-02",
      to: "2026-08-08",
    });
  });

  it("mês cobre o mês inteiro, inclusive fevereiro", () => {
    expect(dashboardRange("mes", "2026-02-17")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(dashboardRange("mes", "2024-02-17")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
  });

  it("ano cobre o ano do calendário", () => {
    expect(dashboardRange("ano", "2026-08-05")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("período anterior tem o mesmo tamanho e atravessa a virada de ano", () => {
    expect(previousRange("semana", { from: "2026-01-05", to: "2026-01-11" })).toEqual({
      from: "2025-12-29",
      to: "2026-01-04",
    });
    expect(previousRange("mes", { from: "2026-01-01", to: "2026-01-31" })).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(previousRange("ano", { from: "2026-01-01", to: "2026-12-31" })).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("rotula o período em pt-BR", () => {
    expect(rangeLabel("mes", { from: "2026-03-01", to: "2026-03-31" })).toBe("março de 2026");
    expect(rangeLabel("semana", { from: "2026-08-03", to: "2026-08-09" })).toBe("03/08 a 09/08");
    expect(rangeLabel("ano", { from: "2026-01-01", to: "2026-12-31" })).toBe("2026");
  });

  it("recorta as sessões pela data pura", () => {
    const list = [
      makeSession({ id: "a", sessionDate: "2026-07-31" }),
      makeSession({ id: "b", sessionDate: "2026-08-03" }),
      makeSession({ id: "c", sessionDate: "2026-08-09" }),
      makeSession({ id: "d", sessionDate: "2026-08-10" }),
    ];
    const inRange = sessionsInRange(list, { from: "2026-08-03", to: "2026-08-09" });
    expect(inRange.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("semanas da janela nunca é zero (não pode virar divisor de zero)", () => {
    expect(weeksInRange({ from: "2026-08-03", to: "2026-08-09" })).toBe(1);
    expect(weeksInRange({ from: "2026-08-01", to: "2026-08-31" })).toBeCloseTo(4.43, 2);
    expect(weeksInRange({ from: "2026-08-03", to: "2026-08-03" })).toBe(1);
    // Intervalo invertido: continua ≥ 1, sem NaN.
    expect(weeksInRange({ from: "2026-08-09", to: "2026-08-03" })).toBe(1);
  });
});

/* ═══════════════════════════ Dashboard ═══════════════════════════ */

describe("buildDashboard", () => {
  it("período sem NENHUM treino não produz NaN em lugar nenhum", () => {
    const dashboard = buildDashboard([], "semana", dashboardRange("semana", "2026-08-05"), "2026-08-05");

    expect(dashboard.metrics.sessionCount).toBe(0);
    expect(dashboard.metrics.totals.volumeKg).toBe(0);
    expect(dashboard.muscleGroups).toEqual([]);
    expect(dashboard.exercises).toEqual([]);
    expect(dashboard.frequency.currentWeekStreak).toBe(0);

    const json = JSON.stringify(dashboard);
    expect(json).not.toContain("NaN");
    expect(json).not.toContain("Infinity");
  });

  it("os totais do dashboard são EXATAMENTE os de metrics.ts (nada é recalculado)", () => {
    const sessions = [
      makeSession({ id: "a", sessionDate: "2026-08-03" }),
      makeSession({ id: "b", sessionDate: "2026-08-05" }),
    ];
    const range = dashboardRange("semana", "2026-08-05");
    const dashboard = buildDashboard(sessions, "semana", range, "2026-08-05");
    const direto = aggregateSessions(sessions);

    expect(dashboard.metrics.totals).toEqual(direto.totals);
    expect(dashboard.metrics.sessionCount).toBe(direto.sessionCount);
  });

  it("a regra do usuário chega até o dashboard (aquecimento dentro muda o total)", () => {
    const sessions = [
      makeSession({
        exercises: [
          makeExercise({
            sets: [makeSet({ setNumber: 1, isWarmup: true }), makeSet({ setNumber: 2 })],
          }),
        ],
      }),
    ];
    const range = dashboardRange("semana", "2026-08-05");

    const fora = buildDashboard(sessions, "semana", range, "2026-08-05", { includeWarmup: false });
    const dentro = buildDashboard(sessions, "semana", range, "2026-08-05", { includeWarmup: true });

    expect(fora.metrics.totals.sets).toBe(1);
    expect(dentro.metrics.totals.sets).toBe(2);
  });

  it("a sequência de semanas olha o histórico inteiro, não só a janela", () => {
    const sessions = [
      makeSession({ id: "a", sessionDate: "2026-07-20" }),
      makeSession({ id: "b", sessionDate: "2026-07-27" }),
      makeSession({ id: "c", sessionDate: "2026-08-03" }),
    ];
    const range = dashboardRange("semana", "2026-08-05");
    const dashboard = buildDashboard(sessions, "semana", range, "2026-08-05");
    expect(dashboard.frequency.currentWeekStreak).toBe(3);
  });

  it("sessão cancelada não entra no dashboard", () => {
    const dashboard = buildDashboard(
      [makeSession({ status: "cancelada" })],
      "semana",
      dashboardRange("semana", "2026-08-05"),
      "2026-08-05",
    );
    expect(dashboard.metrics.sessionCount).toBe(0);
  });
});

describe("distribuição por grupo muscular", () => {
  it("soma as séries por grupo e calcula a participação", () => {
    const sessions = [
      makeSession({
        exercises: [
          makeExercise({ id: "e1", muscleGroup: "Peitoral", sets: [makeSet(), makeSet({ setNumber: 2 })] }),
          makeExercise({ id: "e2", exerciseId: "cat-2", exerciseName: "Remada", muscleGroup: "Costas", sets: [makeSet()] }),
        ],
      }),
    ];
    const metrics = aggregateSessions(sessions);
    const shares = muscleGroupShares(sessions, metrics);

    expect(shares[0]).toMatchObject({ group: "Peitoral", sets: 2 });
    expect(shares[0].percent).toBeCloseTo(66.7, 1);
    expect(shares[1]).toMatchObject({ group: "Costas", sets: 1 });
    expect(shares[0].lastTrainedOn).toBe("2026-08-03");
  });

  it("sem série nenhuma, a participação é 0 e não NaN", () => {
    const shares = muscleGroupShares([], aggregateSessions([]));
    expect(shares).toEqual([]);
  });

  it("guarda a última data em que o grupo foi treinado", () => {
    const sessions = [
      makeSession({ id: "a", sessionDate: "2026-08-01" }),
      makeSession({ id: "b", sessionDate: "2026-08-06" }),
    ];
    const shares = muscleGroupShares(sessions, aggregateSessions(sessions));
    expect(shares[0].lastTrainedOn).toBe("2026-08-06");
  });
});

describe("topExercises", () => {
  it("agrupa por exercício, soma as séries e conta as sessões", () => {
    const sessions = [
      makeSession({ id: "a", sessionDate: "2026-08-01" }),
      makeSession({ id: "b", sessionDate: "2026-08-03" }),
    ];
    const top = topExercises(sessions);
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ exerciseName: "Supino reto", sets: 2, sessions: 2 });
    expect(top[0].volumeKg).toBe(1000);
  });

  it("exercício sem id do catálogo é agrupado pelo NOME congelado", () => {
    const sessions = [
      makeSession({
        id: "a",
        exercises: [makeExercise({ exerciseId: null, exerciseName: "Movimento antigo" })],
      }),
      makeSession({
        id: "b",
        sessionDate: "2026-08-04",
        exercises: [makeExercise({ exerciseId: null, exerciseName: "Movimento antigo" })],
      }),
    ];
    const top = topExercises(sessions);
    expect(top).toHaveLength(1);
    expect(top[0].sessions).toBe(2);
  });

  it("exercício sem série contada fica de fora", () => {
    const top = topExercises([
      makeSession({
        exercises: [makeExercise({ sets: [makeSet({ status: "pulada" })] })],
      }),
    ]);
    expect(top).toEqual([]);
  });
});

/* ═══════════════════════════ Comparação ═══════════════════════════ */

describe("comparação entre períodos", () => {
  it("calcula a variação percentual", () => {
    expect(compareValues(120, 100)).toMatchObject({ absolute: 20, percent: 20 });
    expect(compareValues(80, 100)).toMatchObject({ absolute: -20, percent: -20 });
  });

  it("período anterior ZERADO devolve null, nunca Infinity", () => {
    const delta = compareValues(10, 0);
    expect(delta.percent).toBeNull();
    expect(Number.isFinite(delta.absolute)).toBe(true);
  });

  it("dois períodos zerados também não produzem NaN", () => {
    const delta = compareValues(0, 0);
    expect(delta.percent).toBeNull();
    expect(delta.absolute).toBe(0);
  });

  it("o rótulo explica a falta de base em vez de mostrar 0%", () => {
    expect(deltaLabel(compareValues(0, 0))).toBe("sem base");
    expect(deltaLabel(compareValues(10, 0))).toBe("primeiro período");
    expect(deltaLabel(compareValues(120, 100))).toBe("+20%");
    expect(deltaLabel(compareValues(80, 100))).toBe("−20%");
  });

  it("comparar períodos propaga o aviso de parcial", () => {
    const current = aggregateSessions([
      makeSession({
        bodyWeightKg: null,
        exercises: [makeExercise({ trackingType: "peso_corporal_reps", sets: [makeSet({ weightKg: null })] })],
      }),
    ]);
    const previous = aggregateSessions([makeSession()]);
    const comparison = comparePeriods(current, previous);
    expect(comparison.partial).toBe(true);
    expect(comparison.sessions.current).toBe(1);
  });
});

/* ═══════════════════════════ Aderência ═══════════════════════════ */

describe("aderência ao planejamento", () => {
  const range = { from: "2026-08-03", to: "2026-08-09" };

  it("NADA planejado devolve null — não é 0%", () => {
    const result = adherence([], ["2026-08-03"], range, "2026-08-09");
    expect(result.percent).toBeNull();
    expect(result.planned).toBe(0);
  });

  it("conta os dias planejados que já passaram e tiveram treino", () => {
    const result = adherence(
      [planned("2026-08-03"), planned("2026-08-05"), planned("2026-08-07")],
      ["2026-08-03", "2026-08-07"],
      range,
      "2026-08-09",
    );
    expect(result).toMatchObject({ planned: 3, done: 2, upcoming: 0 });
    expect(result.percent).toBeCloseTo(66.7, 1);
  });

  it("dia planejado no FUTURO não conta como falta", () => {
    const result = adherence(
      [planned("2026-08-03"), planned("2026-08-08")],
      ["2026-08-03"],
      range,
      "2026-08-05",
    );
    expect(result).toMatchObject({ planned: 1, done: 1, upcoming: 1 });
    expect(result.percent).toBe(100);
  });

  it("descanso planejado NÃO entra na aderência de treino", () => {
    const result = adherence(
      [planned("2026-08-03"), planned("2026-08-04", { entryKind: "descanso" })],
      ["2026-08-03"],
      range,
      "2026-08-09",
    );
    expect(result.planned).toBe(1);
    expect(result.percent).toBe(100);
  });

  it("dia cancelado ou reagendado sai do denominador", () => {
    const result = adherence(
      [
        planned("2026-08-03"),
        planned("2026-08-04", { status: "cancelado" }),
        planned("2026-08-05", { status: "reagendado" }),
      ],
      ["2026-08-03"],
      range,
      "2026-08-09",
    );
    expect(result.planned).toBe(1);
    expect(result.percent).toBe(100);
  });

  it("dois treinos planejados no mesmo dia contam como UM dia", () => {
    const result = adherence(
      [planned("2026-08-03"), planned("2026-08-03")],
      ["2026-08-03"],
      range,
      "2026-08-09",
    );
    expect(result.planned).toBe(1);
    expect(result.percent).toBe(100);
  });

  it("nenhum treino feito é 0% de verdade — havia plano e ele não aconteceu", () => {
    const result = adherence([planned("2026-08-03")], [], range, "2026-08-09");
    expect(result.percent).toBe(0);
  });
});

/* ═══════════════════════════ Sequência semanal ═══════════════════════════ */

describe("weeklyGoalStreak", () => {
  const week = (start: string, count: number, prefix: string): MetricSession[] =>
    Array.from({ length: count }, (_, i) =>
      makeSession({ id: `${prefix}${i}`, sessionDate: `${start}` === start ? addDays(start, i) : start }),
    );

  function addDays(iso: string, days: number): string {
    const [y, m, d] = iso.split("-").map(Number);
    const stamp = Date.UTC(y, m - 1, d + days);
    const date = new Date(stamp);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  it("meta desligada (0) não produz sequência", () => {
    expect(weeklyGoalStreak([makeSession()], 0, "2026-08-05")).toBe(0);
  });

  it("conta as semanas seguidas que bateram a meta", () => {
    const sessions = [
      ...week("2026-07-20", 3, "a"),
      ...week("2026-07-27", 3, "b"),
      ...week("2026-08-03", 3, "c"),
    ];
    expect(weeklyGoalStreak(sessions, 3, "2026-08-05")).toBe(3);
  });

  it("a semana CORRENTE incompleta não quebra a sequência das anteriores", () => {
    const sessions = [
      ...week("2026-07-20", 3, "a"),
      ...week("2026-07-27", 3, "b"),
      ...week("2026-08-03", 1, "c"),
    ];
    // Ainda é quarta-feira: a semana atual não bateu, mas também não terminou.
    expect(weeklyGoalStreak(sessions, 3, "2026-08-05")).toBe(2);
  });

  it("uma semana passada abaixo da meta interrompe a sequência", () => {
    const sessions = [
      ...week("2026-07-20", 3, "a"),
      ...week("2026-07-27", 1, "b"),
      ...week("2026-08-03", 3, "c"),
    ];
    expect(weeklyGoalStreak(sessions, 3, "2026-08-05")).toBe(1);
  });

  it("dois treinos no mesmo dia contam como UM dia da semana", () => {
    const sessions = [
      makeSession({ id: "x", sessionDate: "2026-08-03" }),
      makeSession({ id: "y", sessionDate: "2026-08-03" }),
    ];
    expect(weeklyGoalStreak(sessions, 2, "2026-08-05")).toBe(0);
  });
});

/* ═══════════════════════════ Calendário de consistência ═══════════════════════════ */

describe("calendário de consistência", () => {
  const range = { from: "2026-08-03", to: "2026-08-09" };

  it("um dia por data, na ordem", () => {
    const days = consistencyCalendar([], [], range, "2026-08-05");
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe("2026-08-03");
    expect(days[6].date).toBe("2026-08-09");
  });

  it("distingue treinado, parcial, descanso, planejado sem execução, livre e futuro", () => {
    const days = consistencyCalendar(
      [
        makeSession({ id: "a", sessionDate: "2026-08-03", status: "concluida" }),
        makeSession({ id: "b", sessionDate: "2026-08-04", status: "abandonada" }),
      ],
      [planned("2026-08-05", { entryKind: "descanso" }), planned("2026-08-06")],
      range,
      "2026-08-07",
    );

    const byDate = Object.fromEntries(days.map((day) => [day.date, day.state]));
    expect(byDate["2026-08-03"]).toBe("treinado");
    expect(byDate["2026-08-04"]).toBe("parcial");
    expect(byDate["2026-08-05"]).toBe("descanso");
    expect(byDate["2026-08-06"]).toBe("planejado_sem_execucao");
    expect(byDate["2026-08-07"]).toBe("livre");
    expect(byDate["2026-08-08"]).toBe("futuro");
  });

  it("dia planejado no futuro é FUTURO, nunca 'não realizado'", () => {
    const days = consistencyCalendar([], [planned("2026-08-09")], range, "2026-08-05");
    expect(days.find((day) => day.date === "2026-08-09")?.state).toBe("futuro");
  });

  it("dia livre sem plano nenhum não é falha", () => {
    const days = consistencyCalendar([], [], range, "2026-08-09");
    expect(days.every((day) => day.state === "livre")).toBe(true);
  });

  it("marca o dia de hoje", () => {
    const days = consistencyCalendar([], [], range, "2026-08-05");
    expect(days.filter((day) => day.isToday).map((day) => day.date)).toEqual(["2026-08-05"]);
  });

  it("leva o volume do dia, vindo de metrics.ts", () => {
    const days = consistencyCalendar([makeSession({ sessionDate: "2026-08-03" })], [], range, "2026-08-09");
    expect(days[0].volumeKg).toBe(500);
    expect(days[0].workouts).toEqual(["Treino A"]);
  });

  it("resume a contagem por estado", () => {
    const days = consistencyCalendar(
      [makeSession({ sessionDate: "2026-08-03" })],
      [planned("2026-08-04")],
      range,
      "2026-08-09",
    );
    const summary = summarizeConsistency(days);
    expect(summary.treinado).toBe(1);
    expect(summary.planejado_sem_execucao).toBe(1);
    expect(summary.livre).toBe(5);
    expect(Object.values(summary).reduce((a, b) => a + b, 0)).toBe(7);
  });

  it("nenhum rótulo do calendário culpa o usuário", () => {
    const banidas = ["falhou", "falha", "perdeu", "você não", "não cumpriu"];
    for (const state of CONSISTENCY_STATES) {
      const label = CONSISTENCY_STATE_LABELS[state].toLowerCase();
      for (const palavra of banidas) expect(label).not.toContain(palavra);
    }
  });
});
