"use client";

/**
 * Fase 15 — Módulo TO-DO · Linha de tarefa (visão em lista).
 *
 * Regras de UX seguidas aqui:
 *  • Nada depende de hover — o menu "⋯" fica sempre acessível (só suaviza no desktop),
 *    porque no celular não existe hover.
 *  • Toda ação do drag tem alternativa por menu/teclado.
 *  • O checkbox tem `aria-label` explícito; o título é um botão (abre os detalhes).
 */
import * as React from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  Flag,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  RotateCcw,
  Sun,
  Trash2,
  Archive,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  TODO_PRIORITIES,
  TODO_PRIORITY_LABELS,
  type TodoPriority,
} from "@/lib/todo/constants";
import { effectiveStatus, isClosed, subtaskProgress } from "@/lib/todo/status";
import {
  ColorDot,
  DeadlineChip,
  LabelChip,
  PriorityFlag,
  RecurrenceChip,
  ScheduleChip,
} from "@/components/todo/badges";
import type { TodoProject, TodoTask } from "@/lib/todo/types";

export interface TaskRowActions {
  onOpen: (task: TodoTask) => void;
  onToggleComplete: (task: TodoTask) => void;
  onSnooze: (task: TodoTask, days: number) => void;
  onPickDate: (task: TodoTask) => void;
  onPriority: (task: TodoTask, priority: TodoPriority) => void;
  onMove: (task: TodoTask) => void;
  onDuplicate: (task: TodoTask) => void;
  onMakeSubtask: (task: TodoTask) => void;
  onPromote: (task: TodoTask) => void;
  onArchive: (task: TodoTask) => void;
  onDelete: (task: TodoTask) => void;
  onAddSubtask: (task: TodoTask) => void;
}

export function TaskRow({
  task,
  todayIso,
  projects,
  actions,
  handle,
  selected,
  onSelectedChange,
  selectionMode,
  depth = 0,
  expandable,
  expanded,
  onToggleExpand,
  className,
}: {
  task: TodoTask;
  todayIso: string;
  projects: TodoProject[];
  actions: TaskRowActions;
  /** Alça de arraste fornecida pelo SortableList (opcional). */
  handle?: React.ReactNode;
  selected?: boolean;
  onSelectedChange?: (checked: boolean) => void;
  selectionMode?: boolean;
  /** Nível de aninhamento (subtarefa) — só recua visualmente. */
  depth?: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  className?: string;
}) {
  const status = effectiveStatus(task, todayIso);
  const done = task.status === "concluida";
  const overdue = status === "atrasada";
  const closed = isClosed(task);
  const progress = subtaskProgress(task.subtaskDoneCount, task.subtaskCount);
  const project = projects.find((p) => p.id === task.projectId) ?? null;

  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-xl border border-border bg-card px-2.5 py-2 transition-colors",
        overdue && "border-destructive/30",
        done && "opacity-60",
        className,
      )}
      style={depth > 0 ? { marginLeft: `${Math.min(depth, 3) * 1.25}rem` } : undefined}
    >
      {handle}

      {selectionMode && (
        <Checkbox
          checked={selected}
          onCheckedChange={(v) => onSelectedChange?.(v === true)}
          aria-label={`Selecionar ${task.title}`}
          className="mt-1"
        />
      )}

      <Checkbox
        checked={done}
        onCheckedChange={() => actions.onToggleComplete(task)}
        aria-label={done ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
        className="mt-1"
      />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start gap-1.5">
          {expandable && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label={expanded ? "Recolher subtarefas" : "Expandir subtarefas"}
              aria-expanded={expanded}
              className="mt-0.5 rounded text-muted-foreground transition-transform hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <ChevronRight className={cn("size-4", expanded && "rotate-90")} />
            </button>
          )}
          <button
            type="button"
            onClick={() => actions.onOpen(task)}
            className={cn(
              "min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              done && "line-through",
            )}
          >
            {task.title}
          </button>
          <PriorityFlag priority={task.priority} className="mt-0.5 shrink-0" />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <ScheduleChip
            dateIso={task.scheduledDate}
            time={task.scheduledTime}
            todayIso={todayIso}
            overdue={overdue}
          />
          <DeadlineChip deadlineIso={task.deadlineAt} todayIso={todayIso} />
          <RecurrenceChip rule={task.recurrence} />

          {project && (
            <span className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground">
              <ColorDot color={project.color} />
              {project.name}
            </span>
          )}

          {task.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}

          {progress !== null && (
            <span className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground">
              <Check className="size-3" aria-hidden />
              {task.subtaskDoneCount}/{task.subtaskCount} subtarefas
            </span>
          )}
          {task.commentCount > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground"
              title={`${task.commentCount} comentário(s)`}
            >
              <MessageSquare className="size-3" aria-hidden />
              {task.commentCount}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span
              className="inline-flex items-center gap-1 text-[0.7rem] text-muted-foreground"
              title={`${task.attachmentCount} anexo(s)`}
            >
              <Paperclip className="size-3" aria-hidden />
              {task.attachmentCount}
            </span>
          )}
        </div>

        {progress !== null && progress > 0 && (
          <div
            className="h-1 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso das subtarefas: ${progress}%`}
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Ações de ${task.title}`}
            className="shrink-0 text-muted-foreground sm:opacity-60 sm:group-hover:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => actions.onOpen(task)}>
            <Pencil /> Abrir e editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.onToggleComplete(task)}>
            {done ? <RotateCcw /> : <Check />}
            {done ? "Reabrir" : "Concluir"}
          </DropdownMenuItem>

          {!closed && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => actions.onSnooze(task, 1)}>
                <Sun /> Adiar para amanhã
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.onSnooze(task, 7)}>
                <ArrowRight /> Adiar 1 semana
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.onPickDate(task)}>
                <CalendarDays /> Escolher data…
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Flag /> Prioridade
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {TODO_PRIORITIES.map((p) => (
                <DropdownMenuItem key={p} onClick={() => actions.onPriority(task, p)}>
                  <PriorityFlag priority={p} />
                  {TODO_PRIORITY_LABELS[p]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem onClick={() => actions.onMove(task)}>
            <ArrowRight /> Mover para…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => actions.onAddSubtask(task)}>
            <ArrowDownRight /> Adicionar subtarefa
          </DropdownMenuItem>
          {task.parentTaskId ? (
            <DropdownMenuItem onClick={() => actions.onPromote(task)}>
              <ArrowUpRight /> Tornar tarefa principal
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => actions.onMakeSubtask(task)}>
              <ArrowDownRight /> Transformar em subtarefa
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => actions.onDuplicate(task)}>
            <Copy /> Duplicar
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => actions.onArchive(task)}>
            <Archive /> Arquivar
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => actions.onDelete(task)}>
            <Trash2 /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
