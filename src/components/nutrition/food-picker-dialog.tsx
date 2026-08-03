"use client";

/**
 * Fase 16-B — Dieta e Alimentação · Escolher alimento e porção.
 *
 * Usado tanto pelo diário quanto pelo planejamento — um caminho só de escolha, para os dois
 * lados falarem a mesma língua (e para a 16-C plugar receita aqui, em vez de criar um segundo
 * seletor).
 *
 * ══ O QUE ESTA TELA NÃO FAZ ══
 * Não calcula nem envia nutriente nenhum. Ela devolve `{ foodId, quantity, measureId }` e o
 * SERVIDOR monta o snapshot lendo o catálogo. Deixar o cliente mandar valores nutricionais
 * permitiria gravar história inventada.
 *
 * A prévia mostrada aqui é só orientação (vem dos macros já carregados na lista) e mostra "—"
 * onde a fonte não publicou o valor, nunca 0.
 */
import * as React from "react";
import { Search, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PREPARATION_STATE_LABELS } from "@/lib/nutrition/constants";
import { matchesSearch } from "@/lib/nutrition/filters";
import { CONVERSION_FAILURE_MESSAGES, convertToBase, describeMeasure } from "@/lib/nutrition/units";
import type { FoodListItem } from "@/lib/nutrition/types";
import { MacroChip } from "./nutrient-value";

export type PickedFood = {
  foodId: string;
  quantity: number;
  measureId: string | null;
  notes: string | null;
  isOptional: boolean;
};

export type PickerMeasure = {
  id: string;
  foodId: string;
  label: string;
  grams: number | null;
  milliliters: number | null;
};

const RESULT_LIMIT = 40;

export function FoodPickerDialog({
  open,
  onOpenChange,
  foods,
  measures,
  title = "Adicionar alimento",
  description,
  showOptional = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foods: FoodListItem[];
  /** Medidas caseiras indexadas por `foodId`. */
  measures: Map<string, PickerMeasure[]>;
  title?: string;
  description?: string;
  /** O planejamento oferece "item opcional"; o diário, não. */
  showOptional?: boolean;
  onConfirm: (picked: PickedFood) => Promise<void> | void;
}) {
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<FoodListItem | null>(null);
  const [quantity, setQuantity] = React.useState("100");
  const [measureId, setMeasureId] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");
  const [isOptional, setIsOptional] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Reset ao abrir, sem `useEffect`: o React Compiler está ativo e o projeto adotou o
  // ajuste durante o render guardado por um "estado visto".
  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setSearch("");
      setSelected(null);
      setQuantity("100");
      setMeasureId(null);
      setNotes("");
      setIsOptional(false);
      setSaving(false);
    }
  }

  const results = React.useMemo(() => {
    const term = search.trim();
    const pool = foods.filter((food) => !food.isArchived);
    if (!term) {
      // Sem busca: favoritos e mais usados primeiro — é o que torna o registro diário rápido.
      return [...pool]
        .sort(
          (a, b) =>
            Number(b.isFavorite) - Number(a.isFavorite) ||
            b.useCount - a.useCount ||
            a.name.localeCompare(b.name, "pt-BR"),
        )
        .slice(0, RESULT_LIMIT);
    }
    return pool.filter((food) => matchesSearch(food, term)).slice(0, RESULT_LIMIT);
  }, [foods, search]);

  const foodMeasures = selected ? (measures.get(selected.id) ?? []) : [];
  const chosenMeasure = foodMeasures.find((m) => m.id === measureId) ?? null;

  const quantityNumber = Number(quantity.replace(",", "."));
  const conversion = selected
    ? convertToBase(
        quantityNumber,
        chosenMeasure
          ? { label: chosenMeasure.label, grams: chosenMeasure.grams, milliliters: chosenMeasure.milliliters }
          : null,
        { baseQuantity: selected.baseQuantity, baseUnit: selected.baseUnit },
      )
    : null;

  // Prévia dos macros para a porção escolhida. Orientação, não gravação.
  const factor = conversion?.ok ? conversion.factor : null;
  const preview = (value: number | null) => (value === null || factor === null ? null : value * factor);

  async function handleConfirm() {
    if (!selected || !conversion?.ok) return;
    setSaving(true);
    await onConfirm({
      foodId: selected.id,
      quantity: quantityNumber,
      measureId,
      notes: notes.trim() || null,
      isOptional,
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
                placeholder="Buscar alimento (sem acento também funciona)"
                className="pl-9"
              />
            </div>

            <div className="max-h-[45vh] space-y-1 overflow-y-auto rounded-lg border p-1">
              {results.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nenhum alimento encontrado. Cadastre-o no catálogo para registrar com valores
                  reais.
                </p>
              )}
              {results.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => {
                    setSelected(food);
                    const list = measures.get(food.id) ?? [];
                    const preferred = list.find((m) => m.grams !== null || m.milliliters !== null);
                    setMeasureId(preferred?.id ?? null);
                    setQuantity(preferred ? "1" : String(food.baseQuantity));
                  }}
                  className="flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{food.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {food.preparationState !== "nao_informado" && (
                        <span className="text-[11px] text-muted-foreground">
                          {PREPARATION_STATE_LABELS[food.preparationState]}
                        </span>
                      )}
                      {food.brand && (
                        <span className="text-[11px] text-muted-foreground">{food.brand}</span>
                      )}
                      <MacroChip
                        label={`por ${food.baseQuantity} ${food.baseUnit}`}
                        value={food.macros.energiaKcal}
                        unit="kcal"
                        precision={0}
                      />
                    </div>
                  </div>
                  {food.isFavorite && <Badge variant="secondary" className="shrink-0 text-[10px]">Favorito</Badge>}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selected.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Valores por {selected.baseQuantity} {selected.baseUnit}
                  {selected.source ? ` · ${selected.source.name}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <X className="size-4" />
                Trocar
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="picker-quantity">Quantidade</Label>
                <Input
                  id="picker-quantity"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="picker-measure">Medida</Label>
                <select
                  id="picker-measure"
                  value={measureId ?? ""}
                  onChange={(event) => setMeasureId(event.target.value || null)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Direto em {selected.baseUnit}</option>
                  {foodMeasures.map((measure) => (
                    <option key={measure.id} value={measure.id}>
                      {describeMeasure(measure, selected.baseUnit)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Conversão impossível é dita com todas as letras — nunca estimada. */}
            {conversion && !conversion.ok && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                {CONVERSION_FAILURE_MESSAGES[conversion.reason]}
              </p>
            )}

            {conversion?.ok && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">
                  Equivale a{" "}
                  <strong className="text-foreground">
                    {conversion.amount.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                    {selected.baseUnit}
                  </strong>
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <MacroChip label="Energia" value={preview(selected.macros.energiaKcal)} unit="kcal" precision={0} />
                  <MacroChip label="Proteína" value={preview(selected.macros.proteina)} unit="g" />
                  <MacroChip label="Carbo." value={preview(selected.macros.carboidrato)} unit="g" />
                  <MacroChip label="Gordura" value={preview(selected.macros.lipidios)} unit="g" />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Prévia a partir dos macros do catálogo. Um traço significa que a fonte não
                  publicou o valor — não que ele seja zero.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="picker-notes">Observação (opcional)</Label>
              <Textarea
                id="picker-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Ex.: sem sal, marca diferente…"
              />
            </div>

            {showOptional && (
              <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <span>
                  <span className="text-sm font-medium">Item opcional</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Não contar contra o plano se você pular este item.
                  </span>
                </span>
                <Switch checked={isOptional} onCheckedChange={setIsOptional} />
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected || !conversion?.ok || saving}
            className={cn(!selected && "hidden sm:inline-flex")}
          >
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
