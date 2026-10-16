"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { longDateLabel } from "@/lib/nutrition/calendar";
import type { MealType } from "@/lib/nutrition/types";
import type { MealTemplateWithTotals } from "@/lib/nutrition/recipe-queries";

export function PlanTemplateDialog({
  template,
  hoje,
  mealTypes,
  onOpenChange,
  onConfirm,
}: {
  template: MealTemplateWithTotals | null;
  hoje: string;
  mealTypes: MealType[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [date, setDate] = React.useState(hoje);
  const [mealTypeId, setMealTypeId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const seen = template?.id ?? null;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    setDate(hoje);
    setMealTypeId(template?.mealTypeId ?? "");
    setSaving(false);
  }

  return (
    <Dialog open={template !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planejar “{template?.name}”</DialogTitle>
          <DialogDescription>
            Os itens do modelo são copiados para o planejamento da data escolhida. Editar o
            modelo depois não altera o que já foi planejado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plan-date">Data</Label>
            <Input
              id="plan-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">{longDateLabel(date)}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-meal-type">Tipo de refeição</Label>
            <select
              id="plan-meal-type"
              value={mealTypeId}
              onChange={(event) => setMealTypeId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Escolha…</option>
              {mealTypes
                .filter((type) => type.isActive)
                .map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.icon ? `${type.icon} ` : ""}
                    {type.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!date || !mealTypeId || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                template_id: template?.id,
                planned_date: date,
                meal_type_id: mealTypeId,
              });
              setSaving(false);
            }}
          >
            {saving ? "Planejando…" : "Planejar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
