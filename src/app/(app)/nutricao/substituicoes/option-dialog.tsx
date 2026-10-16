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
import { Textarea } from "@/components/ui/textarea";
import type { FoodListItem } from "@/lib/nutrition/types";
import type { SubstitutionGroupWithTotals } from "@/lib/nutrition/recipe-queries";
import type { NamedItem } from "./substitutions-client";
import { type SubjectKind, SubjectPicker } from "./subject-picker";

export function OptionDialog({
  group,
  foods,
  recipes,
  templates,
  onOpenChange,
  onSubmit,
}: {
  group: SubstitutionGroupWithTotals | null;
  foods: FoodListItem[];
  recipes: NamedItem[];
  templates: NamedItem[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [kind, setKind] = React.useState<SubjectKind>("alimento");
  const [subjectId, setSubjectId] = React.useState("");
  const [customLabel, setCustomLabel] = React.useState("");
  const [quantity, setQuantity] = React.useState("100");
  const [priority, setPriority] = React.useState("0");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const seen = group?.id ?? null;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    setKind(group?.groupKind === "refeicao" ? "receita" : "alimento");
    setSubjectId("");
    setCustomLabel("");
    setQuantity("100");
    setPriority("0");
    setNotes("");
    setSaving(false);
  }

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova alternativa</DialogTitle>
          <DialogDescription>
            Para o grupo “{group?.name}”. A prioridade é a SUA ordem de preferência — o sistema
            não classifica alternativas por qualidade nutricional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <SubjectPicker
            idPrefix="option-subject"
            kind={kind}
            onKindChange={setKind}
            value={subjectId}
            onValueChange={setSubjectId}
            customLabel={customLabel}
            onCustomLabelChange={setCustomLabel}
            foods={foods}
            recipes={recipes}
            templates={templates}
            allowTemplate
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="option-quantity">Quantidade sugerida</Label>
              <Input
                id="option-quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="option-priority">Prioridade</Label>
              <Input
                id="option-priority"
                inputMode="numeric"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Menor = sua preferida.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="option-notes">Observações</Label>
            <Textarea
              id="option-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving || (kind !== "livre" ? !subjectId : !customLabel.trim())}
            onClick={async () => {
              setSaving(true);
              await onSubmit({
                group_id: group?.id,
                option_kind: kind,
                food_id: kind === "alimento" ? subjectId || undefined : undefined,
                recipe_id: kind === "receita" ? subjectId || undefined : undefined,
                meal_template_id: kind === "modelo" ? subjectId || undefined : undefined,
                custom_label: kind === "livre" ? customLabel || undefined : undefined,
                quantity: kind === "livre" ? undefined : quantity,
                portion_unit: kind === "receita" ? "porcao" : undefined,
                priority: priority || 0,
                notes: notes || undefined,
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
