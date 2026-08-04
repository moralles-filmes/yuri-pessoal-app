import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hojeISO } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { isDateIso, weekDays } from "@/lib/nutrition/calendar";
import { asPlanningView } from "@/lib/nutrition/constants";
import {
  ensureMealTypes,
  getAllMeasuresByFood,
  getFoodNutrientsFor,
  getMealTypes,
  getNutritionPlans,
  getPlannedMeals,
} from "@/lib/nutrition/diary-queries";
import { getFoods } from "@/lib/nutrition/queries";
import { getRecipesWithTotals } from "@/lib/nutrition/recipe-queries";
import type { PlannedFoodData } from "@/lib/nutrition/diary";
import { PlanningClient } from "./planning-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planejamento · Dieta" };

/**
 * Fase 16-B — Planejamento.
 *
 * O total PLANEJADO usa o catálogo atual (o plano é intenção sobre o futuro), ao contrário do
 * consumido, que sai do snapshot. Por isso carregamos os nutrientes dos alimentos que aparecem
 * no período — e só deles.
 */
export default async function PlanejamentoPage({
  searchParams,
}: {
  // `?plano=<id>` é o deep-link da busca global (16-F).
  searchParams: Promise<{ data?: string; visao?: string; plano?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const hoje = hojeISO();
  const date = isDateIso(params.data) ? params.data : hoje;
  const view = asPlanningView(params.visao);

  await ensureMealTypes(user.id);

  const week = weekDays(date);

  const [meals, weekMeals, plans, mealTypes, foods, measuresByFood, recipes] = await Promise.all([
    getPlannedMeals(date, date),
    view === "semana" ? getPlannedMeals(week[0], week[6]) : Promise.resolve([]),
    getNutritionPlans(),
    getMealTypes(),
    getFoods(),
    getAllMeasuresByFood(),
    // 16-C: uma receita pode ser um item planejado, e o total do dia precisa contá-la.
    getRecipesWithTotals(),
  ]);

  const visibleMeals = [...meals, ...weekMeals];
  const foodIds = [
    ...new Set(
      visibleMeals.flatMap(
        (meal) => meal.items.map((item) => item.foodId).filter(Boolean) as string[],
      ),
    ),
  ];
  const nutrientsByFood = await getFoodNutrientsFor(foodIds);

  const foodById = new Map(foods.map((food) => [food.id, food]));
  const foodData = foodIds
    .map((id) => {
      const food = foodById.get(id);
      if (!food) return null;
      return [
        id,
        {
          baseQuantity: food.baseQuantity,
          baseUnit: food.baseUnit,
          nutrients: nutrientsByFood.get(id) ?? [],
        },
      ] as [string, PlannedFoodData];
    })
    .filter(Boolean) as [string, PlannedFoodData][];

  return (
    <PlanningClient
      date={date}
      hoje={hoje}
      view={view}
      meals={meals}
      weekMeals={weekMeals}
      plans={plans}
      mealTypes={mealTypes}
      foods={foods}
      measures={[...measuresByFood.entries()]}
      foodData={foodData}
      recipes={recipes.map((recipe) => ({
        id: recipe.id,
        name: recipe.name,
        servings: recipe.servings,
        servingLabel: recipe.servingLabel,
        totalWeightG: recipe.totalWeightG,
        isFavorite: recipe.isFavorite,
        isArchived: recipe.isArchived,
        useCount: recipe.useCount,
        totals: recipe.calc.totals,
      }))}
      initialPlanId={plans.some((p) => p.id === params.plano) ? (params.plano ?? null) : null}
    />
  );
}
