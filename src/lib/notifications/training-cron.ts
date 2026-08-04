/**
 * Fase 17-F — leitura do módulo Treinos para o Cron de notificações (SERVER-ONLY).
 *
 * Sem sessão de usuário: usa a **service role**, então **toda** query carrega `user_id`
 * explicitamente (a RLS é ignorada por essa role). Aqui só há I/O — a decisão do que vira
 * notificação é do módulo PURO `./training.ts`.
 *
 * ⛔ NENHUM AGREGADO É RECALCULADO AQUI. O valor de cada meta sai de `resolveGoals`
 * (`goal-queries.ts`), que por sua vez consome `metrics.ts` (17-D) — a MESMA função da tela de
 * metas. Se a notificação apurasse o número por conta própria, ela e a tela discordariam no
 * primeiro arredondamento, e o usuário veria dois valores para a mesma meta.
 *
 * ⛔ O histórico continua saindo do SNAPSHOT: `getSessionHistory` não lê `training_workouts`.
 *
 * Lê pouco de propósito: janelas curtas para planejamento e recordes, e só o que uma
 * notificação usa.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { addDaysIso } from "@/lib/training/schedule";
import { getSessionHistory } from "@/lib/training/history-queries";
import { resolveGoals } from "@/lib/training/goal-queries";
import {
  asGoalDirection,
  asGoalKind,
  asGoalMetric,
  asGoalPeriod,
  asGoalProgressKind,
  asGoalStatus,
  formatGoalValue,
  parseMilestones,
  type GoalProgressEntry,
  type TrainingGoal,
} from "@/lib/training/goals";
import {
  asRecordType,
  asRecordUnit,
  formatRecordValue,
  RECORD_TYPE_LABELS,
} from "@/lib/training/records";
import { asOneRmFormula, asUnilateralVolumeRule } from "@/lib/training/constants";
import { RUNNING_SESSION_STATUSES } from "@/lib/training/session-machine";
import {
  asMeasurementCategory,
  asMeasurementCondition,
  asMeasurementSide,
  asMeasurementSource,
} from "@/lib/body/constants";
import type { MeasurementType, MeasurementWithType } from "@/lib/body/types";
import type {
  GenTrainingGoal,
  GenTrainingPlanned,
  GenTrainingProgram,
  GenTrainingRecord,
  TrainingGenInput,
} from "./training";

type Service = SupabaseClient<Database>;

/** Quantos dias para trás procurar treino planejado em aberto. */
const DIAS_RETROATIVOS = 4;
/** Quantos dias de recorde recente interessam. */
const DIAS_RECORDE = 3;
/** Janela do histórico usada para apurar as metas (cobre meta anual). */
const DIAS_HISTORICO = 400;

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Monta a entrada do gerador de notificações de Treinos para um usuário.
 *
 * Nunca lança: uma leitura que falha vira lista vazia (o Cron inteiro não pode cair por causa
 * de um módulo — quem isola é o `catch` de `cron.ts`).
 */
export async function buildTrainingGenInput(
  service: Service,
  userId: string,
  todayIso: string,
  minutosAgora: number,
  nowMs: number,
): Promise<TrainingGenInput> {
  const desde = addDaysIso(todayIso, -DIAS_RETROATIVOS);

  const [
    plannedRes,
    sessionsTodayRes,
    runningRes,
    recordsRes,
    goalsRes,
    programsRes,
    prefsRes,
    typesRes,
    measurementsRes,
  ] = await Promise.all([
    service
      .from("training_scheduled_workouts")
      .select("id,scheduled_date,entry_kind,status,planned_time,title,workout_id,program_id")
      .eq("user_id", userId)
      .gte("scheduled_date", desde)
      .lte("scheduled_date", todayIso)
      .limit(200),
    // Sessões da janela — usadas só para saber se o dia planejado já virou execução.
    service
      .from("training_sessions")
      .select("id,session_date,status,scheduled_workout_id,workout_id")
      .eq("user_id", userId)
      .gte("session_date", desde)
      .lte("session_date", todayIso)
      .limit(200),
    // A sessão que ficou em execução (índice único garante no máximo uma).
    service
      .from("training_sessions")
      .select("id,status,started_at,workout_name_snapshot")
      .eq("user_id", userId)
      .in("status", RUNNING_SESSION_STATUSES)
      .limit(1),
    service
      .from("training_personal_records")
      .select("id,record_key,exercise_name_snapshot,record_type,value,unit,achieved_on,previous_value")
      .eq("user_id", userId)
      .gte("achieved_on", addDaysIso(todayIso, -DIAS_RECORDE))
      .order("achieved_on", { ascending: false })
      .limit(20),
    service
      .from("training_goals")
      .select(
        "id,name,description,goal_kind,metric,exercise_id,muscle_group_id,program_id,body_measurement_type_id,direction,period,starts_on,ends_on,start_value,target_value,unit,milestones,status,notes,position,created_at,updated_at",
      )
      .eq("user_id", userId)
      .in("status", ["ativa", "planejada"])
      .limit(200),
    service
      .from("training_programs")
      .select("id,name,ends_on,status,archived_at")
      .eq("user_id", userId)
      .eq("status", "ativo")
      .is("archived_at", null)
      .not("ends_on", "is", null)
      .limit(50),
    service
      .from("training_preferences")
      .select("week_starts_on,count_warmup_in_volume,unilateral_volume_rule,one_rm_formula")
      .eq("user_id", userId)
      .maybeSingle(),
    // MÓDULO CENTRAL `body_*` (16-E) — as mesmas tabelas da Dieta, lidas com user_id explícito.
    service
      .from("body_measurement_types")
      .select("id,slug,name,unit,category,side,decimals,position,is_active,is_default,note")
      .eq("user_id", userId)
      .limit(100),
    service
      .from("body_measurements")
      .select("id,type_id,measured_on,measured_at,value,unit,condition,note,source,created_at")
      .eq("user_id", userId)
      .gte("measured_on", addDaysIso(todayIso, -DIAS_HISTORICO))
      .limit(2000),
  ]);

  /* ── Nomes dos treinos planejados ──
   * Ler o MODELO aqui é legítimo: o planejamento é intenção (17-B), não histórico. O que nunca
   * lê `training_workouts` é a leitura de SESSÃO (17-C/17-D). */
  const workoutIds = [
    ...new Set(
      (plannedRes.data ?? [])
        .map((row) => row.workout_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const workoutNames = new Map<string, string>();
  if (workoutIds.length > 0) {
    const { data } = await service
      .from("training_workouts")
      .select("id,name")
      .eq("user_id", userId)
      .in("id", workoutIds);
    for (const row of data ?? []) workoutNames.set(row.id, row.name);
  }

  /* ── Planejamento ── */
  const sessionsByDate = new Map<string, number>();
  const sessionsByScheduled = new Set<string>();
  for (const row of sessionsTodayRes.data ?? []) {
    if (row.status === "cancelada") continue;
    sessionsByDate.set(row.session_date, (sessionsByDate.get(row.session_date) ?? 0) + 1);
    if (row.scheduled_workout_id) sessionsByScheduled.add(row.scheduled_workout_id);
  }

  const planned: GenTrainingPlanned[] = (plannedRes.data ?? []).map((row) => ({
    id: row.id,
    scheduledDate: row.scheduled_date,
    entryKind: row.entry_kind,
    status: row.status,
    plannedTime: row.planned_time,
    label:
      (row.workout_id ? workoutNames.get(row.workout_id) : null) ??
      row.title ??
      (row.entry_kind === "descanso" ? "Descanso" : "Treino"),
    // Já existe execução ligada a este dia — ou alguma sessão no mesmo dia, que é o caso de
    // quem começa o treino sem clicar no dia planejado.
    hasSession:
      sessionsByScheduled.has(row.id) || (sessionsByDate.get(row.scheduled_date) ?? 0) > 0,
  }));

  /* ── Sessão em execução ── */
  const runningRow = (runningRes.data ?? [])[0];
  const startedAtMs = runningRow?.started_at ? new Date(runningRow.started_at).getTime() : null;
  const openSession =
    runningRow && startedAtMs !== null && Number.isFinite(startedAtMs)
      ? {
          id: runningRow.id,
          label: runningRow.workout_name_snapshot ?? "Treino",
          startedAtMs,
        }
      : null;

  /* ── Recordes recentes ── */
  const records: GenTrainingRecord[] = (recordsRes.data ?? []).map((row) => {
    const unit = asRecordUnit(row.unit);
    const previous = num(row.previous_value);
    return {
      id: row.id,
      recordKey: row.record_key,
      exerciseName: row.exercise_name_snapshot ?? "Exercício",
      typeLabel: RECORD_TYPE_LABELS[asRecordType(row.record_type)],
      valueLabel: formatRecordValue(Number(row.value), unit),
      achievedOn: row.achieved_on,
      previousLabel: previous === null ? null : formatRecordValue(previous, unit),
    };
  });

  /* ── Metas: o valor sai de `resolveGoals`, que consome `metrics.ts` ── */
  const measurementTypes: MeasurementType[] = ((typesRes.data ?? []) as MeasurementTypeRow[]).map(
    (row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      unit: row.unit,
      category: asMeasurementCategory(row.category),
      side: asMeasurementSide(row.side),
      decimals: row.decimals,
      position: row.position,
      isActive: row.is_active,
      isDefault: row.is_default,
      note: row.note,
    }),
  );

  const goals = await buildGoals(service, userId, todayIso, {
    goals: (goalsRes.data ?? []) as GoalRow[],
    planned: plannedRes.data ?? [],
    measurementTypes,
    measurements: (measurementsRes.data ?? []) as MeasurementRow[],
    preferences: prefsRes.data ?? null,
  });

  /* ── Programas perto do fim ── */
  const programs: GenTrainingProgram[] = (programsRes.data ?? [])
    .filter((row): row is typeof row & { ends_on: string } => Boolean(row.ends_on))
    .map((row) => ({ id: row.id, name: row.name, endsOn: row.ends_on }));

  return {
    todayIso,
    minutosAgora,
    nowMs,
    planned,
    openSession,
    records,
    goals,
    programs,
  };
}

/* ───────────────────────────── Metas ───────────────────────────── */

type GoalRow = {
  id: string;
  name: string;
  description: string | null;
  goal_kind: string;
  metric: string;
  exercise_id: string | null;
  muscle_group_id: string | null;
  program_id: string | null;
  body_measurement_type_id: string | null;
  direction: string;
  period: string;
  starts_on: string;
  ends_on: string | null;
  start_value: number | string | null;
  target_value: number | string | null;
  unit: string | null;
  milestones: unknown;
  status: string;
  notes: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

type MeasurementRow = {
  id: string;
  type_id: string;
  measured_on: string;
  measured_at: string | null;
  value: number | string;
  unit: string;
  condition: string | null;
  note: string | null;
  source: string;
  created_at: string;
};

type MeasurementTypeRow = {
  id: string;
  slug: string;
  name: string;
  unit: string;
  category: string;
  side: string | null;
  decimals: number;
  position: number;
  is_active: boolean;
  is_default: boolean;
  note: string | null;
};

/** Metas com o valor apurado e o status derivado — prontas para o gerador puro. */
async function buildGoals(
  service: Service,
  userId: string,
  todayIso: string,
  input: {
    goals: GoalRow[];
    planned: Array<{ scheduled_date: string; entry_kind: string; status: string }>;
    measurementTypes: MeasurementType[];
    measurements: MeasurementRow[];
    preferences: {
      week_starts_on: number;
      count_warmup_in_volume: boolean;
      unilateral_volume_rule: string;
      one_rm_formula: string;
    } | null;
  },
): Promise<GenTrainingGoal[]> {
  if (input.goals.length === 0) return [];

  const goals: TrainingGoal[] = input.goals.map((row) => ({
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
    // NULO é preservado ("use o primeiro valor observado"). Nunca vira 0.
    startValue: num(row.start_value),
    targetValue: num(row.target_value) ?? 0,
    unit: row.unit ?? "",
    milestones: parseMilestones(row.milestones),
    status: asGoalStatus(row.status),
    notes: row.notes,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const [history, progressRes] = await Promise.all([
    // A MESMA leitura da tela (não lê `training_workouts`), só que com a service role.
    getSessionHistory({ client: service as never, userId, days: DIAS_HISTORICO, to: todayIso }),
    service
      .from("training_goal_progress")
      .select("id,goal_id,entry_kind,recorded_on,value,field,previous_text,new_text,previous_value,new_value,source,note,created_at")
      .eq("user_id", userId)
      .in(
        "goal_id",
        goals.map((goal) => goal.id),
      )
      .order("recorded_on", { ascending: false })
      .limit(1000),
  ]);

  const progressEntries: GoalProgressEntry[] = (progressRes.data ?? []).map((row) => ({
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
    source:
      row.source === "manual" ? "manual" : row.source === "sistema" ? "sistema" : "automatico",
    note: row.note,
    createdAt: row.created_at,
  }));

  const typeById = new Map(input.measurementTypes.map((type) => [type.id, type]));
  const measurements: MeasurementWithType[] = input.measurements.map((row) => {
    const type = typeById.get(row.type_id);
    return {
      id: row.id,
      typeId: row.type_id,
      measuredOn: row.measured_on,
      measuredAt: row.measured_at ? row.measured_at.slice(0, 5) : null,
      value: num(row.value) ?? 0,
      // A unidade é a CONGELADA na gravação (16-E) — não a do tipo hoje.
      unit: row.unit,
      condition: asMeasurementCondition(row.condition),
      note: row.note,
      source: asMeasurementSource(row.source),
      createdAt: row.created_at,
      typeName: type?.name ?? "Medida",
      typeSlug: type?.slug ?? "",
      typeCategory: type?.category ?? "outro",
      typeDecimals: type?.decimals ?? 1,
    } satisfies MeasurementWithType;
  });

  const options = {
    includeWarmup: Boolean(input.preferences?.count_warmup_in_volume),
    unilateralRule: asUnilateralVolumeRule(input.preferences?.unilateral_volume_rule),
    weekStartsOn: input.preferences?.week_starts_on ?? 1,
    oneRmFormula: asOneRmFormula(input.preferences?.one_rm_formula),
  };

  const resolved = resolveGoals({
    goals,
    history,
    planned: input.planned.map((entry) => ({
      scheduledDate: entry.scheduled_date,
      entryKind: entry.entry_kind,
      status: entry.status,
    })),
    measurements,
    measurementTypes: input.measurementTypes,
    progressEntries,
    // O rótulo do alvo não entra em notificação nenhuma — mapas vazios evitam três consultas.
    exerciseNames: new Map(),
    muscleGroupNames: new Map(),
    programNames: new Map(),
    hoje: todayIso,
    options,
  });

  return resolved.map((item) => ({
    id: item.goal.id,
    name: item.goal.name,
    derivedStatus: item.progress.status,
    rangeFrom: item.range.from,
    endsOn: item.goal.endsOn,
    percent: item.progress.percent,
    progressLabel:
      item.value.value === null
        ? null
        : `${formatGoalValue(item.value.value, item.unit)} de ${formatGoalValue(
            item.goal.targetValue,
            item.unit,
          )}`,
    isShortPeriod: item.goal.period === "semanal" || item.goal.period === "mensal",
  }));
}
