"use client";

/**
 * Fase 16-C — Dieta e Alimentação · Refeições-modelo (cliente).
 *
 * Um modelo reúne ALIMENTOS e RECEITAS e pode ir para o dia (diário) ou para uma data do
 * planejamento com um clique.
 *
 * ══ DUAS COISAS QUE A TELA PRECISA DIZER COM TODAS AS LETRAS ══
 *
 * 1. ADICIONAR O MESMO MODELO DUAS VEZES NÃO DUPLICA. Quando o modelo já está na refeição, a
 *    ação não grava nada e avisa — repetir de propósito exige marcar a opção.
 *
 * 2. O TOTAL PODE SER PARCIAL. Item livre, alimento sem nutriente analisado ou receita
 *    incompleta deixam o selo aparecer. O número é o mínimo conhecido.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChefHat, Copy, Plus, Search, Star, Trash2, Utensils, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { formatNutrientAmount, roundForDisplay } from "@/lib/nutrition/calc";
import {
  CORE_NUTRIENTS,
  MACRO_ORDER,
  TEMPLATE_REGISTER_MODE_HINTS,
  TEMPLATE_REGISTER_MODE_LABELS,
  TEMPLATE_REGISTER_MODES,
  type TemplateRegisterMode,
} from "@/lib/nutrition/constants";
import { normalizeText } from "@/lib/nutrition/filters";
import { TEMPLATE_SKIP_MESSAGES } from "@/lib/nutrition/meal-template";
import { describeRecipePortion } from "@/lib/nutrition/recipe";
import { formatAmount } from "@/lib/nutrition/units";
import { longDateLabel, shortTime } from "@/lib/nutrition/calendar";
import type {
  FoodListItem,
  MealType,
  NutrientDefinition,
  RecipeCategory,
} from "@/lib/nutrition/types";
import type { MealTemplateWithTotals } from "@/lib/nutrition/recipe-queries";
import {
  addMealTemplateToPlan,
  bulkMealTemplateAction,
  deleteMealTemplate,
  deleteMealTemplateItem,
  duplicateMealTemplate,
  saveMealTemplate,
  saveMealTemplateItem,
  setMealTemplateArchived,
  setMealTemplateFavorite,
} from "@/lib/actions/nutrition-meal-templates";
import {
  FoodPickerDialog,
  type PickerMeasure,
} from "@/components/nutrition/food-picker-dialog";
import {
  RecipePickerDialog,
  type PickerRecipe,
} from "@/components/nutrition/recipe-picker-dialog";
import { TotalQualityBadge } from "@/components/nutrition/nutrient-value";

export type MealTemplatesClientProps = {
  hoje: string;
  templates: MealTemplateWithTotals[];
  recipes: PickerRecipe[];
  categories: RecipeCategory[];
  mealTypes: MealType[];
  foods: FoodListItem[];
  measures: [string, PickerMeasure[]][];
  nutrients: Record<string, NutrientDefinition>;
};

export function MealTemplatesClient(props: MealTemplatesClientProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const measures = React.useMemo(() => new Map(props.measures), [props.measures]);
  const foodNames = React.useMemo(
    () => new Map(props.foods.map((food) => [food.id, food.name])),
    [props.foods],
  );
  const recipeNames = React.useMemo(
    () => new Map(props.recipes.map((recipe) => [recipe.id, recipe.name])),
    [props.recipes],
  );

  const [search, setSearch] = React.useState("");
  const [showArchived, setShowArchived] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [foodPickerFor, setFoodPickerFor] = React.useState<string | null>(null);
  const [recipePickerFor, setRecipePickerFor] = React.useState<string | null>(null);
  const [freeItemFor, setFreeItemFor] = React.useState<string | null>(null);
  const [planFor, setPlanFor] = React.useState<MealTemplateWithTotals | null>(null);

  const detail = props.templates.find((template) => template.id === detailId) ?? null;
  const editing = props.templates.find((template) => template.id === editingId) ?? null;

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
    return props.templates
      .filter((template) => {
        if (!showArchived && template.isArchived) return false;
        if (!term) return true;
        return normalizeText(`${template.name} ${template.description ?? ""} ${template.tags.join(" ")}`).includes(term);
      })
      .sort(
        (a, b) =>
          Number(b.isFavorite) - Number(a.isFavorite) || a.name.localeCompare(b.name, "pt-BR"),
      );
  }, [props.templates, search, showArchived]);

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
        `Excluir ${ids.length} refeição-modelo? O que já foi registrado no diário continua lá. Arquivar mantém tudo e tira da lista.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await bulkMealTemplateAction(ids, action);
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível aplicar a ação.");
        return;
      }
      const { afetadas, ignoradas, motivos } = result.data;
      toast.success(
        `${afetadas} atualizada${afetadas === 1 ? "" : "s"}.` +
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
        title="Refeições-modelo"
        description="Conjuntos reutilizáveis de alimentos e receitas, prontos para lançar no dia ou na semana."
      >
        <Button
          onClick={() => {
            setEditingId(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Refeição-modelo
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar refeição-modelo"
            className="pl-9"
            aria-label="Buscar refeição-modelo"
          />
        </div>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
        >
          Arquivadas
        </Button>
      </div>

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
          icon={Utensils}
          title={props.templates.length === 0 ? "Nenhuma refeição-modelo" : "Nada encontrado"}
          description={
            props.templates.length === 0
              ? "Monte o seu café da manhã de sempre uma vez e lance no diário com um clique. Um modelo aceita alimentos e receitas."
              : "Ajuste a busca."
          }
        >
          {props.templates.length === 0 && (
            <Button
              onClick={() => {
                setEditingId(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Criar refeição-modelo
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((template) => {
            const energia = template.calc.totals[CORE_NUTRIENTS.energia];
            return (
              <Card key={template.id} className={cn(template.isArchived && "opacity-60")}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={selected.has(template.id)}
                      onCheckedChange={() => toggle(template.id)}
                      aria-label={`Selecionar ${template.name}`}
                      className="mt-0.5"
                    />
                    <button
                      type="button"
                      onClick={() => setDetailId(template.id)}
                      className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <p className="truncate text-sm font-medium">{template.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {template.items.length} item{template.items.length === 1 ? "" : "s"}
                        {template.mealTypeName && ` · ${template.mealTypeName}`}
                        {template.suggestedTime && ` · ${shortTime(template.suggestedTime)}`}
                      </p>
                    </button>
                    {template.isFavorite && (
                      <Star className="size-4 shrink-0 fill-current text-primary" />
                    )}
                  </div>

                  <div className="ps-6">
                    {energia ? (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="font-semibold tabular-nums">
                          {roundForDisplay(energia.amount, 0).toLocaleString("pt-BR")} kcal
                        </span>
                        <TotalQualityBadge quality={energia.quality} />
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Sem valor calculável</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 ps-6 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending || template.items.length === 0}
                      onClick={() => setPlanFor(template)}
                    >
                      <Calendar className="size-4" />
                      Planejar
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                          Mais
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-52">
                        <DropdownMenuItem onClick={() => setDetailId(template.id)}>
                          Ver itens
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            run(
                              () => setMealTemplateFavorite(template.id, !template.isFavorite),
                              "Favorito atualizado.",
                            )
                          }
                        >
                          {template.isFavorite ? "Desfavoritar" : "Favoritar"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            startTransition(async () => {
                              const result = await duplicateMealTemplate(template.id);
                              if (result.ok) {
                                toast.success(
                                  `Criada “${result.data.name}”. A cópia não herda o histórico.`,
                                );
                                router.refresh();
                              } else {
                                toast.error(result.error ?? "Não foi possível duplicar.");
                              }
                            })
                          }
                        >
                          <Copy className="size-4" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            run(
                              () => setMealTemplateArchived(template.id, !template.isArchived),
                              template.isArchived ? "Desarquivada." : "Arquivada.",
                            )
                          }
                        >
                          {template.isArchived ? "Desarquivar" : "Arquivar"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => {
                            if (
                              !confirm(
                                `Excluir “${template.name}”? O que já foi registrado no diário continua lá.`,
                              )
                            ) {
                              return;
                            }
                            run(() => deleteMealTemplate(template.id), "Refeição-modelo excluída.");
                          }}
                        >
                          <Trash2 className="size-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Detalhe ── */}
      <Sheet open={detail !== null} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6 text-left">{detail.name}</SheetTitle>
              </SheetHeader>

              <div className="space-y-4 px-4 pb-8">
                {detail.description && (
                  <p className="text-sm text-muted-foreground">{detail.description}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(detail.id);
                      setFormOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setFoodPickerFor(detail.id)}>
                    <Plus className="size-4" />
                    Alimento
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRecipePickerFor(detail.id)}>
                    <ChefHat className="size-4" />
                    Receita
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setFreeItemFor(detail.id)}>
                    Item livre
                  </Button>
                </div>

                {detail.items.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nenhum item ainda.
                  </p>
                ) : (
                  <ul className="divide-y rounded-lg border">
                    {detail.items.map((item) => {
                      const skip = detail.calc.skipped.find((s) => s.id === item.id);
                      const label =
                        item.itemKind === "receita"
                          ? (item.recipeId ? recipeNames.get(item.recipeId) : null) ?? "Receita removida"
                          : item.itemKind === "alimento"
                            ? (item.foodId ? foodNames.get(item.foodId) : null) ??
                              "Alimento removido do catálogo"
                            : (item.customLabel ?? "Item");
                      return (
                        <li key={item.id} className="flex items-start justify-between gap-3 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm">
                              {label}
                              {item.isOptional && (
                                <Badge variant="outline" className="ms-2 text-[10px]">
                                  Opcional
                                </Badge>
                              )}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {item.quantity === null
                                ? "Sem quantidade"
                                : item.itemKind === "receita"
                                  ? describeRecipePortion(
                                      { servingLabel: null },
                                      item.quantity,
                                      item.portionUnit ?? "porcao",
                                    )
                                  : `${formatAmount(item.quantity)}${item.measureLabel ? ` × ${item.measureLabel}` : ""}`}
                            </p>
                            {skip && (
                              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                                {TEMPLATE_SKIP_MESSAGES[skip.reason]}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0"
                            aria-label={`Remover ${label}`}
                            disabled={pending}
                            onClick={() =>
                              run(() => deleteMealTemplateItem(item.id), "Item removido.")
                            }
                          >
                            <X className="size-3.5" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {Object.keys(detail.calc.totals).length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3">
                    {MACRO_ORDER.filter((code) => detail.calc.totals[code]).map((code) => {
                      const definition = props.nutrients[code];
                      const total = detail.calc.totals[code];
                      return (
                        <span key={code} className="inline-flex items-baseline gap-1 text-xs">
                          <span className="text-muted-foreground">
                            {definition?.shortName ?? definition?.name ?? code}
                          </span>
                          <span className="font-medium tabular-nums">
                            {definition
                              ? `${formatNutrientAmount(total.amount, definition)} ${definition.unit}`
                              : roundForDisplay(total.amount, 1)}
                          </span>
                          <TotalQualityBadge quality={total.quality} />
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Diálogos ── */}
      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editing}
        categories={props.categories}
        mealTypes={props.mealTypes}
        onSubmit={async (values) => {
          const result = await saveMealTemplate(values, editingId ?? undefined);
          if (result.ok) {
            toast.success(editingId ? "Salva." : "Criada. Agora adicione os itens.");
            setFormOpen(false);
            if (!editingId) setDetailId(result.data.id);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível salvar.");
          }
        }}
      />

      <FoodPickerDialog
        open={foodPickerFor !== null}
        onOpenChange={(open) => !open && setFoodPickerFor(null)}
        foods={props.foods}
        measures={measures}
        title="Adicionar alimento ao modelo"
        showOptional
        onConfirm={async (picked) => {
          const result = await saveMealTemplateItem({
            template_id: foodPickerFor,
            item_kind: "alimento",
            food_id: picked.foodId,
            quantity: picked.quantity,
            measure_id: picked.measureId,
            is_optional: picked.isOptional,
            notes: picked.notes,
          });
          if (result.ok) {
            toast.success("Item adicionado.");
            setFoodPickerFor(null);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível adicionar.");
          }
        }}
      />

      <RecipePickerDialog
        open={recipePickerFor !== null}
        onOpenChange={(open) => !open && setRecipePickerFor(null)}
        recipes={props.recipes}
        title="Adicionar receita ao modelo"
        description="O modelo aponta para a receita: melhorar a receita melhora o modelo."
        onConfirm={async (picked) => {
          const result = await saveMealTemplateItem({
            template_id: recipePickerFor,
            item_kind: "receita",
            recipe_id: picked.recipeId,
            quantity: picked.quantity,
            portion_unit: picked.portionUnit,
            notes: picked.notes,
          });
          if (result.ok) {
            toast.success("Receita adicionada ao modelo.");
            setRecipePickerFor(null);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível adicionar.");
          }
        }}
      />

      <FreeItemDialog
        open={freeItemFor !== null}
        onOpenChange={(open) => !open && setFreeItemFor(null)}
        onConfirm={async (label) => {
          const result = await saveMealTemplateItem({
            template_id: freeItemFor,
            item_kind: "livre",
            custom_label: label,
          });
          if (result.ok) {
            toast.success("Item livre adicionado. Ele não entra no cálculo.");
            setFreeItemFor(null);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível adicionar.");
          }
        }}
      />

      <PlanTemplateDialog
        template={planFor}
        hoje={props.hoje}
        mealTypes={props.mealTypes}
        onOpenChange={(open) => !open && setPlanFor(null)}
        onConfirm={async (payload) => {
          const result = await addMealTemplateToPlan(payload);
          if (result.ok) {
            toast.success(`Refeição planejada com ${result.data.itens} item(ns).`);
            setPlanFor(null);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível planejar.");
          }
        }}
      />
    </div>
  );
}

/* ═══════════════════════════ Diálogos ═══════════════════════════ */

function TemplateFormDialog({
  open,
  onOpenChange,
  template,
  categories,
  mealTypes,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: MealTemplateWithTotals | null;
  categories: RecipeCategory[];
  mealTypes: MealType[];
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [mealTypeId, setMealTypeId] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [time, setTime] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const seen = `${open}:${template?.id ?? "novo"}`;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    if (open) {
      setName(template?.name ?? "");
      setDescription(template?.description ?? "");
      setMealTypeId(template?.mealTypeId ?? "");
      setCategoryId(template?.categoryId ?? "");
      setTime(template?.suggestedTime ? template.suggestedTime.slice(0, 5) : "");
      setNotes(template?.notes ?? "");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{template ? "Editar refeição-modelo" : "Nova refeição-modelo"}</DialogTitle>
          <DialogDescription>
            Os itens (alimentos e receitas) são adicionados depois de salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Nome</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: café da manhã de sempre"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-description">Descrição (opcional)</Label>
            <Input
              id="template-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="template-meal-type">Tipo de refeição</Label>
              <select
                id="template-meal-type"
                value={mealTypeId}
                onChange={(event) => setMealTypeId(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Não definido</option>
                {mealTypes
                  .filter((type) => type.isActive)
                  .map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.icon ? `${type.icon} ` : ""}
                      {type.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template-time">Horário sugerido</Label>
              <Input
                id="template-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-category">Categoria</Label>
            <select
              id="template-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Sem categoria</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="template-notes">Observações</Label>
            <Textarea
              id="template-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              await onSubmit({
                name: name.trim(),
                description: description || undefined,
                meal_type_id: mealTypeId || undefined,
                category_id: categoryId || undefined,
                suggested_time: time || undefined,
                notes: notes || undefined,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : template ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreeItemDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setLabel("");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Item livre</DialogTitle>
          <DialogDescription>
            Para o que faz parte da refeição mas não tem valor nutricional cadastrado. O item
            aparece na lista e deixa o total do modelo marcado como parcial — em vez de fingir
            que não existe.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="free-item">Descrição</Label>
          <Input
            id="free-item"
            autoFocus
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ex.: café preto sem açúcar"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!label.trim() || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm(label.trim());
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanTemplateDialog({
  template,
  hoje,
  mealTypes,
  onOpenChange,
  onConfirm,
}: {
  template: MealTemplateWithTotals | null;
  hoje: string;
  mealTypes: MealType[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [date, setDate] = React.useState(hoje);
  const [mealTypeId, setMealTypeId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const seen = template?.id ?? null;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    setDate(hoje);
    setMealTypeId(template?.mealTypeId ?? "");
    setSaving(false);
  }

  return (
    <Dialog open={template !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planejar “{template?.name}”</DialogTitle>
          <DialogDescription>
            Os itens do modelo são copiados para o planejamento da data escolhida. Editar o
            modelo depois não altera o que já foi planejado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plan-date">Data</Label>
            <Input
              id="plan-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">{longDateLabel(date)}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-meal-type">Tipo de refeição</Label>
            <select
              id="plan-meal-type"
              value={mealTypeId}
              onChange={(event) => setMealTypeId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Escolha…</option>
              {mealTypes
                .filter((type) => type.isActive)
                .map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.icon ? `${type.icon} ` : ""}
                    {type.name}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!date || !mealTypeId || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                template_id: template?.id,
                planned_date: date,
                meal_type_id: mealTypeId,
              });
              setSaving(false);
            }}
          >
            {saving ? "Planejando…" : "Planejar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Exportado para o diário reusar os rótulos dos modos de registro. */
export const TEMPLATE_MODE_OPTIONS = TEMPLATE_REGISTER_MODES.map((mode) => ({
  value: mode as TemplateRegisterMode,
  label: TEMPLATE_REGISTER_MODE_LABELS[mode],
  hint: TEMPLATE_REGISTER_MODE_HINTS[mode],
}));

/** Interruptor reutilizável de "repetir mesmo assim" (usado no diário). */
export function ForceSwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span>
        <span className="text-sm font-medium">Adicionar mesmo assim</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          Este modelo já foi registrado nesta refeição. Marque só se você comeu de novo.
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
