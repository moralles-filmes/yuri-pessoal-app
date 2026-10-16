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
import {
  SUBSTITUTION_LEVEL_HINTS,
  SUBSTITUTION_LEVEL_LABELS,
  SUBSTITUTION_LEVELS,
  type SubstitutionLevel,
} from "@/lib/nutrition/constants";
import type { FoodListItem } from "@/lib/nutrition/types";
import type { SubstitutionGroupWithTotals } from "@/lib/nutrition/recipe-queries";
import type { NamedItem } from "./substitutions-client";
import { type SubjectKind, SubjectPicker } from "./subject-picker";

export function GroupDialog({
  state,
  foods,
  recipes,
  templates,
  onOpenChange,
  onSubmit,
}: {
  state: { group: SubstitutionGroupWithTotals | null } | null;
  foods: FoodListItem[];
  recipes: NamedItem[];
  templates: NamedItem[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const group = state?.group ?? null;

  const [name, setName] = React.useState("");
  const [level, setLevel] = React.useState<SubstitutionLevel>("alimento");
  const [kind, setKind] = React.useState<SubjectKind>("alimento");
  const [subjectId, setSubjectId] = React.useState("");
  const [customLabel, setCustomLabel] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [tolerances, setTolerances] = React.useState({
    energy: "",
    protein: "",
    carb: "",
    fat: "",
    fiber: "",
  });
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const seen = `${state !== null}:${group?.id ?? "novo"}`;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    if (state) {
      setName(group?.name ?? "");
      setLevel(group?.groupKind ?? "alimento");
      setKind(
        group?.foodId
          ? "alimento"
          : group?.recipeId
            ? "receita"
            : group?.mealTemplateId
              ? "modelo"
              : group
                ? "livre"
                : "alimento",
      );
      setSubjectId(group?.foodId ?? group?.recipeId ?? group?.mealTemplateId ?? "");
      setCustomLabel(group?.customLabel ?? "");
      setQuantity(group?.baseQuantity === null || group === null ? "" : String(group.baseQuantity));
      setTolerances({
        energy: group?.tolerances.energy === null || !group ? "" : String(group.tolerances.energy),
        protein: group?.tolerances.protein === null || !group ? "" : String(group.tolerances.protein),
        carb: group?.tolerances.carb === null || !group ? "" : String(group.tolerances.carb),
        fat: group?.tolerances.fat === null || !group ? "" : String(group.tolerances.fat),
        fiber: group?.tolerances.fiber === null || !group ? "" : String(group.tolerances.fiber),
      });
      setNotes(group?.notes ?? "");
      setSaving(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{group ? "Editar grupo" : "Novo grupo de substituição"}</DialogTitle>
          <DialogDescription>
            Um grupo guarda as alternativas que você aceita para um item, e as tolerâncias que
            você considera aceitáveis. O sistema não decide nada por você.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Nome do grupo</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: fontes de carboidrato do almoço"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-level">Nível</Label>
            <select
              id="group-level"
              value={level}
              onChange={(event) => {
                const next = event.target.value as SubstitutionLevel;
                setLevel(next);
                // O CHECK do banco amarra: grupo de alimento não aponta para refeição-modelo.
                if (next === "refeicao" && kind === "alimento") {
                  setKind("receita");
                  setSubjectId("");
                }
                if (next === "alimento" && kind === "modelo") {
                  setKind("alimento");
                  setSubjectId("");
                }
              }}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SUBSTITUTION_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {SUBSTITUTION_LEVEL_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">{SUBSTITUTION_LEVEL_HINTS[level]}</p>
          </div>

          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">O que é substituído</legend>
            <SubjectPicker
              idPrefix="group-subject"
              kind={kind}
              onKindChange={setKind}
              value={subjectId}
              onValueChange={setSubjectId}
              customLabel={customLabel}
              onCustomLabelChange={setCustomLabel}
              foods={foods}
              recipes={recipes}
              templates={templates}
              allowTemplate={level === "refeicao"}
              allowFood={level === "alimento"}
            />

            <div className="space-y-1.5">
              <Label htmlFor="group-quantity">Quantidade de referência</Label>
              <Input
                id="group-quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="Ex.: 150"
              />
              <p className="text-[11px] text-muted-foreground">
                É sobre esta quantidade que a comparação é feita. Sem ela, a diferença não pode
                ser calculada.
              </p>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Tolerâncias (%)</legend>
            <p className="text-[11px] text-muted-foreground">
              Quanto você aceita variar em cada macro. Deixar em branco significa &ldquo;não
              defini&rdquo; — e não &ldquo;tolerância zero&rdquo;. A diferença é sempre exibida;
              a tolerância só colore o resultado.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  ["energy", "Energia"],
                  ["protein", "Proteína"],
                  ["carb", "Carbo."],
                  ["fat", "Gordura"],
                  ["fiber", "Fibra"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`tol-${key}`} className="text-xs">
                    {label}
                  </Label>
                  <Input
                    id={`tol-${key}`}
                    inputMode="decimal"
                    value={tolerances[key]}
                    onChange={(event) =>
                      setTolerances((current) => ({ ...current, [key]: event.target.value }))
                    }
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="group-notes">Observações</Label>
            <Textarea
              id="group-notes"
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
            disabled={!name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              await onSubmit({
                name: name.trim(),
                group_kind: level,
                food_id: kind === "alimento" ? subjectId || undefined : undefined,
                recipe_id: kind === "receita" ? subjectId || undefined : undefined,
                meal_template_id: kind === "modelo" ? subjectId || undefined : undefined,
                custom_label: kind === "livre" ? customLabel || undefined : undefined,
                base_quantity: quantity || undefined,
                base_portion_unit: kind === "receita" ? "porcao" : undefined,
                tolerance_energy_percent: tolerances.energy || undefined,
                tolerance_protein_percent: tolerances.protein || undefined,
                tolerance_carb_percent: tolerances.carb || undefined,
                tolerance_fat_percent: tolerances.fat || undefined,
                tolerance_fiber_percent: tolerances.fiber || undefined,
                notes: notes || undefined,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : group ? "Salvar" : "Criar grupo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
