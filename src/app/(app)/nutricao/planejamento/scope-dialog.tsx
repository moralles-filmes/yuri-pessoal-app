"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { longDateLabel } from "@/lib/nutrition/calendar";
import { PLAN_EDIT_SCOPES, PLAN_EDIT_SCOPE_HINTS, PLAN_EDIT_SCOPE_LABELS, type PlanEditScope } from "@/lib/nutrition/constants";
import type { PlannedMeal } from "@/lib/nutrition/types";

export function ScopeDialog({
  target,
  hoje,
  patch,
  onPatchChange,
  onOpenChange,
  onConfirm,
}: {
  target: { meal: PlannedMeal; action: "excluir" | "editar" } | null;
  hoje: string;
  patch: { time: string; title: string };
  onPatchChange: (patch: { time: string; title: string }) => void;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: PlanEditScope) => Promise<void>;
}) {
  const [scope, setScope] = React.useState<PlanEditScope>("somente_este_dia");
  const [saving, setSaving] = React.useState(false);

  const [lastId, setLastId] = React.useState<string | null>(target?.meal.id ?? null);
  if ((target?.meal.id ?? null) !== lastId) {
    setLastId(target?.meal.id ?? null);
    setScope("somente_este_dia");
    setSaving(false);
  }

  const isSeries = Boolean(target?.meal.planDayId);
  const isEdit = target?.action === "editar";

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar refeição planejada" : "Excluir refeição planejada"}
          </DialogTitle>
          <DialogDescription>
            {isSeries
              ? `Esta refeição veio de um modelo. Escolha até onde ${isEdit ? "a alteração" : "a exclusão"} deve chegar — datas passadas nunca são alteradas.`
              : `Esta refeição é avulsa, então só ela será ${isEdit ? "alterada" : "excluída"}.`}
          </DialogDescription>
        </DialogHeader>

        {isEdit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="scope-time">Horário previsto</Label>
              <Input
                id="scope-time"
                type="time"
                value={patch.time}
                onChange={(event) => onPatchChange({ ...patch, time: event.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scope-title">Título (opcional)</Label>
              <Input
                id="scope-title"
                value={patch.title}
                onChange={(event) => onPatchChange({ ...patch, title: event.target.value })}
              />
            </div>
          </div>
        )}

        {isSeries && (
          <div className="space-y-2">
            {PLAN_EDIT_SCOPES.map((option) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  scope === option ? "border-primary/40 bg-primary/5" : "hover:bg-accent/50",
                )}
              >
                <input
                  type="radio"
                  name="plan-scope"
                  value={option}
                  checked={scope === option}
                  onChange={() => setScope(option)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">
                    {PLAN_EDIT_SCOPE_LABELS[option]}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {PLAN_EDIT_SCOPE_HINTS[option]}
                  </span>
                </span>
              </label>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Referência de hoje: {longDateLabel(hoje)}.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant={isEdit ? "default" : "destructive"}
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm(isSeries ? scope : "somente_este_dia");
              setSaving(false);
            }}
          >
            {saving ? (isEdit ? "Salvando…" : "Excluindo…") : isEdit ? "Salvar" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
