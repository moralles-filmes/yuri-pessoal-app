"use client";

/**
 * Fase 16-C — Dieta e Alimentação · Detalhe da receita.
 *
 * ══ AS TRÊS COISAS QUE ESTA TELA PRECISA DEIXAR ÓBVIAS ══
 *
 * 1. DE ONDE VEM O NÚMERO. O total é a soma dos ingredientes, calculada agora — e a tela diz
 *    quantos entraram na conta e quais ficaram de fora, com o motivo. Ingrediente sem dado não
 *    some em silêncio nem vale zero: ele deixa o total PARCIAL, e o selo aparece.
 *
 * 2. POR 100 g EXIGE O PESO FINAL. Sem ele a aba mostra a explicação, não um número. Dividir
 *    pela soma dos ingredientes crus daria um valor plausível e errado.
 *
 * 3. MUDAR O RENDIMENTO MUDA A PORÇÃO, NÃO O TOTAL. As três colunas (receita inteira, por
 *    porção, por 100 g) saem do MESMO total, escalado de formas diferentes.
 */
import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChefHat,
  Copy,
  Image as ImageIcon,
  Pencil,
  Plus,
  Star,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { RECIPE_PHOTO_ACCEPT_ATTRIBUTE } from "@/lib/nutrition/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatNutrientAmount, roundForDisplay, type NutrientTotal } from "@/lib/nutrition/calc";
import {
  CORE_NUTRIENTS,
  MACRO_ORDER,
  NUTRIENT_GROUP_LABELS,
  NUTRIENT_GROUP_ORDER,
  RECIPE_NO_WEIGHT_HINT,
} from "@/lib/nutrition/constants";
import {
  describeYield,
  INGREDIENT_SKIP_MESSAGES,
  per100g,
  perServing,
  portionLabelOf,
  totalMinutes,
  type RecipeCalcResult,
} from "@/lib/nutrition/recipe";
import { formatAmount } from "@/lib/nutrition/units";
import type { NutrientDefinition, Recipe } from "@/lib/nutrition/types";
import { TotalQualityBadge } from "./nutrient-value";

export type RecipeWithCalc = Recipe & { calc: RecipeCalcResult };

type Scope = "inteira" | "porcao" | "cem";

export function RecipeDetailSheet({
  recipe,
  nutrients,
  foodNames,
  pending,
  onOpenChange,
  onEdit,
  onDuplicate,
  onToggleFavorite,
  onToggleArchive,
  onDelete,
  onAddIngredient,
  onRemoveIngredient,
  onReorderIngredients,
  onUploadPhoto,
  onRemovePhoto,
  onCreateTemplate,
}: {
  recipe: RecipeWithCalc | null;
  nutrients: Record<string, NutrientDefinition>;
  foodNames: Map<string, string>;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleFavorite: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
  onAddIngredient: () => void;
  onRemoveIngredient: (ingredientId: string) => void;
  /** Fase 16-F — chama `reorderRecipeIngredients`, que existia desde a 16-C sem gatilho. */
  onReorderIngredients: (orderedIds: string[]) => void;
  /** Fase 16-F — envio da foto (FormData, para o servidor ver o arquivo real). */
  onUploadPhoto: (file: File) => void;
  onRemovePhoto: (attachmentId: string) => void;
  onCreateTemplate: () => void;
}) {
  const [scope, setScope] = React.useState<Scope>("porcao");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const seen = recipe?.id ?? null;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    setScope("porcao");
    setDragId(null);
  }

  /**
   * Move um ingrediente e manda a ordem inteira para `reorderRecipeIngredients`.
   *
   * Existe em DUAS formas de propósito: arrastar (mouse/toque) e as setas ↑ ↓ (teclado e
   * leitor de tela). Uma lista reordenável só por arrasto é inacessível — e acessibilidade
   * é requisito da subfase, não enfeite.
   */
  function move(ids: string[], from: number, to: number) {
    if (from === to || to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorderIngredients(next);
  }

  if (!recipe) return null;

  const totals = recipe.calc.totals;
  const cem = per100g(totals, recipe.totalWeightG);
  const porcao = perServing(totals, recipe.servings);

  const shown: Record<string, NutrientTotal> =
    scope === "inteira" ? totals : scope === "porcao" ? porcao : cem.ok ? cem.totals : {};

  const minutos = totalMinutes(recipe.prepMinutes, recipe.cookMinutes);
  const skipById = new Map(recipe.calc.skipped.map((item) => [item.id, item.reason]));

  /** Nutrientes agrupados, na ordem do catálogo. */
  const grouped = NUTRIENT_GROUP_ORDER.map((group) => ({
    group,
    codes: Object.keys(shown)
      .filter((code) => (nutrients[code]?.group ?? "outro") === group)
      .sort((a, b) => (nutrients[a]?.position ?? 999) - (nutrients[b]?.position ?? 999)),
  })).filter((entry) => entry.codes.length > 0);

  return (
    <Sheet open={recipe !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-start gap-2 pr-6 text-left">
            <ChefHat className="mt-0.5 size-5 shrink-0 text-primary" />
            <span className="min-w-0">
              <span className="block">{recipe.name}</span>
              <span className="mt-1 block text-xs font-normal text-muted-foreground">
                {describeYield(recipe)}
                {minutos !== null && ` · ${minutos} min`}
              </span>
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-8">
          {/* ── Selos ── */}
          <div className="flex flex-wrap gap-1.5">
            {recipe.isFavorite && (
              <Badge variant="secondary" className="text-[10px]">
                Favorita
              </Badge>
            )}
            {recipe.isArchived && (
              <Badge variant="outline" className="text-[10px]">
                Arquivada
              </Badge>
            )}
            {recipe.isCopy && (
              <Badge variant="outline" className="text-[10px]">
                Cópia
              </Badge>
            )}
            {recipe.categoryName && (
              <Badge variant="outline" className="text-[10px]">
                {recipe.categoryName}
              </Badge>
            )}
            {recipe.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>

          {recipe.description && (
            <p className="text-sm text-muted-foreground">{recipe.description}</p>
          )}

          {/* ── Ações ── */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onEdit} disabled={pending}>
              <Pencil className="size-4" />
              Editar
            </Button>
            <Button size="sm" variant="outline" onClick={onDuplicate} disabled={pending}>
              <Copy className="size-4" />
              Duplicar
            </Button>
            <Button size="sm" variant="outline" onClick={onToggleFavorite} disabled={pending}>
              <Star className={cn("size-4", recipe.isFavorite && "fill-current text-primary")} />
              {recipe.isFavorite ? "Desfavoritar" : "Favoritar"}
            </Button>
            <Button size="sm" variant="outline" onClick={onCreateTemplate} disabled={pending}>
              <Utensils className="size-4" />
              Virar refeição-modelo
            </Button>
            <Button size="sm" variant="outline" onClick={onToggleArchive} disabled={pending}>
              {recipe.isArchived ? "Desarquivar" : "Arquivar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDelete} disabled={pending}>
              <Trash2 className="size-4" />
              Excluir
            </Button>
          </div>

          <Tabs defaultValue="ingredientes">
            <TabsList className="w-full">
              <TabsTrigger value="ingredientes" className="flex-1">
                Ingredientes
              </TabsTrigger>
              <TabsTrigger value="nutricao" className="flex-1">
                Nutrição
              </TabsTrigger>
              <TabsTrigger value="preparo" className="flex-1">
                Preparo
              </TabsTrigger>
            </TabsList>

            {/* ══ Ingredientes ══ */}
            <TabsContent value="ingredientes" className="space-y-3 pt-3">
              {/* ══ Foto (16-F) — bucket PRIVADO, URL assinada de 5 min gerada na leitura.
                  O caminho no Storage nunca chega aqui. ══ */}
              <div className="flex items-center gap-3 rounded-lg border p-3">
                {recipe.photo?.url ? (
                  // URL assinada de curta duração num bucket privado — `next/image` a
                  // otimizaria e cacharia, que é o oposto do que se quer aqui (16-E).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={recipe.photo.url}
                    alt={`Foto da receita ${recipe.name}`}
                    className="size-16 shrink-0 rounded-md object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    aria-hidden
                    className="grid size-16 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
                  >
                    <ImageIcon className="size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Foto da receita</p>
                  <p className="text-xs text-muted-foreground">
                    {recipe.photo
                      ? recipe.photo.url
                        ? "Guardada em armazenamento privado — o link expira em 5 minutos."
                        : "A imagem existe, mas o link não pôde ser gerado agora."
                      : "JPG, PNG, WEBP ou HEIC, até 8 MB."}
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept={RECIPE_PHOTO_ACCEPT_ATTRIBUTE}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    // O valor é limpo para escolher o MESMO arquivo duas vezes seguidas.
                    e.target.value = "";
                    if (file) onUploadPhoto(file);
                  }}
                />
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => fileRef.current?.click()}
                  >
                    {recipe.photo ? "Trocar" : "Enviar"}
                  </Button>
                  {recipe.photo && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label="Remover foto da receita"
                      disabled={pending}
                      onClick={() => onRemovePhoto(recipe.photo!.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              {recipe.ingredients.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum ingrediente ainda. Sem eles não há valor nutricional para calcular.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {recipe.ingredients.map((ingredient, index) => {
                    const skip = skipById.get(ingredient.id);
                    const ids = recipe.ingredients.map((i) => i.id);
                    const label =
                      ingredient.customLabel ??
                      (ingredient.foodId
                        ? (foodNames.get(ingredient.foodId) ?? "Alimento removido do catálogo")
                        : "Item");
                    return (
                      <li
                        key={ingredient.id}
                        draggable={!pending}
                        onDragStart={() => setDragId(ingredient.id)}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (!dragId || dragId === ingredient.id) return;
                          move(ids, ids.indexOf(dragId), index);
                          setDragId(null);
                        }}
                        className={`flex items-start justify-between gap-3 p-3 ${
                          dragId === ingredient.id ? "opacity-50" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm">
                            {label}
                            {ingredient.isOptional && (
                              <Badge variant="outline" className="ms-2 text-[10px]">
                                Opcional
                              </Badge>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {ingredient.quantity === null
                              ? "Sem quantidade"
                              : `${formatAmount(ingredient.quantity)}${ingredient.measureLabel ? ` × ${ingredient.measureLabel}` : ""}`}
                            {ingredient.gramsEquivalent !== null &&
                              ` (${formatAmount(ingredient.gramsEquivalent)} g/ml)`}
                          </p>
                          {/* O motivo aparece: ele explica por que o total é parcial. */}
                          {skip && (
                            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                              {INGREDIENT_SKIP_MESSAGES[skip]}
                            </p>
                          )}
                          {ingredient.note && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {ingredient.note}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          {/* Setas: o caminho por teclado e leitor de tela. Arrastar é o
                              atalho de mouse, nunca a única forma de reordenar. */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`Mover ${label} para cima`}
                            disabled={pending || index === 0}
                            onClick={() => move(ids, index, index - 1)}
                          >
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`Mover ${label} para baixo`}
                            disabled={pending || index === recipe.ingredients.length - 1}
                            onClick={() => move(ids, index, index + 1)}
                          >
                            <ArrowDown className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={`Remover ${label}`}
                            disabled={pending}
                            onClick={() => onRemoveIngredient(ingredient.id)}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Button size="sm" variant="outline" onClick={onAddIngredient} disabled={pending}>
                <Plus className="size-4" />
                Ingrediente
              </Button>

              <p className="text-[11px] text-muted-foreground">
                {recipe.calc.counted} de {recipe.ingredients.length} ingrediente
                {recipe.ingredients.length === 1 ? "" : "s"} entraram no cálculo.
                {recipe.calc.skipped.length > 0 &&
                  " Os demais não têm dado suficiente e, por isso, o total é parcial — não zero."}
              </p>
            </TabsContent>

            {/* ══ Nutrição ══ */}
            <TabsContent value="nutricao" className="space-y-3 pt-3">
              <div className="flex rounded-lg border p-0.5">
                {(
                  [
                    ["inteira", "Receita inteira"],
                    ["porcao", `Por ${portionLabelOf(recipe)}`],
                    ["cem", "Por 100 g"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setScope(value)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      scope === value
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {scope === "cem" && !cem.ok ? (
                // Indisponível COM EXPLICAÇÃO — a regra 1 da subfase em forma de tela.
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    Por 100 g indisponível
                  </p>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                    {RECIPE_NO_WEIGHT_HINT}
                  </p>
                </div>
              ) : Object.keys(shown).length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Sem valor calculável: nenhum ingrediente tem dados nutricionais.
                </p>
              ) : (
                <>
                  {/* Macros em destaque */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {MACRO_ORDER.filter((code) => shown[code]).map((code) => {
                      const definition = nutrients[code];
                      const total = shown[code];
                      return (
                        <div key={code} className="rounded-lg border p-2.5">
                          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            {definition?.shortName ?? definition?.name ?? code}
                            <TotalQualityBadge quality={total.quality} />
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums">
                            {definition
                              ? `${formatNutrientAmount(total.amount, definition)} ${definition.unit}`
                              : roundForDisplay(total.amount, 1).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Todos os nutrientes, por grupo */}
                  {grouped.map(({ group, codes }) => (
                    <div key={group} className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {NUTRIENT_GROUP_LABELS[group]}
                      </p>
                      <ul className="divide-y rounded-lg border">
                        {codes.map((code) => {
                          const definition = nutrients[code];
                          const total = shown[code];
                          return (
                            <li
                              key={code}
                              className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm"
                            >
                              <span className="min-w-0 truncate text-muted-foreground">
                                {definition?.name ?? code}
                              </span>
                              <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                                {definition
                                  ? `${formatNutrientAmount(total.amount, definition)} ${definition.unit}`
                                  : roundForDisplay(total.amount, 2).toLocaleString("pt-BR")}
                                <TotalQualityBadge quality={total.quality} />
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}

                  <p className="text-[11px] text-muted-foreground">
                    {scope === "inteira" &&
                      "Soma de todos os ingredientes, na quantidade cadastrada."}
                    {scope === "porcao" &&
                      `Total dividido por ${formatAmount(recipe.servings)} ${portionLabelOf(recipe)}${recipe.servings === 1 ? "" : "s"}. Alterar o rendimento muda esta coluna, não o total.`}
                    {scope === "cem" &&
                      cem.ok &&
                      `Calculado sobre o peso final informado (${formatAmount(recipe.totalWeightG ?? 0)} g), não sobre a soma dos ingredientes crus.`}
                  </p>
                </>
              )}
            </TabsContent>

            {/* ══ Preparo ══ */}
            <TabsContent value="preparo" className="space-y-3 pt-3">
              {minutos !== null && (
                <p className="text-sm text-muted-foreground">
                  {recipe.prepMinutes !== null && `Preparo: ${recipe.prepMinutes} min`}
                  {recipe.prepMinutes !== null && recipe.cookMinutes !== null && " · "}
                  {recipe.cookMinutes !== null && `Cozimento: ${recipe.cookMinutes} min`}
                </p>
              )}

              {recipe.instructions ? (
                <p className="whitespace-pre-wrap text-sm">{recipe.instructions}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum modo de preparo registrado.</p>
              )}

              {recipe.yieldNote && (
                <p className="text-xs text-muted-foreground">Rendimento: {recipe.yieldNote}</p>
              )}
              {recipe.source && (
                <p className="text-xs text-muted-foreground">Fonte: {recipe.source}</p>
              )}
              {recipe.notes && (
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{recipe.notes}</p>
              )}

              {recipe.totalWeightG !== null && recipe.calc.rawWeightG !== null && (
                <p className="rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">
                  Soma dos ingredientes: {formatAmount(recipe.calc.rawWeightG)} g · Peso final
                  informado: {formatAmount(recipe.totalWeightG)} g.
                  {!recipe.calc.rawWeightComplete &&
                    " A soma está incompleta: há ingredientes sem conversão em gramas."}
                </p>
              )}
            </TabsContent>
          </Tabs>

          {/* Energia total, sempre visível no rodapé */}
          {totals[CORE_NUTRIENTS.energia] && (
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Receita inteira:{" "}
              <strong className="text-foreground tabular-nums">
                {roundForDisplay(totals[CORE_NUTRIENTS.energia].amount, 0).toLocaleString("pt-BR")}{" "}
                kcal
              </strong>
              <TotalQualityBadge
                quality={totals[CORE_NUTRIENTS.energia].quality}
                className="ms-1.5"
              />
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
