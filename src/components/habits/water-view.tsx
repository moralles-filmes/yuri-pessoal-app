"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Droplets, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ProgressRing } from "@/components/habits/progress-ring";
import { StreakFlame, habitIcon } from "@/components/habits/badges";
import { HabitLogDialog } from "@/components/habits/habit-log-dialog";
import { incrementHabit } from "@/lib/actions/habits";
import {
  HABIT_CATEGORY_COLORS,
  WATER_GLASS_ML,
  formatAmount,
  formatHabitValue,
  glassesToUnit,
} from "@/lib/habits/constants";
import { formatDate } from "@/lib/format";
import type { HabitWithStats } from "@/types/database";

export function WaterView({
  habits,
  todayIso,
  onCreate,
}: {
  habits: HabitWithStats[];
  todayIso: string;
  onCreate: () => void;
}) {
  if (habits.length === 0) {
    return (
      <EmptyState
        icon={Droplets}
        title="Sem hábito de água"
        description="Crie um hábito na categoria Água (ex.: 8 copos por dia) para acompanhar sua hidratação aqui."
      >
        <Button size="sm" onClick={onCreate}>
          <Plus /> Novo hábito de água
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Conversão: 1 copo = {WATER_GLASS_ML} ml = 0,25 L. O botão respeita a unidade
        escolhida no hábito.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {habits.map((h) => (
          <WaterCard key={h.id} habit={h} todayIso={todayIso} />
        ))}
      </div>
    </div>
  );
}

function WaterCard({
  habit,
  todayIso,
}: {
  habit: HabitWithStats;
  todayIso: string;
}) {
  const router = useRouter();
  const [logOpen, setLogOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const color = habit.color ?? HABIT_CATEGORY_COLORS.agua;
  const glass = glassesToUnit(1, habit.unit);
  const pct =
    habit.target_value > 0
      ? Math.min(100, Math.round((habit.todayValue / habit.target_value) * 100))
      : 0;

  async function step(delta: number) {
    setBusy(true);
    try {
      const res = await incrementHabit(habit.id, todayIso, delta);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <span aria-hidden>{habitIcon(habit.icon, habit.category)}</span>
          {habit.name}
        </CardTitle>
        <StreakFlame count={habit.streak} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-5">
          <ProgressRing
            value={habit.todayValue}
            target={habit.target_value}
            color={color}
          >
            <div>
              <p className="text-2xl font-semibold tabular-nums">{pct}%</p>
              <p className="text-xs text-muted-foreground">
                {formatAmount(habit.todayValue)}/
                {formatAmount(habit.target_value)}
              </p>
            </div>
          </ProgressRing>
          <div className="flex-1 space-y-2">
            <p className="text-sm text-muted-foreground">
              Meta: {formatHabitValue(habit.target_value, habit.unit)}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                aria-label="Remover um copo"
                disabled={busy || habit.todayValue <= 0}
                onClick={() => step(-glass)}
              >
                <Minus />
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => step(glass)}
                className="flex-1"
              >
                <Plus /> 1 copo
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => setLogOpen(true)}
            >
              Registrar valor exato
            </Button>
          </div>
        </div>

        <WeekStrip habit={habit} color={color} />
      </CardContent>

      <HabitLogDialog
        habitId={habit.id}
        habitName={habit.name}
        unit={habit.unit}
        logDate={todayIso}
        initialValue={habit.todayValue}
        initialNotes={habit.todayLog?.notes ?? ""}
        showNotes={false}
        open={logOpen}
        onOpenChange={setLogOpen}
      />
    </Card>
  );
}

/** Tira da semana: 7 dias com o valor do dia e marca de meta atingida. */
function WeekStrip({
  habit,
  color,
}: {
  habit: HabitWithStats;
  color: string;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {habit.last7.map((d) => (
        <div key={d.date} className="space-y-1 text-center">
          <div
            title={`${formatDate(d.date)} — ${formatAmount(d.value)}`}
            className="grid h-12 place-items-end rounded-md bg-muted/60 p-1"
          >
            <div
              className="w-full rounded-sm"
              style={{
                height: `${
                  habit.target_value > 0
                    ? Math.min(100, (d.value / habit.target_value) * 100)
                    : 0
                }%`,
                backgroundColor: d.done ? color : "var(--muted-foreground)",
                minHeight: d.value > 0 ? 4 : 0,
              }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {d.date.slice(8)}
          </span>
        </div>
      ))}
    </div>
  );
}
