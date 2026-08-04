"use client";

/**
 * Fase 16-C — Dieta e Alimentação · Receitas (cliente).
 *
 * ══ O QUE ESTA TELA GARANTE ══
 *
 * 1. TODO TOTAL EXIBIDO CARREGA A QUALIDADE. Uma receita com ingrediente sem nutriente
 *    analisado mostra o selo "Parcial" — o número é o mínimo conhecido, não o valor real.
 *
 * 2. "POR 100 g" SÓ EXISTE COM PESO FINAL INFORMADO. Quem não pesou vê a explicação, não uma
 *    estimativa.
 *
 * 3. AÇÃO EM MASSA CONTA O QUE FEZ, mostra o escopo, pede confirmação para excluir e oferece
 *    arquivar primeiro.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { ChefHat, Plus, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { roundForDisplay } from "@/lib/nutrition/calc";
import {
  CORE_NUTRIENTS,
  RECIPE_SORT_LABELS,
  RECIPE_SORTS,
  type RecipeSort,
} from "@/lib/nutrition/constants";
import { normalizeText } from "@/lib/nutrition/filters";
import { describeYield, perServing, portionLabelOf, totalMinutes } from "@/lib/nutrition/recipe";
import type { FoodListItem, NutrientDefinition, RecipeCategory } from "@/lib/nutrition/types";
import {
  bulkRecipeAction,
  deleteRecipe,
  deleteRecipeIngredient,
  deleteRecipePhoto,
  duplicateRecipe,
  reorderRecipeIngredients,
  saveRecipe,
  saveRecipeIngredient,
  setRecipeArchived,
  setRecipeFavorite,
  uploadRecipePhoto,
} from "@/lib/actions/nutrition-recipes";
import { createTemplateFromRecipe } from "@/lib/actions/nutrition-meal-templates";
import {
  FoodPickerDialog,
  type PickerMeasure,
} from "@/components/nutrition/food-picker-dialog";
import { RecipeFormDialog } from "@/components/nutrition/recipe-form-dialog";
import {
  RecipeDetailSheet,
  type RecipeWithCalc,
} from "@/components/nutrition/recipe-detail-sheet";
import { TotalQualityBadge } from "@/components/nutrition/nutrient-value";

export type RecipesClientProps = {
  recipes: RecipeWithCalc[];
  categories: RecipeCategory[];
  foods: FoodListItem[];
  measures: [string, PickerMeasure[]][];
  nutrients: Record<string, NutrientDefinition>;
  /**
   * Fase 16-F — deep-link da busca global (`?receita=<id>`): abre o detalhe direto.
   * Vem como estado INICIAL (e não por efeito) porque o React Compiler está ativo e
   * `setState` em `useEffect` é proibido no projeto.
   */
  initialDetailId?: string | null;
};

export function RecipesClient(props: RecipesClientProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const measures = React.useMemo(() => new Map(props.measures), [props.measures]);
  const foodNames = React.useMemo(
    () => new Map(props.foods.map((food) => [food.id, food.name])),
    [props.foods],
  );

  const [search, setSearch] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [onlyFavorites, setOnlyFavorites] = React.useState(false);
  const [showArchived, setShowArchived] = React.useState(false);
  const [sort, setSort] = React.useState<RecipeSort>("nome");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [detailId, setDetailId] = React.useState<string | null>(
    props.initialDetailId ?? null,
  );
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [ingredientFor, setIngredientFor] = React.useState<string | null>(null);

  const detail = props.recipes.find((recipe) => recipe.id === detailId) ?? null;
  const editing = props.recipes.find((recipe) => recipe.id === editingId) ?? null;

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Não foi possível concluir.");
      }
    });
  }

  const filtered = React.useMemo(() => {
    const term = normalizeText(search.trim());
    const list = props.recipes.filter((recipe) => {
      if (!showArchived && recipe.isArchived) return false;
      if (onlyFavorites && !recipe.isFavorite) return false;
      if (categoryId && recipe.categoryId !== categoryId) return false;
      if (term) {
        const haystack = normalizeText(
          `${recipe.name} ${recipe.description ?? ""} ${recipe.tags.join(" ")}`,
        );
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    const energyPerServing = (recipe: RecipeWithCalc) =>
      perServing(recipe.calc.totals, recipe.servings)[CORE_NUTRIENTS.energia]?.amount ?? 0;

    return [...list].sort((a, b) => {
      switch (sort) {
        case "recentes":
          return (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "");
        case "mais_usadas":
          return b.useCount - a.useCount || a.name.localeCompare(b.name, "pt-BR");
        case "calorias_desc":
          return energyPerServing(b) - energyPerServing(a);
        case "tempo": {
          const at = totalMinutes(a.prepMinutes, a.cookMinutes);
          const bt = totalMinutes(b.prepMinutes, b.cookMinutes);
          // Sem tempo informado vai para o fim: ausência não é "zero minutos".
          if (at === null && bt === null) return a.name.localeCompare(b.name, "pt-BR");
          if (at === null) return 1;
          if (bt === null) return -1;
          return at - bt;
        }
        default:
          return a.name.localeCompare(b.name, "pt-BR");
      }
    });
  }, [props.recipes, search, categoryId, onlyFavorites, showArchived, sort]);

  const allSelected = filtered.length > 0 && filtered.every((recipe) => selected.has(recipe.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBulk(action: "favoritar" | "desfavoritar" | "arquivar" | "desarquivar" | "excluir") {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      action === "excluir" &&
      !confirm(
        `Excluir ${ids.length} receita${ids.length > 1 ? "s" : ""}? O que já foi registrado no diário é preservado, mas as receitas em si somem. Arquivar mantém tudo e tira da lista.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await bulkRecipeAction(ids, action);
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível aplicar a ação.");
        return;
      }
      const { afetadas, ignoradas, motivos } = result.data;
      toast.success(
        `${afetadas} receita${afetadas === 1 ? "" : "s"} atualizada${afetadas === 1 ? "" : "s"}.` +
          (ignoradas > 0 ? ` ${ignoradas} ignorada${ignoradas === 1 ? "" : "s"}.` : ""),
      );
      if (motivos.length > 0) toast.warning(motivos.join(" "));
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Receitas"
        description="Preparações com rendimento, peso final e cálculo por porção."
      >
        <Button
          onClick={() => {
            setEditingId(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Receita
        </Button>
      </PageHeader>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar receita"
            className="pl-9"
            aria-label="Buscar receita"
          />
        </div>

        <select
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          aria-label="Filtrar por categoria"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">Todas as categorias</option>
          {props.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as RecipeSort)}
          aria-label="Ordenar"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {RECIPE_SORTS.map((value) => (
            <option key={value} value={value}>
              {RECIPE_SORT_LABELS[value]}
            </option>
          ))}
        </select>

        <Button
          variant={onlyFavorites ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyFavorites((v) => !v)}
        >
          <Star className={cn("size-4", onlyFavorites && "fill-current")} />
          Favoritas
        </Button>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
        >
          Arquivadas
        </Button>
      </div>

      {/* ── Ações em massa: contagem e escopo sempre visíveis ── */}
      {selected.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-sm font-medium">
              {selected.size} selecionada{selected.size > 1 ? "s" : ""}
            </span>
            <div className="ms-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => runBulk("favoritar")}>
                Favoritar
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => runBulk("desfavoritar")}>
                Desfavoritar
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => runBulk("arquivar")}>
                Arquivar
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => runBulk("desarquivar")}>
                Desarquivar
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => runBulk("excluir")}>
                Excluir
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={ChefHat}
          title={props.recipes.length === 0 ? "Nenhuma receita ainda" : "Nada encontrado"}
          description={
            props.recipes.length === 0
              ? "Uma receita soma os ingredientes e calcula o valor por porção. Informe o peso final preparado para ter também o valor por 100 g."
              : "Ajuste a busca ou os filtros."
          }
        >
          {props.recipes.length === 0 && (
            <Button
              onClick={() => {
                setEditingId(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Criar receita
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={allSelected}
              onCheckedChange={(checked) =>
                setSelected(checked ? new Set(filtered.map((r) => r.id)) : new Set())
              }
              aria-label="Selecionar todas as receitas visíveis"
            />
            Selecionar as {filtered.length} visíveis
          </label>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((recipe) => {
              const porcao = perServing(recipe.calc.totals, recipe.servings)[CORE_NUTRIENTS.energia];
              const minutos = totalMinutes(recipe.prepMinutes, recipe.cookMinutes);
              return (
                <Card
                  key={recipe.id}
                  className={cn(
                    "transition-colors hover:border-primary/40",
                    recipe.isArchived && "opacity-60",
                  )}
                >
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={selected.has(recipe.id)}
                        onCheckedChange={() => toggle(recipe.id)}
                        aria-label={`Selecionar ${recipe.name}`}
                        className="mt-0.5"
                      />
                      <button
                        type="button"
                        onClick={() => setDetailId(recipe.id)}
                        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <p className="truncate text-sm font-medium">{recipe.name}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {describeYield(recipe)}
                          {minutos !== null && ` · ${minutos} min`}
                        </p>
                      </button>
                      {recipe.isFavorite && (
                        <Star className="size-4 shrink-0 fill-current text-primary" />
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ps-6">
                      {porcao ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className="font-semibold tabular-nums">
                            {roundForDisplay(porcao.amount, 0).toLocaleString("pt-BR")} kcal
                          </span>
                          <span className="text-muted-foreground">
                            por {portionLabelOf(recipe)}
                          </span>
                          <TotalQualityBadge quality={porcao.quality} />
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Sem valor calculável ainda
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1 ps-6">
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
                      {recipe.totalWeightG === null && (
                        <Badge variant="outline" className="text-[10px]">
                          Sem peso final
                        </Badge>
                      )}
                      {recipe.categoryName && (
                        <Badge variant="secondary" className="text-[10px]">
                          {recipe.categoryName}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* ── Diálogos ── */}
      <RecipeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        recipe={editing}
        categories={props.categories}
        rawWeightG={editing?.calc.rawWeightG ?? null}
        rawWeightComplete={editing?.calc.rawWeightComplete}
        onSubmit={async (values) => {
          const result = await saveRecipe(values, editingId ?? undefined);
          if (result.ok) {
            toast.success(editingId ? "Receita salva." : "Receita criada. Agora adicione os ingredientes.");
            setFormOpen(false);
            if (!editingId) setDetailId(result.data.id);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível salvar.");
          }
        }}
      />

      <RecipeDetailSheet
        recipe={detail}
        nutrients={props.nutrients}
        foodNames={foodNames}
        pending={pending}
        onOpenChange={(open) => !open && setDetailId(null)}
        onEdit={() => {
          setEditingId(detail?.id ?? null);
          setFormOpen(true);
        }}
        onDuplicate={() =>
          startTransition(async () => {
            if (!detail) return;
            const result = await duplicateRecipe(detail.id);
            if (result.ok) {
              toast.success(
                `Criada “${result.data.name}”. A cópia não herda o histórico de uso da original.`,
              );
              setDetailId(result.data.id);
              router.refresh();
            } else {
              toast.error(result.error ?? "Não foi possível duplicar.");
            }
          })
        }
        onToggleFavorite={() =>
          detail &&
          run(() => setRecipeFavorite(detail.id, !detail.isFavorite), "Favorito atualizado.")
        }
        onToggleArchive={() =>
          detail &&
          run(
            () => setRecipeArchived(detail.id, !detail.isArchived),
            detail.isArchived ? "Receita desarquivada." : "Receita arquivada.",
          )
        }
        onDelete={() => {
          if (!detail) return;
          if (
            !confirm(
              `Excluir “${detail.name}”? O que já foi registrado no diário continua lá, com os valores congelados — só o vínculo com a receita se perde.`,
            )
          ) {
            return;
          }
          run(() => deleteRecipe(detail.id), "Receita excluída.");
          setDetailId(null);
        }}
        onAddIngredient={() => setIngredientFor(detail?.id ?? null)}
        onRemoveIngredient={(ingredientId) =>
          run(() => deleteRecipeIngredient(ingredientId), "Ingrediente removido.")
        }
        // 16-F: `reorderRecipeIngredients` existia e era testada desde a 16-C; faltava o
        // gatilho. A tela manda a ordem INTEIRA — a action recusa lista incompleta.
        onReorderIngredients={(orderedIds) =>
          detail &&
          run(
            () => reorderRecipeIngredients({ recipe_id: detail.id, ids: orderedIds }),
            "Ordem dos ingredientes atualizada.",
          )
        }
        onUploadPhoto={(file) => {
          if (!detail) return;
          // FormData: o BINÁRIO passa pelo servidor, que valida MIME e tamanho sobre o
          // arquivo real. O navegador não decide nada aqui.
          const formData = new FormData();
          formData.append("recipe_id", detail.id);
          formData.append("file", file);
          run(() => uploadRecipePhoto(formData), "Foto enviada.");
        }}
        onRemovePhoto={(attachmentId) =>
          run(() => deleteRecipePhoto(attachmentId), "Foto removida.")
        }
        onCreateTemplate={() =>
          startTransition(async () => {
            if (!detail) return;
            const result = await createTemplateFromRecipe(detail.id);
            if (result.ok) {
              toast.success(
                `Refeição-modelo “${result.data.name}” criada. Ela aponta para a receita: melhorar a receita melhora o modelo.`,
              );
              router.refresh();
            } else {
              toast.error(result.error ?? "Não foi possível criar a refeição-modelo.");
            }
          })
        }
      />

      <FoodPickerDialog
        open={ingredientFor !== null}
        onOpenChange={(open) => !open && setIngredientFor(null)}
        foods={props.foods}
        measures={measures}
        title="Adicionar ingrediente"
        description="A receita usa o catálogo como ele está hoje. O congelamento dos valores acontece só quando você registra o consumo."
        showOptional
        onConfirm={async (picked) => {
          const result = await saveRecipeIngredient({
            recipe_id: ingredientFor,
            food_id: picked.foodId,
            quantity: picked.quantity,
            measure_id: picked.measureId,
            is_optional: picked.isOptional,
            note: picked.notes,
          });
          if (result.ok) {
            toast.success("Ingrediente adicionado.");
            setIngredientFor(null);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível adicionar.");
          }
        }}
      />
    </div>
  );
}
