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
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Copy,
  LayoutGrid,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { roundForDisplay, sumNutrients, type NutrientTotal } from "@/lib/nutrition/calc";
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
  PLAN_EDIT_SCOPES,
  PLAN_EDIT_SCOPE_HINTS,
  PLAN_EDIT_SCOPE_LABELS,
  WEEKDAY_SHORT_LABELS,
  type PlanEditScope,
} from "@/lib/nutrition/constants";
import { plannedItemBag, sortMealsByTime, type PlannedFoodData } from "@/lib/nutrition/diary";
import { countMaterialization, describeCycle } from "@/lib/nutrition/plan-recurrence";
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
} from "@/lib/actions/nutrition-plans";
import {
  FoodPickerDialog,
  type PickerMeasure,
} from "@/components/nutrition/food-picker-dialog";
import { TotalQualityBadge } from "@/components/nutrition/nutrient-value";

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
  const [newMealOpen, setNewMealOpen] = React.useState(false);
  const [scopeDialog, setScopeDialog] = React.useState<{ meal: PlannedMeal; action: "excluir" } | null>(null);
  const [applyOpen, setApplyOpen] = React.useState<NutritionPlan | null>(null);
  const [planDialog, setPlanDialog] = React.useState(false);
  const [copyOpen, setCopyOpen] = React.useState(false);

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
        toast.error(result.error ?? "Não foi possível concluir.");
      }
    });
  }

  /** Total planejado de um conjunto de refeições, usando o catálogo ATUAL. */
  function totalsFor(meals: PlannedMeal[]): Record<string, NutrientTotal> {
    return sumNutrients(
      meals.flatMap((meal) =>
        meal.items.map((item) =>
          plannedItemBag(
            item,
            item.foodId ? (foodData.get(item.foodId) ?? null) : null,
            item.measureId ? (measureById.get(item.measureId) ?? null) : null,
          ),
        ),
      ),
    );
  }

  const foodNames = React.useMemo(
    () => new Map(props.foods.map((food) => [food.id, food.name])),
    [props.foods],
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
          <div className="flex rounded-lg border p-0.5">
            {(["dia", "semana", "modelos"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => goTo({ view })}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium capitalize transition-colors",
                  props.view === view
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {view}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Conteúdo ── */}
      {props.view === "modelos" ? (
        <ModelsView
          plans={props.plans}
          pending={pending}
          onApply={setApplyOpen}
          onCreate={() => setPlanDialog(true)}
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
                  key={meal.id}
                  meal={meal}
                  foodNames={foodNames}
                  totals={totalsFor([meal])}
                  pending={pending}
                  onAddItem={() => setPickerMealId(meal.id)}
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
            toast.error(result.error ?? "Não foi possível adicionar.");
          }
        }}
      />

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
            toast.error(result.error ?? "Não foi possível planejar.");
          }
        }}
      />

      <ScopeDialog
        target={scopeDialog}
        hoje={props.hoje}
        onOpenChange={(open) => !open && setScopeDialog(null)}
        onConfirm={async (scope) => {
          if (!scopeDialog) return;
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
            toast.error(result.error ?? "Não foi possível excluir.");
          }
        }}
      />

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
            toast.error(result.error ?? "Não foi possível aplicar o modelo.");
          }
        }}
      />

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
            toast.error(result.error ?? "Não foi possível criar o modelo.");
          }
        }}
      />

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
            toast.error(result.error ?? "Não foi possível copiar.");
          }
        }}
      />
    </div>
  );
}

/* ═══════════════════════════ Refeição planejada ═══════════════════════════ */

function PlannedMealCard({
  meal,
  foodNames,
  totals,
  pending,
  onAddItem,
  onDelete,
  onRemoveItem,
}: {
  meal: PlannedMeal;
  foodNames: Map<string, string>;
  totals: Record<string, NutrientTotal>;
  pending: boolean;
  onAddItem: () => void;
  onDelete: () => void;
  onRemoveItem: (itemId: string) => void;
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
                      (item.foodId ? (foodNames.get(item.foodId) ?? "Alimento removido do catálogo") : "Item")}
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

        <Button variant="outline" size="sm" onClick={onAddItem} disabled={pending}>
          <Plus className="size-4" />
          Item
        </Button>
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
}: {
  plans: NutritionPlan[];
  pending: boolean;
  onApply: (plan: NutritionPlan) => void;
  onCreate: () => void;
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

              <Button
                size="sm"
                variant="outline"
                disabled={pending || plan.days.length === 0}
                onClick={() => onApply(plan)}
              >
                <CalendarRange className="size-4" />
                Aplicar a um período
              </Button>
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

function NewPlannedMealDialog({
  open,
  onOpenChange,
  date,
  mealTypes,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  mealTypes: MealType[];
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const active = mealTypes.filter((type) => type.isActive);
  const [mealTypeId, setMealTypeId] = React.useState(active[0]?.id ?? "");
  const [time, setTime] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      const first = active[0];
      setMealTypeId(first?.id ?? "");
      setTime(first?.defaultTime ? first.defaultTime.slice(0, 5) : "");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Planejar refeição</DialogTitle>
          <DialogDescription>Em {longDateLabel(date)}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="planned-type">Tipo</Label>
            <select
              id="planned-type"
              value={mealTypeId}
              onChange={(event) => {
                setMealTypeId(event.target.value);
                const type = active.find((t) => t.id === event.target.value);
                setTime(type?.defaultTime ? type.defaultTime.slice(0, 5) : "");
              }}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {active.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.icon ? `${type.icon} ` : ""}
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="planned-time">Horário previsto</Label>
            <Input
              id="planned-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!mealTypeId || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                planned_date: date,
                meal_type_id: mealTypeId,
                planned_time: time || null,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Planejar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Escolha do escopo. Mostra o que cada opção significa em texto — o número exato de
 * refeições atingidas depende da série inteira e é resolvido no servidor pela função pura.
 */
function ScopeDialog({
  target,
  hoje,
  onOpenChange,
  onConfirm,
}: {
  target: { meal: PlannedMeal; action: "excluir" } | null;
  hoje: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: PlanEditScope) => Promise<void>;
}) {
  const [scope, setScope] = React.useState<PlanEditScope>("somente_este_dia");
  const [saving, setSaving] = React.useState(false);

  const [lastId, setLastId] = React.useState<string | null>(target?.meal.id ?? null);
  if ((target?.meal.id ?? null) !== lastId) {
    setLastId(target?.meal.id ?? null);
    setScope("somente_este_dia");
    setSaving(false);
  }

  const isSeries = Boolean(target?.meal.planDayId);

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir refeição planejada</DialogTitle>
          <DialogDescription>
            {isSeries
              ? "Esta refeição veio de um modelo. Escolha até onde a exclusão deve chegar — datas passadas nunca são alteradas."
              : "Esta refeição é avulsa, então só ela será excluída."}
          </DialogDescription>
        </DialogHeader>

        {isSeries && (
          <div className="space-y-2">
            {PLAN_EDIT_SCOPES.map((option) => (
              <label
                key={option}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  scope === option ? "border-primary/40 bg-primary/5" : "hover:bg-accent/50",
                )}
              >
                <input
                  type="radio"
                  name="plan-scope"
                  value={option}
                  checked={scope === option}
                  onChange={() => setScope(option)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-medium">
                    {PLAN_EDIT_SCOPE_LABELS[option]}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {PLAN_EDIT_SCOPE_HINTS[option]}
                  </span>
                </span>
              </label>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Referência de hoje: {longDateLabel(hoje)}.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm(isSeries ? scope : "somente_este_dia");
              setSaving(false);
            }}
          >
            {saving ? "Excluindo…" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyPlanDialog({
  plan,
  hoje,
  onOpenChange,
  onConfirm,
}: {
  plan: NutritionPlan | null;
  hoje: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [from, setFrom] = React.useState(hoje);
  const [to, setTo] = React.useState(addDaysIso(hoje, 27));
  const [replace, setReplace] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [lastId, setLastId] = React.useState<string | null>(plan?.id ?? null);
  if ((plan?.id ?? null) !== lastId) {
    setLastId(plan?.id ?? null);
    setFrom(hoje);
    setTo(addDaysIso(hoje, 27));
    setReplace(false);
    setSaving(false);
  }

  // Impacto calculado com a MESMA função pura que o servidor usa para materializar.
  const impact = plan && from && to && to >= from ? countMaterialization(plan, from, to) : null;

  return (
    <Dialog open={plan !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aplicar “{plan?.name}”</DialogTitle>
          <DialogDescription>
            As refeições são criadas com data concreta e ficam independentes do modelo: mudar o
            modelo depois não reescreve o que já foi planejado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="apply-from">De</Label>
              <Input
                id="apply-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apply-to">Até</Label>
              <Input
                id="apply-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="text-sm font-medium">Substituir o que já está planejado</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Apaga o planejamento existente NESTAS datas antes de aplicar. O diário não é
                afetado.
              </span>
            </span>
            <Switch checked={replace} onCheckedChange={setReplace} />
          </label>

          {impact && (
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Serão criados{" "}
              <strong className="text-foreground">
                {impact.refeicoes} refeições e {impact.itens} itens
              </strong>{" "}
              em {impact.dias} dias.
              {impact.dias === 0 && " O modelo não cobre nenhum dia deste período."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !impact || impact.dias === 0}
            onClick={async () => {
              setSaving(true);
              await onConfirm({ plan_id: plan?.id, from, to, replace });
              setSaving(false);
            }}
          >
            {saving ? "Aplicando…" : "Aplicar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({
  open,
  onOpenChange,
  hoje,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hoje: string;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [cycleWeeks, setCycleWeeks] = React.useState("1");
  const [anchorDate, setAnchorDate] = React.useState(startOfWeekIso(hoje));
  const [isDefault, setIsDefault] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setName("");
      setDescription("");
      setCycleWeeks("1");
      setAnchorDate(startOfWeekIso(hoje));
      setIsDefault(false);
      setSaving(false);
    }
  }

  const cycle = Number(cycleWeeks) || 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo modelo de semana</DialogTitle>
          <DialogDescription>
            Descreve a sua semana padrão. Depois de criar, monte os dias e aplique a um período.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Nome</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: semana normal, semana de treino"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-description">Descrição (opcional)</Label>
            <Input
              id="plan-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan-cycle">Semanas do ciclo</Label>
              <Input
                id="plan-cycle"
                type="number"
                min={1}
                max={8}
                value={cycleWeeks}
                onChange={(event) => setCycleWeeks(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                1 = toda semana igual. 2 = alterna semana A e B.
              </p>
            </div>

            {cycle > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="plan-anchor">Semana inicial</Label>
                <Input
                  id="plan-anchor"
                  type="date"
                  value={anchorDate}
                  onChange={(event) => setAnchorDate(event.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Sem ela não há como saber em qual semana do ciclo cada data cai.
                </p>
              </div>
            )}
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-sm font-medium">Usar como modelo padrão</span>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                name: name.trim(),
                description: description || undefined,
                cycle_weeks: cycle,
                anchor_date: cycle > 1 ? anchorDate : undefined,
                is_default: isDefault,
              });
              setSaving(false);
            }}
          >
            {saving ? "Criando…" : "Criar modelo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyDialog({
  open,
  onOpenChange,
  date,
  view,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  view: "dia" | "semana";
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const isWeek = view === "semana";
  const sourceStart = isWeek ? startOfWeekIso(date) : date;
  const [target, setTarget] = React.useState(addDaysIso(sourceStart, isWeek ? 7 : 1));
  const [replace, setReplace] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setTarget(addDaysIso(sourceStart, isWeek ? 7 : 1));
      setReplace(false);
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isWeek ? "Duplicar semana" : "Copiar dia"}</DialogTitle>
          <DialogDescription>
            {isWeek
              ? `Copia tudo que está planejado na semana de ${shortDateLabel(sourceStart)}, preservando o dia da semana de cada refeição. A origem fica intacta.`
              : `Copia o planejamento de ${longDateLabel(date)}. A origem fica intacta.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="copy-target">{isWeek ? "Semana de destino (segunda-feira)" : "Dia de destino"}</Label>
            <Input
              id="copy-target"
              type="date"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <span>
              <span className="text-sm font-medium">Substituir o destino</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Apaga o que já estiver planejado lá antes de copiar.
              </span>
            </span>
            <Switch checked={replace} onCheckedChange={setReplace} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!target || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm(
                isWeek
                  ? {
                      from_week_start: sourceStart,
                      to_week_start: startOfWeekIso(target),
                      replace,
                    }
                  : { from_date: date, to_date: target, replace },
              );
              setSaving(false);
            }}
          >
            {saving ? "Copiando…" : "Copiar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
