/**
 * Fase 17-E — Treinos · Leitura das metas e dos dashboards (server-only).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ NENHUMA CONTA ACONTECE AQUI.                                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Este arquivo lê o banco e chama as funções PURAS: `metrics.ts` (17-D) para os agregados,
 * `goals.ts` para o progresso e o status derivado, `src/lib/body/` para a medida corporal.
 * O padrão do módulo: poucas consultas amplas + derivação em memória, sem N+1.
 *
 * ═══════════════════════ A MEDIDA CORPORAL VEM DO MÓDULO CENTRAL ═══════════════════════
 *
 * Peso, %GC e circunferências saem de `src/lib/body/queries.ts` — as MESMAS tabelas que o
 * módulo Dieta usa. Aqui não há uma linha de SQL sobre medida corporal que não passe por lá.
 *
 * ═══════════════════════ O HISTÓRICO CONTINUA SAINDO DO SNAPSHOT ═══════════════════════
 *
 * As sessões vêm de `getSessionHistory` (17-D), que não lê `training_workouts`. Renomear ou
 * excluir um treino-modelo não pode mexer no número de uma meta já acompanhada.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/format";
import { getMeasurementTypes, getMeasurements } from "@/lib/body/queries";
import type { MeasurementType, MeasurementWithType } from "@/lib/body/types";
import { measurementOnDate, sortByDate } from "@/lib/body/measurements";
import {
  asGoalDirection,
  asGoalKind,
  asGoalMetric,
  asGoalPeriod,
  asGoalProgressKind,
  asGoalStatus,
  goalCurrentValue,
  goalPeriodRange,
  goalProgress,
  milestoneStatuses,
  nextMilestone,
  parseMilestones,
  type GoalProgressEntry,
  type GoalProgressResult,
  type GoalRange,
  type GoalValue,
  type MilestoneStatus,
  type TrainingGoal,
} from "./goals";
import {
  adherence,
  sessionsInRange,
  weeksInRange,
  type PlannedDay,
} from "./dashboards";
import { aggregateSessions, frequencyMetrics, type MetricOptions } from "./metrics";
import { estimateOneRm } from "./one-rm";
import { isSetDone } from "./session-machine";
import { getSessionHistory } from "./history-queries";
import { getScheduledWorkouts } from "./routine-queries";
import { getExercises, getMuscleGroups, getTrainingPreferences } from "./queries";
import type { HistoryItem } from "./history";
import type { OneRmFormula } from "./constants";

const GOAL_SELECT =
  "id,name,description,goal_kind,metric,exercise_id,muscle_group_id,program_id,body_measurement_type_id,direction,period,starts_on,ends_on,start_value,target_value,unit,milestones,status,notes,position,created_at,updated_at";

const PROGRESS_SELECT =
  "id,goal_id,entry_kind,recorded_on,value,field,previous_text,new_text,previous_value,new_value,source,note,created_at";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/* ═══════════════════════════ Leitura crua ═══════════════════════════ */

export async function getTrainingGoals(): Promise<TrainingGoal[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_goals")
    .select(GOAL_SELECT)
    .order("position", { ascending: true })
    .order("starts_on", { ascending: false })
    .limit(500);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    kind: asGoalKind(row.goal_kind),
    metric: asGoalMetric(row.metric),
    exerciseId: row.exercise_id,
    muscleGroupId: row.muscle_group_id,
    programId: row.program_id,
    bodyMeasurementTypeId: row.body_measurement_type_id,
    direction: asGoalDirection(row.direction),
    period: asGoalPeriod(row.period),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    // NULO é preservado: significa "use o primeiro valor observado". Nunca vira 0.
    startValue: num(row.start_value),
    targetValue: num(row.target_value) ?? 0,
    unit: row.unit,
    milestones: parseMilestones(row.milestones),
    status: asGoalStatus(row.status),
    notes: row.notes,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getGoalProgressEntries(goalIds?: string[]): Promise<GoalProgressEntry[]> {
  const supabase = await createClient();
  let query = supabase.from("training_goal_progress").select(PROGRESS_SELECT);
  if (goalIds && goalIds.length > 0) query = query.in("goal_id", goalIds);

  const { data } = await query
    .order("recorded_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);

  return (data ?? []).map((row) => ({
    id: row.id,
    goalId: row.goal_id,
    entryKind: asGoalProgressKind(row.entry_kind),
    recordedOn: row.recorded_on,
    value: num(row.value),
    field: row.field,
    previousText: row.previous_text,
    newText: row.new_text,
    previousValue: num(row.previous_value),
    newValue: num(row.new_value),
    source: row.source === "manual" ? "manual" : row.source === "sistema" ? "sistema" : "automatico",
    note: row.note,
    createdAt: row.created_at,
  }));
}

/* ═══════════════════════════ Melhores marcas do período ═══════════════════════════ */

type ExerciseBests = {
  bestWeightKg: number | null;
  bestReps: number | null;
  bestOneRmKg: number | null;
};

/**
 * As melhores marcas de UM exercício dentro de um recorte de sessões.
 *
 * Só série CONCLUÍDA e que não é aquecimento entra — a mesma regra de `records.ts` (17-D):
 * série pulada, cancelada ou de aquecimento não gera marca. `null` quando não houve nenhuma:
 * não existe "melhor carga" de zero execuções.
 */
function exerciseBests(
  sessions: HistoryItem[],
  exerciseId: string,
  formula: OneRmFormula,
): ExerciseBests {
  let bestWeightKg: number | null = null;
  let bestReps: number | null = null;
  let bestOneRmKg: number | null = null;

  for (const session of sessions) {
    for (const exercise of session.exercises) {
      if (exercise.exerciseId !== exerciseId) continue;
      for (const set of exercise.sets) {
        if (!isSetDone(set.status) || set.isWarmup) continue;

        if (set.weightKg !== null && (bestWeightKg === null || set.weightKg > bestWeightKg)) {
          bestWeightKg = set.weightKg;
        }
        if (set.reps !== null && (bestReps === null || set.reps > bestReps)) {
          bestReps = set.reps;
        }
        // O 1RM só entra quando a estimativa está DENTRO da faixa de validade — acima de ~12
        // repetições o número vem com aviso e, como no recorde (17-D), não vale como marca.
        const estimate = estimateOneRm({
          weightKg: set.weightKg,
          reps: set.reps,
          formula,
        });
        if (
          estimate.ok &&
          estimate.withinValidRange &&
          (bestOneRmKg === null || estimate.value > bestOneRmKg)
        ) {
          bestOneRmKg = estimate.value;
        }
      }
    }
  }

  return { bestWeightKg, bestReps, bestOneRmKg };
}

/* ═══════════════════════════ Meta resolvida ═══════════════════════════ */

export type ResolvedGoal = {
  goal: TrainingGoal;
  range: GoalRange;
  value: GoalValue;
  progress: GoalProgressResult;
  milestones: MilestoneStatus[];
  nextMilestone: MilestoneStatus | null;
  /** Nome do que a meta acompanha (exercício, grupo, programa ou medida). */
  targetLabel: string | null;
  /** A unidade efetiva: a do tipo de medida, quando é meta corporal. */
  unit: string;
  history: GoalProgressEntry[];
};

export type GoalsOverview = {
  goals: ResolvedGoal[];
  hoje: string;
  measurementTypes: MeasurementType[];
  exercises: { id: string; name: string }[];
  muscleGroups: { id: string; name: string }[];
  programs: { id: string; name: string }[];
  preferences: MetricOptions & { weekStartsOn: number; oneRmFormula: OneRmFormula };
};

/**
 * Resolve o valor atual, o progresso e os marcos de cada meta.
 *
 * Recebe TUDO já lido (uma leitura ampla por entidade, feita pela página) e recorta em memória
 * — cada meta tem a sua janela, e ir ao banco por meta seria N+1 na certa.
 */
export function resolveGoals(input: {
  goals: TrainingGoal[];
  history: HistoryItem[];
  planned: PlannedDay[];
  measurements: MeasurementWithType[];
  measurementTypes: MeasurementType[];
  progressEntries: GoalProgressEntry[];
  exerciseNames: Map<string, string>;
  muscleGroupNames: Map<string, string>;
  programNames: Map<string, string>;
  hoje: string;
  options: MetricOptions & { weekStartsOn: number; oneRmFormula: OneRmFormula };
}): ResolvedGoal[] {
  const {
    goals,
    history,
    planned,
    measurements,
    measurementTypes,
    progressEntries,
    hoje,
    options,
  } = input;

  const typeById = new Map(measurementTypes.map((type) => [type.id, type]));
  const historyByGoal = new Map<string, GoalProgressEntry[]>();
  for (const entry of progressEntries) {
    const list = historyByGoal.get(entry.goalId) ?? [];
    list.push(entry);
    historyByGoal.set(entry.goalId, list);
  }

  return goals.map((goal) => {
    const range = goalPeriodRange(goal, hoje, options.weekStartsOn);
    const inRange = sessionsInRange(history, range);

    // TODO agregado sai de metrics.ts — este arquivo só recorta o período.
    const period = aggregateSessions(inRange, options);
    const frequency = frequencyMetrics(history, hoje, { weekStartsOn: options.weekStartsOn });

    const bests = goal.exerciseId
      ? exerciseBests(inRange, goal.exerciseId, options.oneRmFormula)
      : { bestWeightKg: null, bestReps: null, bestOneRmKg: null };

    const type = goal.bodyMeasurementTypeId ? typeById.get(goal.bodyMeasurementTypeId) : undefined;
    const typeMeasurements = goal.bodyMeasurementTypeId
      ? measurements.filter(
          (measurement) =>
            measurement.typeId === goal.bodyMeasurementTypeId &&
            measurement.measuredOn >= goal.startsOn,
        )
      : [];
    // A medição VIGENTE no fim da janela — não a mais recente de todas: uma meta de um período
    // passado não pode mostrar o peso de hoje como se fosse o dela.
    const bodyPoint = measurementOnDate(typeMeasurements, range.to);

    const groupSets = goal.muscleGroupId
      ? (period.setsByMuscleGroup[input.muscleGroupNames.get(goal.muscleGroupId) ?? ""] ?? 0)
      : null;

    const goalPlanned = goal.programId
      ? planned.filter((entry) => entry.scheduledDate >= range.from && entry.scheduledDate <= range.to)
      : planned;
    const goalAdherence = adherence(goalPlanned, period.trainedDays, range, hoje);

    // A última leitura manual registrada — só a meta personalizada depende dela.
    const manual =
      goal.metric === "personalizada"
        ? (sortByDate(
            (historyByGoal.get(goal.id) ?? [])
              .filter((entry) => entry.entryKind === "registro" && entry.value !== null)
              .map((entry) => ({
                measuredOn: entry.recordedOn,
                value: entry.value as number,
                createdAt: entry.createdAt,
              })),
          ).at(-1)?.value ?? null)
        : null;

    const value = goalCurrentValue(goal, {
      period,
      frequency,
      weeksInRange: weeksInRange(range),
      bestWeightKg: bests.bestWeightKg,
      bestReps: bests.bestReps,
      bestOneRmKg: bests.bestOneRmKg,
      muscleGroupSets: groupSets,
      bodyValue: bodyPoint?.value ?? null,
      bodyTypeMissing: goal.metric === "medida_corporal" && !type,
      adherencePercent: goalAdherence.percent,
      manualValue: manual,
    });

    const progress = goalProgress(goal, value, hoje);
    const milestones = milestoneStatuses(goal, value.value, hoje);

    const targetLabel =
      goal.exerciseId
        ? (input.exerciseNames.get(goal.exerciseId) ?? "Exercício removido do catálogo")
        : goal.muscleGroupId
          ? (input.muscleGroupNames.get(goal.muscleGroupId) ?? "Grupo removido")
          : goal.programId
            ? (input.programNames.get(goal.programId) ?? "Programa removido")
            : type
              ? type.name
              : goal.metric === "medida_corporal"
                ? "Medida removida"
                : null;

    return {
      goal,
      range,
      value,
      progress,
      milestones,
      nextMilestone: nextMilestone(milestones),
      targetLabel,
      unit: type?.unit ?? goal.unit,
      history: historyByGoal.get(goal.id) ?? [],
    };
  });
}

/**
 * Pacote pronto da tela de metas.
 *
 * Uma leitura ampla por entidade, em paralelo, e o cruzamento em memória — o mesmo desenho de
 * `getSessionHistory` e de `getBodyOverview`.
 */
export async function getGoalsOverview(): Promise<GoalsOverview> {
  const hoje = hojeISO();
  const supabase = await createClient();

  const [goals, history, scheduled, exercises, muscleGroups, preferences, measurementTypes, measurements, programsRes] =
    await Promise.all([
      getTrainingGoals(),
      // Dois anos cobrem metas anuais e a comparação com o ano anterior.
      getSessionHistory({ days: 730 }),
      getScheduledWorkouts(`${Number(hoje.slice(0, 4)) - 1}-01-01`, `${Number(hoje.slice(0, 4)) + 1}-12-31`),
      getExercises(),
      getMuscleGroups(),
      getTrainingPreferences(),
      getMeasurementTypes(),
      getMeasurements(),
      supabase.from("training_programs").select("id,name").limit(200),
    ]);

  const progressEntries = await getGoalProgressEntries(goals.map((goal) => goal.id));

  const options = {
    includeWarmup: preferences.countWarmupInVolume,
    unilateralRule: preferences.unilateralVolumeRule,
    weekStartsOn: preferences.weekStartsOn,
    oneRmFormula: preferences.oneRmFormula,
  };

  const programs = (programsRes.data ?? []).map((row) => ({ id: row.id, name: row.name }));

  return {
    goals: resolveGoals({
      goals,
      history,
      planned: scheduled.map((entry) => ({
        scheduledDate: entry.scheduledDate,
        entryKind: entry.entryKind,
        status: entry.status,
      })),
      measurements,
      measurementTypes,
      progressEntries,
      exerciseNames: new Map(exercises.map((exercise) => [exercise.id, exercise.name])),
      muscleGroupNames: new Map(muscleGroups.map((group) => [group.id, group.name])),
      programNames: new Map(programs.map((program) => [program.id, program.name])),
      hoje,
      options,
    }),
    hoje,
    measurementTypes,
    exercises: exercises.map((exercise) => ({ id: exercise.id, name: exercise.name })),
    muscleGroups: muscleGroups.map((group) => ({ id: group.id, name: group.name })),
    programs,
    preferences: options,
  };
}
