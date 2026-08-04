/**
 * Fase 17-E — Testes de `reports.ts`.
 *
 * O que estes testes protegem:
 *  • o relatório não recalcula nada — os totais são os de `metrics.ts`;
 *  • CÉLULA VAZIA ≠ ZERO no CSV;
 *  • a regra de contagem e o aviso de parcial viajam com o arquivo exportado;
 *  • período vazio não gera `NaN` nem médias inventadas.
 */
import { describe, expect, it } from "vitest";
import {
  EXERCISE_CSV_HEADERS,
  MEASUREMENT_CSV_HEADERS,
  MUSCLE_CSV_HEADERS,
  PERIOD_CSV_HEADERS,
  RECORD_CSV_HEADERS,
  SESSION_CSV_HEADERS,
  bucketsFor,
  buildPeriodReport,
  exerciseCsvRows,
  measurementCsvRows,
  muscleCsvRows,
  periodCsvRows,
  recordCsvRows,
  reportCsvPreamble,
  sessionCsvRows,
} from "./reports";
import { aggregateSessions, type MetricExercise, type MetricSession, type MetricSet } from "./metrics";
import type { PlannedDay } from "./dashboards";
import type { PersonalRecord } from "./history-queries";
import type { MeasurementWithType } from "@/lib/body/types";

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

const range = { from: "2026-08-01", to: "2026-08-31" };
const planned = (date: string, over: Partial<PlannedDay> = {}): PlannedDay => ({
  scheduledDate: date,
  entryKind: "treino",
  status: "planejado",
  ...over,
});

/* ═══════════════════════════ Relatório ═══════════════════════════ */

describe("buildPeriodReport", () => {
  it("os totais são exatamente os de metrics.ts", () => {
    const sessions = [
      makeSession({ id: "a", sessionDate: "2026-08-03" }),
      makeSession({ id: "b", sessionDate: "2026-08-10" }),
    ];
    const report = buildPeriodReport(sessions, [], range, "semana", "2026-08-31");
    expect(report.totals.totals).toEqual(aggregateSessions(sessions).totals);
  });

  it("período VAZIO não inventa média nenhuma", () => {
    const report = buildPeriodReport([], [], range, "semana", "2026-08-31");
    expect(report.totals.sessionCount).toBe(0);
    expect(report.averageSessionSeconds).toBeNull();
    expect(report.averageVolumeKg).toBeNull();
    expect(report.buckets).toEqual([]);
    expect(report.adherence.percent).toBeNull();
    expect(JSON.stringify(report)).not.toContain("NaN");
  });

  it("calcula média por sessão e treinos por semana", () => {
    const sessions = [
      makeSession({ id: "a", sessionDate: "2026-08-03" }),
      makeSession({ id: "b", sessionDate: "2026-08-10" }),
    ];
    const report = buildPeriodReport(sessions, [], range, "semana", "2026-08-31");
    expect(report.averageSessionSeconds).toBe(3600);
    expect(report.averageVolumeKg).toBe(500);
    expect(report.sessionsPerWeek).toBeCloseTo(0.45, 2);
  });

  it("conta dias treinados e dias parciais separadamente", () => {
    const report = buildPeriodReport(
      [
        makeSession({ id: "a", sessionDate: "2026-08-03", status: "concluida" }),
        makeSession({ id: "b", sessionDate: "2026-08-04", status: "abandonada" }),
      ],
      [],
      range,
      "dia",
      "2026-08-31",
    );
    expect(report.daysTrained).toBe(1);
    expect(report.daysPartial).toBe(1);
  });

  it("a regra de contagem viaja junto do relatório", () => {
    const report = buildPeriodReport([], [], range, "semana", "2026-08-31", {
      includeWarmup: true,
      unilateralRule: "por_lado",
    });
    expect(report.ruleLabel).toContain("aquecimento incluído");
    expect(report.ruleLabel).toContain("cada lado");
  });

  it("total parcial carrega o motivo por extenso", () => {
    const report = buildPeriodReport(
      [
        makeSession({
          bodyWeightKg: null,
          exercises: [
            makeExercise({ trackingType: "peso_corporal_reps", sets: [makeSet({ weightKg: null })] }),
          ],
        }),
      ],
      [],
      range,
      "semana",
      "2026-08-31",
    );
    expect(report.totals.totals.quality).toBe("parcial");
    expect(report.partialNote).toContain("peso corporal");
  });

  it("a aderência entra no relatório com a mesma regra do dashboard", () => {
    const report = buildPeriodReport(
      [makeSession({ sessionDate: "2026-08-03" })],
      [planned("2026-08-03"), planned("2026-08-05")],
      range,
      "semana",
      "2026-08-31",
    );
    expect(report.adherence).toMatchObject({ planned: 2, done: 1 });
  });

  it("agrupa por dia, semana e mês conforme pedido", () => {
    const sessions = [
      makeSession({ id: "a", sessionDate: "2026-08-03" }),
      makeSession({ id: "b", sessionDate: "2026-08-04" }),
    ];
    expect(bucketsFor(sessions, "dia")).toHaveLength(2);
    expect(bucketsFor(sessions, "semana")).toHaveLength(1);
    expect(bucketsFor(sessions, "mes")).toHaveLength(1);
  });
});

/* ═══════════════════════════ CSV ═══════════════════════════ */

describe("CSV — célula vazia nunca é zero", () => {
  it("período sem volume em kg deixa a célula de volume VAZIA", () => {
    const report = buildPeriodReport(
      [
        makeSession({
          exercises: [
            makeExercise({
              trackingType: "duracao",
              sets: [makeSet({ weightKg: null, reps: null, durationSeconds: 60 })],
            }),
          ],
        }),
      ],
      [],
      range,
      "semana",
      "2026-08-31",
    );
    const rows = periodCsvRows(report);
    const volumeIndex = PERIOD_CSV_HEADERS.indexOf("Volume (kg)");
    expect(rows[0][volumeIndex]).toBe("");
    expect(rows[0][volumeIndex]).not.toBe("0");
  });

  it("sessão SEM peso corporal deixa a célula vazia, nunca 0", () => {
    const rows = sessionCsvRows([makeSession({ bodyWeightKg: null })]);
    const index = SESSION_CSV_HEADERS.indexOf("Peso corporal (kg)");
    expect(rows[0][index]).toBe("");
  });

  it("recorde sem marca anterior deixa a célula vazia", () => {
    const record: PersonalRecord = {
      id: "r1",
      exerciseId: "e1",
      exerciseName: "Supino reto",
      scope: "exercicio",
      recordType: "maior_peso",
      recordKey: "k",
      value: 100,
      unit: "kg",
      referenceWeightKg: null,
      reps: 5,
      weightKg: 100,
      oneRmFormula: null,
      achievedOn: "2026-08-03",
      sessionId: "s1",
      sessionSetId: null,
      previousValue: null,
      previousAchievedOn: null,
      notes: null,
      updatedAt: "2026-08-03T00:00:00Z",
    };
    const rows = recordCsvRows([record]);
    const index = RECORD_CSV_HEADERS.indexOf("Marca anterior");
    expect(rows[0][index]).toBe("");
    expect(rows[0][RECORD_CSV_HEADERS.indexOf("Data")]).toBe("03/08/2026");
  });

  it("linha de período leva a qualidade e o motivo do parcial", () => {
    const report = buildPeriodReport(
      [
        makeSession({
          bodyWeightKg: null,
          exercises: [
            makeExercise({ trackingType: "peso_corporal_reps", sets: [makeSet({ weightKg: null })] }),
          ],
        }),
      ],
      [],
      range,
      "semana",
      "2026-08-31",
    );
    const rows = periodCsvRows(report);
    expect(rows[0][PERIOD_CSV_HEADERS.indexOf("Qualidade")]).toBe("parcial");
    expect(rows[0][PERIOD_CSV_HEADERS.indexOf("Observação")]).toContain("peso corporal");
  });

  it("linhas de sessão saem em ordem cronológica com o nome CONGELADO do treino", () => {
    const rows = sessionCsvRows([
      makeSession({ id: "b", sessionDate: "2026-08-10", workoutName: "Treino B" }),
      makeSession({ id: "a", sessionDate: "2026-08-03", workoutName: "Treino A" }),
    ]);
    expect(rows.map((row) => row[1])).toEqual(["Treino A", "Treino B"]);
    expect(rows[0][0]).toBe("03/08/2026");
  });

  it("sessão cancelada não vai para o CSV", () => {
    expect(sessionCsvRows([makeSession({ status: "cancelada" })])).toEqual([]);
  });

  it("grupo muscular sem volume em kg deixa a célula vazia", () => {
    const sessions = [
      makeSession({
        exercises: [
          makeExercise({
            trackingType: "duracao",
            muscleGroup: "Core",
            sets: [makeSet({ weightKg: null, reps: null, durationSeconds: 45 })],
          }),
        ],
      }),
    ];
    const rows = muscleCsvRows(
      buildPeriodReport(sessions, [], range, "semana", "2026-08-31").muscleGroups,
    );
    expect(rows[0][MUSCLE_CSV_HEADERS.indexOf("Volume (kg)")]).toBe("");
    expect(rows[0][MUSCLE_CSV_HEADERS.indexOf("Grupo muscular")]).toBe("Core");
  });

  it("linhas de exercício trazem séries, volume e sessões", () => {
    const report = buildPeriodReport([makeSession()], [], range, "semana", "2026-08-31");
    const rows = exerciseCsvRows(report.exercises);
    expect(rows[0][EXERCISE_CSV_HEADERS.indexOf("Exercício")]).toBe("Supino reto");
    expect(rows[0][EXERCISE_CSV_HEADERS.indexOf("Séries")]).toBe("1");
  });

  it("medidas corporais saem do módulo central, em ordem, sem nenhuma foto", () => {
    const measurements: MeasurementWithType[] = [
      {
        id: "m2",
        typeId: "t1",
        measuredOn: "2026-08-10",
        measuredAt: "07:00",
        value: 79.4,
        unit: "kg",
        condition: "jejum",
        note: null,
        source: "manual",
        createdAt: "2026-08-10T10:00:00Z",
        typeName: "Peso",
        typeSlug: "peso",
        typeCategory: "peso",
        typeDecimals: 1,
      },
      {
        id: "m1",
        typeId: "t1",
        measuredOn: "2026-08-01",
        measuredAt: null,
        value: 80.2,
        unit: "kg",
        condition: null,
        note: null,
        source: "manual",
        createdAt: "2026-08-01T10:00:00Z",
        typeName: "Peso",
        typeSlug: "peso",
        typeCategory: "peso",
        typeDecimals: 1,
      },
    ];
    const rows = measurementCsvRows(measurements);
    expect(rows.map((row) => row[0])).toEqual(["01/08/2026", "10/08/2026"]);
    expect(rows[0][MEASUREMENT_CSV_HEADERS.indexOf("Valor")]).toBe("80,2");
    // Sem condição registrada: célula vazia, não um valor inventado.
    expect(rows[0][MEASUREMENT_CSV_HEADERS.indexOf("Condição")]).toBe("");
    const flat = JSON.stringify(rows);
    expect(flat).not.toContain("http");
    expect(flat).not.toContain("storage");
  });

  it("o cabeçalho do CSV explica período, regra e qualidade", () => {
    const report = buildPeriodReport([makeSession()], [], range, "semana", "2026-08-31");
    const preamble = reportCsvPreamble(report);
    const flat = preamble.flat().join(" | ");
    expect(flat).toContain("01/08/2026 a 31/08/2026");
    expect(flat).toContain("Regra de contagem");
    expect(flat).toContain("exato");
  });

  it("sem planejamento, o cabeçalho diz isso em vez de 0%", () => {
    const report = buildPeriodReport([makeSession()], [], range, "semana", "2026-08-31");
    const flat = reportCsvPreamble(report).flat().join(" | ");
    expect(flat).toContain("sem planejamento no período");
  });
});
