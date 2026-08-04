"use client";

/**
 * Fase 16-C — Dieta e Alimentação · Formulário de receita.
 *
 * ══ O CAMPO QUE DEFINE A HONESTIDADE DESTA TELA ══
 * "Peso final preparado" fica VAZIO por padrão e assim permanece se o usuário não pesar. Um
 * placeholder tentador com a soma dos ingredientes seria uma estimativa disfarçada de dado —
 * e é exatamente o que a regra 1 da subfase proíbe. O texto de ajuda explica o que se perde
 * (o "por 100 g" e o registro em gramas) e o que se ganha ao informar.
 *
 * Também mostra, quando dá, a comparação entre a soma dos ingredientes e o peso final: uma
 * CONSTATAÇÃO de perda/ganho no preparo, nunca uma inferência.
 */
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
import { RECIPE_NO_WEIGHT_HINT } from "@/lib/nutrition/constants";
import { preparationDelta } from "@/lib/nutrition/recipe";
import { formatAmount } from "@/lib/nutrition/units";
import type { Recipe, RecipeCategory } from "@/lib/nutrition/types";

export type RecipeFormValues = {
  name: string;
  description: string;
  category_id: string;
  instructions: string;
  prep_minutes: string;
  cook_minutes: string;
  servings: string;
  serving_label: string;
  yield_note: string;
  total_weight_g: string;
  source: string;
  notes: string;
  tags: string[];
};

const empty: RecipeFormValues = {
  name: "",
  description: "",
  category_id: "",
  instructions: "",
  prep_minutes: "",
  cook_minutes: "",
  servings: "1",
  serving_label: "",
  yield_note: "",
  total_weight_g: "",
  source: "",
  notes: "",
  tags: [],
};

const fromRecipe = (recipe: Recipe): RecipeFormValues => ({
  name: recipe.name,
  description: recipe.description ?? "",
  category_id: recipe.categoryId ?? "",
  instructions: recipe.instructions ?? "",
  prep_minutes: recipe.prepMinutes === null ? "" : String(recipe.prepMinutes),
  cook_minutes: recipe.cookMinutes === null ? "" : String(recipe.cookMinutes),
  servings: String(recipe.servings),
  serving_label: recipe.servingLabel ?? "",
  yield_note: recipe.yieldNote ?? "",
  total_weight_g: recipe.totalWeightG === null ? "" : String(recipe.totalWeightG),
  source: recipe.source ?? "",
  notes: recipe.notes ?? "",
  tags: recipe.tags,
});

export function RecipeFormDialog({
  open,
  onOpenChange,
  recipe,
  categories,
  /** Soma dos ingredientes já convertidos, para a comparação com o peso final. */
  rawWeightG,
  rawWeightComplete,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: Recipe | null;
  categories: RecipeCategory[];
  rawWeightG?: number | null;
  rawWeightComplete?: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = React.useState<RecipeFormValues>(recipe ? fromRecipe(recipe) : empty);
  const [tagInput, setTagInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const seen = `${open}:${recipe?.id ?? "novo"}`;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    if (open) {
      setValues(recipe ? fromRecipe(recipe) : empty);
      setTagInput("");
      setSaving(false);
    }
  }

  const set = <K extends keyof RecipeFormValues>(key: K, value: RecipeFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const weightNumber = values.total_weight_g ? Number(values.total_weight_g.replace(",", ".")) : null;
  const delta =
    rawWeightG && weightNumber
      ? preparationDelta(rawWeightG, weightNumber, rawWeightComplete ?? true)
      : null;

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || values.tags.includes(tag)) return;
    set("tags", [...values.tags, tag]);
    setTagInput("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{recipe ? "Editar receita" : "Nova receita"}</DialogTitle>
          <DialogDescription>
            Os ingredientes são adicionados depois de salvar. O valor nutricional é sempre
            calculado a partir deles — nada é digitado à mão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="recipe-name">Nome</Label>
              <Input
                id="recipe-name"
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Ex.: bolo de fubá da vó"
                autoFocus
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="recipe-description">Descrição (opcional)</Label>
              <Input
                id="recipe-description"
                value={values.description}
                onChange={(event) => set("description", event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recipe-category">Categoria</Label>
              <select
                id="recipe-category"
                value={values.category_id}
                onChange={(event) => set("category_id", event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Sem categoria</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon ? `${category.icon} ` : ""}
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recipe-source">Fonte (opcional)</Label>
              <Input
                id="recipe-source"
                value={values.source}
                onChange={(event) => set("source", event.target.value)}
                placeholder="Ex.: caderno da minha avó"
              />
            </div>
          </div>

          {/* ── Rendimento ── */}
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Rendimento</legend>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="recipe-servings">Porções</Label>
                <Input
                  id="recipe-servings"
                  inputMode="decimal"
                  value={values.servings}
                  onChange={(event) => set("servings", event.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Mudar isto recalcula o valor por porção sem alterar o total da receita.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recipe-serving-label">Como se chama a porção</Label>
                <Input
                  id="recipe-serving-label"
                  value={values.serving_label}
                  onChange={(event) => set("serving_label", event.target.value)}
                  placeholder="fatia, concha, unidade…"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="recipe-yield-note">Observação do rendimento</Label>
                <Input
                  id="recipe-yield-note"
                  value={values.yield_note}
                  onChange={(event) => set("yield_note", event.target.value)}
                  placeholder="1 forma de 20 cm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recipe-weight">Peso final preparado, em gramas (opcional)</Label>
              <Input
                id="recipe-weight"
                inputMode="decimal"
                value={values.total_weight_g}
                onChange={(event) => set("total_weight_g", event.target.value)}
                // Sem placeholder numérico de propósito: sugerir a soma dos ingredientes
                // convidaria a registrar uma estimativa como se fosse medição.
                placeholder="deixe vazio se não pesou"
              />
              <p className="text-[11px] text-muted-foreground">{RECIPE_NO_WEIGHT_HINT}</p>

              {rawWeightG !== null && rawWeightG !== undefined && (
                <p className="text-[11px] text-muted-foreground">
                  Soma dos ingredientes: <strong>{formatAmount(rawWeightG)} g</strong>
                  {rawWeightComplete === false && " (incompleta — há itens sem conversão em gramas)"}
                  .
                </p>
              )}

              {delta && (
                <p className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
                  {delta.direction === "perda" ? "Perda" : delta.direction === "ganho" ? "Ganho" : "Variação"}{" "}
                  no preparo:{" "}
                  <strong className="text-foreground">
                    {formatAmount(Math.abs(delta.deltaG))} g ({formatAmount(Math.abs(delta.percent))}%)
                  </strong>
                  . É a diferença entre o que você pesou e a soma dos ingredientes — não uma
                  estimativa nossa.
                </p>
              )}
            </div>
          </fieldset>

          {/* ── Preparo ── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="recipe-prep">Preparo (minutos)</Label>
              <Input
                id="recipe-prep"
                inputMode="numeric"
                value={values.prep_minutes}
                onChange={(event) => set("prep_minutes", event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="recipe-cook">Cozimento (minutos)</Label>
              <Input
                id="recipe-cook"
                inputMode="numeric"
                value={values.cook_minutes}
                onChange={(event) => set("cook_minutes", event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recipe-instructions">Modo de preparo</Label>
            <Textarea
              id="recipe-instructions"
              value={values.instructions}
              onChange={(event) => set("instructions", event.target.value)}
              rows={5}
              placeholder="Passo a passo, do seu jeito."
            />
          </div>

          {/* ── Etiquetas ── */}
          <div className="space-y-1.5">
            <Label htmlFor="recipe-tags">Etiquetas</Label>
            <div className="flex gap-2">
              <Input
                id="recipe-tags"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Ex.: rápida, sem glúten"
              />
              <Button type="button" variant="outline" onClick={addTag}>
                Adicionar
              </Button>
            </div>
            {values.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {values.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => set("tags", values.tags.filter((t) => t !== tag))}
                    className="rounded-full border px-2 py-0.5 text-[11px] transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    {tag} ×
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recipe-notes">Observações</Label>
            <Textarea
              id="recipe-notes"
              value={values.notes}
              onChange={(event) => set("notes", event.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!values.name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              await onSubmit({
                name: values.name.trim(),
                description: values.description || undefined,
                category_id: values.category_id || undefined,
                instructions: values.instructions || undefined,
                prep_minutes: values.prep_minutes || undefined,
                cook_minutes: values.cook_minutes || undefined,
                servings: values.servings,
                serving_label: values.serving_label || undefined,
                yield_note: values.yield_note || undefined,
                // Vazio vira `undefined` → o schema transforma em NULL. Nada é preenchido
                // automaticamente aqui.
                total_weight_g: values.total_weight_g || undefined,
                source: values.source || undefined,
                tags: values.tags,
                notes: values.notes || undefined,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : recipe ? "Salvar" : "Criar receita"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
