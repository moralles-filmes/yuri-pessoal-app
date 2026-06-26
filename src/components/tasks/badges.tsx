import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ROUTINE_TYPE_COLORS,
  ROUTINE_TYPE_LABELS,
  TASK_PRIORITY_COLORS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type RoutineType,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks/constants";

const STATUS_CLASSES: Record<TaskStatus, string> = {
  pendente: "bg-muted text-muted-foreground ring-1 ring-border",
  em_andamento:
    "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20",
  concluida:
    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20",
  atrasada: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
  cancelada:
    "bg-muted text-muted-foreground ring-1 ring-border line-through decoration-1",
};

/** Badge do status EFETIVO da tarefa (atrasada já derivada). */
export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant="secondary" className={cn("border-0", STATUS_CLASSES[status])}>
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}

const PRIORITY_CLASSES: Record<TaskPriority, string> = {
  baixa: "bg-muted text-muted-foreground ring-1 ring-border",
  media: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-1 ring-sky-500/20",
  alta: "bg-primary/10 text-primary ring-1 ring-primary/20",
  urgente: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
};

/** Badge da prioridade da tarefa. */
export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge
      variant="secondary"
      className={cn("border-0", PRIORITY_CLASSES[priority])}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

/** Ponto colorido por prioridade (para barras laterais e listas densas). */
export function PriorityDot({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: TASK_PRIORITY_COLORS[priority] }}
    />
  );
}

/** Pílula de projeto: ponto colorido + nome. */
export function ProjectPill({
  name,
  color,
  className,
}: {
  name: string;
  color?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full ring-1 ring-foreground/10"
        style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Badge do tipo de rotina (cor por tipo). */
export function RoutineTypeBadge({ type }: { type: RoutineType }) {
  return (
    <Badge
      variant="secondary"
      className="gap-1.5 border-0 bg-muted"
      style={{ color: ROUTINE_TYPE_COLORS[type] }}
    >
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: ROUTINE_TYPE_COLORS[type] }}
      />
      {ROUTINE_TYPE_LABELS[type]}
    </Badge>
  );
}
