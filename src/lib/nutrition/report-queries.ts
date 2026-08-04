import "server-only";

/**
 * Fase 16-E — Dieta e Alimentação · Leitura dos relatórios (server-only).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ O RELATÓRIO DE UM PERÍODO PASSADO SAI DO SNAPSHOT.                                  ║
 * ║ O consumo é lido de `nutrition_diary_entries.nutrients_snapshot` (via `getDiaryMeals`) ║
 * ║ e NUNCA de `nutrition_food_nutrients`. Este arquivo não tem uma única consulta ao      ║
 * ║ catálogo para somar consumo — as que existem servem ao lado PLANEJADO, que é intenção  ║
 * ║ sobre o futuro e deve mesmo refletir o alimento como ele está hoje.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Padrão do projeto: poucas consultas amplas, em paralelo, e derivação em memória.
 */
import { createClient } from "@/lib/supabase/server";
import { getMeasurementTypes, getMeasurements } from "@/lib/body/queries";
import type { MeasurementType, MeasurementWithType } from "@/lib/body/types";
import {
  getDiaryMeals,
  getFoodNutrientsFor,
  getGoalPeriods,
  getMealTypes,
  getMeasures,
  getPlannedMeals,
} from "./diary-queries";
import { getNutrientDefinitions, getOfficialSources, indexNutrients } from "./queries";
import { getSubstitutionLogs } from "./recipe-queries";
import { getShoppingLists } from "./shopping-queries";
import { asDayKind } from "./constants";
import type { PlannedFoodData } from "./diary";
import type { ConvertibleMeasure } from "./units";
import type {
  DiaryMeal,
  FoodSource,
  GoalPeriod,
  MealType,
  NutrientDefinition,
  PlannedMeal,
  ShoppingList,
  SubstitutionLog,
} from "./types";
import type { DayKind } from "./constants";

/**
 * Tipo de dia (treino/descanso) por data, lido do PLANEJAMENTO.
 *
 * Entra na resolução da meta: num período do tipo "treino_descanso", o alvo do dia depende
 * disso. Sem o mapa, todo dia seria "não classificado" e a meta resolvida seria a genérica —
 * o que faria o relatório discordar da tela do dia.
 */
async function getDayKinds(from: string, to: string): Promise<Map<string, DayKind | null>> {
  const supabase = await createClient();
  const map = new Map<string, DayKind | null>();

  const { data } = await supabase
    .from("nutrition_planned_meals")
    .select("planned_date,plan_day_id,nutrition_plan_days(day_kind)")
    .gte("planned_date", from)
    .lte("planned_date", to);

  for (const row of (data ?? []) as unknown as {
    planned_date: string | null;
    nutrition_plan_days: { day_kind: string | null } | null;
  }[]) {
    if (!row.planned_date || map.has(row.planned_date)) continue;
    map.set(row.planned_date, asDayKind(row.nutrition_plan_days?.day_kind));
  }

  return map;
}

/**
 * Listas de compras que TOCAM o período.
 *
 * O recorte é pelo período de origem da lista (`source_from`/`source_to`), não pela data de
 * criação: uma lista gerada no dia 28 para a semana seguinte pertence à semana seguinte.
 * Listas manuais (sem período de origem) entram pela data de criação, que é o que existe.
 */
async function getShoppingListsInPeriod(from: string, to: string): Promise<ShoppingList[]> {
  const all = await getShoppingLists();
  return all.filter((list) => {
    if (list.sourceFrom && list.sourceTo) return list.sourceFrom <= to && list.sourceTo >= from;
    if (list.sourceFrom) return list.sourceFrom >= from && list.sourceFrom <= to;
    const created = list.createdAt.slice(0, 10);
    return created >= from && created <= to;
  });
}

/** Contexto que `planAdherenceReport` precisa para calcular o lado PLANEJADO. */
async function buildPlannedContext(planned: PlannedMeal[]): Promise<{
  foodNames: Map<string, string>;
  foodData: Map<string, PlannedFoodData>;
  measures: Map<string, ConvertibleMeasure>;
}> {
  const foodIds = [
    ...new Set(
      planned.flatMap((meal) => meal.items.map((item) => item.foodId).filter(Boolean) as string[]),
    ),
  ];
  const measureIds = [
    ...new Set(
      planned.flatMap(
        (meal) => meal.items.map((item) => item.measureId).filter(Boolean) as string[],
      ),
    ),
  ];

  if (foodIds.length === 0) {
    return { foodNames: new Map(), foodData: new Map(), measures: new Map() };
  }

  const supabase = await createClient();
  const [{ data: foods }, nutrientsByFood, measureBasics] = await Promise.all([
    supabase.from("nutrition_foods").select("id,name,base_quantity,base_unit").in("id", foodIds),
    getFoodNutrientsFor(foodIds),
    getMeasures(measureIds),
  ]);

  const foodNames = new Map<string, string>();
  const foodData = new Map<string, PlannedFoodData>();

  for (const food of foods ?? []) {
    foodNames.set(food.id, food.name);
    foodData.set(food.id, {
      baseQuantity: Number(food.base_quantity) || 100,
      baseUnit: food.base_unit === "ml" ? "ml" : "g",
      nutrients: nutrientsByFood.get(food.id) ?? [],
    });
  }

  const measures = new Map<string, ConvertibleMeasure>();
  for (const [id, measure] of measureBasics) {
    measures.set(id, {
      label: measure.label,
      grams: measure.grams,
      milliliters: measure.milliliters,
    });
  }

  return { foodNames, foodData, measures };
}

export type ReportPackage = {
  from: string;
  to: string;
  /** Consumo — vem do SNAPSHOT. */
  meals: DiaryMeal[];
  planned: PlannedMeal[];
  periods: GoalPeriod[];
  mealTypes: MealType[];
  definitions: Record<string, NutrientDefinition>;
  dayKinds: Map<string, DayKind | null>;
  plannedContext: {
    foodNames: Map<string, string>;
    foodData: Map<string, PlannedFoodData>;
    measures: Map<string, ConvertibleMeasure>;
  };
  substitutions: SubstitutionLog[];
  shoppingLists: ShoppingList[];
  /** Evolução corporal do mesmo período — para as séries LADO A LADO (nunca causalidade). */
  measurements: MeasurementWithType[];
  measurementTypes: MeasurementType[];
  sources: FoodSource[];
};

/**
 * Tudo que a tela de relatórios precisa de um período, em consultas paralelas.
 *
 * As medidas corporais vêm do MÓDULO CENTRAL (`src/lib/body/queries.ts`) — não há leitura
 * paralela de peso dentro da Dieta, e não pode passar a haver.
 */
export async function getReportPackage(from: string, to: string): Promise<ReportPackage> {
  const [
    meals,
    planned,
    periods,
    mealTypes,
    definitionList,
    dayKinds,
    substitutions,
    shoppingLists,
    measurements,
    measurementTypes,
    sources,
  ] = await Promise.all([
    getDiaryMeals(from, to),
    getPlannedMeals(from, to),
    getGoalPeriods(),
    getMealTypes(),
    getNutrientDefinitions(),
    getDayKinds(from, to),
    getSubstitutionLogs(500),
    getShoppingListsInPeriod(from, to),
    getMeasurements({ from, to }),
    getMeasurementTypes(),
    getOfficialSources(),
  ]);

  const plannedContext = await buildPlannedContext(planned);

  return {
    from,
    to,
    meals,
    planned,
    periods,
    mealTypes,
    definitions: indexNutrients(definitionList),
    dayKinds,
    plannedContext,
    // O histórico de trocas é lido inteiro e recortado aqui: `appliedOn` é data pura, e o
    // volume (centenas de linhas numa base pessoal) não justifica uma consulta a mais.
    substitutions: substitutions.filter((log) => log.appliedOn >= from && log.appliedOn <= to),
    shoppingLists,
    measurements,
    measurementTypes,
    sources,
  };
}

/**
 * Medidas de TODO o histórico, para os gráficos de evolução da tela de medidas.
 *
 * Sem recorte de data de propósito: "valor inicial" precisa ser o mais antigo que existe, não
 * o mais antigo que coube na tela.
 */
export async function getMeasurementHistory(): Promise<MeasurementWithType[]> {
  return getMeasurements();
}
