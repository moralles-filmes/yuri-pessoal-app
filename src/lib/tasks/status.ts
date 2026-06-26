/**
 * Derivação pura do status EFETIVO de uma tarefa (Fase 09). SEM efeitos colaterais
 * (`today` injetado). Espelha a filosofia "status na leitura" do financeiro/fatura:
 * `atrasada` NÃO é gravada — é calculada quando `due_date < hoje` e a tarefa não
 * está concluída nem cancelada.
 */
import type {
  TaskPriority,
  TaskStatus,
  TaskStoredStatus,
} from "@/lib/tasks/constants";
import { TASK_PRIORITY_WEIGHT } from "@/lib/tasks/constants";

export interface TaskLike {
  status: TaskStoredStatus;
  /** 'yyyy-MM-dd' ou null. */
  due_date: string | null;
}

/** True se a tarefa está vencida em `todayIso` (não concluída/cancelada). */
export function isOverdue(task: TaskLike, todayIso: string): boolean {
  if (task.status === "concluida" || task.status === "cancelada") return false;
  return Boolean(task.due_date) && (task.due_date as string) < todayIso;
}

/** True se a tarefa vence exatamente em `todayIso` (e ainda está aberta). */
export function isDueToday(task: TaskLike, todayIso: string): boolean {
  if (task.status === "concluida" || task.status === "cancelada") return false;
  return task.due_date === todayIso;
}

/**
 * Status efetivo para exibição/filtragem: o gravado, exceto quando vencida —
 * aí vira `atrasada`. Tarefas concluídas/canceladas nunca são "atrasada".
 */
export function effectiveTaskStatus(
  task: TaskLike,
  todayIso: string,
): TaskStatus {
  if (isOverdue(task, todayIso)) return "atrasada";
  return task.status;
}

/** True se a tarefa está "aberta" (conta como pendência ativa). */
export function isOpen(task: TaskLike): boolean {
  return task.status === "pendente" || task.status === "em_andamento";
}

/**
 * Ordenação padrão de tarefas abertas: atrasadas primeiro, depois por data de
 * vencimento (mais cedo primeiro; sem data por último), depois por prioridade
 * (mais urgente primeiro). Estável e puro.
 */
export function compareTasks(
  a: TaskLike & { priority: TaskPriority; position?: number | null },
  b: TaskLike & { priority: TaskPriority; position?: number | null },
  todayIso: string,
): number {
  const aOver = isOverdue(a, todayIso) ? 0 : 1;
  const bOver = isOverdue(b, todayIso) ? 0 : 1;
  if (aOver !== bOver) return aOver - bOver;

  const aDue = a.due_date ?? "9999-99-99";
  const bDue = b.due_date ?? "9999-99-99";
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;

  const pw = TASK_PRIORITY_WEIGHT[b.priority] - TASK_PRIORITY_WEIGHT[a.priority];
  if (pw !== 0) return pw;

  return (a.position ?? 0) - (b.position ?? 0);
}
