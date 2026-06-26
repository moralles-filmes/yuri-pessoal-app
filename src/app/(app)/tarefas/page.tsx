import type { Metadata } from "next";
import {
  getCalendarEventOptions,
  getProjectsWithCounts,
  getRoutinesWithToday,
  getTasks,
} from "@/lib/tasks/queries";
import { getCurrentUser } from "@/lib/supabase/server";
import { TASK_VIEWS, type TaskView } from "@/lib/tasks/constants";
import { toDateInputValue } from "@/lib/format";
import { TasksClient } from "./tasks-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tarefas" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;

  const viewRaw = first(sp.view);
  const view: TaskView = (TASK_VIEWS as readonly string[]).includes(viewRaw ?? "")
    ? (viewRaw as TaskView)
    : "lista";

  const now = new Date();
  const todayIso = toDateInputValue(now);
  const dateRaw = first(sp.date);
  const dateIso =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : todayIso;

  const [tasks, projects, events, routines, user] = await Promise.all([
    getTasks(),
    getProjectsWithCounts(),
    getCalendarEventOptions(now),
    getRoutinesWithToday(todayIso),
    getCurrentUser(),
  ]);

  return (
    <TasksClient
      tasks={tasks}
      projects={projects}
      events={events}
      routines={routines}
      view={view}
      dateIso={dateIso}
      todayIso={todayIso}
      userId={user?.id ?? ""}
    />
  );
}
