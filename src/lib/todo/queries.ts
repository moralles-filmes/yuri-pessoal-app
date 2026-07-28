/**
 * Fase 15 — Módulo TO-DO · Camada de leitura (server-only).
 *
 * Padrão do projeto: UMA consulta ampla por entidade + derivação em memória (evitar
 * N+1). A RLS garante que só vem o que é do usuário — nenhuma query aqui filtra por
 * `user_id` manualmente, e nem deve: quem faz isso é a policy.
 *
 * Tudo que é "status", "contagem" e "progresso" é DERIVADO aqui, nunca lido de coluna.
 */
import { createClient } from "@/lib/supabase/server";
import {
  TODO_ATTACHMENT_ENTITY,
  asColor,
  asPriority,
  type TodoColor,
  type TodoSource,
  type TodoStatus,
  type TodoView,
} from "@/lib/todo/constants";
import { normalizeRule } from "@/lib/todo/recurrence";
import { isOverdue, trimTime } from "@/lib/todo/status";
import type {
  TodoActivityEntry,
  TodoAttachment,
  TodoComment,
  TodoLabel,
  TodoLabelRef,
  TodoPreference,
  TodoProject,
  TodoReminder,
  TodoSavedFilter,
  TodoSection,
  TodoSummary,
  TodoTask,
} from "@/lib/todo/types";
import { DEFAULT_TODO_PREFERENCE } from "@/lib/todo/types";
import type { TodoFilterDefinition } from "@/lib/todo/types";

/** Teto de segurança: nenhuma leitura traz mais que isto de uma vez. */
const TASK_LIMIT = 5000;

/* ───────────────────────────── Shapes crus ───────────────────────────── */

type RawLabelJoin = {
  label: { id: string; name: string; color: string } | { id: string; name: string; color: string }[] | null;
};

type RawRecurrence = {
  frequency: string;
  interval_count: number;
  days_of_week: number[] | null;
  day_of_month: number | null;
  month_of_year: number | null;
  week_of_month: number | null;
  business_day_rule: string | null;
  recurrence_mode: string;
  starts_on: string | null;
  ends_on: string | null;
  max_occurrences: number | null;
  occurrences_created: number;
  is_paused: boolean;
};

type RawTask = {
  id: string;
  project_id: string | null;
  section_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_minutes: number | null;
  deadline_at: string | null;
  is_all_day: boolean;
  position: number;
  series_id: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  archived_at: string | null;
  source: string;
  external_reference: string | null;
  created_at: string;
  updated_at: string;
  labels: RawLabelJoin[] | null;
  recurrence: RawRecurrence | RawRecurrence[] | null;
};

/** PostgREST devolve relação 1:1 ora como objeto, ora como array de um item. */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/* ───────────────────────────── Mapeamento ───────────────────────────── */

function mapLabels(raw: RawLabelJoin[] | null): TodoLabelRef[] {
  if (!raw) return [];
  return raw
    .map((join) => one(join.label))
    .filter((l): l is { id: string; name: string; color: string } => !!l)
    .map((l) => ({ id: l.id, name: l.name, color: asColor(l.color) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
}

function mapRecurrence(raw: RawRecurrence | RawRecurrence[] | null) {
  const r = one(raw);
  if (!r) return null;
  return normalizeRule({
    frequency: r.frequency,
    intervalCount: r.interval_count,
    daysOfWeek: r.days_of_week,
    dayOfMonth: r.day_of_month,
    monthOfYear: r.month_of_year,
    weekOfMonth: r.week_of_month,
    businessDayRule: r.business_day_rule,
    mode: r.recurrence_mode,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    maxOccurrences: r.max_occurrences,
    occurrencesCreated: r.occurrences_created,
    isPaused: r.is_paused,
  });
}

/** Contadores derivados que a UI precisa, calculados em memória. */
interface Counters {
  subtasks: Map<string, { total: number; done: number }>;
  comments: Map<string, number>;
  attachments: Map<string, number>;
  reminders: Map<string, number>;
}

function mapTask(raw: RawTask, counters: Counters): TodoTask {
  const sub = counters.subtasks.get(raw.id);
  return {
    id: raw.id,
    projectId: raw.project_id,
    sectionId: raw.section_id,
    parentTaskId: raw.parent_task_id,
    title: raw.title,
    description: raw.description,
    status: raw.status as TodoStatus,
    priority: asPriority(raw.priority),
    scheduledDate: raw.scheduled_date,
    scheduledTime: trimTime(raw.scheduled_time),
    durationMinutes: raw.duration_minutes,
    deadlineAt: raw.deadline_at,
    isAllDay: raw.is_all_day,
    position: raw.position,
    seriesId: raw.series_id,
    completedAt: raw.completed_at,
    cancelledAt: raw.cancelled_at,
    archivedAt: raw.archived_at,
    source: raw.source as TodoSource,
    externalReference: raw.external_reference,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    labels: mapLabels(raw.labels),
    recurrence: mapRecurrence(raw.recurrence),
    subtaskCount: sub?.total ?? 0,
    subtaskDoneCount: sub?.done ?? 0,
    commentCount: counters.comments.get(raw.id) ?? 0,
    attachmentCount: counters.attachments.get(raw.id) ?? 0,
    reminderCount: counters.reminders.get(raw.id) ?? 0,
  };
}

const TASK_SELECT = `
  id, project_id, section_id, parent_task_id, title, description, status, priority,
  scheduled_date, scheduled_time, duration_minutes, deadline_at, is_all_day, position,
  series_id, completed_at, cancelled_at, archived_at, source, external_reference,
  created_at, updated_at,
  labels:todo_task_labels(label:todo_labels(id, name, color)),
  recurrence:todo_recurrences(
    frequency, interval_count, days_of_week, day_of_month, month_of_year, week_of_month,
    business_day_rule, recurrence_mode, starts_on, ends_on, max_occurrences,
    occurrences_created, is_paused
  )
`;

/* ───────────────────────────── Leituras ───────────────────────────── */

/**
 * TODAS as tarefas do usuário, já com etiquetas, recorrência e contadores resolvidos.
 * É a leitura base do módulo: as visões (Hoje, Próximos, projeto…) filtram em memória
 * pelos módulos puros, sem novas idas ao banco.
 */
export async function getTodoTasks(): Promise<TodoTask[]> {
  const supabase = await createClient();

  const [tasksRes, commentsRes, attachmentsRes, remindersRes] = await Promise.all([
    supabase
      .from("todo_tasks")
      .select(TASK_SELECT)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(TASK_LIMIT),
    supabase.from("todo_comments").select("task_id").is("deleted_at", null),
    supabase
      .from("attachments")
      .select("entity_id")
      .eq("entity_type", TODO_ATTACHMENT_ENTITY),
    supabase.from("todo_reminders").select("task_id").eq("status", "pendente"),
  ]);

  const rows = (tasksRes.data ?? []) as unknown as RawTask[];

  // Contadores em memória (uma passada por lista) — nada de N+1.
  const subtasks = new Map<string, { total: number; done: number }>();
  for (const row of rows) {
    if (!row.parent_task_id) continue;
    const acc = subtasks.get(row.parent_task_id) ?? { total: 0, done: 0 };
    acc.total += 1;
    if (row.status === "concluida") acc.done += 1;
    subtasks.set(row.parent_task_id, acc);
  }

  const tally = (list: Array<Record<string, unknown>> | null, key: string) => {
    const map = new Map<string, number>();
    for (const row of list ?? []) {
      const id = row[key] as string | null;
      if (id) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  };

  const counters: Counters = {
    subtasks,
    comments: tally(commentsRes.data, "task_id"),
    attachments: tally(attachmentsRes.data, "entity_id"),
    reminders: tally(remindersRes.data, "task_id"),
  };

  return rows.map((row) => mapTask(row, counters));
}

/** Uma tarefa específica (painel de detalhes). */
export async function getTodoTask(taskId: string): Promise<TodoTask | null> {
  const all = await getTodoTasks();
  return all.find((t) => t.id === taskId) ?? null;
}

/**
 * Projetos com suas seções e contagens derivadas. As contagens de tarefa vêm de uma
 * consulta enxuta (só as colunas necessárias) para não puxar a lista inteira duas vezes.
 */
export async function getTodoProjects(todayIso: string): Promise<TodoProject[]> {
  const supabase = await createClient();

  const [projectsRes, sectionsRes, tasksRes] = await Promise.all([
    supabase
      .from("todo_projects")
      .select(
        "id, parent_project_id, name, description, icon, color, is_favorite, default_view, status, position, archived_at",
      )
      .order("position", { ascending: true }),
    supabase
      .from("todo_sections")
      .select("id, project_id, name, description, position, archived_at")
      .order("position", { ascending: true }),
    supabase
      .from("todo_tasks")
      .select("project_id, status, scheduled_date, deadline_at"),
  ]);

  const sectionsByProject = new Map<string, TodoSection[]>();
  for (const raw of sectionsRes.data ?? []) {
    const section: TodoSection = {
      id: raw.id,
      projectId: raw.project_id,
      name: raw.name,
      description: raw.description,
      position: raw.position,
      archivedAt: raw.archived_at,
    };
    const list = sectionsByProject.get(section.projectId) ?? [];
    list.push(section);
    sectionsByProject.set(section.projectId, list);
  }

  type CountAcc = { total: number; open: number; done: number; overdue: number };
  const counts = new Map<string, CountAcc>();
  for (const raw of tasksRes.data ?? []) {
    const pid = raw.project_id as string | null;
    if (!pid) continue;
    const acc = counts.get(pid) ?? { total: 0, open: 0, done: 0, overdue: 0 };
    acc.total += 1;
    if (raw.status === "concluida") acc.done += 1;
    if (raw.status === "pendente" || raw.status === "em_andamento") acc.open += 1;
    if (
      isOverdue(
        {
          status: raw.status as TodoStatus,
          scheduledDate: raw.scheduled_date,
          deadlineAt: raw.deadline_at,
        },
        todayIso,
      )
    ) {
      acc.overdue += 1;
    }
    counts.set(pid, acc);
  }

  return (projectsRes.data ?? []).map((raw) => {
    const acc = counts.get(raw.id) ?? { total: 0, open: 0, done: 0, overdue: 0 };
    return {
      id: raw.id,
      parentProjectId: raw.parent_project_id,
      name: raw.name,
      description: raw.description,
      icon: raw.icon,
      color: asColor(raw.color),
      isFavorite: raw.is_favorite,
      defaultView: raw.default_view as TodoView,
      status: raw.status as "ativo" | "arquivado",
      position: raw.position,
      archivedAt: raw.archived_at,
      sections: sectionsByProject.get(raw.id) ?? [],
      totalTasks: acc.total,
      openTasks: acc.open,
      completedTasks: acc.done,
      overdueTasks: acc.overdue,
    } satisfies TodoProject;
  });
}

/** Etiquetas com a contagem de uso (para a tela de gerenciamento). */
export async function getTodoLabels(): Promise<TodoLabel[]> {
  const supabase = await createClient();
  const [labelsRes, joinRes] = await Promise.all([
    supabase
      .from("todo_labels")
      .select("id, name, description, color, position, status")
      .order("position", { ascending: true }),
    supabase.from("todo_task_labels").select("label_id"),
  ]);

  const counts = new Map<string, number>();
  for (const row of joinRes.data ?? []) {
    counts.set(row.label_id, (counts.get(row.label_id) ?? 0) + 1);
  }

  return (labelsRes.data ?? []).map((raw) => ({
    id: raw.id,
    name: raw.name,
    description: raw.description,
    color: asColor(raw.color),
    position: raw.position,
    status: raw.status as "ativo" | "arquivado",
    taskCount: counts.get(raw.id) ?? 0,
  }));
}

/** Filtros salvos do usuário. */
export async function getTodoSavedFilters(): Promise<TodoSavedFilter[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("todo_saved_filters")
    .select("id, name, description, icon, color, filter_definition, is_favorite, show_in_nav, position")
    .order("position", { ascending: true });

  return (data ?? []).map((raw) => ({
    id: raw.id,
    name: raw.name,
    description: raw.description,
    icon: raw.icon,
    color: asColor(raw.color),
    definition: (raw.filter_definition ?? {}) as TodoFilterDefinition,
    isFavorite: raw.is_favorite,
    showInNav: raw.show_in_nav,
    position: raw.position,
  }));
}

/** Preferência de visualização de um escopo ('global' | 'project:<id>'). */
export async function getTodoPreference(scope = "global"): Promise<TodoPreference> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("todo_preferences")
    .select("scope, view, sort_by, sort_dir, group_by, show_completed")
    .eq("scope", scope)
    .maybeSingle();

  if (!data) return { ...DEFAULT_TODO_PREFERENCE, scope };
  return {
    scope: data.scope,
    view: data.view as TodoPreference["view"],
    sortBy: data.sort_by as TodoPreference["sortBy"],
    sortDir: data.sort_dir as TodoPreference["sortDir"],
    groupBy: data.group_by as TodoPreference["groupBy"],
    showCompleted: data.show_completed,
  };
}

/** Comentários de uma tarefa (mais antigos primeiro — leitura de diário). */
export async function getTodoComments(taskId: string): Promise<TodoComment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("todo_comments")
    .select("id, task_id, content, edited_at, created_at")
    .eq("task_id", taskId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  return (data ?? []).map((raw) => ({
    id: raw.id,
    taskId: raw.task_id,
    content: raw.content,
    editedAt: raw.edited_at,
    createdAt: raw.created_at,
    // Single-user: o autor é sempre o dono. O campo existe para colaboração futura.
    authorLabel: null,
  }));
}

/** Anexos de uma tarefa (tabela genérica `attachments` da Fase 14). */
export async function getTodoAttachments(taskId: string): Promise<TodoAttachment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("attachments")
    .select("id, file_name, mime_type, size_bytes, storage_path, created_at")
    .eq("entity_type", TODO_ATTACHMENT_ENTITY)
    .eq("entity_id", taskId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((raw) => ({
    id: raw.id,
    fileName: raw.file_name,
    mimeType: raw.mime_type,
    sizeBytes: raw.size_bytes,
    storagePath: raw.storage_path,
    createdAt: raw.created_at,
  }));
}

/** Lembretes de uma tarefa. */
export async function getTodoReminders(taskId: string): Promise<TodoReminder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("todo_reminders")
    .select("id, task_id, remind_at, offset_minutes, channel, status, sent_at")
    .eq("task_id", taskId)
    .order("remind_at", { ascending: true });

  return (data ?? []).map((raw) => ({
    id: raw.id,
    taskId: raw.task_id,
    remindAt: raw.remind_at,
    offsetMinutes: raw.offset_minutes,
    channel: raw.channel as TodoReminder["channel"],
    status: raw.status as TodoReminder["status"],
    sentAt: raw.sent_at,
  }));
}

/** Histórico de atividades de uma tarefa (mais recentes primeiro). */
export async function getTodoActivity(
  taskId: string,
  limit = 50,
): Promise<TodoActivityEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("todo_activity")
    .select("id, event_type, previous_data, new_data, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((raw) => ({
    id: raw.id,
    eventType: raw.event_type,
    previousData: raw.previous_data as Record<string, unknown> | null,
    newData: raw.new_data as Record<string, unknown> | null,
    createdAt: raw.created_at,
  }));
}

/** Tudo que o painel de detalhes precisa, numa ida só. */
export async function getTodoTaskDetail(taskId: string) {
  const [comments, attachments, reminders, activity] = await Promise.all([
    getTodoComments(taskId),
    getTodoAttachments(taskId),
    getTodoReminders(taskId),
    getTodoActivity(taskId),
  ]);
  return { comments, attachments, reminders, activity };
}

/* ───────────────────────────── Indicadores ───────────────────────────── */

/**
 * Resumo do módulo, derivado de uma lista já carregada (não vai ao banco de novo).
 * Usado no cabeçalho do TO-DO e no card do Dashboard Geral.
 */
export function summarizeTodo(
  tasks: TodoTask[],
  projects: TodoProject[],
  todayIso: string,
  weekStartIso: string,
  weekEndIso: string,
): TodoSummary {
  let pending = 0;
  let completedToday = 0;
  let overdue = 0;
  let p1 = 0;
  let p2 = 0;
  let dueToday = 0;
  let thisWeek = 0;
  let weekDone = 0;
  let weekTotal = 0;

  for (const task of tasks) {
    const open = task.status === "pendente" || task.status === "em_andamento";
    const completedOn = (task.completedAt ?? "").slice(0, 10);

    if (open) {
      pending += 1;
      if (task.priority === 1) p1 += 1;
      if (task.priority === 2) p2 += 1;
      if (isOverdue(task, todayIso)) overdue += 1;
      if (task.scheduledDate === todayIso || task.deadlineAt === todayIso) dueToday += 1;
      const date = task.scheduledDate ?? task.deadlineAt;
      if (date && date >= weekStartIso && date <= weekEndIso) {
        thisWeek += 1;
        weekTotal += 1;
      }
    }

    if (task.status === "concluida") {
      if (completedOn === todayIso) completedToday += 1;
      if (completedOn >= weekStartIso && completedOn <= weekEndIso) {
        weekDone += 1;
        weekTotal += 1;
      }
    }
  }

  return {
    pending,
    completedToday,
    overdue,
    p1,
    p2,
    dueToday,
    thisWeek,
    weeklyCompletionRate: weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0,
    activeProjects: projects.filter((p) => p.status === "ativo").length,
  };
}

/** Cor de um projeto por id (helper para os lookups de agrupamento). */
export function projectColorMap(projects: TodoProject[]): Map<string, TodoColor> {
  return new Map(projects.map((p) => [p.id, p.color]));
}
