"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { incrementHabit, setHabitDone } from "@/lib/actions/habits";
import { formatAmount, formatHabitValue } from "@/lib/habits/constants";
import { Metric, CardEmpty } from "./primitives";
import type { HabitsCardData } from "@/lib/dashboard/types";

/** Corpo interativo do card Hábitos — check-in rápido (concluir / +copo) + streak. */
export function HabitsCardBody({
  data,
  todayIso,
  periodLabel,
}: {
  data: HabitsCardData;
  todayIso: string;
  periodLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

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

  if (!data.hasHabits) {
    return <CardEmpty>Nenhum hábito ativo. Crie em Hábitos.</CardEmpty>;
  }

  const listItems = data.items.filter((h) => h.category !== "agua");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Metric
          label="Concluídos hoje"
          value={`${data.doneToday}/${data.scheduledToday}`}
          accent={data.scheduledToday > 0 && data.doneToday === data.scheduledToday}
        />
        <Metric
          label="Sequência"
          value={`${data.topStreak} 🔥`}
          hint={`${Math.round(data.periodRate * 100)}% ${periodLabel}`}
        />
      </div>

      {data.water && (
        <div className="rounded-lg border bg-card/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">💧 {data.water.name}</span>
            <span className="text-sm tabular-nums">
              {formatAmount(data.water.value)} /{" "}
              {formatHabitValue(data.water.target, data.water.unit)}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            disabled={busy}
            onClick={() =>
              run(incrementHabit(data.water!.id, todayIso, data.water!.step))
            }
          >
            <Plus /> {formatHabitValue(data.water.step, data.water.unit)}
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        {listItems.length === 0 && !data.water ? (
          <CardEmpty>Sem hábitos agendados para hoje.</CardEmpty>
        ) : (
          listItems.map((h) => (
            <label
              key={h.id}
              className="flex cursor-pointer items-center gap-2.5 text-sm"
            >
              <Checkbox
                checked={h.done}
                disabled={busy}
                aria-label={`Concluir ${h.name}`}
                onCheckedChange={(v) =>
                  run(setHabitDone(h.id, todayIso, Boolean(v)))
                }
              />
              <span className={cn("truncate", h.done && "text-muted-foreground line-through")}>
                {h.icon ? `${h.icon} ` : ""}
                {h.name}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
