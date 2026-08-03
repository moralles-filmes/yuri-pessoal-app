"use server";

/**
 * Fase 16-A — Dieta e Alimentação · Server Actions do catálogo de alimentos.
 *
 * Contrato do projeto (src/lib/actions/accounts.ts é o molde):
 *   1. `authContext()` → `{ supabase, userId }`; `user_id` SEMPRE de `auth.getUser()`.
 *   2. Zod no servidor; erro → `invalid(...)`.
 *   3. Query Supabase com `user_id: ctx.userId` nos inserts; erro → `dbError(...)`.
 *   4. `revalidatePath` + `ActionResult`.
 *
 * DUAS REGRAS PRÓPRIAS DESTE MÓDULO:
 *
 * • A BASE DO SISTEMA É IMUTÁVEL. Nenhuma action edita ou exclui alimento com
 *   `user_id is null`. A policy já barra no banco; aqui barramos antes, para devolver uma
 *   mensagem em pt-BR em vez de "0 linhas afetadas". Favoritar/arquivar/recategorizar um
 *   alimento global grava em `nutrition_food_prefs`, que é dado do usuário.
 *
 * • FONTE OFICIAL NÃO SE FORJA. Um alimento criado à mão nunca pode apontar para a TACO:
 *   isso faria um número digitado parecer publicado por uma tabela oficial.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { NUTRITION_BASE_PATH } from "@/lib/nutrition/constants";
import { getFoodDetail } from "@/lib/nutrition/queries";
import type { FoodDetail } from "@/lib/nutrition/types";
import {
  nutritionBulkSchema,
  nutritionDuplicateSchema,
  nutritionFoodMeasureSchema,
  nutritionFoodPrefSchema,
  nutritionFoodWithNutrientsSchema,
  nutritionTagSchema,
} from "@/lib/validators/nutrition";
import type { ActionResult } from "@/types/finance";

const FOODS_PATH = `${NUTRITION_BASE_PATH}/alimentos`;

function revalidateNutrition() {
  revalidatePath(NUTRITION_BASE_PATH);
  revalidatePath(FOODS_PATH);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

const NOT_EDITABLE =
  "Alimentos da base do sistema são somente leitura. Use “Duplicar” para criar uma cópia sua e editar à vontade.";

/**
 * Confere que o alimento existe E pertence ao usuário. Devolve `null` quando é da base do
 * sistema ou não existe — o chamador transforma isso na mensagem certa.
 */
async function assertOwnFood(ctx: Ctx, foodId: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("nutrition_foods")
    .select("id,user_id")
    .eq("id", foodId)
    .maybeSingle();
  return Boolean(data && data.user_id === ctx.userId);
}

/** Uma fonte pode ser usada num alimento do usuário? Oficiais ficam de fora. */
async function isAssignableSource(ctx: Ctx, sourceId: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("nutrition_food_sources")
    .select("id,user_id,is_official")
    .eq("id", sourceId)
    .maybeSingle();
  if (!data) return false;
  return data.user_id === ctx.userId || !data.is_official;
}

/* ───────────────────────────── Leitura sob demanda ─────────────────────────────
 * O detalhe traz todos os nutrientes do alimento. Carregar isso para os 597 da base de uma
 * vez seriam ~21 mil linhas no cliente; buscar só o que foi aberto mantém a tela leve.
 */

export async function fetchNutritionFoodDetail(
  foodId: string,
): Promise<ActionResult<FoodDetail>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const detail = await getFoodDetail(foodId);
  if (!detail) return dbError("Alimento não encontrado.");
  return { ok: true, data: detail };
}

/* ───────────────────────────── Criar / editar ───────────────────────────── */

export async function saveNutritionFood(
  input: unknown,
  foodId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = nutritionFoodWithNutrientsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { food, nutrients } = parsed.data;

  if (foodId && !(await assertOwnFood(ctx, foodId))) return dbError(NOT_EDITABLE);
  if (food.source_id && !(await isAssignableSource(ctx, food.source_id))) {
    return dbError(
      "Não é possível atribuir uma fonte oficial a um alimento cadastrado manualmente. Escolha “Cadastro próprio” ou “Rótulo do fabricante”.",
    );
  }

  const payload = {
    name: food.name,
    alternative_name: food.alternative_name,
    brand: food.brand,
    barcode: food.barcode,
    category_id: food.category_id,
    food_type: food.food_type,
    preparation_state: food.preparation_state,
    base_quantity: food.base_quantity,
    base_unit: food.base_unit,
    edible_portion_percent: food.edible_portion_percent,
    source_id: food.source_id,
    source_food_code: food.source_food_code,
    source_version: food.source_version,
    data_quality: food.data_quality,
    last_verified_at: food.last_verified_at,
    notes: food.notes,
  };

  let id = foodId;
  if (foodId) {
    const { error } = await ctx.supabase.from("nutrition_foods").update(payload).eq("id", foodId);
    if (error) return dbError("Não foi possível salvar o alimento.");
  } else {
    const { data, error } = await ctx.supabase
      .from("nutrition_foods")
      .insert({ ...payload, user_id: ctx.userId, is_system_food: false })
      .select("id")
      .single();
    if (error || !data) return dbError("Não foi possível criar o alimento.");
    id = data.id;
  }
  if (!id) return dbError("Não foi possível salvar o alimento.");

  // Nutrientes: substituição completa do conjunto. Apagar antes evita deixar órfão um
  // nutriente que o usuário removeu do formulário.
  const { error: deleteError } = await ctx.supabase
    .from("nutrition_food_nutrients")
    .delete()
    .eq("food_id", id);
  if (deleteError) return dbError("Não foi possível atualizar os nutrientes.");

  if (nutrients.length > 0) {
    const rows = nutrients.map((nutrient) => ({
      user_id: ctx.userId,
      food_id: id,
      nutrient_code: nutrient.nutrient_code,
      // A constraint do banco exige coerência; o schema já garantiu, isto é defesa dupla.
      amount: nutrient.value_state === "disponivel" ? nutrient.amount : null,
      value_state: nutrient.value_state,
      method: nutrient.method,
    }));
    const { error } = await ctx.supabase.from("nutrition_food_nutrients").insert(rows);
    if (error) return dbError("Não foi possível salvar os nutrientes.");
  }

  revalidateNutrition();
  return { ok: true, data: { id } };
}

/* ───────────────────────────── Duplicar ─────────────────────────────
 * O caminho que torna a base do sistema utilizável: o usuário copia um alimento oficial,
 * ganha uma versão editável e a origem fica registrada em `origin_food_id`.
 */

export async function duplicateNutritionFood(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = nutritionDuplicateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { food_id: foodId, name } = parsed.data;

  const { data: original } = await ctx.supabase
    .from("nutrition_foods")
    .select("*")
    .eq("id", foodId)
    .maybeSingle();
  if (!original) return dbError("Alimento não encontrado.");

  const { data: created, error } = await ctx.supabase
    .from("nutrition_foods")
    .insert({
      user_id: ctx.userId,
      is_system_food: false,
      name: name ?? `${original.name} (cópia)`,
      alternative_name: original.alternative_name,
      brand: original.brand,
      // Código de barras NÃO é copiado: dois alimentos com o mesmo código confundiriam a
      // busca por código e a leitura futura pela câmera.
      barcode: null,
      category_id: original.category_id,
      food_type: original.food_type,
      preparation_state: original.preparation_state,
      base_quantity: original.base_quantity,
      base_unit: original.base_unit,
      edible_portion_percent: original.edible_portion_percent,
      source_id: original.source_id,
      source_food_code: original.source_food_code,
      source_version: original.source_version,
      // A cópia herda os números, mas quem a editar passa a responder por eles.
      data_quality: original.data_quality,
      is_verified: false,
      last_verified_at: original.last_verified_at,
      notes: original.notes,
      origin_food_id: original.id,
    })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível duplicar o alimento.");

  // Copia nutrientes e medidas preservando estado e método — inclusive os "não disponível".
  const [{ data: nutrients }, { data: measures }] = await Promise.all([
    ctx.supabase
      .from("nutrition_food_nutrients")
      .select("nutrient_code,amount,value_state,method,source_note")
      .eq("food_id", foodId),
    ctx.supabase
      .from("nutrition_food_measures")
      .select("label,unit_type,grams,milliliters,is_default,position,source_note")
      .eq("food_id", foodId),
  ]);

  if (nutrients?.length) {
    await ctx.supabase.from("nutrition_food_nutrients").insert(
      nutrients.map((row) => ({ ...row, user_id: ctx.userId, food_id: created.id })),
    );
  }
  if (measures?.length) {
    await ctx.supabase.from("nutrition_food_measures").insert(
      measures.map((row) => ({ ...row, user_id: ctx.userId, food_id: created.id })),
    );
  }

  revalidateNutrition();
  return { ok: true, data: { id: created.id } };
}

/* ───────────────────────────── Excluir ───────────────────────────── */

export async function deleteNutritionFood(foodId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!(await assertOwnFood(ctx, foodId))) return dbError(NOT_EDITABLE);

  const { error } = await ctx.supabase.from("nutrition_foods").delete().eq("id", foodId);
  if (error) return dbError("Não foi possível excluir o alimento.");

  revalidateNutrition();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Preferências ─────────────────────────────
 * Favoritar, arquivar e recategorizar valem para QUALQUER alimento, inclusive os globais —
 * porque nada disso toca no alimento: grava em `nutrition_food_prefs`, que é do usuário.
 */

async function upsertPref(
  ctx: Ctx,
  foodId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await ctx.supabase
    .from("nutrition_food_prefs")
    .upsert({ user_id: ctx.userId, food_id: foodId, ...patch }, { onConflict: "user_id,food_id" });
  return !error;
}

export async function setNutritionFoodPref(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = nutritionFoodPrefSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const patch: Record<string, unknown> = {};
  if (data.is_favorite !== undefined) patch.is_favorite = data.is_favorite;
  if (data.archived !== undefined) patch.archived_at = data.archived ? new Date().toISOString() : null;
  if (data.category_override_id !== undefined) patch.category_override_id = data.category_override_id;
  if (data.custom_note !== undefined) patch.custom_note = data.custom_note;

  if (!(await upsertPref(ctx, data.food_id, patch))) {
    return dbError("Não foi possível salvar a preferência.");
  }

  revalidateNutrition();
  return { ok: true, data: undefined };
}

export async function toggleNutritionFavorite(
  foodId: string,
  isFavorite: boolean,
): Promise<ActionResult> {
  return setNutritionFoodPref({ food_id: foodId, is_favorite: isFavorite });
}

/* ───────────────────────────── Medidas caseiras ───────────────────────────── */

export async function saveNutritionMeasure(
  input: unknown,
  measureId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = nutritionFoodMeasureSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  // O alimento pode ser global (a medida é do usuário), mas precisa existir.
  const { data: food } = await ctx.supabase
    .from("nutrition_foods")
    .select("id")
    .eq("id", data.food_id)
    .maybeSingle();
  if (!food) return dbError("Alimento não encontrado.");

  // Só uma medida padrão por alimento e por dono (índice único no banco).
  if (data.is_default) {
    await ctx.supabase
      .from("nutrition_food_measures")
      .update({ is_default: false })
      .eq("food_id", data.food_id)
      .eq("user_id", ctx.userId);
  }

  const payload = {
    food_id: data.food_id,
    label: data.label,
    unit_type: data.unit_type,
    grams: data.grams,
    milliliters: data.milliliters,
    is_default: data.is_default,
  };

  if (measureId) {
    const { error } = await ctx.supabase
      .from("nutrition_food_measures")
      .update(payload)
      .eq("id", measureId)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível salvar a medida.");
    revalidateNutrition();
    return { ok: true, data: { id: measureId } };
  }

  const { data: created, error } = await ctx.supabase
    .from("nutrition_food_measures")
    .insert({ ...payload, user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível criar a medida.");

  revalidateNutrition();
  return { ok: true, data: { id: created.id } };
}

export async function deleteNutritionMeasure(measureId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_food_measures")
    .delete()
    .eq("id", measureId)
    .eq("user_id", ctx.userId);
  if (error) return dbError("Não foi possível excluir a medida.");

  revalidateNutrition();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Etiquetas ───────────────────────────── */

export async function saveNutritionTag(
  input: unknown,
  tagId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = nutritionTagSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  if (tagId) {
    const { error } = await ctx.supabase
      .from("nutrition_food_tags")
      .update(parsed.data)
      .eq("id", tagId)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível salvar a etiqueta.");
    revalidateNutrition();
    return { ok: true, data: { id: tagId } };
  }

  const { data, error } = await ctx.supabase
    .from("nutrition_food_tags")
    .insert({ ...parsed.data, user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !data) return dbError("Já existe uma etiqueta com esse nome.");

  revalidateNutrition();
  return { ok: true, data: { id: data.id } };
}

export async function deleteNutritionTag(tagId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // Excluir etiqueta remove só a associação (cascade em tag_links). Nenhum alimento some.
  const { error } = await ctx.supabase
    .from("nutrition_food_tags")
    .delete()
    .eq("id", tagId)
    .eq("user_id", ctx.userId);
  if (error) return dbError("Não foi possível excluir a etiqueta.");

  revalidateNutrition();
  return { ok: true, data: undefined };
}

export async function setNutritionFoodTags(
  foodId: string,
  tagIds: string[],
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  await ctx.supabase
    .from("nutrition_food_tag_links")
    .delete()
    .eq("food_id", foodId)
    .eq("user_id", ctx.userId);

  if (tagIds.length > 0) {
    const { error } = await ctx.supabase.from("nutrition_food_tag_links").insert(
      tagIds.map((tagId) => ({ user_id: ctx.userId, food_id: foodId, tag_id: tagId })),
    );
    if (error) return dbError("Não foi possível salvar as etiquetas.");
  }

  revalidateNutrition();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Ações em massa ─────────────────────────────
 * O escopo é a lista EXPLÍCITA de ids que veio da seleção — nunca "tudo do filtro atual"
 * resolvido no servidor. Assim a ação não pode atingir registro que o usuário não viu.
 * Excluir só afeta alimentos próprios; os da base do sistema são contados e reportados.
 */

export async function bulkNutritionFoodAction(
  input: unknown,
): Promise<ActionResult<{ affected: number; skipped: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = nutritionBulkSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { action, ids, category_id: categoryId } = parsed.data;

  const { data: foods } = await ctx.supabase
    .from("nutrition_foods")
    .select("id,user_id")
    .in("id", ids);
  if (!foods) return dbError("Não foi possível carregar os alimentos selecionados.");

  const ownIds = foods.filter((f) => f.user_id === ctx.userId).map((f) => f.id);
  const allIds = foods.map((f) => f.id);

  if (action === "excluir") {
    // Só o que é do usuário some. O que é da base é reportado como ignorado.
    if (ownIds.length > 0) {
      const { error } = await ctx.supabase.from("nutrition_foods").delete().in("id", ownIds);
      if (error) return dbError("Não foi possível excluir os alimentos.");
    }
    revalidateNutrition();
    return { ok: true, data: { affected: ownIds.length, skipped: allIds.length - ownIds.length } };
  }

  // As demais ações são preferências do usuário e valem para qualquer alimento.
  const patch: Record<string, unknown> = {};
  switch (action) {
    case "favoritar":
      patch.is_favorite = true;
      break;
    case "desfavoritar":
      patch.is_favorite = false;
      break;
    case "arquivar":
      patch.archived_at = new Date().toISOString();
      break;
    case "restaurar":
      patch.archived_at = null;
      break;
    case "alterar_categoria":
      patch.category_override_id = categoryId;
      break;
  }

  const { error } = await ctx.supabase
    .from("nutrition_food_prefs")
    .upsert(
      allIds.map((id) => ({ user_id: ctx.userId, food_id: id, ...patch })),
      { onConflict: "user_id,food_id" },
    );
  if (error) return dbError("Não foi possível aplicar a ação.");

  // Alimento próprio também tem `archived_at` na própria linha: manter os dois coerentes
  // evita que ele reapareça "desarquivado" numa leitura que olhe só o alimento.
  if ((action === "arquivar" || action === "restaurar") && ownIds.length > 0) {
    await ctx.supabase
      .from("nutrition_foods")
      .update({ archived_at: patch.archived_at as string | null })
      .in("id", ownIds);
  }

  revalidateNutrition();
  return { ok: true, data: { affected: allIds.length, skipped: ids.length - allIds.length } };
}
