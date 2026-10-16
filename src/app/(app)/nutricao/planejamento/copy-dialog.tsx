"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { addDaysIso, longDateLabel, shortDateLabel, startOfWeekIso } from "@/lib/nutrition/calendar";

export function CopyDialog({
  open,
  onOpenChange,
  date,
  view,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  view: "dia" | "semana";
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const isWeek = view === "semana";
  const sourceStart = isWeek ? startOfWeekIso(date) : date;
  const [target, setTarget] = React.useState(addDaysIso(sourceStart, isWeek ? 7 : 1));
  const [replace, setReplace] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTarget(addDaysIso(sourceStart, isWeek ? 7 : 1));
      setReplace(false);
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isWeek ? "Duplicar semana" : "Copiar dia"}</DialogTitle>
          <DialogDescription>
            {isWeek
              ? `Copia tudo que está planejado na semana de ${shortDateLabel(sourceStart)}, preservando o dia da semana de cada refeição. A origem fica intacta.`
              : `Copia o planejamento de ${longDateLabel(date)}. A origem fica intacta.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="copy-target">{isWeek ? "Semana de destino (segunda-feira)" : "Dia de destino"}</Label>
            <Input
              id="copy-target"
              type="date"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="text-sm font-medium">Substituir o destino</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Apaga o que já estiver planejado lá antes de copiar.
              </span>
            </span>
            <Switch checked={replace} onCheckedChange={setReplace} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!target || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm(
                isWeek
                  ? {
                      from_week_start: sourceStart,
                      to_week_start: startOfWeekIso(target),
                      replace,
                    }
                  : { from_date: date, to_date: target, replace },
              );
              setSaving(false);
            }}
          >
            {saving ? "Copiando…" : "Copiar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
