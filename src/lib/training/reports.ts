/**
 * Fase 17-E — Treinos · Relatórios por período (PURO, sem I/O, sem `Date.now()`).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ O RELATÓRIO NÃO RECALCULA NADA.                                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Ele entra por `metrics.ts` (17-D) e por `dashboards.ts`, monta as séries do período e
 * transforma isso em linhas de tabela e de CSV. Um relatório que refizesse a conta acabaria
 * discordando do histórico — e o usuário teria dois números para a mesma semana, sem saber
 * qual acreditar. É a mesma regra do `reports.ts` da Dieta, que entra por `dayTotals`.
 *
 * ══ AS DUAS REGRAS DO CSV ══
 *
 * 1. **CÉLULA VAZIA ≠ ZERO.** Um agregado indisponível sai como célula VAZIA, nunca como "0".
 *    No Excel a diferença entre as duas é a diferença entre "não sei" e "medi e deu zero", e
 *    uma planilha que soma zeros inventados produz um número que ninguém consegue auditar.
 * 2. **A REGRA DE CONTAGEM VIAJA COM O ARQUIVO.** O cabeçalho do CSV leva qual regra de
 *    volume estava valendo (aquecimento dentro/fora, contagem do unilateral) e quais linhas
 *    ficaram parciais. Sem isso, o mesmo período exportado em dois dias diferentes daria
 *    números diferentes sem explicação.
 *
 * Quem transforma as linhas em texto é `toCsv` (`src/lib/reports/csv.ts`, Fase 14) e quem
 * baixa é `downloadCsv` — nenhum dos dois é reimplementado aqui.
 */
import {
  aggregateSessions,
  formatVolumeKg,
  metricsByDay,
  metricsByMonth,
  metricsByWeek,
  partialExplanation,
  sessionCounts,
  volumeRuleLabel,
  type MetricBucket,
  type MetricOptions,
  type MetricSession,
  type PeriodMetrics,
} from "./metrics";
import {
  adherence,
  consistencyCalendar,
  muscleGroupShares,
  sessionsInRange,
  topExercises,
  weeksInRange,
  type Adherence,
  type DateRange,
  type ExerciseShare,
  type MuscleGroupShare,
  type PlannedDay,
} from "./dashboards";
import { durationLabel } from "./history";
import type { PersonalRecord } from "./history-queries";
import { formatRecordValue, recordTypeLabel } from "./records";
import type { MeasurementWithType } from "@/lib/body/types";
import { formatMeasurementValue } from "@/lib/body/measurements";
import { toCsv } from "@/lib/reports/csv";

/* ═══════════════════════════ Granularidade ═══════════════════════════ */

export const REPORT_GRANULARITIES = ["dia", "semana", "mes"] as const;
export type ReportGranularity = (typeof REPORT_GRANULARITIES)[number];

export const REPORT_GRANULARITY_LABELS: Record<ReportGranularity, string> = {
  dia: "Por dia",
  semana: "Por semana",
  mes: "Por mês",
};

export function bucketsFor(
  sessions: MetricSession[],
  granularity: ReportGranularity,
  options: MetricOptions & { weekStartsOn?: number } = {},
): MetricBucket[] {
  if (granularity === "dia") return metricsByDay(sessions, options);
  if (granularity === "mes") return metricsByMonth(sessions, options);
  return metricsByWeek(sessions, options);
}

/* ═══════════════════════════ O relatório do período ═══════════════════════════ */

export type PeriodReport = {
  range: DateRange;
  granularity: ReportGranularity;
  totals: PeriodMetrics;
  buckets: MetricBucket[];
  muscleGroups: MuscleGroupShare[];
  exercises: ExerciseShare[];
  adherence: Adherence;
  /** Dias treinados, parciais, de descanso e livres — do calendário de consistência. */
  daysTrained: number;
  daysPartial: number;
  /** Duração média por sessão, em segundos. `null` sem sessão — não é 0. */
  averageSessionSeconds: number | null;
  /** Volume médio por sessão. `null` sem sessão em kg. */
  averageVolumeKg: number | null;
  /** Média de treinos por semana no período. `null` quando o período é inválido. */
  sessionsPerWeek: number | null;
  /** A regra de contagem que gerou estes números — viaja junto, sempre. */
  ruleLabel: string;
  /** Vazio quando o total é exato. */
  partialNote: string;
};

/**
 * Monta o relatório de um intervalo.
 *
 * @param hoje 'yyyy-MM-dd' INJETADO — a aderência só conta dia planejado que já passou.
 */
export function buildPeriodReport(
  sessions: MetricSession[],
  planned: PlannedDay[],
  range: DateRange,
  granularity: ReportGranularity,
  hoje: string,
  options: MetricOptions & { weekStartsOn?: number } = {},
): PeriodReport {
  const inRange = sessionsInRange(sessions, range).filter(sessionCounts);
  const totals = aggregateSessions(inRange, options);
  const weeks = weeksInRange(range);

  const consistency = consistencyCalendar(inRange, planned, range, hoje, options);

  return {
    range,
    granularity,
    totals,
    buckets: bucketsFor(inRange, granularity, options),
    muscleGroups: muscleGroupShares(inRange, totals),
    exercises: topExercises(inRange, options, 20),
    adherence: adherence(planned, totals.trainedDays, range, hoje),
    daysTrained: consistency.filter((day) => day.state === "treinado").length,
    daysPartial: consistency.filter((day) => day.state === "parcial").length,
    averageSessionSeconds:
      totals.sessionCount === 0 ? null : Math.round(totals.totalSeconds / totals.sessionCount),
    averageVolumeKg:
      totals.sessionCount === 0
        ? null
        : Number((totals.totals.volumeKg / totals.sessionCount).toFixed(1)),
    sessionsPerWeek: weeks <= 0 ? null : Number((totals.sessionCount / weeks).toFixed(2)),
    ruleLabel: volumeRuleLabel(options),
    partialNote: partialExplanation(totals.totals),
  };
}

/* ═══════════════════════════ Linhas de CSV ═══════════════════════════ */

/** Número em pt-BR. `null`/indefinido vira CÉLULA VAZIA — jamais 0. Regra 1 do arquivo. */
function num(value: number | null | undefined, precision = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: precision,
  });
}

const brDate = (iso: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;

export const PERIOD_CSV_HEADERS = [
  "Período",
  "Treinos",
  "Dias treinados",
  "Volume (kg)",
  "Séries",
  "Séries de trabalho",
  "Repetições",
  "Tempo total",
  "Tempo ativo",
  "Distância (m)",
  "Qualidade",
  "Observação",
];

/** Uma linha por bucket (dia, semana ou mês). */
export function periodCsvRows(report: PeriodReport): string[][] {
  return report.buckets.map((bucket) => {
    const totals = bucket.metrics.totals;
    return [
      bucket.label,
      String(bucket.metrics.sessionCount),
      String(bucket.metrics.trainedDays.length),
      // Volume só existe para os tipos que acumulam em kg. Sem nenhum, célula VAZIA.
      totals.units.includes("kg") ? num(totals.volumeKg, 1) : "",
      String(totals.sets),
      String(totals.workingSets),
      String(totals.reps),
      bucket.metrics.totalSeconds > 0 ? durationLabel(bucket.metrics.totalSeconds) : "",
      bucket.metrics.activeSeconds > 0 ? durationLabel(bucket.metrics.activeSeconds) : "",
      totals.distanceM > 0 ? num(totals.distanceM, 1) : "",
      totals.quality === "parcial" ? "parcial" : "exato",
      partialExplanation(totals),
    ];
  });
}

export const SESSION_CSV_HEADERS = [
  "Data",
  "Treino",
  "Programa",
  "Volume (kg)",
  "Séries",
  "Repetições",
  "Duração",
  "Tempo ativo",
  "Peso corporal (kg)",
  "Qualidade",
];

/** Uma linha por sessão executada. O nome do treino vem do SNAPSHOT, não do modelo atual. */
export function sessionCsvRows(
  sessions: MetricSession[],
  options: MetricOptions = {},
): string[][] {
  return [...sessions]
    .filter(sessionCounts)
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
    .map((session) => {
      const metrics = aggregateSessions([session], options);
      const totals = metrics.totals;
      return [
        brDate(session.sessionDate),
        session.workoutName,
        session.programName ?? "",
        totals.units.includes("kg") ? num(totals.volumeKg, 1) : "",
        String(totals.sets),
        String(totals.reps),
        session.totalSeconds ? durationLabel(session.totalSeconds) : "",
        session.activeSeconds ? durationLabel(session.activeSeconds) : "",
        // Sem peso corporal do dia, célula VAZIA: a carga efetiva é indisponível, nunca zero.
        num(session.bodyWeightKg, 1),
        totals.quality === "parcial" ? "parcial" : "exato",
      ];
    });
}

export const MUSCLE_CSV_HEADERS = [
  "Grupo muscular",
  "Séries",
  "% das séries",
  "Volume (kg)",
  "Último treino",
];

export function muscleCsvRows(shares: MuscleGroupShare[]): string[][] {
  return shares.map((share) => [
    share.group,
    String(share.sets),
    num(share.percent, 1),
    share.volumeKg > 0 ? num(share.volumeKg, 1) : "",
    share.lastTrainedOn ? brDate(share.lastTrainedOn) : "",
  ]);
}

export const EXERCISE_CSV_HEADERS = ["Exercício", "Séries", "Volume (kg)", "Sessões"];

export function exerciseCsvRows(shares: ExerciseShare[]): string[][] {
  return shares.map((share) => [
    share.exerciseName,
    String(share.sets),
    share.volumeKg > 0 ? num(share.volumeKg, 1) : "",
    String(share.sessions),
  ]);
}

export const RECORD_CSV_HEADERS = [
  "Exercício",
  "Tipo de recorde",
  "Valor",
  "Data",
  "Marca anterior",
  "Data da marca anterior",
];

export function recordCsvRows(records: PersonalRecord[]): string[][] {
  return records.map((record) => [
    record.exerciseName ?? "Geral",
    recordTypeLabel(record.recordType, record.referenceWeightKg),
    formatRecordValue(record.value, record.unit),
    brDate(record.achievedOn),
    // Sem marca anterior, célula VAZIA — não "0".
    record.previousValue === null ? "" : formatRecordValue(record.previousValue, record.unit),
    record.previousAchievedOn ? brDate(record.previousAchievedOn) : "",
  ]);
}

export const MEASUREMENT_CSV_HEADERS = ["Data", "Medida", "Valor", "Unidade", "Condição"];

/**
 * Medidas corporais do período — lidas do MÓDULO CENTRAL `body_*` (16-E).
 *
 * O relatório de treino exporta a evolução corporal porque ela é parte do acompanhamento; o
 * dado, porém, continua vindo de um lugar só. **Nenhuma foto entra no CSV** — nem o binário,
 * nem a URL assinada, que expira em minutos e não faz sentido dentro de um arquivo salvo.
 */
export function measurementCsvRows(measurements: MeasurementWithType[]): string[][] {
  return [...measurements]
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))
    .map((measurement) => [
      brDate(measurement.measuredOn),
      measurement.typeName,
      formatMeasurementValue(measurement.value, measurement.typeDecimals),
      measurement.unit,
      measurement.condition ?? "",
    ]);
}

/**
 * O cabeçalho de contexto que abre todo CSV do módulo.
 *
 * Sem ele, o arquivo é um monte de números sem procedência: quem exportou não lembra qual
 * regra de volume estava valendo, e quem recebe não tem como saber.
 */
export function reportCsvPreamble(report: PeriodReport): string[][] {
  return [
    ["Período", `${brDate(report.range.from)} a ${brDate(report.range.to)}`],
    ["Regra de contagem", report.ruleLabel],
    [
      "Qualidade do total",
      report.totals.totals.quality === "parcial" ? `parcial — ${report.partialNote}` : "exato",
    ],
    [
      "Aderência ao planejamento",
      report.adherence.percent === null
        ? "sem planejamento no período"
        : `${num(report.adherence.percent, 1)}% (${report.adherence.done} de ${report.adherence.planned})`,
    ],
    ["Treinos", String(report.totals.sessionCount)],
    ["Dias treinados", String(report.daysTrained)],
  ];
}

/* ═══════════════════════════ Montagem do arquivo ═══════════════════════════ */

export type CsvSection = { title: string; headers: string[]; rows: string[][] };

/**
 * O arquivo inteiro, em blocos.
 *
 * Um CSV por seção seria mais "puro", mas quem exporta quer UM arquivo: o período, as sessões,
 * os grupos musculares, os exercícios, os recordes e as medidas na mesma planilha, cada bloco
 * com o seu cabeçalho.
 */
export function reportCsvSections(
  report: PeriodReport,
  extras: {
    sessions?: MetricSession[];
    records?: PersonalRecord[];
    measurements?: MeasurementWithType[];
    options?: MetricOptions;
  } = {},
): CsvSection[] {
  const sections: CsvSection[] = [
    { title: "Relatório de treinos — Sistema Pessoal Yuri", headers: ["Campo", "Valor"], rows: reportCsvPreamble(report) },
    { title: `Totais ${REPORT_GRANULARITY_LABELS[report.granularity].toLowerCase()}`, headers: PERIOD_CSV_HEADERS, rows: periodCsvRows(report) },
  ];

  if (extras.sessions && extras.sessions.length > 0) {
    sections.push({
      title: "Sessões",
      headers: SESSION_CSV_HEADERS,
      rows: sessionCsvRows(extras.sessions, extras.options),
    });
  }
  if (report.muscleGroups.length > 0) {
    sections.push({ title: "Grupos musculares", headers: MUSCLE_CSV_HEADERS, rows: muscleCsvRows(report.muscleGroups) });
  }
  if (report.exercises.length > 0) {
    sections.push({ title: "Exercícios", headers: EXERCISE_CSV_HEADERS, rows: exerciseCsvRows(report.exercises) });
  }
  if (extras.records && extras.records.length > 0) {
    sections.push({ title: "Recordes", headers: RECORD_CSV_HEADERS, rows: recordCsvRows(extras.records) });
  }
  if (extras.measurements && extras.measurements.length > 0) {
    sections.push({
      title: "Medidas corporais (módulo central, compartilhado com a Dieta)",
      headers: MEASUREMENT_CSV_HEADERS,
      rows: measurementCsvRows(extras.measurements),
    });
  }

  return sections;
}

/**
 * Blocos → texto CSV.
 *
 * O escape (aspas, ';', quebra de linha) é do `toCsv` da Fase 14 — reimplementá-lo aqui seria
 * a segunda implementação de RFC 4180 no projeto, livre para divergir no primeiro nome de
 * exercício com ponto e vírgula.
 */
export function sectionsToCsv(sections: CsvSection[]): string {
  return sections
    .map((section) => {
      const objects = section.rows.map((row) =>
        Object.fromEntries(section.headers.map((header, index) => [header, row[index] ?? ""])),
      );
      return `${toCsv([], [section.title])}\r\n${toCsv(objects, section.headers)}`;
    })
    .join("\r\n\r\n");
}

/** "12.480 kg" para a tela; o CSV usa `num`, sem sufixo, para a planilha poder somar. */
export const volumeDisplay = formatVolumeKg;
