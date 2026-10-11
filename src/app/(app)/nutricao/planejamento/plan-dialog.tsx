"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { startOfWeekIso } from "@/lib/nutrition/calendar";

export function PlanDialog({
  open,
  onOpenChange,
  hoje,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hoje: string;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [cycleWeeks, setCycleWeeks] = React.useState("1");
  const [anchorDate, setAnchorDate] = React.useState(startOfWeekIso(hoje));
  const [isDefault, setIsDefault] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName("");
      setDescription("");
      setCycleWeeks("1");
      setAnchorDate(startOfWeekIso(hoje));
      setIsDefault(false);
      setSaving(false);
    }
  }

  const cycle = Number(cycleWeeks) || 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo modelo de semana</DialogTitle>
          <DialogDescription>
            Descreve a sua semana padrão. Depois de criar, monte os dias e aplique a um período.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Nome</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: semana normal, semana de treino"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-description">Descrição (opcional)</Label>
            <Input
              id="plan-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan-cycle">Semanas do ciclo</Label>
              <Input
                id="plan-cycle"
                type="number"
                min={1}
                max={8}
                value={cycleWeeks}
                onChange={(event) => setCycleWeeks(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                1 = toda semana igual. 2 = alterna semana A e B.
              </p>
            </div>

            {cycle > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="plan-anchor">Semana inicial</Label>
                <Input
                  id="plan-anchor"
                  type="date"
                  value={anchorDate}
                  onChange={(event) => setAnchorDate(event.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Sem ela não há como saber em qual semana do ciclo cada data cai.
                </p>
              </div>
            )}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm font-medium">Usar como modelo padrão</span>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                name: name.trim(),
                description: description || undefined,
                cycle_weeks: cycle,
                anchor_date: cycle > 1 ? anchorDate : undefined,
                is_default: isDefault,
              });
              setSaving(false);
            }}
          >
            {saving ? "Criando…" : "Criar modelo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
