"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { longDateLabel } from "@/lib/nutrition/calendar";
import { MEAL_STATUSES, MEAL_STATUS_LABELS, type MealStatus } from "@/lib/nutrition/constants";
import type { MealType } from "@/lib/nutrition/types";

export function NewMealDialog({
  open,
  onOpenChange,
  date,
  mealTypes,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  mealTypes: MealType[];
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const active = mealTypes.filter((type) => type.isActive);
  const [mealTypeId, setMealTypeId] = React.useState(active[0]?.id ?? "");
  const [time, setTime] = React.useState("");
  const [status, setStatus] = React.useState<MealStatus>("fora_do_planejamento");
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      const first = active[0];
      setMealTypeId(first?.id ?? "");
      setTime(first?.defaultTime ? first.defaultTime.slice(0, 5) : "");
      setStatus("fora_do_planejamento");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova refeição</DialogTitle>
          <DialogDescription>
            Em {longDateLabel(date)}. Você registra os alimentos depois de criar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="meal-type">Tipo</Label>
            <select
              id="meal-type"
              value={mealTypeId}
              onChange={(event) => {
                setMealTypeId(event.target.value);
                const type = active.find((t) => t.id === event.target.value);
                setTime(type?.defaultTime ? type.defaultTime.slice(0, 5) : "");
              }}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {active.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.icon ? `${type.icon} ` : ""}
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="meal-time">Horário previsto</Label>
              <Input
                id="meal-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meal-status">Situação</Label>
              <select
                id="meal-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as MealStatus)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {MEAL_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {MEAL_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!mealTypeId || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                diary_date: date,
                meal_type_id: mealTypeId,
                planned_time: time || null,
                status,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
