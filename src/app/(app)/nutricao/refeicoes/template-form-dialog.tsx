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
import type { MealType, RecipeCategory } from "@/lib/nutrition/types";
import type { MealTemplateWithTotals } from "@/lib/nutrition/recipe-queries";

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
  categories,
  mealTypes,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: MealTemplateWithTotals | null;
  categories: RecipeCategory[];
  mealTypes: MealType[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [mealTypeId, setMealTypeId] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [time, setTime] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const seen = `${open}:${template?.id ?? "novo"}`;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    if (open) {
      setName(template?.name ?? "");
      setDescription(template?.description ?? "");
      setMealTypeId(template?.mealTypeId ?? "");
      setCategoryId(template?.categoryId ?? "");
      setTime(template?.suggestedTime ? template.suggestedTime.slice(0, 5) : "");
      setNotes(template?.notes ?? "");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{template ? "Editar refeição-modelo" : "Nova refeição-modelo"}</DialogTitle>
          <DialogDescription>
            Os itens (alimentos e receitas) são adicionados depois de salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Nome</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: café da manhã de sempre"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-description">Descrição (opcional)</Label>
            <Input
              id="template-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="template-meal-type">Tipo de refeição</Label>
              <select
                id="template-meal-type"
                value={mealTypeId}
                onChange={(event) => setMealTypeId(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Não definido</option>
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

            <div className="space-y-1.5">
              <Label htmlFor="template-time">Horário sugerido</Label>
              <Input
                id="template-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-category">Categoria</Label>
            <select
              id="template-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-notes">Observações</Label>
            <Textarea
              id="template-notes"
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
                description: description || undefined,
                meal_type_id: mealTypeId || undefined,
                category_id: categoryId || undefined,
                suggested_time: time || undefined,
                notes: notes || undefined,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : template ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
