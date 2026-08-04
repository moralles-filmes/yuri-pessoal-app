import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hojeISO } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  ensureMealTypes,
  getAllMeasuresByFood,
  getMealTypes,
} from "@/lib/nutrition/diary-queries";
import {
  getMealTemplatesWithTotals,
  getRecipeCategories,
  getRecipesWithTotals,
} from "@/lib/nutrition/recipe-queries";
import { getFoods, getNutrientDefinitions, indexNutrients } from "@/lib/nutrition/queries";
import { MealTemplatesClient } from "./meal-templates-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Refeições-modelo · Dieta" };

/**
 * Fase 16-C — Refeições-modelo.
 *
 * O total de cada modelo é calculado no SERVIDOR, somando alimentos e receitas pelo mesmo
 * núcleo (`templateTotals` → `calc.ts`). As receitas citadas são resolvidas uma vez só.
 */
export default async function RefeicoesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await ensureMealTypes(user.id);

  const [templates, recipes, categories, mealTypes, foods, nutrientList, measuresByFood] =
    await Promise.all([
      getMealTemplatesWithTotals(),
      getRecipesWithTotals(),
      getRecipeCategories(),
      getMealTypes(),
      getFoods(),
      getNutrientDefinitions(),
      getAllMeasuresByFood(),
    ]);

  return (
    <MealTemplatesClient
      hoje={hojeISO()}
      templates={templates}
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
      categories={categories}
      mealTypes={mealTypes}
      foods={foods}
      measures={[...measuresByFood.entries()]}
      nutrients={indexNutrients(nutrientList)}
    />
  );
}
