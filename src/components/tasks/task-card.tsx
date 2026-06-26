"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  CheckCircle2,
  ListChecks,
  MoreVertical,
  Paperclip,
  Pencil,
  Repeat,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskPriorityBadge, TaskStatusBadge, ProjectPill } from "./badges";
import {
  completeTask,
  deleteTask,
  reopenTask,
  setTaskStatus,
} from "@/lib/actions/tasks";
import { effectiveTaskStatus, isOverdue } from "@/lib/tasks/status";
import { TASK_PRIORITY_COLORS } from "@/lib/tasks/constants";
import { formatDate } from "@/lib/format";
import type { TaskWithRelations } from "@/types/database";

export function TaskCard({
  task,
  todayIso,
  onEdit,
  onOpen,
  compact = false,
  className,
}: {
  task: TaskWithRelations;
  todayIso: string;
  onEdit: (task: TaskWithRelations) => void;
  onOpen: (task: TaskWithRelations) => void;
  compact?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const status = effectiveTaskStatus(task, todayIso);
  const done = task.status === "concluida";
  const cancelled = task.status === "cancelada";
  const overdue = isOverdue(task, todayIso);

  const checklistTotal = task.checklist?.length ?? 0;
  const checklistDone = task.checklist?.filter((c) => c.is_done).length ?? 0;

  async function run(
    action: Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) {
    setBusy(true);
    try {
      const res = await action;
      if (res.ok) {
        toast.success(okMsg);
        router.refresh();
      } else {
        toast.error(res.error ?? "Não foi possível concluir.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4 transition-colors hover:border-border/80",
        className,
      )}
      style={{ borderLeftColor: TASK_PRIORITY_COLORS[task.priority] }}
    >
      <CardContent className={cn("flex items-start gap-3", compact ? "p-3" : "p-3.5")}>
        <Checkbox
          checked={done}
          disabled={busy || cancelled}
          aria-label={done ? "Reabrir tarefa" : "Concluir tarefa"}
          className="mt-0.5"
          onCheckedChange={(v) =>
            run(
              v ? completeTask(task.id) : reopenTask(task.id),
              v ? "Tarefa concluída." : "Tarefa reaberta.",
            )
          }
        />

        <button
          type="button"
          onClick={() => onOpen(task)}
          className="min-w-0 flex-1 space-y-1 text-left"
        >
          <p
            className={cn(
              "truncate text-sm font-medium",
              (done || cancelled) && "text-muted-foreground line-through decoration-1",
            )}
          >
            {task.title}
          </p>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            {task.project && (
              <ProjectPill name={task.project.name} color={task.project.color} />
            )}
            {task.due_date && (
              <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive font-medium")}>
                <CalendarClock className="size-3" />
                {formatDate(task.due_date)}
              </span>
            )}
            {checklistTotal > 0 && (
              <span className="inline-flex items-center gap-1">
                <ListChecks className="size-3" />
                {checklistDone}/{checklistTotal}
              </span>
            )}
            {task.recurrence && <Repeat className="size-3" aria-label="Recorrente" />}
            {task.calendar_event && (
              <CalendarClock className="size-3" aria-label="Vinculada à agenda" />
            )}
            {(task.attachments?.length ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="size-3" />
                {task.attachments.length}
              </span>
            )}
          </div>

          {!compact && task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {task.tags.slice(0, 4).map((t) => (
                <Badge key={t} variant="outline" className="px-1.5 py-0 text-[11px] font-normal">
                  #{t}
                </Badge>
              ))}
            </div>
          )}
        </button>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {compact ? (
            <TaskPriorityBadge priority={task.priority} />
          ) : (
            <TaskStatusBadge status={status} />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Ações da tarefa" disabled={busy}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(task)}>
                <Pencil /> Editar
              </DropdownMenuItem>
              {task.status !== "em_andamento" && !done && !cancelled && (
                <DropdownMenuItem
                  onClick={() => run(setTaskStatus(task.id, "em_andamento"), "Em andamento.")}
                >
                  <RotateCcw /> Marcar em andamento
                </DropdownMenuItem>
              )}
              {!done ? (
                <DropdownMenuItem
                  onClick={() => run(completeTask(task.id), "Tarefa concluída.")}
                >
                  <CheckCircle2 /> Concluir
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => run(reopenTask(task.id), "Tarefa reaberta.")}
                >
                  <RotateCcw /> Reabrir
                </DropdownMenuItem>
              )}
              {!cancelled && task.status !== "concluida" && (
                <DropdownMenuItem
                  onClick={() => run(setTaskStatus(task.id, "cancelada"), "Tarefa cancelada.")}
                >
                  Cancelar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => run(deleteTask(task.id), "Tarefa excluída.")}
              >
                <Trash2 /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
