"use client";

/**
 * Fase 16-D — Dieta e Alimentação · Formulário de item da lista de compras.
 *
 * ══ DUAS COISAS QUE ESTE FORMULÁRIO NÃO FAZ ══
 * 1. NÃO converte unidade. Escolher "kg" não reescreve o número em gramas: quem converte (e
 *    quem se recusa a converter) é o servidor, na consolidação. Aqui o usuário só declara.
 * 2. NÃO preenche preço com zero. Campo vazio continua vazio — "não anotei" é diferente de
 *    "custou nada", e um zero silencioso faria o total da compra parecer barato.
 *
 * Mobile-first: campos grandes, teclado numérico onde faz sentido (`inputMode`), nada que
 * dependa de passar o mouse.
 */
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
import { cn } from "@/lib/utils";
import {
  SHOPPING_PRIORITIES,
  SHOPPING_PRIORITY_LABELS,
  SHOPPING_UNIT_LABELS,
  SHOPPING_UNITS,
} from "@/lib/nutrition/constants";
import { matchesSearch } from "@/lib/nutrition/filters";
import type { FoodListItem, MarketCategory, ShoppingListItem } from "@/lib/nutrition/types";

export type ShoppingItemFormValues = {
  food_id: string;
  label: string;
  brand: string;
  quantity: string;
  unit: string;
  category_id: string;
  priority: string;
  estimated_price: string;
  actual_price: string;
  store: string;
  note: string;
};

const empty: ShoppingItemFormValues = {
  food_id: "",
  label: "",
  brand: "",
  quantity: "",
  unit: "un",
  category_id: "",
  priority: "normal",
  estimated_price: "",
  actual_price: "",
  store: "",
  note: "",
};

const fromItem = (item: ShoppingListItem): ShoppingItemFormValues => ({
  food_id: item.foodId ?? "",
  label: item.label,
  brand: item.brand ?? "",
  quantity: item.quantity === null ? "" : String(item.quantity),
  unit: item.unit,
  category_id: item.categoryId ?? "",
  priority: item.priority,
  estimated_price:
    item.estimatedPriceCents === null ? "" : (item.estimatedPriceCents / 100).toFixed(2).replace(".", ","),
  actual_price:
    item.actualPriceCents === null ? "" : (item.actualPriceCents / 100).toFixed(2).replace(".", ","),
  store: item.store ?? "",
  note: item.note ?? "",
});

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const FOOD_RESULTS = 20;

export function ShoppingItemDialog({
  open,
  onOpenChange,
  item,
  categories,
  foods,
  stores,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nulo = novo item. */
  item: ShoppingListItem | null;
  categories: MarketCategory[];
  foods: FoodListItem[];
  /** Lojas já usadas, para sugerir sem obrigar a digitar de novo. */
  stores: string[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = React.useState<ShoppingItemFormValues>(
    item ? fromItem(item) : empty,
  );
  const [foodSearch, setFoodSearch] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Ajuste de estado durante o render (padrão do projeto com React Compiler ativo).
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

  const set = <K extends keyof ShoppingItemFormValues>(
    key: K,
    value: ShoppingItemFormValues[K],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const selectedFood = values.food_id
    ? (foods.find((food) => food.id === values.food_id) ?? null)
    : null;

  const results = React.useMemo(() => {
    const term = foodSearch.trim();
    if (term.length < 2) return [];
    return foods.filter((food) => matchesSearch(food, term)).slice(0, FOOD_RESULTS);
  }, [foods, foodSearch]);

  async function submit() {
    setSaving(true);
    await onSubmit({
      food_id: values.food_id || null,
      label: values.label || null,
      brand: values.brand || null,
      quantity: values.quantity || null,
      unit: values.unit || "un",
      category_id: values.category_id || null,
      priority: values.priority,
      estimated_price_cents: values.estimated_price || null,
      actual_price_cents: values.actual_price || null,
      store: values.store || null,
      note: values.note || null,
    });
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item" : "Adicionar item"}</DialogTitle>
          <DialogDescription>
            Escolha um alimento do catálogo ou escreva livremente — papel toalha também entra na
            lista.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Alimento do catálogo (opcional) ── */}
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
            <p className="text-[11px] text-muted-foreground">
              Ligar ao catálogo permite descontar este item da despensa automaticamente.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shopping-label">O que comprar</Label>
            <Input
              id="shopping-label"
              value={values.label}
              onChange={(event) => set("label", event.target.value)}
              placeholder="Arroz integral"
              className="h-11"
            />
          </div>

          {/* ── Quantidade + unidade ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shopping-quantity">Quantidade</Label>
              <Input
                id="shopping-quantity"
                value={values.quantity}
                onChange={(event) => set("quantity", event.target.value)}
                inputMode="decimal"
                placeholder="Deixe vazio para “a gosto”"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shopping-unit">Unidade</Label>
              <select
                id="shopping-unit"
                value={SHOPPING_UNITS.includes(values.unit as (typeof SHOPPING_UNITS)[number]) ? values.unit : "outra"}
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shopping-category">Corredor</Label>
              <select
                id="shopping-category"
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
              <Label htmlFor="shopping-priority">Prioridade</Label>
              <select
                id="shopping-priority"
                value={values.priority}
                onChange={(event) => set("priority", event.target.value)}
                className={selectClass}
              >
                {SHOPPING_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {SHOPPING_PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shopping-brand">Marca</Label>
              <Input
                id="shopping-brand"
                value={values.brand}
                onChange={(event) => set("brand", event.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shopping-store">Loja</Label>
              <Input
                id="shopping-store"
                list="shopping-stores"
                value={values.store}
                onChange={(event) => set("store", event.target.value)}
                className="h-11"
              />
              <datalist id="shopping-stores">
                {stores.map((store) => (
                  <option key={store} value={store} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="shopping-estimated">Preço estimado (R$)</Label>
              <Input
                id="shopping-estimated"
                value={values.estimated_price}
                onChange={(event) => set("estimated_price", event.target.value)}
                inputMode="decimal"
                placeholder="Opcional"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shopping-actual">Preço pago (R$)</Label>
              <Input
                id="shopping-actual"
                value={values.actual_price}
                onChange={(event) => set("actual_price", event.target.value)}
                inputMode="decimal"
                placeholder="Opcional"
                className="h-11"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="shopping-note">Observação</Label>
            <Textarea
              id="shopping-note"
              value={values.note}
              onChange={(event) => set("note", event.target.value)}
              rows={2}
            />
          </div>

          {item?.separateReason && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-muted-foreground">
              {item.separateReason}
            </p>
          )}
        </div>

        <DialogFooter className={cn("gap-2 sm:gap-2")}>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || (!values.label && !values.food_id)}>
            {item ? "Salvar" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
