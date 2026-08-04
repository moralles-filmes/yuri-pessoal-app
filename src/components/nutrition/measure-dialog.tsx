"use client";

/**
 * Fase 16-A — Dieta e Alimentação · Cadastro de medida caseira.
 *
 * A conversão é sempre POR ALIMENTO: uma colher de sopa de arroz e uma de azeite não pesam
 * o mesmo. O formulário exige gramas **ou** mililitros — medida sem conversão não calcula
 * nada, e estimar seria inventar dado.
 */
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  MEASURE_LABEL_SUGGESTIONS,
  MEASURE_UNIT_TYPES,
  MEASURE_UNIT_TYPE_LABELS,
} from "@/lib/nutrition/constants";
import { saveNutritionMeasure } from "@/lib/actions/nutrition-foods";
import type { FoodDetail, FoodMeasure } from "@/lib/nutrition/types";

export function MeasureDialog({
  open,
  onOpenChange,
  food,
  measure,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  food: FoodDetail | null;
  /** `null` = nova medida. */
  measure: FoodMeasure | null;
  onSaved: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [unitType, setUnitType] = React.useState<string>("unidade");
  const [grams, setGrams] = React.useState("");
  const [milliliters, setMilliliters] = React.useState("");
  const [isDefault, setIsDefault] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Recarrega ao abrir para outra medida (ajuste durante o render, sem useEffect).
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);
  const key = `${food?.id ?? ""}:${measure?.id ?? "novo"}:${open}`;
  if (open && key !== loadedKey) {
    setLoadedKey(key);
    setLabel(measure?.label ?? "");
    setUnitType(measure?.unitType ?? "unidade");
    setGrams(measure?.grams === null || measure?.grams === undefined ? "" : String(measure.grams));
    setMilliliters(
      measure?.milliliters === null || measure?.milliliters === undefined
        ? ""
        : String(measure.milliliters),
    );
    setIsDefault(measure?.isDefault ?? false);
    setError(null);
  }

  if (!food) return null;

  async function submit() {
    if (!food) return;
    setError(null);
    setSaving(true);
    const result = await saveNutritionMeasure(
      {
        food_id: food.id,
        label,
        unit_type: unitType,
        grams,
        milliliters,
        is_default: isDefault,
      },
      measure?.id,
    );
    setSaving(false);

    if (!result.ok) {
      setError(result.fieldErrors?.grams?.[0] ?? result.error);
      return;
    }
    toast.success(measure ? "Medida atualizada." : "Medida criada.");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `sm:max-w-md` (28rem): ver nota em food-form-dialog — sem o prefixo o limite da
          primitiva vencia e o diálogo não crescia no desktop. */}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{measure ? "Editar medida" : "Nova medida caseira"}</DialogTitle>
          <DialogDescription>
            Para <strong>{food.name}</strong>. A conversão vale só para este alimento.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="m-label">Nome da medida *</Label>
            <Input
              id="m-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Ex.: Colher de sopa cheia"
              list="medidas-sugeridas"
              required
            />
            <datalist id="medidas-sugeridas">
              {MEASURE_LABEL_SUGGESTIONS.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-tipo">Tipo</Label>
            <Select value={unitType} onValueChange={setUnitType}>
              <SelectTrigger id="m-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEASURE_UNIT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {MEASURE_UNIT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-g">Equivale a (g)</Label>
              <Input
                id="m-g"
                inputMode="decimal"
                value={grams}
                onChange={(event) => setGrams(event.target.value)}
                placeholder="Ex.: 25"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-ml">Equivale a (ml)</Label>
              <Input
                id="m-ml"
                inputMode="decimal"
                value={milliliters}
                onChange={(event) => setMilliliters(event.target.value)}
                placeholder="Ex.: 200"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Informe ao menos uma conversão. Este alimento é medido em{" "}
            <strong>{food.baseUnit}</strong>, então é essa a coluna usada no cálculo.
          </p>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="m-padrao" className="text-sm">
                Medida padrão
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Vem selecionada ao registrar este alimento.
              </p>
            </div>
            <Switch id="m-padrao" checked={isDefault} onCheckedChange={setIsDefault} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
