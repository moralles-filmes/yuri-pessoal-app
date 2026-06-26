"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TaskCard } from "./task-card";
import { moveTask } from "@/lib/actions/tasks";
import {
  KANBAN_COLUMNS,
  TASK_STATUS_LABELS,
  type TaskStoredStatus,
} from "@/lib/tasks/constants";
import type { TaskWithRelations } from "@/types/database";

const COLUMN_ACCENT: Record<(typeof KANBAN_COLUMNS)[number], string> = {
  pendente: "border-t-muted-foreground/40",
  em_andamento: "border-t-sky-500/60",
  concluida: "border-t-emerald-500/60",
};

export function KanbanBoard({
  tasks,
  todayIso,
  onEdit,
  onOpen,
}: {
  tasks: TaskWithRelations[];
  todayIso: string;
  onEdit: (task: TaskWithRelations) => void;
  onOpen: (task: TaskWithRelations) => void;
}) {
  const router = useRouter();
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overCol, setOverCol] = React.useState<TaskStoredStatus | null>(null);

  const columns = React.useMemo(() => {
    const map: Record<string, TaskWithRelations[]> = {
      pendente: [],
      em_andamento: [],
      concluida: [],
    };
    for (const t of tasks) {
      if (t.status in map) map[t.status].push(t);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.position - b.position);
    }
    return map;
  }, [tasks]);

  async function handleDrop(status: TaskStoredStatus) {
    setOverCol(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;

    const position = columns[status]?.length ?? 0;
    const res = await moveTask(id, status, position);
    if (res.ok) {
      toast.success(`Movida para "${TASK_STATUS_LABELS[status]}".`);
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível mover a tarefa.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {KANBAN_COLUMNS.map((status) => (
        <div
          key={status}
          onDragOver={(e) => {
            e.preventDefault();
            if (overCol !== status) setOverCol(status);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setOverCol(null);
          }}
          onDrop={() => handleDrop(status)}
          className={cn(
            "flex flex-col rounded-xl border border-t-2 bg-muted/30 p-2.5 transition-colors",
            COLUMN_ACCENT[status],
            overCol === status && "ring-2 ring-primary/40",
          )}
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <h3 className="text-sm font-semibold">{TASK_STATUS_LABELS[status]}</h3>
            <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
              {columns[status].length}
            </span>
          </div>

          <div className="flex min-h-24 flex-col gap-2">
            {columns[status].length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
                Arraste tarefas para cá
              </p>
            ) : (
              columns[status].map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => setDragId(task.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  className={cn(
                    "cursor-grab active:cursor-grabbing",
                    dragId === task.id && "opacity-50",
                  )}
                >
                  <TaskCard
                    task={task}
                    todayIso={todayIso}
                    onEdit={onEdit}
                    onOpen={onOpen}
                    compact
                  />
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
