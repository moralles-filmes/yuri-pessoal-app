/**
 * Fase 16-F — leitura do módulo Dieta para o Cron de notificações (SERVER-ONLY).
 *
 * Sem sessão de usuário: usa a service role, então **toda** query carrega `user_id`
 * explicitamente (a RLS é ignorada por essa role). Aqui só há I/O — a decisão de o que vira
 * notificação é do módulo PURO `./nutrition.ts`, e a soma do dia sai de `dayTotals`/`calc.ts`,
 * nunca de uma conta escrita neste arquivo.
 *
 * Lê pouco de propósito: só as colunas que uma notificação usa. O diário completo (com todos
 * os campos do snapshot) é caro e não é necessário para dizer "o almoço continua sem registro".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { addDaysIso, startOfWeekIso } from "@/lib/nutrition/calendar";
import { dayTotals, type CountableEntry } from "@/lib/nutrition/diary";
import { dayTargets, goalPeriodForDate } from "@/lib/nutrition/goals";
import { parseNutrientSnapshot } from "@/lib/nutrition/snapshot";
import {
  asChangeKind,
  asDayKind,
  asGoalType,
  asMealStatus,
  SHOPPING_OPEN_STATUSES,
} from "@/lib/nutrition/constants";
import type { GoalItemRow, GoalPeriod } from "@/lib/nutrition/types";
import type {
  GenFoodReview,
  GenGoalProgress,
  GenMeasurementDue,
  GenNutritionMeal,
  GenPantryItem,
  GenShoppingList,
  NutritionGenInput,
} from "./nutrition";

type Service = SupabaseClient<Database>;

/** Quantos dias para trás procurar refeição sem registro. */
const DIAS_RETROATIVOS = 3;

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

/**
 * Monta a entrada do gerador de notificações da Dieta para um usuário.
 * Nunca lança: uma leitura que falha vira lista vazia (o Cron inteiro não pode cair por
 * causa de um módulo).
 */
export async function buildNutritionGenInput(
  service: Service,
  userId: string,
  todayIso: string,
  minutosAgora: number,
): Promise<NutritionGenInput> {
  const desde = addDaysIso(todayIso, -DIAS_RETROATIVOS);
  // A "semana que vem" é a semana seguinte à de hoje, com a segunda como primeiro dia.
  const proximaSemana = addDaysIso(startOfWeekIso(todayIso, 1), 7);
  const fimProximaSemana = addDaysIso(proximaSemana, 6);

  const [
    diaryMealsRes,
    plannedMealsRes,
    mealTypesRes,
    weekPlanRes,
    listsRes,
    pantryRes,
    typesRes,
    measurementsRes,
    goalsRes,
    goalPeriodsRes,
    goalItemsRes,
    nutrientsRes,
    foodsRes,
  ] = await Promise.all([
    service
      .from("nutrition_diary_meals")
      .select("id,diary_date,meal_type_id,planned_meal_id,planned_time,status")
      .eq("user_id", userId)
      .gte("diary_date", desde)
      .lte("diary_date", todayIso),
    service
      .from("nutrition_planned_meals")
      .select("id,planned_date,meal_type_id,planned_time")
      .eq("user_id", userId)
      .gte("planned_date", desde)
      .lte("planned_date", todayIso),
    service
      .from("nutrition_meal_types")
      .select("id,name")
      .eq("user_id", userId),
    service
      .from("nutrition_planned_meals")
      .select("id")
      .eq("user_id", userId)
      .gte("planned_date", proximaSemana)
      .lte("planned_date", fimProximaSemana),
    // `archived_at` (instante) é a coluna real; `isArchived` é a derivação da leitura (16-D).
    service
      .from("nutrition_shopping_lists")
      .select("id,name,status,archived_at")
      .eq("user_id", userId)
      .eq("status", "ativa")
      .is("archived_at", null),
    service
      .from("nutrition_pantry_items")
      .select("id,label,quantity,expires_on")
      .eq("user_id", userId)
      .not("expires_on", "is", null),
    service
      .from("body_measurement_types")
      .select("id,name,is_active")
      .eq("user_id", userId)
      .eq("is_active", true),
    service
      .from("body_measurements")
      .select("type_id,measured_on")
      .eq("user_id", userId),
    service
      .from("body_measurement_goals")
      .select("type_id,status")
      .eq("user_id", userId)
      .eq("status", "ativa"),
    service
      .from("nutrition_goal_periods")
      .select("id,name,reason,starts_on,ends_on,goal_type,notes,is_active,created_at")
      .eq("user_id", userId),
    service
      .from("nutrition_goal_items")
      .select(
        "id,period_id,nutrient_code,weekday,day_kind,meal_type_id,target_amount,target_percent,min_amount,max_amount,notes,created_at",
      )
      .eq("user_id", userId),
    service.from("nutrition_nutrients").select("code,name,short_name,unit"),
    // Só alimentos DO USUÁRIO: a base do sistema é imutável e não cabe a ele revisá-la.
    service
      .from("nutrition_foods")
      .select("id,name,source_id,data_quality,is_verified,archived_at")
      .eq("user_id", userId)
      .is("archived_at", null),
  ]);

  /* ── Refeições: diário + planejado ainda não materializado ── */
  const mealTypeName = new Map(
    ((mealTypesRes.data ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]),
  );

  const diaryMeals = (diaryMealsRes.data ?? []) as Array<{
    id: string;
    diary_date: string;
    meal_type_id: string;
    planned_meal_id: string | null;
    planned_time: string | null;
    status: string;
  }>;

  // Itens por refeição: só o que decide "tem registro?" — a decisão gravada.
  const mealIds = diaryMeals.map((m) => m.id);
  const entriesRes = mealIds.length
    ? await service
        .from("nutrition_diary_entries")
        .select("diary_meal_id,change_kind")
        .eq("user_id", userId)
        .in("diary_meal_id", mealIds)
    : { data: [] as Array<{ diary_meal_id: string; change_kind: string }> };

  const entryCount = new Map<string, number>();
  for (const row of (entriesRes.data ?? []) as Array<{
    diary_meal_id: string;
    change_kind: string;
  }>) {
    // 'removido' é a decisão de pular um item planejado — não conta como registro de consumo.
    if (asChangeKind(row.change_kind) === "removido") continue;
    entryCount.set(row.diary_meal_id, (entryCount.get(row.diary_meal_id) ?? 0) + 1);
  }

  const meals: GenNutritionMeal[] = diaryMeals.map((m) => ({
    id: m.id,
    origin: "diario",
    date: m.diary_date,
    mealName: mealTypeName.get(m.meal_type_id) ?? "Refeição",
    plannedTime: m.planned_time,
    status: asMealStatus(m.status),
    entries: entryCount.get(m.id) ?? 0,
  }));

  // Refeição planejada que ainda não virou linha de diário: também merece o aviso.
  const materializados = new Set(
    diaryMeals.map((m) => m.planned_meal_id).filter((id): id is string => !!id),
  );
  for (const p of (plannedMealsRes.data ?? []) as Array<{
    id: string;
    planned_date: string | null;
    meal_type_id: string;
    planned_time: string | null;
  }>) {
    if (!p.planned_date || materializados.has(p.id)) continue;
    meals.push({
      id: p.id,
      origin: "planejado",
      date: p.planned_date,
      mealName: mealTypeName.get(p.meal_type_id) ?? "Refeição",
      plannedTime: p.planned_time,
      status: "planejada",
      entries: 0,
    });
  }

  /* ── Listas de compras com itens a pegar ── */
  const lists = (listsRes.data ?? []) as Array<{
    id: string;
    name: string;
    status: string;
    archived_at: string | null;
  }>;
  const listIds = lists.map((l) => l.id);
  const itemsRes = listIds.length
    ? await service
        .from("nutrition_shopping_list_items")
        .select("list_id,status")
        .eq("user_id", userId)
        .in("list_id", listIds)
        .in("status", SHOPPING_OPEN_STATUSES)
    : { data: [] as Array<{ list_id: string; status: string }> };

  const pending = new Map<string, number>();
  for (const row of (itemsRes.data ?? []) as Array<{ list_id: string; status: string }>) {
    pending.set(row.list_id, (pending.get(row.list_id) ?? 0) + 1);
  }
  const shoppingLists: GenShoppingList[] = lists.map((l) => ({
    id: l.id,
    name: l.name,
    status: l.status,
    isArchived: Boolean(l.archived_at),
    pendingItems: pending.get(l.id) ?? 0,
  }));

  /* ── Despensa ── */
  const pantry: GenPantryItem[] = (
    (pantryRes.data ?? []) as Array<{
      id: string;
      label: string;
      quantity: number | string | null;
      expires_on: string | null;
    }>
  ).map((p) => ({
    id: p.id,
    label: p.label,
    expiresOn: p.expires_on,
    // NULA continua NULA ("tenho, não sei quanto") — virar 0 aqui diria "acabou".
    quantity: num(p.quantity),
  }));

  /* ── Medidas: só os tipos que o usuário REALMENTE acompanha ──
   * Sem esse filtro, os 16 tipos semeados na primeira leitura virariam 16 notificações de
   * "nunca medido" para quem só acompanha o peso. Acompanhar = já mediu alguma vez, ou
   * definiu uma meta ativa para aquele tipo. */
  const lastByType = new Map<string, string>();
  for (const m of (measurementsRes.data ?? []) as Array<{
    type_id: string;
    measured_on: string;
  }>) {
    const cur = lastByType.get(m.type_id);
    if (!cur || m.measured_on > cur) lastByType.set(m.type_id, m.measured_on);
  }
  const goalTypes = new Set(
    ((goalsRes.data ?? []) as Array<{ type_id: string }>).map((g) => g.type_id),
  );
  const measurements: GenMeasurementDue[] = (
    (typesRes.data ?? []) as Array<{ id: string; name: string }>
  )
    .filter((t) => lastByType.has(t.id) || goalTypes.has(t.id))
    .map((t) => ({
      typeId: t.id,
      typeName: t.name,
      lastMeasuredOn: lastByType.get(t.id) ?? null,
    }));

  /* ── Meta do dia por perto (opt-in) ──
   * O total do dia sai de `dayTotals` (soma do SNAPSHOT) e a meta de `dayTargets` resolvida
   * PARA HOJE. Nenhuma conta nova. */
  const goalProgress = await buildGoalProgress(
    service,
    userId,
    todayIso,
    diaryMeals.map((m) => m.id),
    (goalPeriodsRes.data ?? []) as GoalPeriodRow[],
    (goalItemsRes.data ?? []) as GoalItemDbRow[],
    (nutrientsRes.data ?? []) as NutrientRow[],
  );

  /* ── Alimentos do usuário que podem ser revisados ── */
  const foodsToReview: GenFoodReview[] = [];
  for (const f of (foodsRes.data ?? []) as Array<{
    id: string;
    name: string;
    source_id: string | null;
    data_quality: string;
    is_verified: boolean;
  }>) {
    if (f.data_quality === "desconhecido") {
      foodsToReview.push({ id: f.id, name: f.name, reason: "em_revisao" });
    } else if (!f.source_id) {
      foodsToReview.push({ id: f.id, name: f.name, reason: "sem_fonte" });
    }
  }

  return {
    todayIso,
    minutosAgora,
    meals,
    weekPlan: {
      weekStart: proximaSemana,
      plannedMeals: (weekPlanRes.data ?? []).length,
    },
    shoppingLists,
    pantry,
    measurements,
    goalProgress,
    foodsToReview,
  };
}

/* ───────────────────────────── Meta do dia ───────────────────────────── */

type GoalPeriodRow = {
  id: string;
  name: string | null;
  reason: string | null;
  starts_on: string;
  ends_on: string | null;
  goal_type: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

type GoalItemDbRow = {
  id: string;
  period_id: string;
  nutrient_code: string;
  weekday: number | null;
  day_kind: string | null;
  meal_type_id: string | null;
  target_amount: number | string | null;
  target_percent: number | string | null;
  min_amount: number | string | null;
  max_amount: number | string | null;
  notes: string | null;
  created_at: string;
};

type NutrientRow = {
  code: string;
  name: string;
  short_name: string | null;
  unit: string;
};

/**
 * Progresso de hoje contra a meta que vale HOJE.
 *
 * Só entra nutriente que tem alvo (`amount`) definido: comparar contra uma faixa sem alvo
 * exigiria escolher um número, e escolher por conta própria é prescrever.
 */
async function buildGoalProgress(
  service: Service,
  userId: string,
  todayIso: string,
  mealIds: string[],
  periodRows: GoalPeriodRow[],
  itemRows: GoalItemDbRow[],
  nutrientRows: NutrientRow[],
): Promise<GenGoalProgress[]> {
  if (periodRows.length === 0 || mealIds.length === 0) return [];

  const itemsByPeriod = new Map<string, GoalItemRow[]>();
  for (const row of itemRows) {
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

  const periods: GoalPeriod[] = periodRows.map((row) => ({
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

  // ⛔ A meta é a que vale NESTE dia — não "a mais recente".
  const period = goalPeriodForDate(periods, todayIso);
  if (!period) return [];

  const { data } = await service
    .from("nutrition_diary_entries")
    .select("change_kind,nutrients_snapshot,diary_meal:nutrition_diary_meals!inner(diary_date)")
    .eq("user_id", userId)
    .in("diary_meal_id", mealIds);

  const entries: CountableEntry[] = [];
  for (const row of (data ?? []) as Array<{
    change_kind: string;
    nutrients_snapshot: unknown;
    diary_meal: { diary_date: string } | { diary_date: string }[] | null;
  }>) {
    const meal = Array.isArray(row.diary_meal) ? row.diary_meal[0] : row.diary_meal;
    if (meal?.diary_date !== todayIso) continue;
    entries.push({
      changeKind: asChangeKind(row.change_kind),
      nutrientsSnapshot: parseNutrientSnapshot(row.nutrients_snapshot),
    });
  }
  if (entries.length === 0) return [];

  const totals = dayTotals([{ entries }]);
  const targets = dayTargets(period, { date: todayIso, dayKind: null });
  const definitions = new Map(nutrientRows.map((n) => [n.code, n]));

  const progress: GenGoalProgress[] = [];
  for (const [code, target] of Object.entries(targets)) {
    if (target.amount === null || target.amount <= 0) continue;
    const total = totals[code];
    if (!total) continue;
    const definition = definitions.get(code);
    progress.push({
      code,
      label: definition?.short_name ?? definition?.name ?? code,
      unit: definition?.unit ?? "",
      amount: total.amount,
      target: target.amount,
      quality: total.quality,
    });
  }
  return progress;
}
