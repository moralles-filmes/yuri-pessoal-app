"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
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
  PANTRY_UNKNOWN_QUANTITY_NOTE,
  SHOPPING_UNIT_LABELS,
  SHOPPING_UNITS,
} from "@/lib/nutrition/constants";
import { matchesSearch } from "@/lib/nutrition/filters";
import type { FoodListItem, MarketCategory, PantryItem } from "@/lib/nutrition/types";

export const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export type PantryFormValues = {
  food_id: string;
  label: string;
  quantity: string;
  unit: string;
  expires_on: string;
  min_quantity: string;
  note: string;
  category_id: string;
};

export const empty: PantryFormValues = {
  food_id: "",
  label: "",
  quantity: "",
  unit: "un",
  expires_on: "",
  min_quantity: "",
  note: "",
  category_id: "",
};

export const fromItem = (item: PantryItem): PantryFormValues => ({
  food_id: item.foodId ?? "",
  label: item.label,
  quantity: item.quantity === null ? "" : String(item.quantity),
  unit: item.unit,
  expires_on: item.expiresOn ?? "",
  min_quantity: item.minQuantity === null ? "" : String(item.minQuantity),
  note: item.note ?? "",
  category_id: item.categoryId ?? "",
});

export function PantryFormDialog({
  open,
  onOpenChange,
  item,
  categories,
  foods,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: PantryItem | null;
  categories: MarketCategory[];
  foods: FoodListItem[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = React.useState<PantryFormValues>(item ? fromItem(item) : empty);
  const [foodSearch, setFoodSearch] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const seen = `${open}:${item?.id ?? "novo"}`;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    if (open) {
      setValues(item ? fromItem(item) : empty);
      setFoodSearch("");
      setSaving(false);
    }
  }

  const set = <K extends keyof PantryFormValues>(key: K, value: PantryFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const selectedFood = values.food_id
    ? (foods.find((food) => food.id === values.food_id) ?? null)
    : null;

  const results = React.useMemo(() => {
    const term = foodSearch.trim();
    if (term.length < 2) return [];
    return foods.filter((food) => matchesSearch(food, term)).slice(0, 20);
  }, [foods, foodSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item da despensa" : "Adicionar à despensa"}</DialogTitle>
          <DialogDescription>
            Ligar ao catálogo é o que permite descontar este item da lista de compras.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Alimento do catálogo</Label>
            {selectedFood ? (
              <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{selectedFood.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set("food_id", "")}
                  aria-label="Remover alimento do catálogo"
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={foodSearch}
                    onChange={(event) => setFoodSearch(event.target.value)}
                    placeholder="Buscar no catálogo (opcional)"
                    className="h-11 pl-9"
                  />
                </div>
                {results.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-input">
                    {results.map((food) => (
                      <button
                        key={food.id}
                        type="button"
                        onClick={() => {
                          setValues((current) => ({
                            ...current,
                            food_id: food.id,
                            label: current.label || food.name,
                            unit: current.unit === "un" ? food.baseUnit : current.unit,
                          }));
                          setFoodSearch("");
                        }}
                        className="block w-full px-3 py-2.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      >
                        {food.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pantry-label">Item</Label>
            <Input
              id="pantry-label"
              value={values.label}
              onChange={(event) => set("label", event.target.value)}
              className="h-11"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pantry-quantity">Quantidade disponível</Label>
              <Input
                id="pantry-quantity"
                value={values.quantity}
                onChange={(event) => set("quantity", event.target.value)}
                inputMode="decimal"
                placeholder="Vazio = não sei quanto"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pantry-unit">Unidade</Label>
              <select
                id="pantry-unit"
                value={
                  SHOPPING_UNITS.includes(values.unit as (typeof SHOPPING_UNITS)[number])
                    ? values.unit
                    : "outra"
                }
                onChange={(event) =>
                  set("unit", event.target.value === "outra" ? values.unit : event.target.value)
                }
                className={selectClass}
              >
                {SHOPPING_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {SHOPPING_UNIT_LABELS[unit]}
                  </option>
                ))}
                {!SHOPPING_UNITS.includes(values.unit as (typeof SHOPPING_UNITS)[number]) && (
                  <option value="outra">{values.unit}</option>
                )}
              </select>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">{PANTRY_UNKNOWN_QUANTITY_NOTE}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pantry-expires">Validade</Label>
              <Input
                id="pantry-expires"
                type="date"
                value={values.expires_on}
                onChange={(event) => set("expires_on", event.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pantry-min">Estoque mínimo</Label>
              <Input
                id="pantry-min"
                value={values.min_quantity}
                onChange={(event) => set("min_quantity", event.target.value)}
                inputMode="decimal"
                placeholder="Opcional"
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pantry-category">Corredor</Label>
            <select
              id="pantry-category"
              value={values.category_id}
              onChange={(event) => set("category_id", event.target.value)}
              className={selectClass}
            >
              <option value="">Sem corredor</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pantry-note">Observação</Label>
            <Textarea
              id="pantry-note"
              value={values.note}
              onChange={(event) => set("note", event.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            disabled={saving || (!values.label && !values.food_id)}
            onClick={async () => {
              setSaving(true);
              await onSubmit({
                food_id: values.food_id || null,
                label: values.label || null,
                quantity: values.quantity === "" ? null : values.quantity,
                unit: values.unit || "un",
                expires_on: values.expires_on || null,
                min_quantity: values.min_quantity || null,
                note: values.note || null,
                category_id: values.category_id || null,
              });
              setSaving(false);
            }}
          >
            {item ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
