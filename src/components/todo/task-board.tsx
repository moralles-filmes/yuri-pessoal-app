"use client";

/**
 * Fase 15 — Módulo TO-DO · Visão em quadro (Kanban).
 *
 * Cada SEÇÃO do projeto é uma coluna, mais uma coluna "Sem seção". Arrastar move a
 * tarefa entre colunas (persiste `section_id` + `position`).
 *
 * ACESSIBILIDADE E MOBILE: o drag NUNCA é o único caminho — cada card tem o menu "⋯"
 * com "Mover para…", e o dnd-kit já dá suporte a teclado. Em telas pequenas as colunas
 * rolam na horizontal com largura confortável (sem cortar conteúdo).
 */
import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { effectiveStatus } from "@/lib/todo/status";
import {
  DeadlineChip,
  LabelChip,
  PriorityBadge,
  RecurrenceChip,
  ScheduleChip,
} from "@/components/todo/badges";
import { QuickTaskInput } from "@/components/todo/quick-task-input";
import type { TodoLabel, TodoProject, TodoTask } from "@/lib/todo/types";

const NO_SECTION = "__sem_secao__";

export interface BoardColumn {
  id: string;
  title: string;
  tasks: TodoTask[];
}

export function TaskBoard({
  columns,
  project,
  projects,
  labels,
  todayIso,
  onOpenTask,
  onToggleComplete,
  onMoveTask,
  onEditSection,
  onDeleteSection,
  onMoveSection,
}: {
  columns: BoardColumn[];
  project: TodoProject | null;
  projects: TodoProject[];
  /** Alimenta a interpretação de "@etiqueta" na criação rápida da coluna. */
  labels: TodoLabel[];
  todayIso: string;
  onOpenTask: (task: TodoTask) => void;
  onToggleComplete: (task: TodoTask) => void;
  /** (taskId, sectionId | null, novaPosição) */
  onMoveTask: (taskId: string, sectionId: string | null, position: number) => void;
  onEditSection: (sectionId: string) => void;
  onDeleteSection: (sectionId: string, taskCount: number) => void;
  /** Reordena a seção uma posição para a esquerda (-1) ou direita (+1). */
  onMoveSection: (sectionId: string, direction: -1 | 1) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [adding, setAdding] = React.useState<string | null>(null);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const overId = String(over.id);

    // O alvo pode ser a coluna (droppable) ou outro card (sortable dentro dela).
    const targetColumn =
      columns.find((c) => c.id === overId) ??
      columns.find((c) => c.tasks.some((t) => t.id === overId));
    if (!targetColumn) return;

    const sectionId = targetColumn.id === NO_SECTION ? null : targetColumn.id;
    const overIndex = targetColumn.tasks.findIndex((t) => t.id === overId);
    const position = overIndex >= 0 ? overIndex : targetColumn.tasks.length;

    const current = columns.find((c) => c.tasks.some((t) => t.id === taskId));
    const currentSection = current?.id === NO_SECTION ? null : (current?.id ?? null);
    const currentIndex = current?.tasks.findIndex((t) => t.id === taskId) ?? -1;
    if (currentSection === sectionId && currentIndex === position) return;

    onMoveTask(taskId, sectionId, position);
  }

  // Índice entre as seções REAIS (a coluna "Sem seção" é virtual e não reordena).
  const sectionIds = columns.filter((c) => c.id !== NO_SECTION).map((c) => c.id);

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {columns.map((column) => (
          <BoardColumnView
            key={column.id}
            column={column}
            project={project}
            projects={projects}
            labels={labels}
            todayIso={todayIso}
            sectionIndex={sectionIds.indexOf(column.id)}
            sectionCount={sectionIds.length}
            adding={adding === column.id}
            onAddToggle={(open) => setAdding(open ? column.id : null)}
            onOpenTask={onOpenTask}
            onToggleComplete={onToggleComplete}
            onEditSection={onEditSection}
            onDeleteSection={onDeleteSection}
            onMoveSection={onMoveSection}
          />
        ))}
      </div>
    </DndContext>
  );
}

function BoardColumnView({
  column,
  project,
  projects,
  labels,
  todayIso,
  sectionIndex,
  sectionCount,
  adding,
  onAddToggle,
  onOpenTask,
  onToggleComplete,
  onEditSection,
  onDeleteSection,
  onMoveSection,
}: {
  column: BoardColumn;
  project: TodoProject | null;
  projects: TodoProject[];
  labels: TodoLabel[];
  todayIso: string;
  sectionIndex: number;
  sectionCount: number;
  adding: boolean;
  onAddToggle: (open: boolean) => void;
  onOpenTask: (task: TodoTask) => void;
  onToggleComplete: (task: TodoTask) => void;
  onEditSection: (sectionId: string) => void;
  onDeleteSection: (sectionId: string, taskCount: number) => void;
  onMoveSection: (sectionId: string, direction: -1 | 1) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  // A coluna "Sem seção" é virtual: não existe registro para editar/excluir.
  const isRealSection = column.id !== NO_SECTION;

  return (
    <section
      ref={setNodeRef}
      aria-label={`Coluna ${column.title}`}
      className={cn(
        "flex w-[17rem] shrink-0 flex-col gap-2 rounded-2xl border border-border bg-card/40 p-2.5 transition-colors sm:w-[19rem]",
        isOver && "border-primary/40 bg-primary/5",
      )}
    >
      <header className="flex items-center justify-between gap-1 px-0.5">
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">{column.title}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground">
          {column.tasks.length}
        </span>
        {isRealSection && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Ações da seção ${column.title}`}
                className="text-muted-foreground"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditSection(column.id)}>
                <Pencil /> Renomear seção
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={sectionIndex <= 0}
                onClick={() => onMoveSection(column.id, -1)}
              >
                <ChevronLeft /> Mover para a esquerda
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={sectionIndex < 0 || sectionIndex >= sectionCount - 1}
                onClick={() => onMoveSection(column.id, 1)}
              >
                <ChevronRight /> Mover para a direita
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDeleteSection(column.id, column.tasks.length)}
              >
                <Trash2 /> Excluir seção
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      <SortableContext
        items={column.tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-[3rem] flex-col gap-2">
          {column.tasks.map((task) => (
            <BoardCard
              key={task.id}
              task={task}
              todayIso={todayIso}
              onOpen={onOpenTask}
              onToggleComplete={onToggleComplete}
            />
          ))}
          {column.tasks.length === 0 && !adding && (
            <p className="rounded-lg border border-dashed border-border px-2 py-4 text-center text-xs text-muted-foreground">
              Nenhuma tarefa aqui.
            </p>
          )}
        </div>
      </SortableContext>

      {adding ? (
        <QuickTaskInput
          compact
          autoFocus
          projects={projects}
          labels={labels}
          todayIso={todayIso}
          defaultProjectId={project?.id ?? null}
          defaultSectionId={column.id === NO_SECTION ? null : column.id}
          onDone={() => onAddToggle(false)}
          onCancel={() => onAddToggle(false)}
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-muted-foreground"
          onClick={() => onAddToggle(true)}
        >
          <Plus /> Adicionar tarefa
        </Button>
      )}
    </section>
  );
}

function BoardCard({
  task,
  todayIso,
  onOpen,
  onToggleComplete,
}: {
  task: TodoTask;
  todayIso: string;
  onOpen: (task: TodoTask) => void;
  onToggleComplete: (task: TodoTask) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const overdue = effectiveStatus(task, todayIso) === "atrasada";
  const done = task.status === "concluida";

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "space-y-2 rounded-xl border border-border bg-card p-2.5",
        overdue && "border-destructive/30",
        done && "opacity-60",
        isDragging && "relative z-10 opacity-80",
      )}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Arrastar ${task.title}`}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded text-muted-foreground/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <Checkbox
          checked={done}
          onCheckedChange={() => onToggleComplete(task)}
          aria-label={done ? `Reabrir ${task.title}` : `Concluir ${task.title}`}
          className="mt-0.5"
        />
        <button
          type="button"
          onClick={() => onOpen(task)}
          className={cn(
            "min-w-0 flex-1 text-left text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            done && "line-through",
          )}
        >
          {task.title}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-6">
        <PriorityBadge priority={task.priority} compact />
        <ScheduleChip
          dateIso={task.scheduledDate}
          time={task.scheduledTime}
          todayIso={todayIso}
          overdue={overdue}
        />
        <DeadlineChip deadlineIso={task.deadlineAt} todayIso={todayIso} />
        <RecurrenceChip rule={task.recurrence} />
        {task.labels.map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
      </div>

      {(task.subtaskCount > 0 || task.commentCount > 0 || task.attachmentCount > 0) && (
        <div className="flex items-center gap-3 pl-6 text-[0.7rem] text-muted-foreground">
          {task.subtaskCount > 0 && (
            <span>
              {task.subtaskDoneCount}/{task.subtaskCount} subtarefas
            </span>
          )}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3" aria-hidden />
              {task.commentCount}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3" aria-hidden />
              {task.attachmentCount}
            </span>
          )}
        </div>
      )}
    </article>
  );
}
