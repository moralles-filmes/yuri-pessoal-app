/**
 * Fase 15 — Módulo TO-DO · Tipos de domínio (puros, sem React nem Supabase).
 *
 * São os shapes que atravessam servidor → client. Ficam separados das linhas cruas do
 * banco de propósito: as queries montam estes objetos (resolvendo etiquetas, contagens e
 * o status derivado) e a UI consome só isto, sem saber de joins.
 */
import type {
  TodoColor,
  TodoGroup,
  TodoPriority,
  TodoReminderChannel,
  TodoSort,
  TodoSortDir,
  TodoSource,
  TodoStatus,
  TodoView,
} from "@/lib/todo/constants";
import type { TodoRecurrenceRule } from "@/lib/todo/recurrence";

/** Etiqueta enxuta (o que a UI precisa para renderizar o chip). */
export interface TodoLabelRef {
  id: string;
  name: string;
  color: TodoColor;
}

export interface TodoLabel extends TodoLabelRef {
  description: string | null;
  position: number;
  status: "ativo" | "arquivado";
  /** Quantas tarefas usam esta etiqueta (calculado na leitura). */
  taskCount: number;
}

export interface TodoSection {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  position: number;
  archivedAt: string | null;
}

export interface TodoProject {
  id: string;
  parentProjectId: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: TodoColor;
  isFavorite: boolean;
  defaultView: TodoView;
  status: "ativo" | "arquivado";
  position: number;
  archivedAt: string | null;
  sections: TodoSection[];
  /** Contagens derivadas na leitura (nunca gravadas). */
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
}

export interface TodoReminder {
  id: string;
  taskId: string;
  /** ISO datetime (timestamptz). */
  remindAt: string;
  offsetMinutes: number | null;
  channel: TodoReminderChannel;
  status: "pendente" | "enviado" | "falhou" | "cancelado";
  sentAt: string | null;
}

export interface TodoComment {
  id: string;
  taskId: string;
  content: string;
  editedAt: string | null;
  createdAt: string;
  /** Nome/e-mail de exibição do autor (single-user hoje). */
  authorLabel: string | null;
}

export interface TodoAttachment {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storagePath: string;
  createdAt: string;
}

export interface TodoActivityEntry {
  id: string;
  eventType: string;
  previousData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * Tarefa como a UI consome. `scheduledDate`/`deadlineAt` são datas puras 'yyyy-MM-dd'
 * e `scheduledTime` é 'HH:mm' — separados de propósito (ver migration de `todo_tasks`).
 */
export interface TodoTask {
  id: string;
  projectId: string | null;
  sectionId: string | null;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  scheduledDate: string | null;
  scheduledTime: string | null;
  durationMinutes: number | null;
  deadlineAt: string | null;
  isAllDay: boolean;
  position: number;
  seriesId: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  archivedAt: string | null;
  source: TodoSource;
  externalReference: string | null;
  createdAt: string;
  updatedAt: string;

  labels: TodoLabelRef[];
  /** Regra de recorrência resolvida (null = não recorre). */
  recurrence: TodoRecurrenceRule | null;

  /* Contadores derivados na leitura — evitam N+1 na UI. */
  subtaskCount: number;
  subtaskDoneCount: number;
  commentCount: number;
  attachmentCount: number;
  reminderCount: number;
}

/** Tarefa + subtarefas aninhadas (usada na lista e no painel de detalhes). */
export interface TodoTaskNode extends TodoTask {
  children: TodoTaskNode[];
}

/** Grupo renderizável (seção do Kanban, agrupamento da lista, dia do calendário). */
export interface TodoTaskGroup {
  key: string;
  label: string;
  /** Cor opcional do cabeçalho (projeto/etiqueta/prioridade). */
  color?: TodoColor | null;
  tasks: TodoTask[];
}

/* ───────────────────────────── Filtros ───────────────────────────── */

/**
 * Definição de filtro. É o shape gravado em `todo_saved_filters.filter_definition`
 * (jsonb) e o mesmo usado pelos filtros temporários da URL — um único formato para
 * as duas coisas. Todo campo é opcional; ausente = "não filtra por isto".
 *
 * Combinação: os campos são AND entre si; dentro de um array é OR (ex.: projectIds
 * = [a, b] traz tarefas de a OU b).
 */
export interface TodoFilterDefinition {
  /** Texto livre (título e descrição). */
  search?: string | null;
  projectIds?: string[] | null;
  sectionIds?: string[] | null;
  labelIds?: string[] | null;
  priorities?: TodoPriority[] | null;
  statuses?: TodoStatus[] | null;
  /** Data programada dentro do intervalo (inclusivo), 'yyyy-MM-dd'. */
  scheduledFrom?: string | null;
  scheduledTo?: string | null;
  /** Prazo final dentro do intervalo (inclusivo). */
  deadlineFrom?: string | null;
  deadlineTo?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  completedFrom?: string | null;
  completedTo?: string | null;
  /** Atalhos booleanos (tri-state: true exige, false exclui, null/ausente ignora). */
  onlyOverdue?: boolean | null;
  onlyToday?: boolean | null;
  onlyUpcoming?: boolean | null;
  onlyNoDate?: boolean | null;
  onlyRecurring?: boolean | null;
  onlyWithReminder?: boolean | null;
  onlyWithComments?: boolean | null;
  onlyWithAttachments?: boolean | null;
  /** true = só tarefas principais; false = só subtarefas; ausente = ambas. */
  onlyParents?: boolean | null;
  onlySubtasks?: boolean | null;
  /** Inclui tarefas concluídas/canceladas/arquivadas no resultado. */
  includeCompleted?: boolean | null;
  includeArchived?: boolean | null;
}

export interface TodoSavedFilter {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: TodoColor;
  definition: TodoFilterDefinition;
  isFavorite: boolean;
  showInNav: boolean;
  position: number;
}

/** Preferência de visualização por escopo ('global' | 'project:<id>'). */
export interface TodoPreference {
  scope: string;
  view: TodoView;
  sortBy: TodoSort;
  sortDir: TodoSortDir;
  groupBy: TodoGroup;
  showCompleted: boolean;
}

export const DEFAULT_TODO_PREFERENCE: TodoPreference = {
  scope: "global",
  view: "lista",
  sortBy: "manual",
  sortDir: "asc",
  groupBy: "nenhum",
  showCompleted: false,
};

/* ───────────────────────────── Indicadores ───────────────────────────── */

/** Resumo do módulo (cabeçalho do TO-DO e card do dashboard). */
export interface TodoSummary {
  pending: number;
  completedToday: number;
  overdue: number;
  p1: number;
  p2: number;
  dueToday: number;
  thisWeek: number;
  /** 0..100 — concluídas ÷ (concluídas + pendentes) da semana. */
  weeklyCompletionRate: number;
  activeProjects: number;
}
