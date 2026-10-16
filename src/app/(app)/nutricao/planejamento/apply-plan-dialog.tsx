"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { addDaysIso } from "@/lib/nutrition/calendar";
import { countMaterialization } from "@/lib/nutrition/plan-recurrence";
import type { NutritionPlan } from "@/lib/nutrition/types";

export function ApplyPlanDialog({
  plan,
  hoje,
  onOpenChange,
  onConfirm,
}: {
  plan: NutritionPlan | null;
  hoje: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [from, setFrom] = React.useState(hoje);
  const [to, setTo] = React.useState(addDaysIso(hoje, 27));
  const [replace, setReplace] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [lastId, setLastId] = React.useState<string | null>(plan?.id ?? null);
  if ((plan?.id ?? null) !== lastId) {
    setLastId(plan?.id ?? null);
    setFrom(hoje);
    setTo(addDaysIso(hoje, 27));
    setReplace(false);
    setSaving(false);
  }

  // Impacto calculado com a MESMA função pura que o servidor usa para materializar.
  const impact = plan && from && to && to >= from ? countMaterialization(plan, from, to) : null;

  return (
    <Dialog open={plan !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar “{plan?.name}”</DialogTitle>
          <DialogDescription>
            As refeições são criadas com data concreta e ficam independentes do modelo: mudar o
            modelo depois não reescreve o que já foi planejado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="apply-from">De</Label>
              <Input
                id="apply-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply-to">Até</Label>
              <Input
                id="apply-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="text-sm font-medium">Substituir o que já está planejado</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Apaga o planejamento existente NESTAS datas antes de aplicar. O diário não é
                afetado.
              </span>
            </span>
            <Switch checked={replace} onCheckedChange={setReplace} />
          </label>

          {impact && (
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Serão criados{" "}
              <strong className="text-foreground">
                {impact.refeicoes} refeições e {impact.itens} itens
              </strong>{" "}
              em {impact.dias} dias.
              {impact.dias === 0 && " O modelo não cobre nenhum dia deste período."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !impact || impact.dias === 0}
            onClick={async () => {
              setSaving(true);
              await onConfirm({ plan_id: plan?.id, from, to, replace });
              setSaving(false);
            }}
          >
            {saving ? "Aplicando…" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
