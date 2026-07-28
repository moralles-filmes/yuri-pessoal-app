import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/format";
import {
  getTodoLabels,
  getTodoPreference,
  getTodoProjects,
  getTodoSavedFilters,
  getTodoTasks,
  summarizeTodo,
} from "@/lib/todo/queries";
import { addDaysIso, weekdayOf } from "@/lib/todo/recurrence";
import { TODO_NAV_VIEWS, TODO_VIEWS, type TodoView } from "@/lib/todo/constants";
import type { TodoRoute } from "@/components/todo/todo-nav";
import { TodoClient } from "./todo-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "TO-DO" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Resolve a rota interna a partir da URL (`?v=` + `?id=`). */
function resolveRoute(v: string | undefined, id: string | undefined): TodoRoute {
  if (v === "projeto" && id) return { kind: "projeto", id };
  if (v === "etiqueta" && id) return { kind: "etiqueta", id };
  if (v === "filtro" && id) return { kind: "filtro", id };
  if (v === "arquivados") return { kind: "arquivados" };
  if (v && (TODO_NAV_VIEWS as readonly string[]).includes(v)) {
    return { kind: "view", value: v as (typeof TODO_NAV_VIEWS)[number] };
  }
  return { kind: "view", value: "hoje" };
}

export default async function TodoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  // "Hoje" SEMPRE do servidor, no fuso America/Sao_Paulo — nunca do relógio do cliente
  // (regra do projeto: na Vercel o processo roda em UTC e "vira o dia" à noite).
  const todayIso = hojeISO();

  const route = resolveRoute(first(sp.v), first(sp.id));

  const [tasks, projects, labels, savedFilters, user] = await Promise.all([
    getTodoTasks(),
    getTodoProjects(todayIso),
    getTodoLabels(),
    getTodoSavedFilters(),
    getCurrentUser(),
  ]);

  // Preferência do escopo atual (projeto tem a sua; o resto usa a global).
  const scope = route.kind === "projeto" ? `project:${route.id}` : "global";
  const preference = await getTodoPreference(scope);

  // Visão: a da URL vence; senão a padrão do projeto; senão a preferência do escopo.
  const viewParam = first(sp.view);
  const project = route.kind === "projeto" ? projects.find((p) => p.id === route.id) : undefined;
  const view: TodoView = (TODO_VIEWS as readonly string[]).includes(viewParam ?? "")
    ? (viewParam as TodoView)
    : (project?.defaultView ?? preference.view);

  const monthParam = first(sp.m);
  const monthIso = /^\d{4}-\d{2}$/.test(monthParam ?? "")
    ? (monthParam as string)
    : todayIso.slice(0, 7);

  // Semana corrente (domingo a sábado) para a taxa de conclusão semanal.
  const weekStartIso = addDaysIso(todayIso, -weekdayOf(todayIso));
  const weekEndIso = addDaysIso(weekStartIso, 6);
  const summary = summarizeTodo(tasks, projects, todayIso, weekStartIso, weekEndIso);

  return (
    <TodoClient
      tasks={tasks}
      projects={projects}
      labels={labels}
      savedFilters={savedFilters}
      preference={preference}
      summary={summary}
      todayIso={todayIso}
      userId={user?.id ?? ""}
      route={route}
      view={view}
      monthIso={monthIso}
      openTaskId={first(sp.task) ?? null}
    />
  );
}
