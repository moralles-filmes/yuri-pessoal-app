/**
 * Fonte única de verdade dos enums de Demandas, Tarefas & Rotinas (Fase 09).
 * Os arrays `as const` alimentam os tipos TS (src/types/database.ts), os schemas
 * Zod (src/lib/validators) e os rótulos pt-BR da UI. Os valores precisam casar
 * com os CHECK constraints das migrations.
 */

/* ───────────────────────────── Tarefas ───────────────────────────── */

/** Prioridade de uma tarefa (casa com o CHECK de tasks.priority). */
export const TASK_PRIORITIES = ["baixa", "media", "alta", "urgente"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

/** Peso para ordenar por prioridade (maior = mais urgente). */
export const TASK_PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  baixa: 0,
  media: 1,
  alta: 2,
  urgente: 3,
};

/**
 * Status PERSISTIDO de uma tarefa (casa com o CHECK de tasks.status).
 * `atrasada` é DERIVADA na leitura (due_date < hoje e não concluída/cancelada) —
 * ver src/lib/tasks/status.ts. Só `pendente|em_andamento|concluida|cancelada`
 * são gravados; `atrasada` existe no CHECK por compatibilidade mas não é escrita.
 */
export const TASK_STATUSES = [
  "pendente",
  "em_andamento",
  "concluida",
  "atrasada",
  "cancelada",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Status que o usuário pode gravar (exclui `atrasada`, que é derivada). */
export const TASK_STORED_STATUSES = [
  "pendente",
  "em_andamento",
  "concluida",
  "cancelada",
] as const;
export type TaskStoredStatus = (typeof TASK_STORED_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  atrasada: "Atrasada",
  cancelada: "Cancelada",
};

/** Colunas do kanban (status persistidos que fluem da esquerda → direita). */
export const KANBAN_COLUMNS = [
  "pendente",
  "em_andamento",
  "concluida",
] as const satisfies readonly TaskStoredStatus[];

/* ───────────────────────────── Rotinas ───────────────────────────── */

/** Tipo de rotina (casa com o CHECK de routines.type). */
export const ROUTINE_TYPES = [
  "manha",
  "noite",
  "trabalho",
  "estudos",
  "exercicios",
  "outro",
] as const;
export type RoutineType = (typeof ROUTINE_TYPES)[number];

export const ROUTINE_TYPE_LABELS: Record<RoutineType, string> = {
  manha: "Manhã",
  noite: "Noite",
  trabalho: "Trabalho",
  estudos: "Estudos",
  exercicios: "Exercícios",
  outro: "Outro",
};

/** Frequência de uma rotina (casa com o CHECK de routines.frequency). */
export const ROUTINE_FREQUENCIES = [
  "diaria",
  "semanal",
  "dias_especificos",
] as const;
export type RoutineFrequency = (typeof ROUTINE_FREQUENCIES)[number];

export const ROUTINE_FREQUENCY_LABELS: Record<RoutineFrequency, string> = {
  diaria: "Todos os dias",
  semanal: "Semanal",
  dias_especificos: "Dias específicos",
};

/* ───────────────────────────── Recorrência de tarefas ───────────────────────────── */

/** Frequências de recorrência de uma tarefa (espelha o financeiro/agenda). */
export const TASK_RECURRENCE_FREQUENCIES = [
  "diaria",
  "semanal",
  "mensal",
  "anual",
] as const;
export type TaskRecurrenceFrequency =
  (typeof TASK_RECURRENCE_FREQUENCIES)[number];

export const TASK_RECURRENCE_FREQUENCY_LABELS: Record<
  TaskRecurrenceFrequency,
  string
> = {
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
  anual: "Anual",
};

/* ───────────────────────────── Cores (premium preto/branco/dourado) ───────────────────────────── */

/**
 * Cor por prioridade — usada como ponto/borda/realce. Hex legíveis em dark E light.
 * Urgente puxa o dourado/âmbar da identidade; demais usam neutros auxiliares.
 */
export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  baixa: "#64748B", // cinza-azulado
  media: "#2F6FED", // azul
  alta: "#C99A2E", // dourado (identidade)
  urgente: "#DC2626", // vermelho
};

/** Cor por tipo de rotina (ponto/realce). */
export const ROUTINE_TYPE_COLORS: Record<RoutineType, string> = {
  manha: "#C99A2E", // dourado (identidade) — começo do dia
  noite: "#7C5CFC", // violeta
  trabalho: "#2F6FED", // azul
  estudos: "#0EA5E9", // ciano
  exercicios: "#1FA971", // verde
  outro: "#64748B", // cinza-azulado
};

/** Paleta sugerida para o seletor de cor de projetos/rotinas. */
export const ENTITY_COLOR_PALETTE = [
  "#C99A2E",
  "#2F6FED",
  "#7C5CFC",
  "#1FA971",
  "#0EA5E9",
  "#DC2626",
  "#EA580C",
  "#64748B",
] as const;

/* ───────────────────────────── Visões de tarefas ───────────────────────────── */

/** Visões da tela de tarefas (estado em URL `?view=`). */
export const TASK_VIEWS = [
  "lista",
  "kanban",
  "calendario",
  "hoje",
  "semana",
  "atrasadas",
  "concluidas",
] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export const TASK_VIEW_LABELS: Record<TaskView, string> = {
  lista: "Lista",
  kanban: "Kanban",
  calendario: "Calendário",
  hoje: "Hoje",
  semana: "Semana",
  atrasadas: "Atrasadas",
  concluidas: "Concluídas",
};
