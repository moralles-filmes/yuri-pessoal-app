"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { longDateLabel } from "@/lib/nutrition/calendar";
import type { MealType } from "@/lib/nutrition/types";

export function NewPlannedMealDialog({
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
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      const first = active[0];
      setMealTypeId(first?.id ?? "");
      setTime(first?.defaultTime ? first.defaultTime.slice(0, 5) : "");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planejar refeição</DialogTitle>
          <DialogDescription>Em {longDateLabel(date)}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="planned-type">Tipo</Label>
            <select
              id="planned-type"
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

          <div className="space-y-1.5">
            <Label htmlFor="planned-time">Horário previsto</Label>
            <Input
              id="planned-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
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
                planned_date: date,
                meal_type_id: mealTypeId,
                planned_time: time || null,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Planejar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
