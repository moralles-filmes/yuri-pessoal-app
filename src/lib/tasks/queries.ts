/**
 * Camada de leitura de Demandas, Tarefas & Rotinas (Fase 09). Server-only.
 * A RLS garante que cada query retorna apenas o que é do usuário. As derivações
 * (atrasada, aderência, streak) usam os módulos puros src/lib/tasks/*.
 */
import { addDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { computeAdherence, currentStreak, routineOccursOn } from "@/lib/tasks/routines";
import type {
  ProjectWithCount,
  RoutineLogRow,
  RoutineWithToday,
  TaskWithRelations,
} from "@/types/database";

const ISO = "yyyy-MM-dd";

/** Todas as tarefas do usuário, com projeto, checklist, anexos e evento vinculados. */
export async function getTasks(): Promise<TaskWithRelations[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(
      `*,
       project:projects(id, name, color, icon),
       checklist:task_checklist_items(*),
       attachments:task_attachments(*),
       calendar_event:calendar_events!tasks_calendar_event_id_fkey(id, title, start_at)`,
    )
    .order("position", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(2000);

  const rows = (data ?? []) as unknown as TaskWithRelations[];
  // Ordena o checklist de cada tarefa por posição (a relação não garante ordem).
  for (const t of rows) {
    t.checklist?.sort((a, b) => a.position - b.position);
  }
  return rows;
}

/** Projetos do usuário com a contagem de tarefas abertas (pendente/em andamento). */
export async function getProjectsWithCounts(): Promise<ProjectWithCount[]> {
  const supabase = await createClient();
  const [{ data: projects }, { data: openTasks }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .order("is_archived", { ascending: true })
      .order("position", { ascending: true }),
    supabase
      .from("tasks")
      .select("project_id")
      .in("status", ["pendente", "em_andamento"]),
  ]);

  const counts = new Map<string, number>();
  for (const t of openTasks ?? []) {
    const pid = t.project_id as string | null;
    if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }

  return (projects ?? []).map((p) => ({
    ...p,
    open_tasks: counts.get(p.id) ?? 0,
  })) as ProjectWithCount[];
}

/** Opções de eventos da agenda (janela próxima) para vincular a uma tarefa. */
export async function getCalendarEventOptions(
  now: Date,
  horizonDays = 90,
): Promise<{ id: string; title: string; start_at: string }[]> {
  const supabase = await createClient();
  const from = addDays(now, -7).toISOString();
  const to = addDays(now, horizonDays).toISOString();
  const { data } = await supabase
    .from("calendar_events")
    .select("id, title, start_at")
    .gte("start_at", from)
    .lte("start_at", to)
    .order("start_at", { ascending: true })
    .limit(200);
  return (data ?? []) as { id: string; title: string; start_at: string }[];
}

/**
 * Rotinas ativas/inativas com tudo que a tela "Rotinas de hoje" precisa: itens,
 * log do dia, se cai hoje, aderência dos últimos 7 dias e sequência atual.
 */
export async function getRoutinesWithToday(
  todayIso: string,
): Promise<RoutineWithToday[]> {
  const supabase = await createClient();
  const todayDate = new Date(`${todayIso}T00:00:00`);
  const windowStart = format(addDays(todayDate, -90), ISO);

  const [{ data: routines }, { data: logs }] = await Promise.all([
    supabase
      .from("routines")
      .select("*, items:routine_items(*)")
      .order("position", { ascending: true }),
    supabase
      .from("routine_logs")
      .select("*")
      .gte("log_date", windowStart)
      .lte("log_date", todayIso),
  ]);

  const allLogs = (logs ?? []) as RoutineLogRow[];
  const adherenceStart = format(addDays(todayDate, -6), ISO);

  return (routines ?? []).map((r) => {
    const routine = r as unknown as RoutineWithToday;
    routine.items?.sort((a, b) => a.position - b.position);

    const myLogs = allLogs.filter((l) => l.routine_id === routine.id);
    const doneDates = new Set(
      myLogs.filter((l) => l.is_done).map((l) => l.log_date),
    );
    const todayLog = myLogs.find((l) => l.log_date === todayIso) ?? null;

    const routineLike = {
      frequency: routine.frequency,
      weekdays: routine.weekdays,
      is_active: routine.is_active,
    };

    return {
      ...routine,
      todayLog,
      scheduledToday: routineOccursOn(routineLike, todayIso),
      adherence7: computeAdherence(
        routineLike,
        doneDates,
        adherenceStart,
        todayIso,
      ),
      streak: currentStreak(routineLike, doneDates, todayIso),
    };
  });
}

/** Histórico de check-ins de uma rotina (mais recentes primeiro). */
export async function getRoutineHistory(
  routineId: string,
  limit = 30,
): Promise<RoutineLogRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("routine_logs")
    .select("*")
    .eq("routine_id", routineId)
    .order("log_date", { ascending: false })
    .limit(limit);
  return (data ?? []) as RoutineLogRow[];
}
