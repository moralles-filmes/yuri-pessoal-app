"use server";

/**
 * Fase 16-B — Dieta e Alimentação · Server Actions de metas, perfil e tipos de refeição.
 *
 * ══ A REGRA QUE ESTE ARQUIVO PROTEGE ══
 * Alterar a meta de hoje NÃO PODE mudar o relatório de ontem. Por isso não existe action de
 * "salvar a meta": existe criar/encerrar PERÍODO. Mudar de objetivo fecha o período atual e
 * abre outro, e as leituras passadas continuam encontrando a meta que valia naquela data.
 *
 * ══ SEM PRESCRIÇÃO ══
 * Nenhuma action define meta automaticamente. O estimador de gasto energético é puro
 * (`estimateEnergyExpenditure`), roda na tela, mostra a fórmula e só vira meta se o usuário
 * digitar/confirmar — o servidor nunca grava um alvo que a pessoa não pediu.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { addDaysIso } from "@/lib/nutrition/calendar";
import { NUTRITION_BASE_PATH } from "@/lib/nutrition/constants";
import {
  goalItemSchema,
  goalItemsBatchSchema,
  goalPeriodSchema,
  mealTypeReorderSchema,
  mealTypeSchema,
  nutritionProfileSchema,
} from "@/lib/validators/nutrition-diary";
import type { ActionResult } from "@/types/finance";

const GOALS_PATH = `${NUTRITION_BASE_PATH}/metas`;

function revalidateGoals() {
  revalidatePath(NUTRITION_BASE_PATH);
  revalidatePath(GOALS_PATH);
  revalidatePath(`${NUTRITION_BASE_PATH}/diario`);
}

/** Slug estável a partir do nome, para tipos de refeição criados pelo usuário. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "refeicao"
  );
}

/* ═══════════════════════════ Perfil ═══════════════════════════ */

export async function saveNutritionProfile(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = nutritionProfileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("nutrition_profiles")
    .upsert({ user_id: ctx.userId, ...parsed.data }, { onConflict: "user_id" });
  if (error) return dbError("Não foi possível salvar o perfil.");

  revalidateGoals();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Tipos de refeição ═══════════════════════════ */

export async function saveMealType(
  input: unknown,
  mealTypeId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = mealTypeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const payload = {
    name: data.name,
    icon: data.icon,
    color: data.color,
    default_time: data.default_time,
    is_active: data.is_active,
  };

  if (mealTypeId) {
    // O slug NÃO é regravado: ele é a identidade estável que torna o seed idempotente.
    // Renomear "Almoço" para "Refeição principal" não pode fazer o seed recriar um "Almoço".
    const { error } = await ctx.supabase
      .from("nutrition_meal_types")
      .update(payload)
      .eq("id", mealTypeId);
    if (error) return dbError("Já existe uma refeição com esse nome.");
    revalidateGoals();
    return { ok: true, data: { id: mealTypeId } };
  }

  const { count } = await ctx.supabase
    .from("nutrition_meal_types")
    .select("id", { count: "exact", head: true });

  const { data: created, error } = await ctx.supabase
    .from("nutrition_meal_types")
    .insert({
      ...payload,
      user_id: ctx.userId,
      slug: `${slugify(data.name)}_${Date.now().toString(36)}`,
      position: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !created) return dbError("Já existe uma refeição com esse nome.");

  revalidateGoals();
  return { ok: true, data: { id: created.id } };
}

/**
 * Excluir tipo de refeição.
 *
 * As FKs de `nutrition_diary_meals` e `nutrition_planned_meals` são `on delete restrict`, então
 * o banco já barraria. Conferimos antes para explicar em pt-BR e oferecer a saída certa —
 * DESATIVAR, que preserva todo o histórico. Nenhuma exclusão silenciosa, como no TO-DO.
 */
export async function deleteMealType(mealTypeId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const [{ count: diaryCount }, { count: plannedCount }] = await Promise.all([
    ctx.supabase
      .from("nutrition_diary_meals")
      .select("id", { count: "exact", head: true })
      .eq("meal_type_id", mealTypeId),
    ctx.supabase
      .from("nutrition_planned_meals")
      .select("id", { count: "exact", head: true })
      .eq("meal_type_id", mealTypeId),
  ]);

  const usos = (diaryCount ?? 0) + (plannedCount ?? 0);
  if (usos > 0) {
    return dbError(
      `Esta refeição já foi usada ${usos} ${usos === 1 ? "vez" : "vezes"} no diário ou no planejamento. Desative-a em vez de excluir — assim o histórico continua completo.`,
    );
  }

  const { error } = await ctx.supabase
    .from("nutrition_meal_types")
    .delete()
    .eq("id", mealTypeId);
  if (error) return dbError("Não foi possível excluir a refeição.");

  revalidateGoals();
  return { ok: true, data: undefined };
}

export async function reorderMealTypes(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = mealTypeReorderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  // Um update por item, como `reorderHabits`/`reorderTodoProjects`. Suficiente para single-user.
  await Promise.all(
    parsed.data.ids.map((id, index) =>
      ctx.supabase.from("nutrition_meal_types").update({ position: index }).eq("id", id),
    ),
  );

  revalidateGoals();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Períodos de meta ═══════════════════════════ */

export async function saveGoalPeriod(
  input: unknown,
  periodId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = goalPeriodSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (periodId) {
    const { error } = await ctx.supabase
      .from("nutrition_goal_periods")
      .update(data)
      .eq("id", periodId);
    if (error) return dbError("Não foi possível salvar o período.");
    revalidateGoals();
    return { ok: true, data: { id: periodId } };
  }

  const { data: created, error } = await ctx.supabase
    .from("nutrition_goal_periods")
    .insert({ ...data, user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível criar o período.");

  revalidateGoals();
  return { ok: true, data: { id: created.id } };
}

/**
 * Encerra o período vigente na véspera de `newStart` e abre outro.
 *
 * É ESTA action que preserva o histórico quando o usuário muda de objetivo. O caminho errado
 * seria editar o período atual, que reescreveria retroativamente a meta de todos os dias já
 * vividos dentro dele.
 */
export async function startNewGoalPeriod(
  input: unknown,
  previousPeriodId: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = goalPeriodSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data: previous } = await ctx.supabase
    .from("nutrition_goal_periods")
    .select("id,starts_on,ends_on")
    .eq("id", previousPeriodId)
    .maybeSingle();
  if (!previous) return dbError("Período anterior não encontrado.");

  // Véspera pela aritmética pura de data — nada de `new Date` no fuso local.
  const endsOn = addDaysIso(parsed.data.starts_on, -1);

  if (endsOn < previous.starts_on) {
    return dbError("O novo período começa antes do anterior. Escolha uma data posterior.");
  }

  const { error: closeError } = await ctx.supabase
    .from("nutrition_goal_periods")
    .update({ ends_on: endsOn, is_active: false })
    .eq("id", previousPeriodId);
  if (closeError) return dbError("Não foi possível encerrar o período anterior.");

  const { data: created, error } = await ctx.supabase
    .from("nutrition_goal_periods")
    .insert({ ...parsed.data, user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível criar o novo período.");

  revalidateGoals();
  return { ok: true, data: { id: created.id } };
}

export async function deleteGoalPeriod(periodId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // Os valores vão junto (cascade). Nenhum registro do DIÁRIO é afetado: o consumo não
  // depende da meta, e o histórico do que foi comido continua intacto.
  const { error } = await ctx.supabase
    .from("nutrition_goal_periods")
    .delete()
    .eq("id", periodId);
  if (error) return dbError("Não foi possível excluir o período.");

  revalidateGoals();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Valores da meta ═══════════════════════════ */

/**
 * Salva UM valor de meta.
 *
 * Apaga a linha do mesmo escopo antes de inserir, em vez de `upsert`. Motivo concreto: o
 * índice único do escopo é sobre EXPRESSÕES (`coalesce(weekday, -1)` e afins), porque NULL
 * precisa se comportar como curinga — e o PostgREST não consegue apontar `onConflict` para um
 * índice de expressão. Delete-do-escopo + insert entrega o mesmo resultado sem depender disso.
 */
export async function saveGoalItem(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = goalItemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { error: deleteError } = await deleteScopedGoalItems(ctx, {
    periodId: data.period_id,
    nutrientCode: data.nutrient_code,
    weekday: data.weekday,
    dayKind: data.day_kind,
    mealTypeId: data.meal_type_id,
  });
  if (deleteError) return dbError("Não foi possível salvar a meta.");

  const { error } = await ctx.supabase
    .from("nutrition_goal_items")
    .insert({ ...data, user_id: ctx.userId });
  if (error) return dbError("Não foi possível salvar a meta.");

  revalidateGoals();
  return { ok: true, data: undefined };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/**
 * Apaga as linhas de um escopo. `null` precisa virar `is null` no filtro — `eq(coluna, null)`
 * no PostgREST não casa com NULL, e o escopo "vale para qualquer dia" nunca seria limpo.
 */
async function deleteScopedGoalItems(
  ctx: Ctx,
  scope: {
    periodId: string;
    nutrientCode?: string;
    weekday: number | null;
    dayKind: string | null;
    mealTypeId: string | null;
  },
) {
  let query = ctx.supabase.from("nutrition_goal_items").delete().eq("period_id", scope.periodId);
  if (scope.nutrientCode) query = query.eq("nutrient_code", scope.nutrientCode);
  query = scope.weekday === null ? query.is("weekday", null) : query.eq("weekday", scope.weekday);
  query = scope.dayKind === null ? query.is("day_kind", null) : query.eq("day_kind", scope.dayKind);
  query =
    scope.mealTypeId === null
      ? query.is("meal_type_id", null)
      : query.eq("meal_type_id", scope.mealTypeId);
  return query;
}

/**
 * Salva de uma vez todos os valores de UM escopo (a tela edita a tabela inteira).
 *
 * Apaga apenas as linhas DAQUELE escopo antes de gravar. Um `delete` mais amplo levaria junto
 * a meta de outro dia da semana ou de outra refeição sem o usuário ter pedido.
 */
export async function saveGoalItems(input: unknown): Promise<ActionResult<{ salvos: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = goalItemsBatchSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { period_id: periodId, weekday, day_kind: dayKind, meal_type_id: mealTypeId, items } = parsed.data;

  const { data: period } = await ctx.supabase
    .from("nutrition_goal_periods")
    .select("id")
    .eq("id", periodId)
    .maybeSingle();
  if (!period) return dbError("Período não encontrado.");

  const { error: deleteError } = await deleteScopedGoalItems(ctx, {
    periodId,
    weekday,
    dayKind,
    mealTypeId,
  });
  if (deleteError) return dbError("Não foi possível atualizar as metas.");

  // Linha sem nenhum número não é gravada: ela não configuraria nada e o CHECK a rejeitaria.
  const rows = items
    .filter(
      (item) =>
        item.target_amount !== null ||
        item.target_percent !== null ||
        item.min_amount !== null ||
        item.max_amount !== null,
    )
    .map((item) => ({
      user_id: ctx.userId,
      period_id: periodId,
      nutrient_code: item.nutrient_code,
      weekday,
      day_kind: dayKind,
      meal_type_id: mealTypeId,
      target_amount: item.target_amount,
      target_percent: mealTypeId ? item.target_percent : null,
      min_amount: item.min_amount,
      max_amount: item.max_amount,
    }));

  if (rows.length > 0) {
    const { error } = await ctx.supabase.from("nutrition_goal_items").insert(rows);
    if (error) return dbError("Não foi possível salvar as metas.");
  }

  revalidateGoals();
  return { ok: true, data: { salvos: rows.length } };
}

export async function deleteGoalItem(itemId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("nutrition_goal_items").delete().eq("id", itemId);
  if (error) return dbError("Não foi possível excluir a meta.");

  revalidateGoals();
  return { ok: true, data: undefined };
}
