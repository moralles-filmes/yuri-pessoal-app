/**
 * Camada de leitura de Hábitos (Fase 10). Server-only. A RLS garante que cada query
 * retorna apenas o que é do usuário. As derivações (streak, recorde, consistência,
 * heatmap, ranking) usam o módulo puro src/lib/habits/streak.ts. Uma única leitura de
 * `habit_logs` (janela de ~1 ano) alimenta todos os agregados da tela.
 */
import { addDays, format, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  bestStreak,
  computeConsistency,
  currentStreak,
  habitOccursOn,
  type HabitLike,
} from "@/lib/habits/streak";
import type {
  HabitHeatCell,
  HabitLogRow,
  HabitRankItem,
  HabitRow,
  HabitsConsistency,
  HabitsDashboard,
  HabitWeekPoint,
  HabitWithStats,
} from "@/types/database";

const ISO = "yyyy-MM-dd";
const HEATMAP_DAYS = 105; // 15 semanas
const WEEKLY_WEEKS = 8;

type ActiveAgg = { like: HabitLike; doneSet: Set<string>; habit: HabitWithStats };

/** Pacote completo da tela de hábitos: cards do dia + agregados de consistência. */
export async function getHabitsDashboard(
  todayIso: string,
): Promise<HabitsDashboard> {
  const supabase = await createClient();
  const today = new Date(`${todayIso}T00:00:00`);
  const windowStart = format(addDays(today, -364), ISO);

  const [{ data: habitsData }, { data: logsData }] = await Promise.all([
    supabase.from("habits").select("*").order("position", { ascending: true }),
    supabase
      .from("habit_logs")
      .select("*")
      .gte("log_date", windowStart)
      .lte("log_date", todayIso),
  ]);

  const habits = (habitsData ?? []) as unknown as HabitRow[];
  const logs = (logsData ?? []) as HabitLogRow[];

  const logsByHabit = new Map<string, HabitLogRow[]>();
  for (const l of logs) {
    const arr = logsByHabit.get(l.habit_id);
    if (arr) arr.push(l);
    else logsByHabit.set(l.habit_id, [l]);
  }

  const cons7Start = format(addDays(today, -6), ISO);
  const cons30Start = format(addDays(today, -29), ISO);

  const withStats: HabitWithStats[] = habits.map((h) => {
    const myLogs = logsByHabit.get(h.id) ?? [];
    const doneDates = new Set(
      myLogs.filter((l) => l.is_done).map((l) => l.log_date),
    );
    const byDate = new Map(myLogs.map((l) => [l.log_date, l]));
    const todayLog = byDate.get(todayIso) ?? null;
    const like: HabitLike = {
      frequency: h.frequency,
      weekdays: h.weekdays,
      is_active: h.is_active,
    };

    // Últimos 7 dias (mais antigo → hoje).
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const date = format(addDays(today, -i), ISO);
      const log = byDate.get(date);
      last7.push({
        date,
        value: log ? Number(log.value) : 0,
        done: Boolean(log?.is_done),
        scheduled: habitOccursOn(like, date),
      });
    }

    // Registros recentes com valor/observações (histórico).
    const recentLogs = myLogs
      .filter((l) => Number(l.value) > 0 || l.is_done || l.notes)
      .sort((a, b) => (a.log_date < b.log_date ? 1 : -1))
      .slice(0, 14)
      .map((l) => ({
        log_date: l.log_date,
        value: Number(l.value),
        is_done: l.is_done,
        notes: l.notes,
      }));

    return {
      ...h,
      todayLog,
      scheduledToday: habitOccursOn(like, todayIso),
      todayValue: todayLog ? Number(todayLog.value) : 0,
      todayDone: Boolean(todayLog?.is_done),
      streak: currentStreak(like, doneDates, todayIso),
      bestStreak: bestStreak(like, doneDates, windowStart, todayIso),
      consistency7: computeConsistency(like, doneDates, cons7Start, todayIso),
      consistency30: computeConsistency(like, doneDates, cons30Start, todayIso),
      doneDates: [...doneDates].sort(),
      last7,
      recentLogs,
    };
  });

  return {
    habits: withStats,
    consistency: buildConsistency(withStats, today, todayIso),
  };
}

/** Monta os agregados de consistência (taxa 30d, série semanal, heatmap, ranking). */
function buildConsistency(
  habits: HabitWithStats[],
  today: Date,
  todayIso: string,
): HabitsConsistency {
  const active: ActiveAgg[] = habits
    .filter((h) => h.is_active)
    .map((habit) => ({
      habit,
      like: {
        frequency: habit.frequency,
        weekdays: habit.weekdays,
        is_active: true,
      },
      doneSet: new Set(habit.doneDates),
    }));

  // Taxa de conclusão dos últimos 30 dias (agregada).
  let done30 = 0;
  let scheduled30 = 0;
  for (const a of active) {
    done30 += a.habit.consistency30.done;
    scheduled30 += a.habit.consistency30.scheduled;
  }

  // Série semanal (8 semanas, segunda a domingo) — gráfico de consistência.
  const weekly: HabitWeekPoint[] = [];
  for (let w = WEEKLY_WEEKS - 1; w >= 0; w--) {
    const ws = startOfWeek(addDays(today, -7 * w), { weekStartsOn: 1 });
    const weekStart = format(ws, ISO);
    const rawEnd = format(addDays(ws, 6), ISO);
    const weekEnd = rawEnd > todayIso ? todayIso : rawEnd;
    const agg = aggregateWindow(active, weekStart, weekEnd);
    weekly.push({
      weekStart,
      label: format(ws, "dd/MM"),
      done: agg.done,
      scheduled: agg.scheduled,
      rate: agg.rate,
    });
  }

  // Heatmap diário (últimos 105 dias): fração de hábitos do dia concluídos.
  const heatmap: HabitHeatCell[] = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const date = format(addDays(today, -i), ISO);
    let scheduled = 0;
    let done = 0;
    for (const a of active) {
      if (habitOccursOn(a.like, date)) {
        scheduled++;
        if (a.doneSet.has(date)) done++;
      }
    }
    heatmap.push({ date, done, scheduled, rate: scheduled ? done / scheduled : 0 });
  }

  // Ranking dos mais consistentes (30 dias) — só hábitos que tiveram dias agendados.
  const ranking: HabitRankItem[] = active
    .filter((a) => a.habit.consistency30.scheduled > 0)
    .map((a) => ({
      id: a.habit.id,
      name: a.habit.name,
      icon: a.habit.icon,
      color: a.habit.color,
      category: a.habit.category,
      rate: a.habit.consistency30.rate,
      done: a.habit.consistency30.done,
      scheduled: a.habit.consistency30.scheduled,
      streak: a.habit.streak,
    }))
    .sort(
      (x, y) =>
        y.rate - x.rate || y.streak - x.streak || y.done - x.done,
    );

  return {
    completionRate30: scheduled30 ? done30 / scheduled30 : 0,
    done30,
    scheduled30,
    weekly,
    heatmap,
    ranking,
  };
}

/** Soma agendados/concluídos de todos os hábitos ativos numa janela [from, to]. */
function aggregateWindow(active: ActiveAgg[], fromIso: string, toIso: string) {
  let scheduled = 0;
  let done = 0;
  for (const a of active) {
    const c = computeConsistency(a.like, a.doneSet, fromIso, toIso);
    scheduled += c.scheduled;
    done += c.done;
  }
  return { scheduled, done, rate: scheduled ? done / scheduled : 0 };
}
