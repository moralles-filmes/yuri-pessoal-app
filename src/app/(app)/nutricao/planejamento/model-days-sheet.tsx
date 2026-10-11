"use client";

import * as React from "react";
import { ChefHat, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { shortTime } from "@/lib/nutrition/calendar";
import { WEEKDAY_SHORT_LABELS } from "@/lib/nutrition/constants";
import { sortMealsByTime } from "@/lib/nutrition/diary";
import type { MealType, NutritionPlan } from "@/lib/nutrition/types";
import { deletePlanDay, deletePlannedMealInScope, deletePlannedMealItem, savePlanDay, savePlannedMeal } from "@/lib/actions/nutrition-plans";

export function ModelDaysSheet({
  plan,
  mealTypes,
  foodNames,
  recipeNames,
  pending,
  onOpenChange,
  onRun,
  onAddFood,
  onAddRecipe,
}: {
  plan: NutritionPlan | null;
  mealTypes: MealType[];
  foodNames: Map<string, string>;
  recipeNames: Map<string, string>;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => void;
  onAddFood: (mealId: string) => void;
  onAddRecipe: (mealId: string) => void;
}) {
  const [weekIndex, setWeekIndex] = React.useState(0);

  const seen = plan?.id ?? null;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    setWeekIndex(0);
  }

  if (!plan) return null;

  const daysOfWeek = plan.days.filter((day) => day.weekIndex === weekIndex);
  const dayByWeekday = new Map(daysOfWeek.map((day) => [day.weekday, day]));
  const activeTypes = mealTypes.filter((type) => type.isActive);

  return (
    <Sheet open={plan !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="pr-6 text-left">Dias de “{plan.name}”</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-8">
          <p className="text-xs text-muted-foreground">
            Um dia do modelo não tem data: ele descreve o que você come naquele dia da semana.
            Aplicar o modelo cria refeições com data concreta, e elas ficam independentes daqui.
          </p>

          {plan.cycleWeeks > 1 && (
            <div className="flex rounded-lg border p-0.5">
              {Array.from({ length: plan.cycleWeeks }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setWeekIndex(index)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    weekIndex === index
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Semana {index + 1}
                </button>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {/* Domingo(0) … sábado(6), na ordem da semana brasileira começando na segunda. */}
            {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
              const day = dayByWeekday.get(weekday);
              return (
                <Card key={weekday}>
                  <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <CardTitle className="text-sm">{WEEKDAY_SHORT_LABELS[weekday]}</CardTitle>
                    {day ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !confirm(
                              "Remover este dia do modelo? As refeições já materializadas em datas concretas continuam onde estão.",
                            )
                          ) {
                            return;
                          }
                          onRun(() => deletePlanDay(day.id), "Dia removido do modelo.");
                        }}
                      >
                        <Trash2 className="size-3.5" />
                        Remover
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          onRun(
                            () =>
                              savePlanDay({
                                plan_id: plan.id,
                                week_index: weekIndex,
                                weekday,
                              }),
                            "Dia adicionado ao modelo.",
                          )
                        }
                      >
                        <Plus className="size-3.5" />
                        Usar este dia
                      </Button>
                    )}
                  </CardHeader>

                  {day && (
                    <CardContent className="space-y-2">
                      {day.meals.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Nenhuma refeição neste dia do modelo.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {sortMealsByTime(day.meals).map((meal) => (
                            <li key={meal.id} className="rounded-lg border p-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="min-w-0 truncate text-sm">
                                  {meal.mealTypeIcon && <span aria-hidden>{meal.mealTypeIcon} </span>}
                                  {meal.title || meal.mealTypeName}
                                  {meal.plannedTime && (
                                    <span className="ms-1.5 text-xs text-muted-foreground">
                                      {shortTime(meal.plannedTime)}
                                    </span>
                                  )}
                                </p>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 shrink-0"
                                  aria-label="Excluir refeição do modelo"
                                  disabled={pending}
                                  onClick={() =>
                                    onRun(
                                      () =>
                                        deletePlannedMealInScope({
                                          planned_meal_id: meal.id,
                                          scope: "todo_o_modelo",
                                        }),
                                      "Refeição removida do modelo.",
                                    )
                                  }
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>

                              {meal.items.length > 0 && (
                                <ul className="mt-1 space-y-0.5">
                                  {meal.items.map((item) => (
                                    <li
                                      key={item.id}
                                      className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                                    >
                                      <span className="min-w-0 truncate">
                                        {item.customLabel ??
                                          (item.itemKind === "receita"
                                            ? (item.recipeId ? recipeNames.get(item.recipeId) : null) ??
                                              "Receita removida"
                                            : item.foodId
                                              ? (foodNames.get(item.foodId) ?? "Alimento removido")
                                              : "Item")}
                                        {item.quantity !== null &&
                                          ` — ${item.quantity.toLocaleString("pt-BR")}${item.measureLabel ? ` × ${item.measureLabel}` : ""}`}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="size-6 shrink-0"
                                        aria-label="Remover item"
                                        disabled={pending}
                                        onClick={() =>
                                          onRun(
                                            () => deletePlannedMealItem(item.id),
                                            "Item removido.",
                                          )
                                        }
                                      >
                                        <Trash2 className="size-3" />
                                      </Button>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  disabled={pending}
                                  onClick={() => onAddFood(meal.id)}
                                >
                                  <Plus className="size-3.5" />
                                  Alimento
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  disabled={pending}
                                  onClick={() => onAddRecipe(meal.id)}
                                >
                                  <ChefHat className="size-3.5" />
                                  Receita
                                </Button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}

                      <AddModelMealForm
                        mealTypes={activeTypes}
                        pending={pending}
                        onAdd={(mealTypeId, time) =>
                          onRun(
                            () =>
                              savePlannedMeal({
                                plan_id: plan.id,
                                plan_day_id: day.id,
                                meal_type_id: mealTypeId,
                                planned_time: time || null,
                              }),
                            "Refeição adicionada ao modelo.",
                          )
                        }
                      />
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function AddModelMealForm({
  mealTypes,
  pending,
  onAdd,
}: {
  mealTypes: MealType[];
  pending: boolean;
  onAdd: (mealTypeId: string, time: string) => void;
}) {
  const [mealTypeId, setMealTypeId] = React.useState(mealTypes[0]?.id ?? "");
  const [time, setTime] = React.useState(
    mealTypes[0]?.defaultTime ? mealTypes[0].defaultTime.slice(0, 5) : "",
  );

  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-2">
      <div className="min-w-[9rem] flex-1 space-y-1">
        <Label className="text-[11px]">Refeição</Label>
        <select
          value={mealTypeId}
          onChange={(event) => {
            setMealTypeId(event.target.value);
            const type = mealTypes.find((t) => t.id === event.target.value);
            setTime(type?.defaultTime ? type.defaultTime.slice(0, 5) : "");
          }}
          aria-label="Tipo de refeição"
          className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {mealTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </div>
      <div className="w-24 space-y-1">
        <Label className="text-[11px]">Horário</Label>
        <Input
          type="time"
          value={time}
          onChange={(event) => setTime(event.target.value)}
          aria-label="Horário previsto"
          className="h-8 text-xs"
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8"
        disabled={pending || !mealTypeId}
        onClick={() => onAdd(mealTypeId, time)}
      >
        <Plus className="size-3.5" />
        Refeição
      </Button>
    </div>
  );
}
