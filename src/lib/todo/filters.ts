/**
 * Fase 15 — Módulo TO-DO · Filtro, ordenação e agrupamento (PUROS, testados).
 *
 * Rodam em memória sobre a lista já carregada. A leitura do banco faz UMA consulta ampla
 * (padrão do projeto: evitar N+1) e tudo o mais é derivado aqui — o que também permite
 * testar cada regra sem tocar no banco.
 *
 * `todayIso` é SEMPRE injetado. Nenhuma função deste arquivo chama `Date.now()`.
 */
import {
  TODO_PRIORITY_LABELS,
  TODO_EFFECTIVE_STATUS_LABELS,
  type TodoColor,
  type TodoGroup,
  type TodoSort,
  type TodoSortDir,
} from "@/lib/todo/constants";
import {
  effectiveStatus,
  hasNoDate,
  isClosed,
  isDueToday,
  isOverdue,
  isUpcoming,
} from "@/lib/todo/status";
import type {
  TodoFilterDefinition,
  TodoTask,
  TodoTaskGroup,
} from "@/lib/todo/types";

/* ───────────────────────────── Filtro ───────────────────────────── */

/** Tri-state: só aplica a exigência quando o flag é explicitamente `true`. */
function requires(flag: boolean | null | undefined): boolean {
  return flag === true;
}

function inList<T>(list: T[] | null | undefined, value: T | null): boolean {
  if (!list || list.length === 0) return true;
  return value !== null && list.includes(value);
}

/**
 * A tarefa passa no filtro? Campos são **AND** entre si; dentro de um array é **OR**.
 * Filtro vazio (`{}`) aceita tudo (menos os fechados, salvo `includeCompleted`).
 */
export function matchesFilter(
  task: TodoTask,
  filter: TodoFilterDefinition,
  todayIso: string,
): boolean {
  // Fechadas só entram quando pedido explicitamente (ou quando o filtro pede um status
  // fechado específico — ex.: "só canceladas").
  const wantsClosedStatus = (filter.statuses ?? []).some(
    (s) => s === "concluida" || s === "cancelada" || s === "arquivada",
  );
  if (isClosed(task) && !filter.includeCompleted && !wantsClosedStatus) return false;
  if (task.status === "arquivada" && !filter.includeArchived && !wantsClosedStatus) {
    return false;
  }

  if (filter.search) {
    const q = filter.search.trim().toLowerCase();
    if (q) {
      const haystack = `${task.title} ${task.description ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
  }

  if (!inList(filter.projectIds, task.projectId)) return false;
  if (!inList(filter.sectionIds, task.sectionId)) return false;
  if (!inList(filter.priorities, task.priority)) return false;
  if (!inList(filter.statuses, task.status)) return false;

  if (filter.labelIds && filter.labelIds.length > 0) {
    const ids = new Set(task.labels.map((l) => l.id));
    if (!filter.labelIds.some((id) => ids.has(id))) return false;
  }

  // Intervalos de data (inclusivos). Sem a data → não passa quando há intervalo.
  if (filter.scheduledFrom && (!task.scheduledDate || task.scheduledDate < filter.scheduledFrom)) {
    return false;
  }
  if (filter.scheduledTo && (!task.scheduledDate || task.scheduledDate > filter.scheduledTo)) {
    return false;
  }
  if (filter.deadlineFrom && (!task.deadlineAt || task.deadlineAt < filter.deadlineFrom)) {
    return false;
  }
  if (filter.deadlineTo && (!task.deadlineAt || task.deadlineAt > filter.deadlineTo)) {
    return false;
  }
  if (filter.createdFrom && task.createdAt.slice(0, 10) < filter.createdFrom) return false;
  if (filter.createdTo && task.createdAt.slice(0, 10) > filter.createdTo) return false;
  if (filter.completedFrom && (!task.completedAt || task.completedAt.slice(0, 10) < filter.completedFrom)) {
    return false;
  }
  if (filter.completedTo && (!task.completedAt || task.completedAt.slice(0, 10) > filter.completedTo)) {
    return false;
  }

  if (requires(filter.onlyOverdue) && !isOverdue(task, todayIso)) return false;
  if (requires(filter.onlyToday) && !isDueToday(task, todayIso)) return false;
  if (requires(filter.onlyUpcoming) && !isUpcoming(task, todayIso)) return false;
  if (requires(filter.onlyNoDate) && !hasNoDate(task)) return false;
  if (requires(filter.onlyRecurring) && !task.recurrence) return false;
  if (requires(filter.onlyWithReminder) && task.reminderCount <= 0) return false;
  if (requires(filter.onlyWithComments) && task.commentCount <= 0) return false;
  if (requires(filter.onlyWithAttachments) && task.attachmentCount <= 0) return false;
  if (requires(filter.onlyParents) && task.parentTaskId !== null) return false;
  if (requires(filter.onlySubtasks) && task.parentTaskId === null) return false;

  return true;
}

/** Aplica o filtro a uma lista. */
export function filterTasks(
  tasks: TodoTask[],
  filter: TodoFilterDefinition,
  todayIso: string,
): TodoTask[] {
  return tasks.filter((t) => matchesFilter(t, filter, todayIso));
}

/** O filtro tem alguma regra ativa? (para mostrar o botão "limpar filtros"). */
export function isFilterActive(filter: TodoFilterDefinition): boolean {
  return Object.entries(filter).some(([, value]) => {
    if (value === null || value === undefined || value === false) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  });
}

/** Quantas regras estão ativas (badge numérico na barra de filtros). */
export function countActiveFilters(filter: TodoFilterDefinition): number {
  return Object.entries(filter).filter(([, value]) => {
    if (value === null || value === undefined || value === false) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return true;
  }).length;
}

/* ───────────────────────────── Ordenação ───────────────────────────── */

/** Nulos SEMPRE por último, independentemente da direção (data vazia não "vence"). */
function compareNullable(
  a: string | number | null,
  b: string | number | null,
  dir: TodoSortDir,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const cmp = a < b ? -1 : a > b ? 1 : 0;
  return dir === "desc" ? -cmp : cmp;
}

/**
 * Ordena uma lista (cópia — não muta a entrada). O desempate final é sempre
 * `position` → `title`, o que torna a ordenação **estável e determinística**
 * (importante: a UI reordena por drag e não pode "pular" itens equivalentes).
 */
export function sortTasks(
  tasks: TodoTask[],
  sortBy: TodoSort,
  dir: TodoSortDir = "asc",
): TodoTask[] {
  const out = [...tasks];
  out.sort((a, b) => {
    let cmp = 0;
    switch (sortBy) {
      case "manual":
        cmp = a.position - b.position;
        if (dir === "desc") cmp = -cmp;
        break;
      case "data":
        cmp = compareNullable(a.scheduledDate, b.scheduledDate, dir);
        break;
      case "horario":
        cmp = compareNullable(a.scheduledTime, b.scheduledTime, dir);
        break;
      case "prazo":
        cmp = compareNullable(a.deadlineAt, b.deadlineAt, dir);
        break;
      case "prioridade":
        // priority 1 = urgente → 'asc' mostra as urgentes primeiro.
        cmp = a.priority - b.priority;
        if (dir === "desc") cmp = -cmp;
        break;
      case "nome":
        cmp = a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" });
        if (dir === "desc") cmp = -cmp;
        break;
      case "criacao":
        cmp = compareNullable(a.createdAt, b.createdAt, dir);
        break;
      case "conclusao":
        cmp = compareNullable(a.completedAt, b.completedAt, dir);
        break;
    }
    if (cmp !== 0) return cmp;
    if (a.position !== b.position) return a.position - b.position;
    return a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" });
  });
  return out;
}

/* ───────────────────────────── Agrupamento ───────────────────────────── */

/** Rótulos que a UI passa para resolver ids em nomes (projeto, seção, etiqueta). */
export interface TodoGroupLookups {
  projectName: (id: string | null) => string;
  projectColor?: (id: string | null) => TodoColor | null;
  sectionName: (id: string | null) => string;
  /** 'yyyy-MM-dd' → rótulo pt-BR (ex.: "Hoje", "28/07/2026"). */
  dateLabel: (iso: string | null) => string;
}

/**
 * Agrupa a lista já filtrada/ordenada. Grupos saem em ordem estável e previsível
 * (prioridade P1→P4, datas crescentes, "sem X" sempre por último).
 *
 * Em 'etiqueta' uma tarefa com várias etiquetas aparece em VÁRIOS grupos — é o
 * comportamento esperado de um agrupamento por etiqueta, e está documentado aqui para
 * ninguém "corrigir" isso por engano depois.
 */
export function groupTasks(
  tasks: TodoTask[],
  groupBy: TodoGroup,
  lookups: TodoGroupLookups,
  todayIso: string,
): TodoTaskGroup[] {
  if (groupBy === "nenhum") {
    return [{ key: "todas", label: "", tasks }];
  }

  const buckets = new Map<string, TodoTaskGroup>();
  const push = (key: string, label: string, task: TodoTask, color?: TodoColor | null) => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, color: color ?? null, tasks: [] };
      buckets.set(key, bucket);
    }
    bucket.tasks.push(task);
  };

  for (const task of tasks) {
    switch (groupBy) {
      case "projeto":
        push(
          task.projectId ?? "__inbox__",
          lookups.projectName(task.projectId),
          task,
          lookups.projectColor?.(task.projectId) ?? null,
        );
        break;
      case "secao":
        push(task.sectionId ?? "__sem_secao__", lookups.sectionName(task.sectionId), task);
        break;
      case "prioridade":
        push(`p${task.priority}`, TODO_PRIORITY_LABELS[task.priority], task);
        break;
      case "etiqueta":
        if (task.labels.length === 0) {
          push("__sem_etiqueta__", "Sem etiqueta", task);
        } else {
          for (const label of task.labels) {
            push(`l:${label.id}`, label.name, task, label.color);
          }
        }
        break;
      case "data":
        push(
          task.scheduledDate ?? "__sem_data__",
          lookups.dateLabel(task.scheduledDate),
          task,
        );
        break;
      case "status": {
        const eff = effectiveStatus(task, todayIso);
        push(eff, TODO_EFFECTIVE_STATUS_LABELS[eff], task);
        break;
      }
    }
  }

  const groups = [...buckets.values()];
  const isFallback = (key: string) => key.startsWith("__");

  groups.sort((a, b) => {
    // "Sem projeto/seção/data/etiqueta" sempre por último.
    if (isFallback(a.key) !== isFallback(b.key)) return isFallback(a.key) ? 1 : -1;
    if (groupBy === "prioridade" || groupBy === "data") return a.key.localeCompare(b.key);
    return a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" });
  });

  return groups;
}

/* ───────────────────────────── Hierarquia ───────────────────────────── */

/**
 * Monta a árvore tarefa → subtarefas. Uma subtarefa cuja mãe não está na lista
 * (filtrada de fora) sobe para a raiz, para não sumir silenciosamente da tela.
 * Protegido contra ciclos: cada tarefa entra na árvore uma única vez.
 */
export function buildTaskTree(tasks: TodoTask[]): Array<TodoTask & { children: TodoTask[] }> {
  const byId = new Map(tasks.map((t) => [t.id, { ...t, children: [] as TodoTask[] }]));
  const roots: Array<TodoTask & { children: TodoTask[] }> = [];

  for (const task of byId.values()) {
    const parent = task.parentTaskId ? byId.get(task.parentTaskId) : undefined;
    if (parent && parent.id !== task.id) parent.children.push(task);
    else roots.push(task);
  }
  return roots;
}

/* ───────────────────────────── Filtros das visões fixas ───────────────────────────── */

/**
 * Caixa de entrada: tarefa aberta, sem projeto e que não é subtarefa de ninguém.
 * (Uma subtarefa pertence ao contexto da mãe, então não é "captura solta".)
 */
export function isInbox(task: TodoTask): boolean {
  return !isClosed(task) && task.projectId === null && task.parentTaskId === null;
}

/** "Hoje": vencendo hoje OU atrasadas (a UI separa em duas seções). */
export function isTodayBucket(task: TodoTask, todayIso: string): boolean {
  return isDueToday(task, todayIso) || isOverdue(task, todayIso);
}

/** Concluídas HOJE (para a terceira seção da visão "Hoje"). */
export function isCompletedToday(task: TodoTask, todayIso: string): boolean {
  return task.status === "concluida" && (task.completedAt ?? "").slice(0, 10) === todayIso;
}
