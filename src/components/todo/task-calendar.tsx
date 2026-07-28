"use client";

/**
 * Fase 15 — Módulo TO-DO · Visão em calendário (mês).
 *
 * Espelha a estrutura de grade do calendário da Agenda (Fase 08) — mesma linguagem
 * visual, sem importar aquele componente, porque ele é modelado em torno de EVENTOS
 * com início/fim em timestamptz, e aqui a unidade é uma tarefa com data pura + hora
 * opcional. Duplicar a grade (poucas linhas) sai mais barato e mais seguro do que
 * generalizar o componente da agenda e arriscar regressão nela.
 *
 * Arrastar um dia para outro reagenda a tarefa. Como sempre, há alternativa sem drag:
 * clicar na tarefa abre os detalhes, onde a data é um campo comum.
 */
import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WEEKDAY_SHORT, TODO_PRIORITY_FLAG } from "@/lib/todo/constants";
import { effectiveStatus } from "@/lib/todo/status";
import { addDaysIso, weekdayOf } from "@/lib/todo/recurrence";
import type { TodoTask } from "@/lib/todo/types";

/** Todos os dias da grade do mês (começa no domingo, 6 semanas fixas). */
function monthGrid(year: number, month: number): string[] {
  const firstIso = `${year}-${String(month).padStart(2, "0")}-01`;
  const start = addDaysIso(firstIso, -weekdayOf(firstIso));
  return Array.from({ length: 42 }, (_, i) => addDaysIso(start, i));
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function TaskCalendar({
  tasks,
  monthIso,
  todayIso,
  onMonthChange,
  onOpenTask,
  onReschedule,
  onCreateAt,
}: {
  tasks: TodoTask[];
  /** 'yyyy-MM' do mês exibido. */
  monthIso: string;
  todayIso: string;
  onMonthChange: (nextMonthIso: string) => void;
  onOpenTask: (task: TodoTask) => void;
  onReschedule: (taskId: string, dateIso: string) => void;
  onCreateAt: (dateIso: string) => void;
}) {
  const [year, month] = monthIso.split("-").map(Number);
  const days = React.useMemo(() => monthGrid(year, month), [year, month]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Agrupa por data programada (uma passada) — evita filtrar 42 vezes a lista inteira.
  const byDate = React.useMemo(() => {
    const map = new Map<string, TodoTask[]>();
    for (const task of tasks) {
      const date = task.scheduledDate;
      if (!date) continue;
      const list = map.get(date) ?? [];
      list.push(task);
      map.set(date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.scheduledTime ?? "99:99").localeCompare(b.scheduledTime ?? "99:99"));
    }
    return map;
  }, [tasks]);

  function shiftMonth(delta: number) {
    const total = year * 12 + (month - 1) + delta;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    onMonthChange(`${y}-${String(m).padStart(2, "0")}`);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const dateIso = String(over.id);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return;
    onReschedule(String(active.id), dateIso);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {MONTH_NAMES[month - 1]} de {year}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onMonthChange(todayIso.slice(0, 7))}>
            Hoje
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Próximo mês" onClick={() => shiftMonth(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto">
          <div className="min-w-[42rem]">
            <div className="grid grid-cols-7 gap-px">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                <div
                  key={d}
                  className="pb-1.5 text-center text-[0.7rem] font-medium text-muted-foreground"
                >
                  {WEEKDAY_SHORT[d]}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
              {days.map((dayIso) => (
                <CalendarDay
                  key={dayIso}
                  dayIso={dayIso}
                  tasks={byDate.get(dayIso) ?? []}
                  inMonth={Number(dayIso.slice(5, 7)) === month}
                  isToday={dayIso === todayIso}
                  todayIso={todayIso}
                  onOpenTask={onOpenTask}
                  onCreateAt={onCreateAt}
                />
              ))}
            </div>
          </div>
        </div>
      </DndContext>

      <p className="text-[0.7rem] text-muted-foreground">
        Arraste uma tarefa para outro dia para reagendar. Também dá para abrir a tarefa e
        alterar a data pelo campo.
      </p>
    </div>
  );
}

function CalendarDay({
  dayIso,
  tasks,
  inMonth,
  isToday,
  todayIso,
  onOpenTask,
  onCreateAt,
}: {
  dayIso: string;
  tasks: TodoTask[];
  inMonth: boolean;
  isToday: boolean;
  todayIso: string;
  onOpenTask: (task: TodoTask) => void;
  onCreateAt: (dateIso: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayIso });
  const dayNumber = Number(dayIso.slice(8, 10));
  const visible = tasks.slice(0, 3);
  const hidden = tasks.length - visible.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/day min-h-[6.5rem] bg-card p-1.5 transition-colors",
        !inMonth && "bg-muted/40",
        isOver && "bg-primary/10",
      )}
    >
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            "grid size-5 place-items-center rounded-full text-[0.7rem] tabular-nums",
            isToday && "bg-primary font-semibold text-primary-foreground",
            !inMonth && "text-muted-foreground",
          )}
        >
          {dayNumber}
        </span>
        <button
          type="button"
          onClick={() => onCreateAt(dayIso)}
          aria-label={`Criar tarefa em ${dayIso.split("-").reverse().join("/")}`}
          className="rounded text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-hover/day:opacity-100 sm:opacity-0"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <div className="space-y-1">
        {visible.map((task) => (
          <CalendarTask key={task.id} task={task} todayIso={todayIso} onOpen={onOpenTask} />
        ))}
        {hidden > 0 && (
          <p className="px-1 text-[0.65rem] text-muted-foreground">+{hidden} tarefa(s)</p>
        )}
      </div>
    </div>
  );
}

function CalendarTask({
  task,
  todayIso,
  onOpen,
}: {
  task: TodoTask;
  todayIso: string;
  onOpen: (task: TodoTask) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const overdue = effectiveStatus(task, todayIso) === "atrasada";
  const done = task.status === "concluida";

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "flex items-center gap-1 rounded-md border px-1 py-0.5 text-[0.7rem] leading-tight",
        overdue
          ? "border-destructive/30 bg-destructive/10"
          : "border-border bg-muted/50",
        done && "opacity-60",
        isDragging && "relative z-10 opacity-80",
      )}
      {...attributes}
      {...listeners}
    >
      <span
        aria-hidden
        className={cn("shrink-0 text-[0.6rem]", TODO_PRIORITY_FLAG[task.priority])}
      >
        ●
      </span>
      {task.scheduledTime && (
        <span className="shrink-0 tabular-nums text-muted-foreground">{task.scheduledTime}</span>
      )}
      <button
        type="button"
        onClick={() => onOpen(task)}
        className={cn("min-w-0 flex-1 truncate text-left", done && "line-through")}
      >
        {task.title}
      </button>
    </div>
  );
}
