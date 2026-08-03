"use server";

/**
 * Fase 16-B — Dieta e Alimentação · Server Actions do planejamento.
 *
 * ══ TRÊS COMPROMISSOS ══
 *
 * 1. O PLANO NUNCA É REESCRITO PELO CONSUMO. Nenhuma action daqui lê ou grava no diário. As
 *    duas histórias vivem em tabelas separadas e só se encontram na leitura.
 *
 * 2. EDITAR EM SÉRIE SEMPRE PERGUNTA O ESCOPO. `plannedMealsInScope` (puro, testado) traduz a
 *    escolha em uma lista de ids; o servidor não amplia o escopo por conta própria — e o
 *    PASSADO nunca é alterado em nenhum dos três escopos.
 *
 * 3. APLICAR MODELO É MATERIALIZAR. As refeições nascem com data concreta e ficam
 *    independentes do modelo. Assim o modelo pode mudar amanhã sem reescrever o que já foi
 *    planejado (e possivelmente consumido) ontem.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { hojeISO } from "@/lib/format";
import { addDaysIso } from "@/lib/nutrition/calendar";
import { NUTRITION_BASE_PATH } from "@/lib/nutrition/constants";
import { getNutritionPlans, getPlannedMealsForSeries } from "@/lib/nutrition/diary-queries";
import {
  copyDayPlan,
  duplicateWeekPlan,
  materializationTargets,
  plannedMealsInScope,
} from "@/lib/nutrition/plan-recurrence";
import type { PlannedMeal } from "@/lib/nutrition/types";
import {
  applyPlanSchema,
  copyDaySchema,
  duplicateWeekSchema,
  nutritionPlanSchema,
  planDaySchema,
  plannedMealItemSchema,
  plannedMealSchema,
  plannedMealScopeSchema,
} from "@/lib/validators/nutrition-diary";
import type { ActionResult } from "@/types/finance";

const PLANNING_PATH = `${NUTRITION_BASE_PATH}/planejamento`;

function revalidatePlanning() {
  revalidatePath(NUTRITION_BASE_PATH);
  revalidatePath(PLANNING_PATH);
  revalidatePath(`${NUTRITION_BASE_PATH}/diario`);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/* ═══════════════════════════ Modelos ═══════════════════════════ */

export async function saveNutritionPlan(
  input: unknown,
  planId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = nutritionPlanSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (data.cycle_weeks > 1 && !data.anchor_date) {
    return dbError(
      "Um ciclo de mais de uma semana precisa de uma semana inicial: sem ela não há como saber em qual semana do ciclo cada data cai.",
    );
  }

  // Só um modelo padrão por usuário (índice único parcial no banco).
  if (data.is_default) {
    await ctx.supabase
      .from("nutrition_plans")
      .update({ is_default: false })
      .eq("is_default", true);
  }

  if (planId) {
    const { error } = await ctx.supabase.from("nutrition_plans").update(data).eq("id", planId);
    if (error) return dbError("Já existe um modelo com esse nome.");
    revalidatePlanning();
    return { ok: true, data: { id: planId } };
  }

  const { data: created, error } = await ctx.supabase
    .from("nutrition_plans")
    .insert({ ...data, user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !created) return dbError("Já existe um modelo com esse nome.");

  revalidatePlanning();
  return { ok: true, data: { id: created.id } };
}

/**
 * Exclui um modelo.
 *
 * As refeições JÁ MATERIALIZADAS não são apagadas: `plan_id` e `plan_day_id` são
 * `on delete set null`, então o que estava planejado para datas concretas continua lá,
 * apenas sem origem. Apagar o histórico de planejamento junto com o modelo destruiria a
 * comparação planejado × consumido dos dias passados.
 */
export async function deleteNutritionPlan(planId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // Só as linhas de MODELO (sem data) somem — o `cascade` de plan_day_id não as alcança
  // porque a FK é `set null`, então a limpeza é explícita.
  const { data: days } = await ctx.supabase
    .from("nutrition_plan_days")
    .select("id")
    .eq("plan_id", planId);

  if (days?.length) {
    await ctx.supabase
      .from("nutrition_planned_meals")
      .delete()
      .is("planned_date", null)
      .in(
        "plan_day_id",
        days.map((day) => day.id),
      );
  }

  const { error } = await ctx.supabase.from("nutrition_plans").delete().eq("id", planId);
  if (error) return dbError("Não foi possível excluir o modelo.");

  revalidatePlanning();
  return { ok: true, data: undefined };
}

export async function savePlanDay(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = planDaySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: plan } = await ctx.supabase
    .from("nutrition_plans")
    .select("id,cycle_weeks")
    .eq("id", data.plan_id)
    .maybeSingle();
  if (!plan) return dbError("Modelo não encontrado.");
  if (data.week_index >= plan.cycle_weeks) {
    return dbError("Esta semana está fora do ciclo do modelo.");
  }

  const { data: created, error } = await ctx.supabase
    .from("nutrition_plan_days")
    .upsert({ ...data, user_id: ctx.userId }, { onConflict: "plan_id,week_index,weekday" })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível salvar o dia do modelo.");

  revalidatePlanning();
  return { ok: true, data: { id: created.id } };
}

export async function deletePlanDay(dayId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // Apaga só as refeições de MODELO do dia; as materializadas ficam (FK `set null`).
  await ctx.supabase
    .from("nutrition_planned_meals")
    .delete()
    .eq("plan_day_id", dayId)
    .is("planned_date", null);

  const { error } = await ctx.supabase.from("nutrition_plan_days").delete().eq("id", dayId);
  if (error) return dbError("Não foi possível excluir o dia.");

  revalidatePlanning();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Refeições planejadas ═══════════════════════════ */

export async function savePlannedMeal(
  input: unknown,
  plannedMealId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = plannedMealSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (plannedMealId) {
    const { error } = await ctx.supabase
      .from("nutrition_planned_meals")
      .update(data)
      .eq("id", plannedMealId);
    if (error) return dbError("Não foi possível salvar a refeição planejada.");
    revalidatePlanning();
    return { ok: true, data: { id: plannedMealId } };
  }

  // Posição no fim da lista do dia (ou do dia do modelo, quando a refeição não tem data).
  // Filtrar por `planned_date = ""` quebraria: coluna `date` não aceita string vazia.
  const positionQuery = ctx.supabase
    .from("nutrition_planned_meals")
    .select("id", { count: "exact", head: true });
  const { count } = await (data.planned_date
    ? positionQuery.eq("planned_date", data.planned_date)
    : positionQuery.eq("plan_day_id", data.plan_day_id!).is("planned_date", null));

  const { data: created, error } = await ctx.supabase
    .from("nutrition_planned_meals")
    .insert({ ...data, user_id: ctx.userId, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível criar a refeição planejada.");

  revalidatePlanning();
  return { ok: true, data: { id: created.id } };
}

/**
 * Aplica uma edição de horário/título a um ESCOPO escolhido pelo usuário.
 * O escopo é resolvido pela função pura, e nunca alcança datas passadas.
 */
export async function updatePlannedMealInScope(
  input: unknown,
  patch: { planned_time?: string | null; title?: string | null; notes?: string | null },
): Promise<ActionResult<{ afetadas: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = plannedMealScopeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const targets = await resolveScope(ctx, parsed.data.planned_meal_id, parsed.data.scope);
  if (!targets) return dbError("Refeição planejada não encontrada.");

  const { error } = await ctx.supabase
    .from("nutrition_planned_meals")
    .update(patch)
    .in(
      "id",
      targets.map((meal) => meal.id),
    );
  if (error) return dbError("Não foi possível aplicar a alteração.");

  revalidatePlanning();
  return { ok: true, data: { afetadas: targets.length } };
}

export async function deletePlannedMealInScope(
  input: unknown,
): Promise<ActionResult<{ excluidas: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = plannedMealScopeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const targets = await resolveScope(ctx, parsed.data.planned_meal_id, parsed.data.scope);
  if (!targets) return dbError("Refeição planejada não encontrada.");

  const { error } = await ctx.supabase
    .from("nutrition_planned_meals")
    .delete()
    .in(
      "id",
      targets.map((meal) => meal.id),
    );
  if (error) return dbError("Não foi possível excluir.");

  revalidatePlanning();
  return { ok: true, data: { excluidas: targets.length } };
}

/** Carrega a série e delega a decisão do escopo para a função pura. */
async function resolveScope(
  ctx: Ctx,
  plannedMealId: string,
  scope: "somente_este_dia" | "este_e_proximos" | "todo_o_modelo",
): Promise<PlannedMeal[] | null> {
  const { data: row } = await ctx.supabase
    .from("nutrition_planned_meals")
    .select("id,plan_id,plan_day_id,planned_date,meal_type_id,planned_time,title,notes,position")
    .eq("id", plannedMealId)
    .maybeSingle();
  if (!row) return null;

  const target: PlannedMeal = {
    id: row.id,
    planId: row.plan_id,
    planDayId: row.plan_day_id,
    plannedDate: row.planned_date,
    mealTypeId: row.meal_type_id,
    mealTypeName: "",
    mealTypeIcon: null,
    plannedTime: row.planned_time,
    title: row.title,
    notes: row.notes,
    position: row.position,
    items: [],
  };

  if (!row.plan_day_id) return [target];
  const series = await getPlannedMealsForSeries(row.plan_day_id);
  return plannedMealsInScope(scope, target, series, hojeISO());
}

/* ═══════════════════════════ Itens planejados ═══════════════════════════ */

export async function savePlannedMealItem(
  input: unknown,
  itemId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = plannedMealItemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  // Guarda o rótulo da medida junto: se a medida for excluída depois, o item continua legível.
  let measureLabel: string | null = null;
  if (data.measure_id) {
    const { data: measure } = await ctx.supabase
      .from("nutrition_food_measures")
      .select("label,food_id")
      .eq("id", data.measure_id)
      .maybeSingle();
    if (measure && data.food_id && measure.food_id !== data.food_id) {
      return dbError("Esta medida caseira é de outro alimento.");
    }
    measureLabel = measure?.label ?? null;
  }

  const payload = {
    planned_meal_id: data.planned_meal_id,
    food_id: data.food_id,
    custom_label: data.custom_label,
    quantity: data.quantity,
    measure_id: data.measure_id,
    measure_label: measureLabel,
    is_optional: data.is_optional,
    notes: data.notes,
  };

  if (itemId) {
    const { error } = await ctx.supabase
      .from("nutrition_planned_meal_items")
      .update(payload)
      .eq("id", itemId);
    if (error) return dbError("Não foi possível salvar o item.");
    revalidatePlanning();
    return { ok: true, data: { id: itemId } };
  }

  const { count } = await ctx.supabase
    .from("nutrition_planned_meal_items")
    .select("id", { count: "exact", head: true })
    .eq("planned_meal_id", data.planned_meal_id);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_planned_meal_items")
    .insert({ ...payload, user_id: ctx.userId, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível adicionar o item.");

  revalidatePlanning();
  return { ok: true, data: { id: created.id } };
}

export async function deletePlannedMealItem(itemId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // O que já foi consumido não é tocado: `nutrition_diary_entries.planned_item_id` é
  // `on delete set null`, então o registro do diário sobrevive com o snapshot intacto.
  const { error } = await ctx.supabase
    .from("nutrition_planned_meal_items")
    .delete()
    .eq("id", itemId);
  if (error) return dbError("Não foi possível excluir o item.");

  revalidatePlanning();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Aplicar modelo ═══════════════════════════ */

/**
 * Materializa um modelo num período.
 *
 * `replace` apaga o que já estava planejado NAS DATAS ALVO antes de recriar — e só nelas.
 * Sem ele, aplicar duas vezes não duplica: o índice único parcial
 * (plan_day_id, planned_date, meal_type_id) faz a segunda tentativa virar atualização.
 */
export async function applyPlanToPeriod(
  input: unknown,
): Promise<ActionResult<{ dias: number; refeicoes: number; itens: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = applyPlanSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { plan_id: planId, from, to, replace } = parsed.data;

  const plans = await getNutritionPlans();
  const plan = plans.find((item) => item.id === planId);
  if (!plan) return dbError("Modelo não encontrado.");
  if (plan.cycleWeeks > 1 && !plan.anchorDate) {
    return dbError("Defina a semana inicial do modelo antes de aplicá-lo.");
  }

  const targets = materializationTargets(plan, from, to);
  if (targets.length === 0) {
    return dbError("O modelo não cobre nenhum dia deste período.");
  }

  if (replace) {
    const { error } = await ctx.supabase
      .from("nutrition_planned_meals")
      .delete()
      .gte("planned_date", from)
      .lte("planned_date", to);
    if (error) return dbError("Não foi possível limpar o período.");
  }

  let refeicoes = 0;
  let itens = 0;

  for (const target of targets) {
    for (const modelMeal of target.day.meals) {
      const payload = {
        plan_id: plan.id,
        plan_day_id: target.day.id,
        planned_date: target.date,
        meal_type_id: modelMeal.mealTypeId,
        planned_time: modelMeal.plannedTime,
        title: modelMeal.title,
        notes: modelMeal.notes,
        position: modelMeal.position,
      };

      // Reler e decidir, em vez de `upsert`: o índice que garante a não duplicação é PARCIAL
      // (`where plan_day_id is not null and planned_date is not null`), e o Postgres não
      // infere índice parcial num `ON CONFLICT` sem repetir o predicado — o upsert falharia
      // com "no unique or exclusion constraint matching".
      const { data: existing } = await ctx.supabase
        .from("nutrition_planned_meals")
        .select("id")
        .eq("plan_day_id", target.day.id)
        .eq("planned_date", target.date)
        .eq("meal_type_id", modelMeal.mealTypeId)
        .maybeSingle();

      let mealId = existing?.id ?? null;
      if (mealId) {
        await ctx.supabase.from("nutrition_planned_meals").update(payload).eq("id", mealId);
      } else {
        const { data: inserted, error } = await ctx.supabase
          .from("nutrition_planned_meals")
          .insert({ ...payload, user_id: ctx.userId })
          .select("id")
          .single();
        if (error || !inserted) continue;
        mealId = inserted.id;
      }
      const created = { id: mealId };
      refeicoes += 1;

      // Itens: substituição completa, para reaplicar o modelo refletir o modelo atual.
      await ctx.supabase
        .from("nutrition_planned_meal_items")
        .delete()
        .eq("planned_meal_id", created.id);

      if (modelMeal.items.length > 0) {
        const { error: itemsError } = await ctx.supabase
          .from("nutrition_planned_meal_items")
          .insert(
            modelMeal.items.map((item, index) => ({
              user_id: ctx.userId,
              planned_meal_id: created.id,
              food_id: item.foodId,
              custom_label: item.customLabel,
              quantity: item.quantity,
              measure_id: item.measureId,
              measure_label: item.measureLabel,
              is_optional: item.isOptional,
              notes: item.notes,
              position: index,
            })),
          );
        if (!itemsError) itens += modelMeal.items.length;
      }
    }
  }

  revalidatePlanning();
  return { ok: true, data: { dias: targets.length, refeicoes, itens } };
}

/* ═══════════════════════════ Copiar ═══════════════════════════ */

/** Copia as refeições planejadas de um dia para outro. A origem fica intacta. */
export async function copyPlannedDay(
  input: unknown,
): Promise<ActionResult<{ refeicoes: number; itens: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = copyDaySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { from_date: fromDate, to_date: toDate, replace } = parsed.data;

  if (fromDate === toDate) return dbError("Escolha um dia de destino diferente.");

  const { data: sourceRows } = await ctx.supabase
    .from("nutrition_planned_meals")
    .select("id,meal_type_id,planned_time,title,notes,position")
    .eq("planned_date", fromDate)
    .order("position");

  if (!sourceRows?.length) return dbError("Não há nada planejado no dia de origem.");

  if (replace) {
    await ctx.supabase.from("nutrition_planned_meals").delete().eq("planned_date", toDate);
  }

  const copies = copyDayPlan(
    sourceRows.map((row) => ({
      id: row.id,
      planId: null,
      planDayId: null,
      plannedDate: fromDate,
      mealTypeId: row.meal_type_id,
      mealTypeName: "",
      mealTypeIcon: null,
      plannedTime: row.planned_time,
      title: row.title,
      notes: row.notes,
      position: row.position,
      items: [],
    })),
    toDate,
  );

  return duplicateMeals(ctx, copies);
}

export async function duplicatePlannedWeek(
  input: unknown,
): Promise<ActionResult<{ refeicoes: number; itens: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = duplicateWeekSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { from_week_start: fromStart, to_week_start: toStart, replace } = parsed.data;

  if (fromStart === toStart) return dbError("Escolha uma semana de destino diferente.");

  const fromEnd = addDaysIso(fromStart, 6);
  const toEnd = addDaysIso(toStart, 6);

  const { data: sourceRows } = await ctx.supabase
    .from("nutrition_planned_meals")
    .select("id,planned_date,meal_type_id,planned_time,title,notes,position")
    .gte("planned_date", fromStart)
    .lte("planned_date", fromEnd)
    .order("planned_date")
    .order("position");

  if (!sourceRows?.length) return dbError("Não há nada planejado na semana de origem.");

  if (replace) {
    await ctx.supabase
      .from("nutrition_planned_meals")
      .delete()
      .gte("planned_date", toStart)
      .lte("planned_date", toEnd);
  }

  const copies = duplicateWeekPlan(
    sourceRows.map((row) => ({
      id: row.id,
      planId: null,
      planDayId: null,
      plannedDate: row.planned_date,
      mealTypeId: row.meal_type_id,
      mealTypeName: "",
      mealTypeIcon: null,
      plannedTime: row.planned_time,
      title: row.title,
      notes: row.notes,
      position: row.position,
      items: [],
    })),
    fromStart,
    toStart,
  );

  return duplicateMeals(ctx, copies);
}

/**
 * Cria as refeições copiadas junto com seus itens.
 *
 * A cópia NÃO herda `plan_day_id`: ela passa a ser avulsa. Herdar a origem faria uma edição
 * futura "deste dia e os próximos" no modelo atingir uma refeição que o usuário copiou à mão
 * para outro dia — uma surpresa desagradável e difícil de desfazer.
 */
async function duplicateMeals(
  ctx: Ctx,
  copies: { sourceMealId: string; targetDate: string; mealTypeId: string; plannedTime: string | null; title: string | null; notes: string | null; position: number }[],
): Promise<ActionResult<{ refeicoes: number; itens: number }>> {
  let refeicoes = 0;
  let itens = 0;

  for (const copy of copies) {
    const { data: created, error } = await ctx.supabase
      .from("nutrition_planned_meals")
      .insert({
        user_id: ctx.userId,
        plan_id: null,
        plan_day_id: null,
        planned_date: copy.targetDate,
        meal_type_id: copy.mealTypeId,
        planned_time: copy.plannedTime,
        title: copy.title,
        notes: copy.notes,
        position: copy.position,
      })
      .select("id")
      .single();
    if (error || !created) continue;
    refeicoes += 1;

    const { data: sourceItems } = await ctx.supabase
      .from("nutrition_planned_meal_items")
      .select("food_id,custom_label,quantity,measure_id,measure_label,is_optional,notes,position")
      .eq("planned_meal_id", copy.sourceMealId)
      .order("position");

    if (sourceItems?.length) {
      const { error: itemsError } = await ctx.supabase
        .from("nutrition_planned_meal_items")
        .insert(
          sourceItems.map((item) => ({ ...item, user_id: ctx.userId, planned_meal_id: created.id })),
        );
      if (!itemsError) itens += sourceItems.length;
    }
  }

  revalidatePlanning();
  return { ok: true, data: { refeicoes, itens } };
}
