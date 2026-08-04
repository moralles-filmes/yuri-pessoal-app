import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hojeISO, timeInSaoPaulo } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { isDateIso, monthGridRange, timeToMinutes, weekDays } from "@/lib/nutrition/calendar";
import { asDiaryView } from "@/lib/nutrition/constants";
import {
  ensureMealTypes,
  getAllMeasuresByFood,
  getDiaryMeals,
  getFoodNutrientsFor,
  getGoalPeriods,
  getMealTypes,
  getPlannedMeals,
  getWaterForDate,
} from "@/lib/nutrition/diary-queries";
import { getFoods, getNutrientDefinitions, indexNutrients } from "@/lib/nutrition/queries";
// 17-F — quem sabe se o dia é de treino ou de descanso é o módulo TREINOS. A Dieta lê e usa
// para resolver a meta por tipo de dia (16-B); não recalcula nada de treino.
import { getTrainingDayKinds } from "@/lib/training/day-kind-queries";
import {
  getMealTemplatesWithTotals,
  getRecipesWithTotals,
  getSubstitutionGroupsWithTotals,
} from "@/lib/nutrition/recipe-queries";
import type { PlannedFoodData } from "@/lib/nutrition/diary";
import { DiaryClient } from "./diary-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Diário alimentar · Dieta" };

/**
 * Fase 16-B — Diário alimentar.
 *
 * Server Component. Dois cuidados que não são detalhe:
 *
 * • A DATA e a HORA de "agora" são resolvidas AQUI, em Brasília (`hojeISO`/`timeInSaoPaulo`),
 *   e descem como props. Se o cliente calculasse, o status derivado mudaria conforme o fuso do
 *   aparelho — e um jantar viraria "atrasado" para quem estivesse viajando.
 *
 * • O intervalo lido depende da visão: um dia ou a semana inteira. O total da semana precisa
 *   dos dias todos, e buscar dia a dia seria N+1.
 */
export default async function DiarioPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; visao?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const hoje = hojeISO();
  const date = isDateIso(params.data) ? params.data : hoje;
  const view = asDiaryView(params.visao);

  // Cria os 8 tipos padrão na primeira visita. Idempotente pelo unique (user_id, slug).
  await ensureMealTypes(user.id);

  const week = weekDays(date);

  // 16-E — a visão de MÊS lê a grade inteira do calendário, e não só o mês: a primeira e a
  // última semana mostram dias vizinhos, e uma célula vazia por falta de leitura daria a
  // impressão errada de que não houve registro naquele dia.
  const monthRange = monthGridRange(date);
  const [from, to] =
    view === "mes" ? monthRange : view === "semana" ? [week[0], week[6]] : [date, date];

  const [
    meals,
    weekMeals,
    planned,
    mealTypes,
    periods,
    foods,
    nutrientList,
    measuresByFood,
    water,
    recipes,
    templates,
    substitutionGroups,
  ] = await Promise.all([
    getDiaryMeals(date, date),
    view === "dia" ? Promise.resolve([]) : getDiaryMeals(from, to),
    // Na visão de mês o planejamento do intervalo inteiro alimenta os indicadores das
    // células; nas outras, só o do dia.
    view === "mes" ? getPlannedMeals(from, to) : getPlannedMeals(date, date),
    getMealTypes(),
    getGoalPeriods(),
    getFoods(),
    getNutrientDefinitions(),
    getAllMeasuresByFood(),
    getWaterForDate(date),
    // 16-C: receitas e refeições-modelo entram no diário pelo mesmo caminho de snapshot.
    getRecipesWithTotals(),
    getMealTemplatesWithTotals(),
    getSubstitutionGroupsWithTotals(),
  ]);

  // Mapa de dias de treino/descanso do intervalo lido. Dia sem informação fica FORA do mapa —
  // ausência de dado não é "descanso", e a meta do dia continua a sem recorte.
  const dayKinds = await getTrainingDayKinds(from, to);

  // Nutrientes dos alimentos que aparecem no PLANEJAMENTO do dia — necessários para calcular
  // o lado "planejado" da comparação. O lado "consumido" sai do snapshot e não precisa disto.
  const plannedFoodIds = [
    ...new Set(
      planned.flatMap((meal) => meal.items.map((item) => item.foodId).filter(Boolean) as string[]),
    ),
  ];
  const plannedNutrients = await getFoodNutrientsFor(plannedFoodIds);

  const foodById = new Map(foods.map((food) => [food.id, food]));
  const foodData: [string, PlannedFoodData][] = plannedFoodIds
    .map((id) => {
      const food = foodById.get(id);
      if (!food) return null;
      return [
        id,
        {
          baseQuantity: food.baseQuantity,
          baseUnit: food.baseUnit,
          nutrients: plannedNutrients.get(id) ?? [],
        },
      ] as [string, PlannedFoodData];
    })
    .filter(Boolean) as [string, PlannedFoodData][];

  const foodNames: [string, string][] = plannedFoodIds
    .map((id) => [id, foodById.get(id)?.name ?? ""] as [string, string])
    .filter(([, name]) => name !== "");

  return (
    <DiaryClient
      date={date}
      hoje={hoje}
      minutosAgora={timeToMinutes(timeInSaoPaulo(new Date())) ?? 0}
      view={view}
      meals={meals}
      weekMeals={weekMeals}
      planned={planned}
      mealTypes={mealTypes}
      periods={periods}
      foods={foods}
      measures={[...measuresByFood.entries()]}
      foodData={foodData}
      foodNames={foodNames}
      dayKinds={[...dayKinds.entries()]}
      nutrients={indexNutrients(nutrientList)}
      water={water}
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
      templates={templates.map((template) => ({
        id: template.id,
        name: template.name,
        itemCount: template.items.length,
        isArchived: template.isArchived,
        totals: template.calc.totals,
      }))}
      substitutionGroups={substitutionGroups}
    />
  );
}
