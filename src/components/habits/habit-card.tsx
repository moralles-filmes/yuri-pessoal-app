"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Plus, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  HabitCategoryBadge,
  HabitProgressBar,
  StreakFlame,
  frequencySummary,
  habitIcon,
} from "@/components/habits/badges";
import { HabitLogDialog } from "@/components/habits/habit-log-dialog";
import {
  incrementHabit,
  setHabitDone,
  undoHabitCheckIn,
} from "@/lib/actions/habits";
import {
  HABIT_CATEGORY_COLORS,
  HABIT_UNIT_STEP,
  formatAmount,
  formatHabitValue,
} from "@/lib/habits/constants";
import type { HabitWithStats } from "@/types/database";

function isMeasured(h: HabitWithStats): boolean {
  return h.target_value > 1 || h.unit !== "vezes";
}

export function HabitCard({
  habit,
  todayIso,
  onEdit,
}: {
  habit: HabitWithStats;
  todayIso: string;
  onEdit?: (habit: HabitWithStats) => void;
}) {
  const router = useRouter();
  const [logOpen, setLogOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const measured = isMeasured(habit);
  const color = habit.color ?? HABIT_CATEGORY_COLORS[habit.category];
  const step = HABIT_UNIT_STEP[habit.unit];
  const hasLog = Boolean(habit.todayLog);

  async function run(action: Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    try {
      const res = await action;
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className={cn("border-l-4", habit.todayDone && "bg-primary/[0.03]")}
      style={{ borderLeftColor: color }}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={habit.todayDone}
            disabled={busy}
            aria-label={`Concluir ${habit.name}`}
            className="mt-0.5"
            onCheckedChange={(v) =>
              run(setHabitDone(habit.id, todayIso, Boolean(v)))
            }
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "font-medium",
                  habit.todayDone &&
                    "text-muted-foreground line-through decoration-1",
                )}
              >
                <span aria-hidden>{habitIcon(habit.icon, habit.category)} </span>
                {habit.name}
              </span>
              <HabitCategoryBadge category={habit.category} />
              {habit.time_of_day && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {habit.time_of_day.slice(0, 5)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {frequencySummary(habit.frequency, habit.weekdays)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StreakFlame count={habit.streak} />
            {onEdit && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Editar hábito"
                onClick={() => onEdit(habit)}
              >
                <Pencil />
              </Button>
            )}
          </div>
        </div>

        {measured && (
          <div className="space-y-2 pl-7">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium tabular-nums">
                {formatAmount(habit.todayValue)} / {formatHabitValue(habit.target_value, habit.unit)}
              </span>
              <span className="text-muted-foreground">
                Semana {habit.consistency7.done}/{habit.consistency7.scheduled}
                {habit.bestStreak > 0 && ` · recorde ${habit.bestStreak}`}
              </span>
            </div>
            <HabitProgressBar
              value={habit.todayValue}
              target={habit.target_value}
              color={color}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => run(incrementHabit(habit.id, todayIso, step))}
              >
                <Plus /> {formatHabitValue(step, habit.unit)}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setLogOpen(true)}
              >
                Registrar
              </Button>
              {hasLog && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-muted-foreground"
                  disabled={busy}
                  onClick={() => run(undoHabitCheckIn(habit.id, todayIso))}
                >
                  <RotateCcw /> Desfazer
                </Button>
              )}
            </div>
          </div>
        )}

        {!measured && hasLog && (
          <div className="flex items-center justify-between pl-7 text-xs text-muted-foreground">
            <span>
              Semana {habit.consistency7.done}/{habit.consistency7.scheduled}
              {habit.bestStreak > 0 && ` · recorde ${habit.bestStreak}`}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              disabled={busy}
              onClick={() => run(undoHabitCheckIn(habit.id, todayIso))}
            >
              <RotateCcw /> Desfazer
            </Button>
          </div>
        )}

        {!habit.scheduledToday && (
          <div className="pl-7">
            <Badge variant="outline" className="text-muted-foreground">
              Fora da frequência de hoje
            </Badge>
          </div>
        )}
      </CardContent>

      <HabitLogDialog
        habitId={habit.id}
        habitName={habit.name}
        unit={habit.unit}
        logDate={todayIso}
        initialValue={habit.todayValue}
        initialNotes={habit.todayLog?.notes ?? ""}
        showNotes
        open={logOpen}
        onOpenChange={setLogOpen}
      />
    </Card>
  );
}
