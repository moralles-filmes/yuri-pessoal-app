"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { roundForDisplay } from "@/lib/nutrition/calc";
import { CORE_NUTRIENTS } from "@/lib/nutrition/constants";
import { TEMPLATE_REGISTER_MODE_HINTS, TEMPLATE_REGISTER_MODE_LABELS, TEMPLATE_REGISTER_MODES, type TemplateRegisterMode } from "@/lib/nutrition/constants";
import { Switch } from "@/components/ui/switch";
import type { DiaryTemplate } from "./diary-client";

export function TemplatePickerDialog({
  open,
  onOpenChange,
  templates,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: DiaryTemplate[];
  onConfirm: (payload: {
    templateId: string;
    mode: TemplateRegisterMode;
    force: boolean;
  }) => Promise<void>;
}) {
  const active = templates.filter((template) => !template.isArchived && template.itemCount > 0);
  const [templateId, setTemplateId] = React.useState("");
  const [mode, setMode] = React.useState<TemplateRegisterMode>("detalhado");
  const [force, setForce] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTemplateId(active[0]?.id ?? "");
      setMode("detalhado");
      setForce(false);
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar refeição-modelo</DialogTitle>
          <DialogDescription>
            Os valores são congelados agora. Adicionar o mesmo modelo duas vezes na mesma
            refeição não duplica o consumo.
          </DialogDescription>
        </DialogHeader>

        {active.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma refeição-modelo com itens. Monte uma em Refeições-modelo.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="template-pick">Refeição-modelo</Label>
              <select
                id="template-pick"
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {active.map((template) => {
                  const energia = template.totals[CORE_NUTRIENTS.energia];
                  return (
                    <option key={template.id} value={template.id}>
                      {template.name} — {template.itemCount} item
                      {template.itemCount === 1 ? "" : "ns"}
                      {energia
                        ? ` · ${roundForDisplay(energia.amount, 0).toLocaleString("pt-BR")} kcal`
                        : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Como registrar</Label>
              {TEMPLATE_REGISTER_MODES.map((value) => (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                    mode === value ? "border-primary/40 bg-primary/5" : "hover:bg-accent/50",
                  )}
                >
                  <input
                    type="radio"
                    name="template-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      {TEMPLATE_REGISTER_MODE_LABELS[value]}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {TEMPLATE_REGISTER_MODE_HINTS[value]}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <span>
                <span className="text-sm font-medium">Adicionar mesmo assim</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Use só se você comeu este modelo mais de uma vez nesta refeição.
                </span>
              </span>
              <Switch checked={force} onCheckedChange={setForce} />
            </label>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!templateId || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({ templateId, mode, force });
              setSaving(false);
            }}
          >
            {saving ? "Registrando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
