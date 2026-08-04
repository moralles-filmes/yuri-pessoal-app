"use client";

/**
 * Fase 16-D — Dieta e Alimentação · Despensa.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ SEIS CAMPOS E PONTO FINAL — ISTO NÃO É UM ERP DE ESTOQUE.                             ║
 * ║ Não há entrada, saída, lote nem histórico. Marcar um item como comprado na lista NÃO  ║
 * ║ dá baixa aqui: quem atualiza a despensa é a pessoa, quando ela quiser. Se manter o    ║
 * ║ estoque atualizado custar mais trabalho do que evitar comprar açúcar duas vezes,      ║
 * ║ ninguém usa — e o recurso morre.                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A distinção que a tela precisa deixar clara: quantidade VAZIA é "tenho, mas não sei quanto"
 * (e por isso não desconta); ZERO é "acabou", um fato medido. São coisas diferentes.
 */
import * as React from "react";
import { CalendarClock, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { diffDaysIso, shortDateLabel } from "@/lib/nutrition/calendar";
import {
  PANTRY_SCOPE_NOTE,
  PANTRY_UNKNOWN_QUANTITY_NOTE,
  SHOPPING_UNIT_LABELS,
  SHOPPING_UNITS,
} from "@/lib/nutrition/constants";
import { formatShoppingQuantity } from "@/lib/nutrition/shopping";
import { matchesSearch, normalizeText } from "@/lib/nutrition/filters";
import type { FoodListItem, MarketCategory, PantryItem } from "@/lib/nutrition/types";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type PantryFormValues = {
  food_id: string;
  label: string;
  quantity: string;
  unit: string;
  expires_on: string;
  min_quantity: string;
  note: string;
  category_id: string;
};

const empty: PantryFormValues = {
  food_id: "",
  label: "",
  quantity: "",
  unit: "un",
  expires_on: "",
  min_quantity: "",
  note: "",
  category_id: "",
};

const fromItem = (item: PantryItem): PantryFormValues => ({
  food_id: item.foodId ?? "",
  label: item.label,
  quantity: item.quantity === null ? "" : String(item.quantity),
  unit: item.unit,
  expires_on: item.expiresOn ?? "",
  min_quantity: item.minQuantity === null ? "" : String(item.minQuantity),
  note: item.note ?? "",
  category_id: item.categoryId ?? "",
});

export function PantryPanel({
  pantry,
  categories,
  foods,
  hoje,
  pending,
  onSave,
  onDelete,
  onSendLowStock,
}: {
  pantry: PantryItem[];
  categories: MarketCategory[];
  foods: FoodListItem[];
  hoje: string;
  pending: boolean;
  onSave: (values: Record<string, unknown>, id?: string) => Promise<boolean>;
  onDelete: (id: string) => void;
  /** Manda para a lista o que está abaixo do mínimo. Nulo = não há lista aberta. */
  onSendLowStock: (() => void) | null;
}) {
  const [search, setSearch] = React.useState("");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PantryItem | null>(null);

  const filtered = React.useMemo(() => {
    const term = normalizeText(search.trim());
    if (!term) return pantry;
    return pantry.filter((item) =>
      normalizeText(`${item.label} ${item.note ?? ""} ${item.categoryName ?? ""}`).includes(term),
    );
  }, [pantry, search]);

  const abaixoDoMinimo = pantry.filter(
    (item) => item.minQuantity !== null && item.quantity !== null && item.quantity < item.minQuantity,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar na despensa"
            className="h-11 pl-9"
            aria-label="Buscar na despensa"
          />
        </div>
        <Button
          className="h-11"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Item
        </Button>
      </div>

      <p className="rounded-md border border-dashed border-border bg-card/40 p-3 text-[11px] text-muted-foreground">
        {PANTRY_SCOPE_NOTE}
      </p>

      {abaixoDoMinimo.length > 0 && onSendLowStock && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-sm">
              {abaixoDoMinimo.length}{" "}
              {abaixoDoMinimo.length === 1 ? "item está" : "itens estão"} abaixo do estoque mínimo.
            </span>
            <Button size="sm" variant="outline" className="ms-auto" disabled={pending} onClick={onSendLowStock}>
              Mandar para a lista
            </Button>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={pantry.length === 0 ? "Despensa vazia" : "Nada encontrado"}
          description={
            pantry.length === 0
              ? "Cadastre o que você já tem em casa para a lista de compras descontar automaticamente — só quando a unidade converter de verdade."
              : "Ajuste a busca."
          }
        >
          {pantry.length === 0 && (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Adicionar item
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const dias = item.expiresOn ? diffDaysIso(hoje, item.expiresOn) : null;
            return (
              <Card key={item.id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.quantity === null ? (
                          <span title={PANTRY_UNKNOWN_QUANTITY_NOTE}>Quantidade não informada</span>
                        ) : (
                          formatShoppingQuantity(item.quantity, item.unit)
                        )}
                        {item.minQuantity !== null &&
                          ` · mínimo ${formatShoppingQuantity(item.minQuantity, item.unit)}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-9 p-0"
                      aria-label={`Editar ${item.label}`}
                      onClick={() => {
                        setEditing(item);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-9 p-0"
                      aria-label={`Excluir ${item.label}`}
                      disabled={pending}
                      onClick={() => {
                        if (confirm(`Excluir “${item.label}” da despensa?`)) onDelete(item.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {item.categoryName && (
                      <Badge variant="secondary" className="text-[10px]">
                        {item.categoryName}
                      </Badge>
                    )}
                    {item.quantity === 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        Acabou
                      </Badge>
                    )}
                    {item.expiresOn && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1 text-[10px]",
                          dias !== null && dias < 0 && "border-destructive/40 text-destructive",
                        )}
                      >
                        <CalendarClock className="size-3" />
                        {dias !== null && dias < 0
                          ? `Venceu ${shortDateLabel(item.expiresOn)}`
                          : `Vence ${shortDateLabel(item.expiresOn)}`}
                      </Badge>
                    )}
                  </div>

                  {item.note && (
                    <p className="text-[11px] text-muted-foreground">{item.note}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <PantryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editing}
        categories={categories}
        foods={foods}
        onSubmit={async (values) => {
          const ok = await onSave(values, editing?.id);
          if (ok) setFormOpen(false);
        }}
      />
    </div>
  );
}

function PantryFormDialog({
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

/** Aviso de despensa vazia usado quando a lista pede desconto sem ter o que descontar. */
export function pantryToastEmpty(): void {
  toast.info("Sua despensa está vazia — não há o que descontar ainda.");
}
