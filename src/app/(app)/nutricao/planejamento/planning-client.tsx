"use client";

/**
 * Fase 16-B — Dieta e Alimentação · Planejamento (cliente).
 *
 * ══ TRÊS DECISÕES DE INTERFACE QUE SÃO REGRA, NÃO ESTILO ══
 *
 * 1. EDITAR EM SÉRIE SEMPRE PERGUNTA O ESCOPO, e mostra QUANTAS refeições cada opção atinge
 *    antes de confirmar. Ninguém deveria descobrir depois que alterou seis semanas.
 *
 * 2. O PASSADO NÃO É TOCADO por nenhum escopo — nem "todo o modelo". O que estava planejado
 *    ontem é registro histórico, não rascunho.
 *
 * 3. APLICAR MODELO MOSTRA O IMPACTO ANTES (dias, refeições e itens que serão criados).
 *
 * O planejamento e o diário são tabelas separadas: nada nesta tela lê ou escreve consumo.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarPlus,
  CalendarRange,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Copy,
  LayoutGrid,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SeletorDeVisao } from "@/components/shared/seletor-de-visao";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { cn } from "@/lib/utils";
import { roundForDisplay, type NutrientTotal } from "@/lib/nutrition/calc";
import {
  addDaysIso,
  longDateLabel,
  relativeDayLabel,
  shortDateLabel,
  shortTime,
  startOfWeekIso,
  weekDays,
} from "@/lib/nutrition/calendar";
import {
  CORE_NUTRIENTS,
  PLANNING_VIEW_LABELS,
  PLANNING_VIEWS,
  WEEKDAY_SHORT_LABELS,
} from "@/lib/nutrition/constants";
import { sortMealsByTime, type PlannedFoodData } from "@/lib/nutrition/diary";
import { templateTotals, type TemplateCalcContext } from "@/lib/nutrition/meal-template";
import { describeCycle } from "@/lib/nutrition/plan-recurrence";
import type {
  FoodListItem,
  MealType,
  NutritionPlan,
  PlannedMeal,
} from "@/lib/nutrition/types";
import {
  applyPlanToPeriod,
  copyPlannedDay,
  deletePlannedMealInScope,
  duplicatePlannedWeek,
  deletePlannedMealItem,
  savePlannedMeal,
  savePlannedMealItem,
  saveNutritionPlan,
  updatePlannedMealInScope,
} from "@/lib/actions/nutrition-plans";
import { addRecipeToPlannedMeal } from "@/lib/actions/nutrition-meal-templates";
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";
import type { PickerMeasure } from "@/components/nutrition/food-picker-dialog";
import type { PickerRecipe } from "@/components/nutrition/recipe-picker-dialog";
import { TotalQualityBadge } from "@/components/nutrition/nutrient-value";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const FoodPickerDialog = dynamic(
  () => import("@/components/nutrition/food-picker-dialog").then((m) => m.FoodPickerDialog),
  { ssr: false },
);
const RecipePickerDialog = dynamic(
  () => import("@/components/nutrition/recipe-picker-dialog").then((m) => m.RecipePickerDialog),
  { ssr: false },
);
const ScheduleMealDialog = dynamic(
  () => import("@/components/nutrition/schedule-meal-dialog").then((m) => m.ScheduleMealDialog),
  { ssr: false },
);
const NewPlannedMealDialog = dynamic(
  () => import("./new-planned-meal-dialog").then((m) => m.NewPlannedMealDialog),
  { ssr: false },
);
const ScopeDialog = dynamic(
  () => import("./scope-dialog").then((m) => m.ScopeDialog),
  { ssr: false },
);
const ModelDaysSheet = dynamic(
  () => import("./model-days-sheet").then((m) => m.ModelDaysSheet),
  { ssr: false },
);
const ApplyPlanDialog = dynamic(
  () => import("./apply-plan-dialog").then((m) => m.ApplyPlanDialog),
  { ssr: false },
);
const PlanDialog = dynamic(
  () => import("./plan-dialog").then((m) => m.PlanDialog),
  { ssr: false },
);
const CopyDialog = dynamic(
  () => import("./copy-dialog").then((m) => m.CopyDialog),
  { ssr: false },
);

export type PlanningClientProps = {
  date: string;
  hoje: string;
  view: "dia" | "semana" | "modelos";
  meals: PlannedMeal[];
  weekMeals: PlannedMeal[];
  plans: NutritionPlan[];
  mealTypes: MealType[];
  foods: FoodListItem[];
  measures: [string, PickerMeasure[]][];
  foodData: [string, PlannedFoodData][];
  /** 16-C: receitas com o total já calculado no servidor. */
  recipes: PickerRecipe[];
  /** Fase 16-F — deep-link da busca global (`?plano=<id>`): abre os dias do modelo. */
  initialPlanId?: string | null;
};

export function PlanningClient(props: PlanningClientProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const measures = React.useMemo(() => new Map(props.measures), [props.measures]);
  const foodData = React.useMemo(() => new Map(props.foodData), [props.foodData]);
  const measureById = React.useMemo(
    () =>
      new Map(
        [...measures.values()]
          .flat()
          .map((m) => [m.id, { label: m.label, grams: m.grams, milliliters: m.milliliters }]),
      ),
    [measures],
  );

  const [pickerMealId, setPickerMealId] = React.useState<string | null>(null);
  const [recipeMealId, setRecipeMealId] = React.useState<string | null>(null);
  const [newMealOpen, setNewMealOpen] = React.useState(false);
  // A 16-B só expunha escopo na EXCLUSÃO; a 16-C expõe também na edição, que é o que
  // `updatePlannedMealInScope` (já existente e testada) sempre soube fazer.
  const [scopeDialog, setScopeDialog] = React.useState<{
    meal: PlannedMeal;
    action: "excluir" | "editar";
  } | null>(null);
  const [editPatch, setEditPatch] = React.useState<{ time: string; title: string }>({
    time: "",
    title: "",
  });
  const [applyOpen, setApplyOpen] = React.useState<NutritionPlan | null>(null);
  // Pendência da 16-B fechada aqui: montar os dias do modelo pela interface.
  const [daysPlanId, setDaysPlanId] = React.useState<string | null>(
    props.initialPlanId ?? null,
  );
  const [planDialog, setPlanDialog] = React.useState(false);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [scheduleFor, setScheduleFor] = React.useState<PlannedMeal | null>(null);
  const foodPickerDialogMontado = useLazyDialog(pickerMealId !== null);
  const recipePickerDialogMontado = useLazyDialog(recipeMealId !== null);
  const scheduleMealDialogMontado = useLazyDialog(scheduleFor !== null);
  const newPlannedMealDialogMontado = useLazyDialog(newMealOpen);
  const scopeDialogMontado = useLazyDialog(scopeDialog !== null);
  const modelDaysSheetMontado = useLazyDialog(daysPlanId !== null);
  const applyPlanDialogMontado = useLazyDialog(applyOpen !== null);
  const planDialogMontado = useLazyDialog(planDialog);
  const copyDialogMontado = useLazyDialog(copyOpen);

  function goTo(next: { date?: string; view?: string }) {
    const search = new URLSearchParams(params.toString());
    if (next.date) search.set("data", next.date);
    if (next.view) search.set("visao", next.view);
    router.push(`/nutricao/planejamento?${search.toString()}`);
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível concluir." }));
      }
    });
  }

  /**
   * Contexto de cálculo do planejado: alimentos, medidas e receitas.
   *
   * O plano usa o catálogo ATUAL (é intenção sobre o futuro), ao contrário do consumo, que sai
   * do snapshot. Alimentos e receitas somam pelo MESMO caminho — `templateTotals` — para o
   * planejamento e a refeição-modelo nunca discordarem sobre a mesma comida.
   */
  const calcContext: TemplateCalcContext = React.useMemo(
    () => ({
      foods: foodData,
      measures: measureById,
      recipes: new Map(
        props.recipes.map((recipe) => [
          recipe.id,
          {
            servings: recipe.servings,
            totalWeightG: recipe.totalWeightG,
            totals: recipe.totals,
          },
        ]),
      ),
    }),
    [foodData, measureById, props.recipes],
  );

  /** Total planejado de um conjunto de refeições, usando o catálogo ATUAL. */
  function totalsFor(meals: PlannedMeal[]): Record<string, NutrientTotal> {
    return templateTotals(
      meals.flatMap((meal) => meal.items),
      calcContext,
    ).totals;
  }

  const foodNames = React.useMemo(
    () => new Map(props.foods.map((food) => [food.id, food.name])),
    [props.foods],
  );
  const recipeNames = React.useMemo(
    () => new Map(props.recipes.map((recipe) => [recipe.id, recipe.name])),
    [props.recipes],
  );

  const dayMeals = React.useMemo(() => sortMealsByTime(props.meals), [props.meals]);
  const dayTotal = totalsFor(props.meals)[CORE_NUTRIENTS.energia];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Planejamento"
        description="Refeições planejadas por dia e por semana, com modelos reutilizáveis."
      >
        {props.view !== "modelos" && (
          <Button variant="outline" onClick={() => setCopyOpen(true)} disabled={pending}>
            <Copy className="size-4" />
            Copiar
          </Button>
        )}
        {props.view === "modelos" ? (
          <Button onClick={() => setPlanDialog(true)}>
            <Plus className="size-4" />
            Modelo
          </Button>
        ) : (
          <Button onClick={() => setNewMealOpen(true)}>
            <Plus className="size-4" />
            Refeição
          </Button>
        )}
      </PageHeader>

      {/* ── Navegação ── */}
      <div className="flex flex-wrap items-center gap-2">
        {props.view !== "modelos" && (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={props.view === "semana" ? "Semana anterior" : "Dia anterior"}
              onClick={() => goTo({ date: addDaysIso(props.date, props.view === "semana" ? -7 : -1) })}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={props.view === "semana" ? "Próxima semana" : "Próximo dia"}
              onClick={() => goTo({ date: addDaysIso(props.date, props.view === "semana" ? 7 : 1) })}
            >
              <ChevronRight className="size-4" />
            </Button>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {props.view === "semana"
                  ? `Semana de ${shortDateLabel(startOfWeekIso(props.date))}`
                  : relativeDayLabel(props.date, props.hoje)}
              </p>
              <p className="text-xs text-muted-foreground">{longDateLabel(props.date)}</p>
            </div>
          </>
        )}

        <div className="ms-auto flex flex-wrap items-center gap-2">
          {props.view !== "modelos" && (
            <Input
              type="date"
              value={props.date}
              onChange={(event) => event.target.value && goTo({ date: event.target.value })}
              className="w-40"
              aria-label="Escolher data"
            />
          )}
          <SeletorDeVisao
            rotulo="Visão do planejamento"
            visoes={PLANNING_VIEWS}
            rotulos={PLANNING_VIEW_LABELS}
            atual={props.view}
            aoEscolher={(view) => goTo({ view })}
          />
        </div>
      </div>

      {/* ── Conteúdo ── */}
      {props.view === "modelos" ? (
        <ModelsView
          plans={props.plans}
          pending={pending}
          onApply={setApplyOpen}
          onCreate={() => setPlanDialog(true)}
          onEditDays={(plan) => setDaysPlanId(plan.id)}
        />
      ) : props.view === "semana" ? (
        <WeekPlanning
          date={props.date}
          hoje={props.hoje}
          meals={props.weekMeals}
          totalsFor={totalsFor}
          onPickDay={(day) => goTo({ date: day, view: "dia" })}
        />
      ) : (
        <>
          {dayTotal && (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                <p className="text-sm text-muted-foreground">
                  Total planejado para o dia:{" "}
                  <strong className="text-foreground tabular-nums">
                    {roundForDisplay(dayTotal.amount, 0).toLocaleString("pt-BR")} kcal
                  </strong>
                </p>
                <TotalQualityBadge quality={dayTotal.quality} />
              </CardContent>
            </Card>
          )}

          {dayMeals.length === 0 ? (
            <EmptyState
              icon={CalendarRange}
              title="Nada planejado neste dia"
              description="Adicione refeições manualmente ou aplique um modelo de semana."
            >
              <Button onClick={() => setNewMealOpen(true)}>
                <Plus className="size-4" />
                Adicionar refeição
              </Button>
              <Button variant="outline" onClick={() => goTo({ view: "modelos" })}>
                Ver modelos
              </Button>
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {dayMeals.map((meal) => (
                <PlannedMealCard
                  onSchedule={() => setScheduleFor(meal)}
                  key={meal.id}
                  meal={meal}
                  foodNames={foodNames}
                  totals={totalsFor([meal])}
                  pending={pending}
                  recipeNames={recipeNames}
                  onAddItem={() => setPickerMealId(meal.id)}
                  onAddRecipe={() => setRecipeMealId(meal.id)}
                  onEdit={() => {
                    setEditPatch({
                      time: meal.plannedTime ? meal.plannedTime.slice(0, 5) : "",
                      title: meal.title ?? "",
                    });
                    setScopeDialog({ meal, action: "editar" });
                  }}
                  onDelete={() => setScopeDialog({ meal, action: "excluir" })}
                  onRemoveItem={(itemId) =>
                    run(() => deletePlannedMealItem(itemId), "Item removido do plano.")
                  }
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Diálogos ── */}
      {foodPickerDialogMontado && (
        <FoodPickerDialog
          open={pickerMealId !== null}
          onOpenChange={(open) => !open && setPickerMealId(null)}
          foods={props.foods}
          measures={measures}
          title="Planejar alimento"
          description="O plano usa o catálogo como ele está hoje. O congelamento dos valores acontece só quando você registra o consumo."
          showOptional
          onConfirm={async (picked) => {
            const result = await savePlannedMealItem({
              planned_meal_id: pickerMealId,
              food_id: picked.foodId,
              quantity: picked.quantity,
              measure_id: picked.measureId,
              is_optional: picked.isOptional,
              notes: picked.notes,
            });
            if (result.ok) {
              toast.success("Item planejado.");
              setPickerMealId(null);
              router.refresh();
            } else {
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível adicionar." }));
            }
          }}
        />
      )}

      {newPlannedMealDialogMontado && (
        <NewPlannedMealDialog
          open={newMealOpen}
          onOpenChange={setNewMealOpen}
          date={props.date}
          mealTypes={props.mealTypes}
          onConfirm={async (payload) => {
            const result = await savePlannedMeal(payload);
            if (result.ok) {
              toast.success("Refeição planejada.");
              setNewMealOpen(false);
              router.refresh();
            } else {
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível planejar." }));
            }
          }}
        />
      )}

      {/* 16-F — ponte OPCIONAL com a agenda: um bloco, para uma data, por clique. */}
      {scheduleMealDialogMontado && (
        <ScheduleMealDialog
          open={scheduleFor !== null}
          onOpenChange={(open) => !open && setScheduleFor(null)}
          defaultTitle={scheduleFor?.title || scheduleFor?.mealTypeName || "Refeição"}
          defaultDate={scheduleFor?.plannedDate ?? props.date}
          defaultTime={scheduleFor?.plannedTime ?? null}
        />
      )}

      {scopeDialogMontado && (
        <ScopeDialog
          target={scopeDialog}
          hoje={props.hoje}
          patch={editPatch}
          onPatchChange={setEditPatch}
          onOpenChange={(open) => !open && setScopeDialog(null)}
          onConfirm={async (scope) => {
            if (!scopeDialog) return;

            if (scopeDialog.action === "editar") {
              const result = await updatePlannedMealInScope(
                { planned_meal_id: scopeDialog.meal.id, scope },
                {
                  planned_time: editPatch.time || null,
                  title: editPatch.title.trim() || null,
                },
              );
              if (result.ok) {
                toast.success(
                  `${result.data.afetadas} refeição${result.data.afetadas > 1 ? "ões" : ""} atualizada${result.data.afetadas > 1 ? "s" : ""}. Nada do passado foi alterado.`,
                );
                setScopeDialog(null);
                router.refresh();
              } else {
                toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível salvar." }));
              }
              return;
            }

            const result = await deletePlannedMealInScope({
              planned_meal_id: scopeDialog.meal.id,
              scope,
            });
            if (result.ok) {
              toast.success(
                `${result.data.excluidas} refeição${result.data.excluidas > 1 ? "ões" : ""} excluída${result.data.excluidas > 1 ? "s" : ""}. Nada do passado foi alterado.`,
              );
              setScopeDialog(null);
              router.refresh();
            } else {
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível excluir." }));
            }
          }}
        />
      )}

      {modelDaysSheetMontado && (
        <ModelDaysSheet
          plan={props.plans.find((plan) => plan.id === daysPlanId) ?? null}
          mealTypes={props.mealTypes}
          foodNames={foodNames}
          recipeNames={recipeNames}
          pending={pending}
          onOpenChange={(open) => !open && setDaysPlanId(null)}
          onRun={run}
          onAddFood={(mealId) => setPickerMealId(mealId)}
          onAddRecipe={(mealId) => setRecipeMealId(mealId)}
        />
      )}

      {recipePickerDialogMontado && (
        <RecipePickerDialog
          open={recipeMealId !== null}
          onOpenChange={(open) => !open && setRecipeMealId(null)}
          recipes={props.recipes}
          title="Planejar receita"
          description="O plano aponta para a receita como ela está hoje. O congelamento acontece só no registro do consumo."
          onConfirm={async (picked) => {
            const result = await addRecipeToPlannedMeal({
              planned_meal_id: recipeMealId,
              recipe_id: picked.recipeId,
              quantity: picked.quantity,
              portion_unit: picked.portionUnit,
              notes: picked.notes,
            });
            if (result.ok) {
              toast.success("Receita planejada.");
              setRecipeMealId(null);
              router.refresh();
            } else {
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível planejar." }));
            }
          }}
        />
      )}

      {applyPlanDialogMontado && (
        <ApplyPlanDialog
          plan={applyOpen}
          hoje={props.hoje}
          onOpenChange={(open) => !open && setApplyOpen(null)}
          onConfirm={async (payload) => {
            const result = await applyPlanToPeriod(payload);
            if (result.ok) {
              toast.success(
                `${result.data.refeicoes} refeições e ${result.data.itens} itens criados em ${result.data.dias} dias.`,
              );
              setApplyOpen(null);
              router.refresh();
            } else {
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível aplicar o modelo." }));
            }
          }}
        />
      )}

      {planDialogMontado && (
        <PlanDialog
          open={planDialog}
          onOpenChange={setPlanDialog}
          hoje={props.hoje}
          onConfirm={async (payload) => {
            const result = await saveNutritionPlan(payload);
            if (result.ok) {
              toast.success("Modelo criado. Agora monte os dias dele.");
              setPlanDialog(false);
              router.refresh();
            } else {
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível criar o modelo." }));
            }
          }}
        />
      )}

      {copyDialogMontado && (
        <CopyDialog
          open={copyOpen}
          onOpenChange={setCopyOpen}
          date={props.date}
          view={props.view === "semana" ? "semana" : "dia"}
          onConfirm={async (payload) => {
            const result =
              props.view === "semana"
                ? await duplicatePlannedWeek(payload)
                : await copyPlannedDay(payload);
            if (result.ok) {
              toast.success(
                `${result.data.refeicoes} refeições e ${result.data.itens} itens copiados.`,
              );
              setCopyOpen(false);
              router.refresh();
            } else {
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível copiar." }));
            }
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════ Refeição planejada ═══════════════════════════ */

function PlannedMealCard({
  meal,
  foodNames,
  recipeNames,
  totals,
  pending,
  onAddItem,
  onAddRecipe,
  onEdit,
  onDelete,
  onRemoveItem,
  onSchedule,
}: {
  meal: PlannedMeal;
  foodNames: Map<string, string>;
  recipeNames: Map<string, string>;
  totals: Record<string, NutrientTotal>;
  pending: boolean;
  onAddItem: () => void;
  onAddRecipe: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRemoveItem: (itemId: string) => void;
  /** 16-F — ponte OPCIONAL com a agenda. Nenhuma refeição vira evento sozinha. */
  onSchedule: () => void;
}) {
  const energia = totals[CORE_NUTRIENTS.energia];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {meal.mealTypeIcon && <span aria-hidden>{meal.mealTypeIcon}</span>}
            <span className="truncate">{meal.title || meal.mealTypeName}</span>
            {meal.planDayId && (
              <Badge variant="secondary" className="text-[10px]">
                Do modelo
              </Badge>
            )}
          </CardTitle>
          {meal.plannedTime && (
            <p className="mt-1 text-xs text-muted-foreground">
              Previsto para {shortTime(meal.plannedTime)}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {energia && (
            <span className="hidden items-center gap-1.5 text-sm font-semibold tabular-nums sm:inline-flex">
              {roundForDisplay(energia.amount, 0).toLocaleString("pt-BR")} kcal
              <TotalQualityBadge quality={energia.quality} />
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Criar bloco na agenda para esta refeição"
            title="Criar bloco na agenda"
            disabled={pending}
            onClick={onSchedule}
          >
            <CalendarPlus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Editar refeição planejada"
            disabled={pending}
            onClick={onEdit}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Excluir refeição planejada"
            disabled={pending}
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {meal.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum item planejado nesta refeição.</p>
        ) : (
          <ul className="divide-y">
            {meal.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">
                    {item.customLabel ??
                      (item.itemKind === "receita"
                        ? (item.recipeId ? recipeNames.get(item.recipeId) : null) ?? "Receita removida"
                        : item.foodId
                          ? (foodNames.get(item.foodId) ?? "Alimento removido do catálogo")
                          : "Item")}
                    {item.itemKind === "receita" && (
                      <Badge variant="secondary" className="ms-2 text-[10px]">
                        Receita
                      </Badge>
                    )}
                    {item.isOptional && (
                      <Badge variant="outline" className="ms-2 text-[10px]">
                        Opcional
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity === null
                      ? "Sem quantidade definida — não entra no cálculo"
                      : `${item.quantity.toLocaleString("pt-BR")}${item.measureLabel ? ` × ${item.measureLabel}` : ""}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Remover item"
                  disabled={pending}
                  onClick={() => onRemoveItem(item.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onAddItem} disabled={pending}>
            <Plus className="size-4" />
            Alimento
          </Button>
          <Button variant="outline" size="sm" onClick={onAddRecipe} disabled={pending}>
            <ChefHat className="size-4" />
            Receita
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════ Semana ═══════════════════════════ */

function WeekPlanning({
  date,
  hoje,
  meals,
  totalsFor,
  onPickDay,
}: {
  date: string;
  hoje: string;
  meals: PlannedMeal[];
  totalsFor: (meals: PlannedMeal[]) => Record<string, NutrientTotal>;
  onPickDay: (day: string) => void;
}) {
  const days = weekDays(date);
  const byDay = new Map<string, PlannedMeal[]>();
  for (const meal of meals) {
    if (!meal.plannedDate) continue;
    const list = byDay.get(meal.plannedDate);
    if (list) list.push(meal);
    else byDay.set(meal.plannedDate, [meal]);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {days.map((day, index) => {
        const dayMeals = sortMealsByTime(byDay.get(day) ?? []);
        const total = totalsFor(dayMeals)[CORE_NUTRIENTS.energia];
        return (
          <button
            key={day}
            type="button"
            onClick={() => onPickDay(day)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              day === hoje && "border-primary/40 bg-primary/5",
            )}
          >
            <p className="text-xs font-medium">{WEEKDAY_SHORT_LABELS[(index + 1) % 7]}</p>
            <p className="text-[11px] text-muted-foreground">{shortDateLabel(day)}</p>
            <p className="mt-2 text-sm font-semibold tabular-nums">
              {total ? `${roundForDisplay(total.amount, 0).toLocaleString("pt-BR")} kcal` : "—"}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {dayMeals.slice(0, 4).map((meal) => (
                <li key={meal.id} className="truncate text-[11px] text-muted-foreground">
                  {meal.mealTypeIcon ?? "•"} {meal.title || meal.mealTypeName}
                </li>
              ))}
              {dayMeals.length > 4 && (
                <li className="text-[11px] text-muted-foreground">
                  + {dayMeals.length - 4} refeições
                </li>
              )}
              {dayMeals.length === 0 && (
                <li className="text-[11px] text-muted-foreground">Sem planejamento</li>
              )}
            </ul>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════ Modelos ═══════════════════════════ */

function ModelsView({
  plans,
  pending,
  onApply,
  onCreate,
  onEditDays,
}: {
  plans: NutritionPlan[];
  pending: boolean;
  onApply: (plan: NutritionPlan) => void;
  onCreate: () => void;
  onEditDays: (plan: NutritionPlan) => void;
}) {
  if (plans.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        title="Nenhum modelo de semana"
        description="Um modelo descreve a sua semana padrão e pode ser aplicado a qualquer período. Aplicar cria refeições com data — o modelo nunca reescreve o que já passou."
      >
        <Button onClick={onCreate}>
          <Plus className="size-4" />
          Criar modelo
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {plans.map((plan) => {
        const refeicoes = plan.days.reduce((sum, day) => sum + day.meals.length, 0);
        return (
          <Card key={plan.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {plan.name}
                {plan.isDefault && (
                  <Badge variant="secondary" className="text-[10px]">
                    Padrão
                  </Badge>
                )}
                {!plan.isActive && (
                  <Badge variant="outline" className="text-[10px]">
                    Inativo
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{describeCycle(plan)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.description && (
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {plan.days.length} dia{plan.days.length === 1 ? "" : "s"} · {refeicoes} refeição
                {refeicoes === 1 ? "" : "ões"}
              </p>

              {plan.days.length > 0 && (
                <ul className="space-y-1">
                  {plan.days.map((day) => (
                    <li key={day.id} className="flex items-baseline gap-2 text-xs">
                      <span className="font-medium">{WEEKDAY_SHORT_LABELS[day.weekday]}</span>
                      {plan.cycleWeeks > 1 && (
                        <span className="text-muted-foreground">S{day.weekIndex + 1}</span>
                      )}
                      <span className="text-muted-foreground">
                        {day.meals.length} refeição{day.meals.length === 1 ? "" : "ões"}
                        {day.dayKind ? ` · ${day.dayKind}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={pending} onClick={() => onEditDays(plan)}>
                  <Pencil className="size-4" />
                  Montar dias
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || plan.days.length === 0}
                  onClick={() => onApply(plan)}
                >
                  <CalendarRange className="size-4" />
                  Aplicar a um período
                </Button>
              </div>
              {plan.days.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Monte os dias do modelo antes de aplicá-lo.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════ Diálogos ═══════════════════════════ */

/* ═══════════════════════════ Montar os dias do modelo ═══════════════════════════ */

/** Linha compacta para acrescentar uma refeição a um dia do modelo. */
