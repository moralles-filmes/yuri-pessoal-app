"use client";

import * as React from "react";
import { addMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { buildMonthGrid } from "@/lib/calendar/grid";
import { monthYearLabel } from "@/lib/calendar/format";
import { toDateInputValue } from "@/lib/format";
import { TASK_PRIORITY_COLORS } from "@/lib/tasks/constants";
import type { TaskWithRelations } from "@/types/database";

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function TaskCalendar({
  monthDateIso,
  todayIso,
  tasks,
  onOpen,
  onNavigate,
}: {
  monthDateIso: string;
  todayIso: string;
  tasks: TaskWithRelations[];
  onOpen: (task: TaskWithRelations) => void;
  onNavigate: (dateIso: string) => void;
}) {
  const refDate = React.useMemo(() => parseLocalDate(monthDateIso), [monthDateIso]);
  const today = React.useMemo(() => parseLocalDate(todayIso), [todayIso]);

  const weeks = React.useMemo(
    () => buildMonthGrid(refDate, { today }).weeks,
    [refDate, today],
  );

  // Tarefas com data de vencimento, agrupadas por dia ('yyyy-MM-dd').
  const byDay = React.useMemo(() => {
    const map = new Map<string, TaskWithRelations[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const list = map.get(t.due_date) ?? [];
      list.push(t);
      map.set(t.due_date, list);
    }
    return map;
  }, [tasks]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium capitalize">{monthYearLabel(refDate)}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Mês anterior"
            onClick={() => onNavigate(toDateInputValue(addMonths(refDate, -1)))}
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate(todayIso)}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Próximo mês"
            onClick={() => onNavigate(toDateInputValue(addMonths(refDate, 1)))}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((day) => {
            const iso = toDateInputValue(day.date);
            const dayTasks = byDay.get(iso) ?? [];
            return (
              <div
                key={iso}
                className={cn(
                  "min-h-24 border-b border-r p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0",
                  !day.inMonth && "bg-muted/30 text-muted-foreground",
                )}
              >
                <div
                  className={cn(
                    "mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs font-medium",
                    day.isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {day.date.getDate()}
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpen(t)}
                      className={cn(
                        "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-accent",
                        t.status === "concluida" &&
                          "text-muted-foreground line-through decoration-1",
                      )}
                    >
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: TASK_PRIORITY_COLORS[t.priority] }}
                      />
                      <span className="truncate">{t.title}</span>
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <p className="px-1 text-[11px] text-muted-foreground">
                      +{dayTasks.length - 3} mais
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
