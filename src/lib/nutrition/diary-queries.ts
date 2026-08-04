import "server-only";

/**
 * Fase 16-B — Dieta e Alimentação · Leitura de metas, diário e planejamento (server-only).
 *
 * Padrão do projeto: poucas consultas amplas + derivação em memória (nada de N+1). A RLS
 * garante o recorte por usuário — nenhuma query aqui filtra `user_id` na mão, e nem deve.
 *
 * ══ DE ONDE VEM CADA NÚMERO ══
 * • Total CONSUMIDO  → `nutrients_snapshot` da própria linha do diário. Nunca do catálogo.
 * • Total PLANEJADO  → catálogo atual, porque o plano é intenção sobre o futuro.
 * • Meta do dia      → período vigente NAQUELA data (nunca "a meta de agora").
 * • Água             → módulo Hábitos (Fase 10). Aqui só se LÊ; a fonte de verdade é lá.
 */
import { createClient } from "@/lib/supabase/server";
import { hojeISO } from "@/lib/format";
import {
  asBaseUnit,
  asChangeKind,
  asDayKind,
  asDiaryEntryKind,
  asGoalType,
  asMealStatus,
  asMethod,
  asActivityLevel,
  asGoalDirection,
  asPortionUnit,
  asPreparationState,
  asProfileSex,
  asTemplateItemKind,
  asValueState,
  DEFAULT_MEAL_TYPES,
} from "./constants";
import { parseNutrientSnapshot, type SnapshotFoodInput } from "./snapshot";
import type { ConvertibleMeasure } from "./units";
import type {
  DiaryEntry,
  DiaryMeal,
  FoodNutrientValue,
  GoalItemRow,
  GoalPeriod,
  MealType,
  NutritionPlan,
  NutritionProfile,
  PlanDay,
  PlannedMeal,
  PlannedMealItem,
} from "./types";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/* ═══════════════════════════ Tipos de refeição ═══════════════════════════ */

/**
 * Cria os tipos de refeição padrão na primeira vez que o módulo é aberto.
 *
 * POR QUE AQUI E NÃO NUMA MIGRATION: os tipos são dado do usuário (ele renomeia, reordena e
 * desativa), e uma migration não sabe quais usuários existem nem os que vão existir. O
 * `onConflict` no unique (user_id, slug) torna a chamada idempotente — rodar mil vezes cria
 * no máximo os oito.
 *
 * A operação é silenciosamente ignorada em caso de erro: falhar o seed não pode impedir a
 * tela de abrir, e a próxima leitura tenta de novo.
 */
export async function ensureMealTypes(userId: string): Promise<void> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("nutrition_meal_types")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  await supabase.from("nutrition_meal_types").upsert(
    DEFAULT_MEAL_TYPES.map((type, index) => ({
      user_id: userId,
      slug: type.slug,
      name: type.name,
      icon: type.icon,
      default_time: type.defaultTime,
      position: index,
      is_active: true,
    })),
    { onConflict: "user_id,slug", ignoreDuplicates: true },
  );
}

export async function getMealTypes(): Promise<MealType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_meal_types")
    .select("id,name,slug,icon,color,default_time,position,is_active")
    .order("position")
    .order("name");

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    color: row.color,
    defaultTime: row.default_time,
    position: row.position,
    isActive: row.is_active,
  }));
}

/* ═══════════════════════════ Perfil ═══════════════════════════ */

export async function getNutritionProfile(): Promise<NutritionProfile | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_profiles")
    .select("id,birth_date,sex,height_cm,weight_kg,activity_level,goal_direction,restrictions,notes")
    .maybeSingle();
  if (!data) return null;

  return {
    id: data.id,
    birthDate: data.birth_date,
    sex: asProfileSex(data.sex),
    heightCm: num(data.height_cm),
    weightKg: num(data.weight_kg),
    activityLevel: asActivityLevel(data.activity_level),
    goalDirection: asGoalDirection(data.goal_direction),
    restrictions: data.restrictions ?? [],
    notes: data.notes,
  };
}

/* ═══════════════════════════ Metas ═══════════════════════════ */

/** Todos os períodos com seus valores. O histórico inteiro cabe numa consulta. */
export async function getGoalPeriods(): Promise<GoalPeriod[]> {
  const supabase = await createClient();

  const [periodsResult, itemsResult] = await Promise.all([
    supabase
      .from("nutrition_goal_periods")
      .select("id,name,reason,starts_on,ends_on,goal_type,notes,is_active,created_at")
      .order("starts_on", { ascending: false }),
    supabase
      .from("nutrition_goal_items")
      .select(
        "id,period_id,nutrient_code,weekday,day_kind,meal_type_id,target_amount,target_percent,min_amount,max_amount,notes,created_at",
      ),
  ]);

  const itemsByPeriod = new Map<string, GoalItemRow[]>();
  for (const row of itemsResult.data ?? []) {
    const item: GoalItemRow = {
      id: row.id,
      periodId: row.period_id,
      nutrientCode: row.nutrient_code,
      weekday: row.weekday,
      dayKind: asDayKind(row.day_kind),
      mealTypeId: row.meal_type_id,
      targetAmount: num(row.target_amount),
      targetPercent: num(row.target_percent),
      minAmount: num(row.min_amount),
      maxAmount: num(row.max_amount),
      notes: row.notes,
      createdAt: row.created_at,
    };
    const list = itemsByPeriod.get(row.period_id);
    if (list) list.push(item);
    else itemsByPeriod.set(row.period_id, [item]);
  }

  return (periodsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    reason: row.reason,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    goalType: asGoalType(row.goal_type),
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    items: itemsByPeriod.get(row.id) ?? [],
  }));
}

/* ═══════════════════════════ Diário ═══════════════════════════ */

const ENTRY_SELECT =
  "id,diary_meal_id,food_id,recipe_id,meal_template_id,entry_kind,planned_item_id,change_kind,changed_at,food_name_snapshot,preparation_state_snapshot,brand_snapshot,quantity,measure_label,grams_equivalent,base_quantity,base_unit,source_id_snapshot,source_name_snapshot,source_version_snapshot,source_food_code_snapshot,nutrients_snapshot,energy_kcal,protein_g,carb_g,fat_g,fiber_g,notes,position";

type EntryRow = {
  id: string;
  diary_meal_id: string;
  food_id: string | null;
  recipe_id: string | null;
  meal_template_id: string | null;
  entry_kind: string;
  planned_item_id: string | null;
  change_kind: string;
  changed_at: string | null;
  food_name_snapshot: string;
  preparation_state_snapshot: string | null;
  brand_snapshot: string | null;
  quantity: number | string | null;
  measure_label: string | null;
  grams_equivalent: number | string | null;
  base_quantity: number | string | null;
  base_unit: string | null;
  source_id_snapshot: string | null;
  source_name_snapshot: string | null;
  source_version_snapshot: string | null;
  source_food_code_snapshot: string | null;
  nutrients_snapshot: unknown;
  energy_kcal: number | string | null;
  protein_g: number | string | null;
  carb_g: number | string | null;
  fat_g: number | string | null;
  fiber_g: number | string | null;
  notes: string | null;
  position: number;
};

function mapEntry(row: EntryRow): DiaryEntry {
  return {
    id: row.id,
    diaryMealId: row.diary_meal_id,
    foodId: row.food_id,
    recipeId: row.recipe_id,
    mealTemplateId: row.meal_template_id,
    entryKind: asDiaryEntryKind(row.entry_kind),
    plannedItemId: row.planned_item_id,
    changeKind: asChangeKind(row.change_kind),
    changedAt: row.changed_at,
    foodNameSnapshot: row.food_name_snapshot,
    preparationStateSnapshot: row.preparation_state_snapshot
      ? asPreparationState(row.preparation_state_snapshot)
      : null,
    brandSnapshot: row.brand_snapshot,
    // Item livre não tem quantidade; o tipo do domínio exige número, então 0 aqui é só o
    // preenchimento estrutural — ele nunca é somado, porque `nutrientsSnapshot` está vazio.
    quantity: num(row.quantity) ?? 0,
    measureLabel: row.measure_label,
    // NULO é preservado: uma receita registrada em porções sem peso final não tem equivalente
    // em gramas, e um 0 aqui afirmaria que a porção não pesa nada (16-C).
    gramsEquivalent: num(row.grams_equivalent),
    baseQuantity: num(row.base_quantity),
    baseUnit: row.base_unit ? asBaseUnit(row.base_unit) : null,
    sourceIdSnapshot: row.source_id_snapshot,
    sourceNameSnapshot: row.source_name_snapshot,
    sourceVersionSnapshot: row.source_version_snapshot,
    sourceFoodCodeSnapshot: row.source_food_code_snapshot,
    nutrientsSnapshot: parseNutrientSnapshot(row.nutrients_snapshot),
    energyKcal: num(row.energy_kcal),
    proteinG: num(row.protein_g),
    carbG: num(row.carb_g),
    fatG: num(row.fat_g),
    fiberG: num(row.fiber_g),
    notes: row.notes,
    position: row.position,
  };
}

/**
 * Refeições do diário num intervalo de datas, já com os itens.
 * Duas consultas, sempre — o número de dias não muda a quantidade de idas ao banco.
 */
export async function getDiaryMeals(from: string, to: string): Promise<DiaryMeal[]> {
  const supabase = await createClient();

  const [mealsResult, mealTypes] = await Promise.all([
    supabase
      .from("nutrition_diary_meals")
      .select(
        "id,diary_date,meal_type_id,planned_meal_id,planned_time,consumed_time,status,title,notes,position",
      )
      .gte("diary_date", from)
      .lte("diary_date", to)
      .order("diary_date")
      .order("position"),
    getMealTypes(),
  ]);

  const meals = mealsResult.data ?? [];
  if (meals.length === 0) return [];

  const { data: entriesData } = await supabase
    .from("nutrition_diary_entries")
    .select(ENTRY_SELECT)
    .in(
      "diary_meal_id",
      meals.map((meal) => meal.id),
    )
    .order("position");

  const entriesByMeal = new Map<string, DiaryEntry[]>();
  for (const row of (entriesData ?? []) as unknown as EntryRow[]) {
    const entry = mapEntry(row);
    const list = entriesByMeal.get(entry.diaryMealId);
    if (list) list.push(entry);
    else entriesByMeal.set(entry.diaryMealId, [entry]);
  }

  const typeById = new Map(mealTypes.map((type) => [type.id, type]));

  return meals.map((row) => {
    const type = typeById.get(row.meal_type_id);
    return {
      id: row.id,
      diaryDate: row.diary_date,
      mealTypeId: row.meal_type_id,
      mealTypeName: type?.name ?? "Refeição",
      mealTypeIcon: type?.icon ?? null,
      plannedMealId: row.planned_meal_id,
      plannedTime: row.planned_time,
      consumedTime: row.consumed_time,
      status: asMealStatus(row.status),
      title: row.title,
      notes: row.notes,
      position: row.position,
      entries: entriesByMeal.get(row.id) ?? [],
    } satisfies DiaryMeal;
  });
}

/* ═══════════════════════════ Planejamento ═══════════════════════════ */

const PLANNED_MEAL_SELECT =
  "id,plan_id,plan_day_id,planned_date,meal_type_id,planned_time,title,notes,position";
const PLANNED_ITEM_SELECT =
  "id,planned_meal_id,item_kind,food_id,recipe_id,meal_template_id,custom_label,quantity,measure_id,measure_label,portion_unit,is_optional,notes,position";

type PlannedMealRow = {
  id: string;
  plan_id: string | null;
  plan_day_id: string | null;
  planned_date: string | null;
  meal_type_id: string;
  planned_time: string | null;
  title: string | null;
  notes: string | null;
  position: number;
};

async function attachItems(
  rows: PlannedMealRow[],
  mealTypes: MealType[],
): Promise<PlannedMeal[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();

  const { data: itemsData } = await supabase
    .from("nutrition_planned_meal_items")
    .select(PLANNED_ITEM_SELECT)
    .in(
      "planned_meal_id",
      rows.map((row) => row.id),
    )
    .order("position");

  const itemsByMeal = new Map<string, PlannedMealItem[]>();
  for (const row of itemsData ?? []) {
    const item: PlannedMealItem = {
      id: row.id,
      plannedMealId: row.planned_meal_id,
      itemKind: asTemplateItemKind(row.item_kind),
      foodId: row.food_id,
      recipeId: row.recipe_id,
      mealTemplateId: row.meal_template_id,
      customLabel: row.custom_label,
      quantity: num(row.quantity),
      measureId: row.measure_id,
      measureLabel: row.measure_label,
      portionUnit: asPortionUnit(row.portion_unit),
      isOptional: row.is_optional,
      notes: row.notes,
      position: row.position,
    };
    const list = itemsByMeal.get(item.plannedMealId);
    if (list) list.push(item);
    else itemsByMeal.set(item.plannedMealId, [item]);
  }

  const typeById = new Map(mealTypes.map((type) => [type.id, type]));

  return rows.map((row) => {
    const type = typeById.get(row.meal_type_id);
    return {
      id: row.id,
      planId: row.plan_id,
      planDayId: row.plan_day_id,
      plannedDate: row.planned_date,
      mealTypeId: row.meal_type_id,
      mealTypeName: type?.name ?? "Refeição",
      mealTypeIcon: type?.icon ?? null,
      plannedTime: row.planned_time,
      title: row.title,
      notes: row.notes,
      position: row.position,
      items: itemsByMeal.get(row.id) ?? [],
    } satisfies PlannedMeal;
  });
}

/** Refeições planejadas com DATA num intervalo (as linhas de modelo ficam de fora). */
export async function getPlannedMeals(from: string, to: string): Promise<PlannedMeal[]> {
  const supabase = await createClient();
  const [{ data }, mealTypes] = await Promise.all([
    supabase
      .from("nutrition_planned_meals")
      .select(PLANNED_MEAL_SELECT)
      .gte("planned_date", from)
      .lte("planned_date", to)
      .order("planned_date")
      .order("position"),
    getMealTypes(),
  ]);
  return attachItems((data ?? []) as PlannedMealRow[], mealTypes);
}

/**
 * TODAS as refeições planejadas de uma série (materializadas + linha de modelo).
 * É o universo que `plannedMealsInScope` precisa para resolver a edição por escopo.
 */
export async function getPlannedMealsForSeries(planDayId: string): Promise<PlannedMeal[]> {
  const supabase = await createClient();
  const [{ data }, mealTypes] = await Promise.all([
    supabase
      .from("nutrition_planned_meals")
      .select(PLANNED_MEAL_SELECT)
      .eq("plan_day_id", planDayId)
      .order("planned_date", { nullsFirst: true }),
    getMealTypes(),
  ]);
  return attachItems((data ?? []) as PlannedMealRow[], mealTypes);
}

/** Modelos de semana completos: plano → dias → refeições → itens. */
export async function getNutritionPlans(): Promise<NutritionPlan[]> {
  const supabase = await createClient();

  const [plansResult, daysResult, mealTypes] = await Promise.all([
    supabase
      .from("nutrition_plans")
      .select("id,name,description,cycle_weeks,week_start_day,anchor_date,is_active,is_default")
      .order("is_default", { ascending: false })
      .order("name"),
    supabase
      .from("nutrition_plan_days")
      .select("id,plan_id,week_index,weekday,label,day_kind,notes")
      .order("week_index")
      .order("weekday"),
    getMealTypes(),
  ]);

  const days = daysResult.data ?? [];
  const { data: modelMealRows } = await supabase
    .from("nutrition_planned_meals")
    .select(PLANNED_MEAL_SELECT)
    .is("planned_date", null)
    .order("position");

  const modelMeals = await attachItems((modelMealRows ?? []) as PlannedMealRow[], mealTypes);
  const mealsByDay = new Map<string, PlannedMeal[]>();
  for (const meal of modelMeals) {
    if (!meal.planDayId) continue;
    const list = mealsByDay.get(meal.planDayId);
    if (list) list.push(meal);
    else mealsByDay.set(meal.planDayId, [meal]);
  }

  const daysByPlan = new Map<string, PlanDay[]>();
  for (const row of days) {
    const day: PlanDay = {
      id: row.id,
      planId: row.plan_id,
      weekIndex: row.week_index,
      weekday: row.weekday,
      label: row.label,
      dayKind: asDayKind(row.day_kind),
      notes: row.notes,
      meals: mealsByDay.get(row.id) ?? [],
    };
    const list = daysByPlan.get(row.plan_id);
    if (list) list.push(day);
    else daysByPlan.set(row.plan_id, [day]);
  }

  return (plansResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    cycleWeeks: row.cycle_weeks,
    weekStartDay: row.week_start_day,
    anchorDate: row.anchor_date,
    isActive: row.is_active,
    isDefault: row.is_default,
    days: daysByPlan.get(row.id) ?? [],
  }));
}

/* ═══════════════════════════ Catálogo para o cálculo ═══════════════════════════ */

/** Nutrientes de um conjunto de alimentos — usado para calcular o PLANEJADO. */
export async function getFoodNutrientsFor(
  foodIds: string[],
): Promise<Map<string, FoodNutrientValue[]>> {
  const map = new Map<string, FoodNutrientValue[]>();
  if (foodIds.length === 0) return map;

  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_food_nutrients")
    .select("food_id,nutrient_code,amount,value_state,method,source_note")
    .in("food_id", foodIds);

  for (const row of data ?? []) {
    const value: FoodNutrientValue = {
      code: row.nutrient_code,
      amount: num(row.amount),
      state: asValueState(row.value_state),
      method: asMethod(row.method),
      sourceNote: row.source_note,
    };
    const list = map.get(row.food_id);
    if (list) list.push(value);
    else map.set(row.food_id, [value]);
  }
  return map;
}

export type FoodBasics = {
  id: string;
  name: string;
  preparationState: string | null;
  brand: string | null;
  baseQuantity: number;
  baseUnit: "g" | "ml";
  sourceId: string | null;
  sourceFoodCode: string | null;
  sourceVersion: string | null;
};

/** Dados de identidade/base de alimentos específicos (para snapshot e para o planejado). */
export async function getFoodBasics(foodIds: string[]): Promise<Map<string, FoodBasics>> {
  const map = new Map<string, FoodBasics>();
  if (foodIds.length === 0) return map;

  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_foods")
    .select(
      "id,name,preparation_state,brand,base_quantity,base_unit,source_id,source_food_code,source_version",
    )
    .in("id", foodIds);

  for (const row of data ?? []) {
    map.set(row.id, {
      id: row.id,
      name: row.name,
      preparationState: row.preparation_state,
      brand: row.brand,
      baseQuantity: num(row.base_quantity) ?? 100,
      baseUnit: asBaseUnit(row.base_unit),
      sourceId: row.source_id,
      sourceFoodCode: row.source_food_code,
      sourceVersion: row.source_version,
    });
  }
  return map;
}

/**
 * Tudo que `buildDiaryEntrySnapshot` precisa, lido do catálogo NO SERVIDOR.
 *
 * Existe para que a action nunca aceite nutriente vindo do navegador: o cliente diz apenas
 * "este alimento, esta quantidade, esta medida", e o snapshot é montado aqui, com o dado real.
 * Devolve `null` quando o alimento não existe ou a RLS não o alcança.
 */
export async function getFoodSnapshotInput(
  foodId: string,
  measureId: string | null,
): Promise<{ food: SnapshotFoodInput; measure: ConvertibleMeasure | null } | null> {
  const supabase = await createClient();

  const [{ data: foodRow }, nutrientsByFood] = await Promise.all([
    supabase
      .from("nutrition_foods")
      .select(
        "id,name,preparation_state,brand,base_quantity,base_unit,source_id,source_food_code,source_version",
      )
      .eq("id", foodId)
      .maybeSingle(),
    getFoodNutrientsFor([foodId]),
  ]);
  if (!foodRow) return null;

  let sourceName: string | null = null;
  if (foodRow.source_id) {
    const { data: source } = await supabase
      .from("nutrition_food_sources")
      .select("name")
      .eq("id", foodRow.source_id)
      .maybeSingle();
    sourceName = source?.name ?? null;
  }

  let measure: ConvertibleMeasure | null = null;
  if (measureId) {
    const { data: measureRow } = await supabase
      .from("nutrition_food_measures")
      .select("id,food_id,label,grams,milliliters")
      .eq("id", measureId)
      .maybeSingle();
    // A medida precisa ser DESTE alimento: uma colher de sopa de azeite não converte arroz.
    if (measureRow && measureRow.food_id === foodId) {
      measure = {
        label: measureRow.label,
        grams: num(measureRow.grams),
        milliliters: num(measureRow.milliliters),
      };
    }
  }

  return {
    food: {
      name: foodRow.name,
      preparationState: asPreparationState(foodRow.preparation_state),
      brand: foodRow.brand,
      baseQuantity: num(foodRow.base_quantity) ?? 100,
      baseUnit: asBaseUnit(foodRow.base_unit),
      sourceId: foodRow.source_id,
      sourceName,
      sourceVersion: foodRow.source_version,
      sourceFoodCode: foodRow.source_food_code,
      nutrients: nutrientsByFood.get(foodId) ?? [],
    },
    measure,
  };
}

export type MeasureBasics = {
  id: string;
  foodId: string;
  label: string;
  grams: number | null;
  milliliters: number | null;
};

export async function getMeasures(measureIds: string[]): Promise<Map<string, MeasureBasics>> {
  const map = new Map<string, MeasureBasics>();
  if (measureIds.length === 0) return map;

  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_food_measures")
    .select("id,food_id,label,grams,milliliters")
    .in("id", measureIds);

  for (const row of data ?? []) {
    map.set(row.id, {
      id: row.id,
      foodId: row.food_id,
      label: row.label,
      grams: num(row.grams),
      milliliters: num(row.milliliters),
    });
  }
  return map;
}

/** Medidas caseiras de alimentos específicos (para o seletor de porção). */
export async function getMeasuresForFoods(
  foodIds: string[],
): Promise<Map<string, MeasureBasics[]>> {
  const map = new Map<string, MeasureBasics[]>();
  if (foodIds.length === 0) return map;

  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_food_measures")
    .select("id,food_id,label,grams,milliliters")
    .in("food_id", foodIds)
    .order("position");

  for (const row of data ?? []) {
    const measure: MeasureBasics = {
      id: row.id,
      foodId: row.food_id,
      label: row.label,
      grams: num(row.grams),
      milliliters: num(row.milliliters),
    };
    const list = map.get(row.food_id);
    if (list) list.push(measure);
    else map.set(row.food_id, [measure]);
  }
  return map;
}

/**
 * TODAS as medidas caseiras visíveis, indexadas por alimento.
 *
 * Cabe numa consulta só porque a TACO não publica medida caseira por alimento (ver 16-A): o
 * que existe aqui é o que o próprio usuário cadastrou, na casa das dezenas — não dos milhares.
 */
export async function getAllMeasuresByFood(): Promise<Map<string, MeasureBasics[]>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_food_measures")
    .select("id,food_id,label,grams,milliliters")
    .order("position")
    .limit(5000);

  const map = new Map<string, MeasureBasics[]>();
  for (const row of data ?? []) {
    const measure: MeasureBasics = {
      id: row.id,
      foodId: row.food_id,
      label: row.label,
      grams: num(row.grams),
      milliliters: num(row.milliliters),
    };
    const list = map.get(row.food_id);
    if (list) list.push(measure);
    else map.set(row.food_id, [measure]);
  }
  return map;
}

/* ═══════════════════════════ Água (módulo Hábitos) ═══════════════════════════ */

export type WaterDay = {
  habitId: string;
  name: string;
  unit: string;
  target: number;
  value: number;
  done: boolean;
};

/**
 * Consumo de água do dia, LIDO do módulo Hábitos (Fase 10).
 *
 * Regra 7 da subfase: a água NÃO é duplicada aqui. Se o usuário registra água em dois lugares,
 * os dois discordam no dia seguinte. A Dieta lê e linka para `/habitos`; quem grava é lá.
 * Devolve `null` quando não existe hábito de água — em vez de mostrar "0 ml de 0".
 */
export async function getWaterForDate(date: string): Promise<WaterDay | null> {
  const supabase = await createClient();

  const { data: habits } = await supabase
    .from("habits")
    .select("id,name,unit,target_value,is_active")
    .eq("category", "agua")
    .eq("is_active", true)
    .order("position")
    .limit(1);

  const habit = habits?.[0];
  if (!habit) return null;

  const { data: log } = await supabase
    .from("habit_logs")
    .select("value,is_done")
    .eq("habit_id", habit.id)
    .eq("log_date", date)
    .maybeSingle();

  return {
    habitId: habit.id,
    name: habit.name,
    unit: habit.unit,
    target: num(habit.target_value) ?? 0,
    value: num(log?.value) ?? 0,
    done: Boolean(log?.is_done),
  };
}

/* ═══════════════════════════ Pacote da visão geral ═══════════════════════════ */

export type NutritionDayPackage = {
  hoje: string;
  mealTypes: MealType[];
  periods: GoalPeriod[];
  meals: DiaryMeal[];
  planned: PlannedMeal[];
  water: WaterDay | null;
  profile: NutritionProfile | null;
};

/**
 * Tudo que a visão geral e a tela do dia precisam, numa leitura só.
 * `hoje` é injetável para teste e para navegação por data.
 */
export async function getNutritionDay(date = hojeISO()): Promise<NutritionDayPackage> {
  const [mealTypes, periods, meals, planned, water, profile] = await Promise.all([
    getMealTypes(),
    getGoalPeriods(),
    getDiaryMeals(date, date),
    getPlannedMeals(date, date),
    getWaterForDate(date),
    getNutritionProfile(),
  ]);

  return { hoje: date, mealTypes, periods, meals, planned, water, profile };
}
