/**
 * Fase 17-E — Treinos · Dashboards de semana, mês e ano (PURO, sem I/O, sem `Date.now()`).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO NÃO CALCULA NADA QUE `metrics.ts` JÁ CALCULA.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Volume, séries, repetições, tempo, distância, frequência e distribuição por grupo muscular
 * saem de `aggregateSessions` / `frequencyMetrics` — com a regra do usuário já aplicada
 * (aquecimento dentro ou fora, contagem do unilateral) e com a QUALIDADE (`exato | parcial`)
 * grudada no número. O que este arquivo faz é **recortar o período**, **comparar com o período
 * anterior** e **montar o calendário de consistência**.
 *
 * Se um dashboard precisar de um agregado que não existe, ele é acrescentado em `metrics.ts` —
 * nunca aqui. Um segundo lugar que soma séries é um segundo número na tela para a mesma semana.
 *
 * ═══════════════════════ DIVISÃO POR ZERO NÃO EXISTE AQUI ═══════════════════════
 *
 * Período sem treino nenhum é caso NORMAL (férias, lesão, semana corrida). Toda razão devolve
 * `null` em vez de `NaN`, `Infinity` ou "0%" — e a tela escreve "sem base de comparação".
 *
 * ═══════════════════════ O CALENDÁRIO NÃO COBRA NINGUÉM ═══════════════════════
 *
 * Ele mostra o que aconteceu: treinado, parcial, descanso planejado, planejado sem execução,
 * dia livre. Sem alarme, sem vermelho de erro, sem "você falhou". Um dia livre não planejado
 * é simplesmente um dia livre.
 */
import {
  aggregateSessions,
  exerciseMetrics,
  frequencyMetrics,
  sessionCounts,
  type FrequencyMetrics,
  type MetricOptions,
  type MetricSession,
  type PeriodMetrics,
} from "./metrics";
import {
  addDaysIso,
  addMonthsIso,
  diffDaysIso,
  eachDayIso,
  endOfMonthIso,
  isDateIso,
  startOfMonthIso,
  startOfWeekIso,
} from "./schedule";

/* ═══════════════════════════ Janela do dashboard ═══════════════════════════ */

export const DASHBOARD_PERIODS = ["semana", "mes", "ano"] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriod, string> = {
  semana: "Semana",
  mes: "Mês",
  ano: "Ano",
};

export type DateRange = { from: string; to: string };

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const brDay = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** A janela de calendário do período que contém `reference`. */
export function dashboardRange(
  period: DashboardPeriod,
  reference: string,
  weekStartsOn = 1,
): DateRange {
  if (!isDateIso(reference)) return { from: reference, to: reference };
  if (period === "semana") {
    const from = startOfWeekIso(reference, weekStartsOn);
    return { from, to: addDaysIso(from, 6) };
  }
  if (period === "mes") {
    return { from: startOfMonthIso(reference), to: endOfMonthIso(reference) };
  }
  const year = reference.slice(0, 4);
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** A janela IMEDIATAMENTE anterior, do mesmo tamanho — a base da comparação. */
export function previousRange(period: DashboardPeriod, range: DateRange): DateRange {
  if (period === "semana") {
    const from = addDaysIso(range.from, -7);
    return { from, to: addDaysIso(from, 6) };
  }
  if (period === "mes") {
    const from = startOfMonthIso(addMonthsIso(range.from, -1));
    return { from, to: endOfMonthIso(from) };
  }
  const year = Number(range.from.slice(0, 4)) - 1;
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function rangeLabel(period: DashboardPeriod, range: DateRange): string {
  if (period === "semana") return `${brDay(range.from)} a ${brDay(range.to)}`;
  if (period === "mes") {
    const name = MONTH_NAMES[Number(range.from.slice(5, 7)) - 1] ?? range.from.slice(5, 7);
    return `${name} de ${range.from.slice(0, 4)}`;
  }
  return range.from.slice(0, 4);
}

/** Só as sessões cuja DATA cai na janela. O recorte é textual: data pura não tem fuso. */
export function sessionsInRange<T extends { sessionDate: string }>(
  sessions: T[],
  range: DateRange,
): T[] {
  return sessions.filter(
    (session) => session.sessionDate >= range.from && session.sessionDate <= range.to,
  );
}

/** Semanas (ou fração) da janela — o divisor de "séries por semana". Nunca menor que 1. */
export function weeksInRange(range: DateRange): number {
  const days = diffDaysIso(range.from, range.to) + 1;
  return Math.max(1, Number((days / 7).toFixed(3)));
}

/* ═══════════════════════════ O dashboard de um período ═══════════════════════════ */

export type MuscleGroupShare = {
  group: string;
  sets: number;
  volumeKg: number;
  /** Participação nas séries do período, 0–100. */
  percent: number;
  /** Última data em que o grupo foi treinado (dentro do conjunto lido). `null` = nunca. */
  lastTrainedOn: string | null;
};

export type ExerciseShare = {
  exerciseId: string | null;
  exerciseName: string;
  sets: number;
  volumeKg: number;
  sessions: number;
};

export type TrainingDashboard = {
  period: DashboardPeriod;
  range: DateRange;
  label: string;
  metrics: PeriodMetrics;
  frequency: FrequencyMetrics;
  muscleGroups: MuscleGroupShare[];
  exercises: ExerciseShare[];
  weeks: number;
};

/**
 * Monta o dashboard de uma janela.
 *
 * @param hoje 'yyyy-MM-dd' INJETADO — a sequência de semanas depende de saber que dia é hoje,
 *             e o servidor é quem sabe isso em Brasília.
 */
export function buildDashboard(
  sessions: MetricSession[],
  period: DashboardPeriod,
  range: DateRange,
  hoje: string,
  options: MetricOptions & { weekStartsOn?: number } = {},
): TrainingDashboard {
  const inRange = sessionsInRange(sessions, range);
  const metrics = aggregateSessions(inRange, options);

  return {
    period,
    range,
    label: rangeLabel(period, range),
    metrics,
    // A frequência olha o histórico INTEIRO, não só a janela: "sequência atual de 6 semanas"
    // não pode zerar só porque o usuário abriu a visão do mês passado.
    frequency: frequencyMetrics(sessions, hoje, { weekStartsOn: options.weekStartsOn ?? 1 }),
    muscleGroups: muscleGroupShares(inRange, metrics),
    exercises: topExercises(inRange, options),
    weeks: weeksInRange(range),
  };
}

/**
 * Distribuição por grupo muscular — **registro, não prescrição**.
 *
 * A tela que exibe isto diz "seu registro de treinamento". Em nenhum lugar o sistema afirma
 * quantas séries por grupo alguém "deveria" fazer: isso é decisão de quem treina (e, se for o
 * caso, de quem o acompanha), não de um app.
 */
export function muscleGroupShares(
  sessions: MetricSession[],
  metrics: PeriodMetrics,
): MuscleGroupShare[] {
  const totalSets = Object.values(metrics.setsByMuscleGroup).reduce((sum, value) => sum + value, 0);

  const lastTrained = new Map<string, string>();
  for (const session of sessions.filter(sessionCounts)) {
    for (const exercise of session.exercises) {
      const group = exercise.muscleGroup ?? "Sem grupo";
      const current = lastTrained.get(group);
      if (!current || session.sessionDate > current) lastTrained.set(group, session.sessionDate);
    }
  }

  return Object.entries(metrics.setsByMuscleGroup)
    .map(([group, sets]) => ({
      group,
      sets,
      volumeKg: metrics.volumeByMuscleGroup[group] ?? 0,
      percent: totalSets === 0 ? 0 : Number(((sets / totalSets) * 100).toFixed(1)),
      lastTrainedOn: lastTrained.get(group) ?? null,
    }))
    .sort((a, b) => b.sets - a.sets || a.group.localeCompare(b.group, "pt-BR"));
}

/**
 * Os exercícios mais presentes na janela, por séries.
 *
 * A conta por exercício sai de `exerciseMetrics` (`metrics.ts`) — a MESMA função que o
 * histórico e o detalhe de sessão usam. Nome e grupo vêm do snapshot; a identidade é o
 * `exercise_id` ou, na falta dele, o nome congelado (um exercício excluído do catálogo
 * continua aparecendo, com o nome que tinha).
 */
export function topExercises(
  sessions: MetricSession[],
  options: MetricOptions = {},
  limit = 10,
): ExerciseShare[] {
  const byKey = new Map<string, ExerciseShare & { sessionIds: Set<string> }>();

  for (const session of sessions.filter(sessionCounts)) {
    for (const exercise of session.exercises) {
      const key = exercise.exerciseId ?? `nome:${exercise.exerciseName}`;
      const metrics = exerciseMetrics(exercise, session.bodyWeightKg, options);

      const entry = byKey.get(key) ?? {
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        sets: 0,
        volumeKg: 0,
        sessions: 0,
        sessionIds: new Set<string>(),
      };

      entry.sets += metrics.totals.sets;
      entry.volumeKg = Number((entry.volumeKg + metrics.totals.volumeKg).toFixed(3));
      // Só conta a sessão quando o exercício de fato rendeu série contada nela.
      if (metrics.totals.sets > 0) entry.sessionIds.add(session.id);
      byKey.set(key, entry);
    }
  }

  return [...byKey.values()]
    .filter((entry) => entry.sets > 0)
    .map(({ sessionIds, ...rest }) => ({ ...rest, sessions: sessionIds.size }))
    .sort(
      (a, b) =>
        b.sets - a.sets ||
        b.volumeKg - a.volumeKg ||
        a.exerciseName.localeCompare(b.exerciseName, "pt-BR"),
    )
    .slice(0, limit);
}

/* ═══════════════════════════ Comparação entre períodos ═══════════════════════════ */

export type MetricDelta = {
  current: number;
  previous: number;
  absolute: number;
  /** Variação percentual. `null` quando o período anterior é 0 — jamais `Infinity` ou "∞%". */
  percent: number | null;
};

export function compareValues(current: number, previous: number): MetricDelta {
  return {
    current,
    previous,
    absolute: Number((current - previous).toFixed(3)),
    percent:
      previous === 0 || !Number.isFinite(previous)
        ? null
        : Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1)),
  };
}

export type PeriodComparison = {
  sessions: MetricDelta;
  volumeKg: MetricDelta;
  sets: MetricDelta;
  reps: MetricDelta;
  trainedDays: MetricDelta;
  activeSeconds: MetricDelta;
  /** `true` quando um dos lados é parcial — a comparação existe, mas com ressalva. */
  partial: boolean;
};

export function comparePeriods(current: PeriodMetrics, previous: PeriodMetrics): PeriodComparison {
  return {
    sessions: compareValues(current.sessionCount, previous.sessionCount),
    volumeKg: compareValues(current.totals.volumeKg, previous.totals.volumeKg),
    sets: compareValues(current.totals.sets, previous.totals.sets),
    reps: compareValues(current.totals.reps, previous.totals.reps),
    trainedDays: compareValues(current.trainedDays.length, previous.trainedDays.length),
    activeSeconds: compareValues(current.activeSeconds, previous.activeSeconds),
    partial: current.totals.quality === "parcial" || previous.totals.quality === "parcial",
  };
}

/** "+12,5%" · "−8%" · "sem base" quando o período anterior não tinha o que comparar. */
export function deltaLabel(delta: MetricDelta): string {
  if (delta.percent === null) return delta.current === 0 ? "sem base" : "primeiro período";
  const sign = delta.percent > 0 ? "+" : delta.percent < 0 ? "−" : "";
  return `${sign}${Math.abs(delta.percent).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/* ═══════════════════════════ Aderência ao planejamento ═══════════════════════════ */

/** O mínimo que um dia planejado precisa ter para entrar na conta. */
export type PlannedDay = {
  scheduledDate: string;
  entryKind: string;
  status: string;
};

export type Adherence = {
  planned: number;
  done: number;
  /** 0–100. `null` quando NADA foi planejado — não é 0%, é "não havia plano". */
  percent: number | null;
  /** Dias planejados que ainda estão no futuro: não entram na conta, e a tela explica. */
  upcoming: number;
};

/**
 * Aderência: dos dias de TREINO planejados que já passaram, em quantos houve execução.
 *
 * Três decisões que mudam o número:
 *  • Dia de **descanso** planejado não é aderência de treino — fica fora do denominador.
 *  • Dia planejado no **futuro** não conta como falha (a mesma regra da 17-B: aderência só
 *    olha o passado).
 *  • Dia **cancelado** pelo usuário sai do denominador: ele decidiu que não haveria treino.
 */
export function adherence(
  planned: PlannedDay[],
  trainedDays: string[],
  range: DateRange,
  hoje: string,
): Adherence {
  const trained = new Set(trainedDays);
  const relevant = planned.filter(
    (entry) =>
      entry.entryKind === "treino" &&
      entry.scheduledDate >= range.from &&
      entry.scheduledDate <= range.to &&
      entry.status !== "cancelado" &&
      entry.status !== "reagendado",
  );

  const past = relevant.filter((entry) => entry.scheduledDate <= hoje);
  const upcoming = relevant.length - past.length;

  const dates = new Set(past.map((entry) => entry.scheduledDate));
  const done = [...dates].filter((date) => trained.has(date)).length;

  return {
    planned: dates.size,
    done,
    percent: dates.size === 0 ? null : Number(((done / dates.size) * 100).toFixed(1)),
    upcoming,
  };
}

/* ═══════════════════════════ Sequência de semanas na meta ═══════════════════════════ */

/**
 * Quantas semanas seguidas (contando para trás a partir da semana de `hoje`) bateram a meta
 * semanal de treinos.
 *
 * A semana CORRENTE só interrompe a sequência quando já terminou: estar na terça com 1 de 3
 * treinos não "quebra" nada — a semana ainda está acontecendo.
 */
export function weeklyGoalStreak(
  sessions: MetricSession[],
  weeklyGoal: number,
  hoje: string,
  weekStartsOn = 1,
  maxWeeks = 104,
): number {
  if (weeklyGoal <= 0 || !isDateIso(hoje)) return 0;

  const daysByWeek = new Map<string, Set<string>>();
  for (const session of sessions.filter(sessionCounts)) {
    if (!isDateIso(session.sessionDate)) continue;
    const week = startOfWeekIso(session.sessionDate, weekStartsOn);
    const set = daysByWeek.get(week) ?? new Set<string>();
    set.add(session.sessionDate);
    daysByWeek.set(week, set);
  }

  const currentWeek = startOfWeekIso(hoje, weekStartsOn);
  let streak = 0;
  let cursor = currentWeek;

  for (let i = 0; i < maxWeeks; i += 1) {
    const met = (daysByWeek.get(cursor)?.size ?? 0) >= weeklyGoal;
    if (met) streak += 1;
    else if (cursor !== currentWeek) break;
    // A semana corrente ainda em curso não zera a sequência — apenas não soma.
    cursor = addDaysIso(cursor, -7);
  }

  return streak;
}

/* ═══════════════════════════ Calendário de consistência ═══════════════════════════ */

export const CONSISTENCY_STATES = [
  "treinado",
  "parcial",
  "descanso",
  "planejado_sem_execucao",
  "livre",
  "futuro",
] as const;
export type ConsistencyState = (typeof CONSISTENCY_STATES)[number];

/** Rótulos DESCRITIVOS. Nenhum deles culpa o usuário por um dia sem treino. */
export const CONSISTENCY_STATE_LABELS: Record<ConsistencyState, string> = {
  treinado: "Treino registrado",
  parcial: "Treino iniciado e não finalizado",
  descanso: "Descanso planejado",
  planejado_sem_execucao: "Estava planejado, sem treino registrado",
  livre: "Dia livre",
  futuro: "Ainda vai chegar",
};

export type ConsistencyDay = {
  date: string;
  state: ConsistencyState;
  sessions: number;
  volumeKg: number;
  /** Nomes dos treinos daquele dia — vindos do snapshot. */
  workouts: string[];
  isToday: boolean;
};

/**
 * Um dia por data no intervalo, classificado.
 *
 * `parcial` é a sessão **abandonada**: ela existe no histórico, tem séries registradas, e
 * chamá-la de "não treinou" apagaria o trabalho que foi feito.
 */
export function consistencyCalendar(
  sessions: MetricSession[],
  planned: PlannedDay[],
  range: DateRange,
  hoje: string,
  options: MetricOptions = {},
): ConsistencyDay[] {
  const byDate = new Map<string, MetricSession[]>();
  for (const session of sessions.filter(sessionCounts)) {
    const list = byDate.get(session.sessionDate) ?? [];
    list.push(session);
    byDate.set(session.sessionDate, list);
  }

  const plannedByDate = new Map<string, PlannedDay[]>();
  for (const entry of planned) {
    const list = plannedByDate.get(entry.scheduledDate) ?? [];
    list.push(entry);
    plannedByDate.set(entry.scheduledDate, list);
  }

  return eachDayIso(range.from, range.to).map((date) => {
    const daySessions = byDate.get(date) ?? [];
    const dayPlanned = plannedByDate.get(date) ?? [];
    const metrics = daySessions.length > 0 ? aggregateSessions(daySessions, options) : null;

    let state: ConsistencyState;
    if (daySessions.some((session) => session.status === "concluida")) state = "treinado";
    else if (daySessions.length > 0) state = "parcial";
    else if (date > hoje) state = "futuro";
    else if (dayPlanned.some((entry) => entry.entryKind === "descanso")) state = "descanso";
    else if (
      dayPlanned.some(
        (entry) =>
          entry.entryKind === "treino" &&
          entry.status !== "cancelado" &&
          entry.status !== "reagendado",
      )
    ) {
      state = "planejado_sem_execucao";
    } else state = "livre";

    return {
      date,
      state,
      sessions: daySessions.length,
      volumeKg: metrics?.totals.volumeKg ?? 0,
      workouts: daySessions.map((session) => session.workoutName),
      isToday: date === hoje,
    };
  });
}

export type ConsistencySummary = Record<ConsistencyState, number>;

export function summarizeConsistency(days: ConsistencyDay[]): ConsistencySummary {
  const summary = Object.fromEntries(
    CONSISTENCY_STATES.map((state) => [state, 0]),
  ) as ConsistencySummary;
  for (const day of days) summary[day.state] += 1;
  return summary;
}
