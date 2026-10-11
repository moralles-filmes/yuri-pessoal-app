"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FoodListItem } from "@/lib/nutrition/types";
import type { NamedItem } from "./substitutions-client";

export type SubjectKind = "alimento" | "receita" | "modelo" | "livre";

export function SubjectPicker({
  idPrefix,
  kind,
  onKindChange,
  value,
  onValueChange,
  customLabel,
  onCustomLabelChange,
  foods,
  recipes,
  templates,
  allowTemplate,
  allowFood = true,
}: {
  idPrefix: string;
  kind: SubjectKind;
  onKindChange: (kind: SubjectKind) => void;
  value: string;
  onValueChange: (value: string) => void;
  customLabel: string;
  onCustomLabelChange: (value: string) => void;
  foods: FoodListItem[];
  recipes: NamedItem[];
  templates: NamedItem[];
  allowTemplate: boolean;
  allowFood?: boolean;
}) {
  const list: NamedItem[] =
    kind === "alimento"
      ? foods.filter((food) => !food.isArchived).slice(0, 500).map((f) => ({ id: f.id, name: f.name }))
      : kind === "receita"
        ? recipes
        : kind === "modelo"
          ? templates
          : [];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-kind`}>Tipo</Label>
        <select
          id={`${idPrefix}-kind`}
          value={kind}
          onChange={(event) => {
            onKindChange(event.target.value as SubjectKind);
            onValueChange("");
          }}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {allowFood && <option value="alimento">Alimento</option>}
          <option value="receita">Receita</option>
          {allowTemplate && <option value="modelo">Refeição-modelo</option>}
          <option value="livre">Descrever com texto</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-value`}>
          {kind === "livre" ? "Descrição" : "Item"}
        </Label>
        {kind === "livre" ? (
          <Input
            id={`${idPrefix}-value`}
            value={customLabel}
            onChange={(event) => onCustomLabelChange(event.target.value)}
            placeholder="Ex.: marmita do restaurante"
          />
        ) : (
          <select
            id={`${idPrefix}-value`}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Escolha…</option>
            {list.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
