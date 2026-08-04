"use client";

/**
 * Fase 16-C — Dieta e Alimentação · Escolher uma receita e a porção.
 *
 * Irmão do `FoodPickerDialog`: um caminho só de escolha, usado pelo diário e pelo
 * planejamento. Devolve `{ recipeId, quantity, portionUnit }` — nenhum valor nutricional sai
 * daqui, porque quem monta o snapshot é o servidor.
 *
 * ══ O QUE ESTA TELA SE RECUSA A FAZER ══
 * Oferecer "gramas" para uma receita sem peso final informado. Sem esse peso não existe
 * conversão entre porção e grama, e estimá-la seria inventar dado. A opção aparece
 * desabilitada, com a explicação — em vez de sumir sem motivo.
 */
import * as React from "react";
import { ChefHat, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { roundForDisplay, type NutrientTotal } from "@/lib/nutrition/calc";
import {
  CORE_NUTRIENTS,
  PORTION_UNIT_HINTS,
  PORTION_UNIT_LABELS,
  RECIPE_NO_WEIGHT_HINT,
  type PortionUnit,
} from "@/lib/nutrition/constants";
import { describeYield, perServing, portionLabelOf, recipePortionFactor } from "@/lib/nutrition/recipe";
import { normalizeText } from "@/lib/nutrition/filters";
import { TotalQualityBadge } from "./nutrient-value";

/** A receita como o seletor precisa dela: identidade, rendimento e total já calculado. */
export type PickerRecipe = {
  id: string;
  name: string;
  servings: number;
  servingLabel: string | null;
  totalWeightG: number | null;
  isFavorite: boolean;
  isArchived: boolean;
  useCount: number;
  totals: Record<string, NutrientTotal>;
};

export type PickedRecipe = {
  recipeId: string;
  quantity: number;
  portionUnit: PortionUnit;
  notes: string | null;
};

const RESULT_LIMIT = 30;

export function RecipePickerDialog({
  open,
  onOpenChange,
  recipes,
  title = "Adicionar receita",
  description,
  showNotes = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipes: PickerRecipe[];
  title?: string;
  description?: string;
  showNotes?: boolean;
  onConfirm: (picked: PickedRecipe) => Promise<void> | void;
}) {
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<PickerRecipe | null>(null);
  const [quantity, setQuantity] = React.useState("1");
  const [portionUnit, setPortionUnit] = React.useState<PortionUnit>("porcao");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Reset ao abrir sem `useEffect` (React Compiler ativo): ajuste no render guardado por um
  // "estado visto", o padrão já adotado no repositório.
  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setSearch("");
      setSelected(null);
      setQuantity("1");
      setPortionUnit("porcao");
      setNotes("");
      setSaving(false);
    }
  }

  const results = React.useMemo(() => {
    const term = normalizeText(search.trim());
    const pool = recipes.filter((recipe) => !recipe.isArchived);
    const ordered = [...pool].sort(
      (a, b) =>
        Number(b.isFavorite) - Number(a.isFavorite) ||
        b.useCount - a.useCount ||
        a.name.localeCompare(b.name, "pt-BR"),
    );
    if (!term) return ordered.slice(0, RESULT_LIMIT);
    return ordered.filter((recipe) => normalizeText(recipe.name).includes(term)).slice(0, RESULT_LIMIT);
  }, [recipes, search]);

  const quantityNumber = Number(quantity.replace(",", "."));
  const factor = selected ? recipePortionFactor(selected, quantityNumber, portionUnit) : null;
  const canWeigh = Boolean(selected?.totalWeightG);

  const energia = selected?.totals[CORE_NUTRIENTS.energia];
  const previewEnergia =
    energia && factor !== null ? { amount: energia.amount * factor, quality: energia.quality } : null;

  async function handleConfirm() {
    if (!selected || factor === null) return;
    setSaving(true);
    await onConfirm({
      recipeId: selected.id,
      quantity: quantityNumber,
      portionUnit,
      notes: notes.trim() || null,
    });
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar receita (sem acento também funciona)"
                className="pl-9"
              />
            </div>

            <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-lg border p-1">
              {results.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhuma receita encontrada. Cadastre-a em Receitas para registrar com os
                  valores dos ingredientes.
                </p>
              )}
              {results.map((recipe) => {
                const porcao = perServing(recipe.totals, recipe.servings)[CORE_NUTRIENTS.energia];
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => {
                      setSelected(recipe);
                      setPortionUnit("porcao");
                      setQuantity("1");
                    }}
                    className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{recipe.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {describeYield(recipe)}
                        {porcao
                          ? ` · ${roundForDisplay(porcao.amount, 0).toLocaleString("pt-BR")} kcal por ${portionLabelOf(recipe)}`
                          : ""}
                      </p>
                    </div>
                    {recipe.isFavorite && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        Favorita
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  <ChefHat className="size-4 shrink-0 text-primary" />
                  {selected.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{describeYield(selected)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <X className="size-4" />
                Trocar
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="recipe-quantity">Quantidade</Label>
                <Input
                  id="recipe-quantity"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recipe-unit">Medida</Label>
                <select
                  id="recipe-unit"
                  value={portionUnit}
                  onChange={(event) => setPortionUnit(event.target.value as PortionUnit)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="porcao">
                    {PORTION_UNIT_LABELS.porcao} ({portionLabelOf(selected)})
                  </option>
                  <option value="peso" disabled={!canWeigh}>
                    {PORTION_UNIT_LABELS.peso}
                    {canWeigh ? "" : " — precisa do peso final"}
                  </option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {PORTION_UNIT_HINTS[portionUnit]}
                </p>
              </div>
            </div>

            {!canWeigh && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                {RECIPE_NO_WEIGHT_HINT}
              </p>
            )}

            {factor !== null && previewEnergia && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  Equivale a{" "}
                  <strong className="text-foreground tabular-nums">
                    {roundForDisplay(previewEnergia.amount, 0).toLocaleString("pt-BR")} kcal
                  </strong>
                  <TotalQualityBadge quality={previewEnergia.quality} />
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Prévia do total da receita nesta quantidade. Os valores serão congelados no
                  momento do registro — editar a receita depois não muda o que já foi registrado.
                </p>
              </div>
            )}

            {showNotes && (
              <div className="space-y-1.5">
                <Label htmlFor="recipe-notes">Observação (opcional)</Label>
                <Textarea
                  id="recipe-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={2}
                />
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected || factor === null || saving}
            className={cn(!selected && "hidden sm:inline-flex")}
          >
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
