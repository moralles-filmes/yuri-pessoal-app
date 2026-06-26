"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import {
  HabitProgressBar,
  StreakFlame,
  frequencySummary,
  habitIcon,
} from "@/components/habits/badges";
import { HabitLogDialog } from "@/components/habits/habit-log-dialog";
import {
  incrementHabit,
  setHabitDescription,
} from "@/lib/actions/habits";
import {
  HABIT_CATEGORY_COLORS,
  HABIT_UNIT_STEP,
  formatAmount,
  formatHabitValue,
} from "@/lib/habits/constants";
import { formatDate } from "@/lib/format";
import type { HabitWithStats } from "@/types/database";

/**
 * Tela especializada para hábitos mensuráveis com "sessões" (leitura, exercícios).
 * Reaproveita o modelo genérico: progresso do dia, registro com observações, e um
 * editor inline da `description` ("Livro atual" / "Tipo de exercício").
 */
export function SessionView({
  habits,
  todayIso,
  icon: Icon,
  descriptionLabel,
  descriptionPlaceholder,
  emptyTitle,
  emptyHint,
  onCreate,
}: {
  habits: HabitWithStats[];
  todayIso: string;
  icon: LucideIcon;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  emptyTitle: string;
  emptyHint: string;
  onCreate: () => void;
}) {
  if (habits.length === 0) {
    return (
      <EmptyState icon={Icon} title={emptyTitle} description={emptyHint}>
        <Button size="sm" onClick={onCreate}>
          <Plus /> Novo hábito
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {habits.map((h) => (
        <SessionCard
          key={h.id}
          habit={h}
          todayIso={todayIso}
          descriptionLabel={descriptionLabel}
          descriptionPlaceholder={descriptionPlaceholder}
        />
      ))}
    </div>
  );
}

function SessionCard({
  habit,
  todayIso,
  descriptionLabel,
  descriptionPlaceholder,
}: {
  habit: HabitWithStats;
  todayIso: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
}) {
  const router = useRouter();
  const [logOpen, setLogOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const color = habit.color ?? HABIT_CATEGORY_COLORS[habit.category];
  const step = HABIT_UNIT_STEP[habit.unit];

  async function bump() {
    setBusy(true);
    try {
      const res = await incrementHabit(habit.id, todayIso, step);
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
        <InlineDescription
          habitId={habit.id}
          value={habit.description ?? ""}
          label={descriptionLabel}
          placeholder={descriptionPlaceholder}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium tabular-nums">
              Hoje: {formatAmount(habit.todayValue)} /{" "}
              {formatHabitValue(habit.target_value, habit.unit)}
            </span>
            <span className="text-xs text-muted-foreground">
              {frequencySummary(habit.frequency, habit.weekdays)}
            </span>
          </div>
          <HabitProgressBar
            value={habit.todayValue}
            target={habit.target_value}
            color={color}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={bump}>
              <Plus /> {formatHabitValue(step, habit.unit)}
            </Button>
            <Button size="sm" onClick={() => setLogOpen(true)}>
              Registrar sessão
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Semana {habit.consistency7.done}/{habit.consistency7.scheduled}
              {habit.bestStreak > 0 && ` · recorde ${habit.bestStreak}`}
            </span>
          </div>
        </div>

        {habit.recentLogs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Histórico</p>
            <ul className="divide-y rounded-lg border">
              {habit.recentLogs.map((log) => (
                <li
                  key={log.log_date}
                  className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="text-muted-foreground">
                      {formatDate(log.log_date)}
                    </span>
                    {log.notes && (
                      <p className="truncate text-xs text-muted-foreground">
                        {log.notes}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-medium tabular-nums">
                    {formatHabitValue(log.value, habit.unit)}
                  </span>
                </li>
              ))}
            </ul>
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

/** Editor inline da descrição (livro atual / tipo) — salva ao sair do campo. */
function InlineDescription({
  habitId,
  value,
  label,
  placeholder,
}: {
  habitId: string;
  value: string;
  label: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [text, setText] = React.useState(value);
  const [saving, setSaving] = React.useState(false);

  // Sincroniza com a prop quando ela muda (após salvar + refresh), em render.
  const [lastValue, setLastValue] = React.useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }

  async function save() {
    if (text.trim() === value.trim()) return;
    setSaving(true);
    try {
      const res = await setHabitDescription(habitId, text);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`desc-${habitId}`} className="text-xs text-muted-foreground">
        {label}
        {saving && " · salvando…"}
      </Label>
      <Input
        id={`desc-${habitId}`}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
