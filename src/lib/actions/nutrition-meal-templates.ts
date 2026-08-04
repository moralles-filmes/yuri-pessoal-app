"use server";

/**
 * Fase 16-C — Dieta e Alimentação · Server Actions de refeições-modelo, e a entrada de
 * receita/modelo no diário e no planejamento.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ O PONTO MAIS IMPORTANTE DA SUBFASE                                                 ║
 * ║ Receita e refeição-modelo viram itens do diário pelo MESMO caminho de gravação do    ║
 * ║ alimento: `buildDiaryEntrySnapshot`, chamado dentro de `buildRecipeEntrySnapshot`.   ║
 * ║ Não existe segunda tabela, segundo cálculo nem segundo formato de snapshot.          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Consequências que ficam garantidas por construção:
 *  • o total do dia soma o `nutrients_snapshot` — nunca a receita atual;
 *  • editar ou excluir a receita depois NÃO muda o que já foi comido;
 *  • a qualidade (exato/aproximado/parcial) da receita viaja para o total do dia.
 *
 * ══ ADICIONAR O MESMO MODELO DUAS VEZES NÃO DUPLICA ══
 * `templateItemsToRegister` (puro, testado) decide o que gravar olhando o que já existe na
 * refeição. Repetir de propósito exige `force`, escolhido pelo usuário na tela.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { NUTRITION_BASE_PATH } from "@/lib/nutrition/constants";
import { getFoodSnapshotInput } from "@/lib/nutrition/diary-queries";
import { snapshotColumns } from "@/lib/nutrition/entry-columns";
import {
  copyName,
  DUPLICATION_RESET,
  templateItemsToRegister,
  templateTotals,
  type TemplateCalcContext,
} from "@/lib/nutrition/meal-template";
import { buildRecipeEntrySnapshot, RECIPE_SNAPSHOT_MESSAGES } from "@/lib/nutrition/recipe";
import {
  buildRecipeCalcContext,
  getMealTemplate,
  getRecipeTotals,
  toCalcIngredient,
} from "@/lib/nutrition/recipe-queries";
import { recipeTotals } from "@/lib/nutrition/recipe";
import { getRecipes } from "@/lib/nutrition/recipe-queries";
import { buildDiaryEntrySnapshot } from "@/lib/nutrition/snapshot";
import { CONVERSION_FAILURE_MESSAGES } from "@/lib/nutrition/units";
import type { MealTemplate, MealTemplateItem } from "@/lib/nutrition/types";
import {
  diaryRecipeEntrySchema,
  diaryTemplateSchema,
  mealTemplateItemSchema,
  mealTemplateSchema,
  planTemplateSchema,
  plannedRecipeItemSchema,
} from "@/lib/validators/nutrition-recipes";
import type { ActionResult } from "@/types/finance";

const TEMPLATES_PATH = `${NUTRITION_BASE_PATH}/refeicoes`;

function revalidateAll() {
  revalidatePath(NUTRITION_BASE_PATH);
  revalidatePath(TEMPLATES_PATH);
  revalidatePath(`${NUTRITION_BASE_PATH}/receitas`);
  revalidatePath(`${NUTRITION_BASE_PATH}/diario`);
  revalidatePath(`${NUTRITION_BASE_PATH}/planejamento`);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

async function ownsTemplate(ctx: Ctx, templateId: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("nutrition_meal_templates")
    .select("id")
    .eq("id", templateId)
    .maybeSingle();
  return Boolean(data);
}

/** Registra o uso (alimenta "mais usadas"). Best-effort: falhar aqui não derruba a ação. */
async function touchUsage(
  ctx: Ctx,
  table: "nutrition_recipes" | "nutrition_meal_templates",
  id: string,
): Promise<void> {
  const { data } = await ctx.supabase.from(table).select("use_count").eq("id", id).maybeSingle();
  await ctx.supabase
    .from(table)
    .update({ use_count: (data?.use_count ?? 0) + 1, last_used_at: new Date().toISOString() })
    .eq("id", id);
}

/* ═══════════════════════════ Refeição-modelo ═══════════════════════════ */

export async function saveMealTemplate(
  input: unknown,
  templateId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = mealTemplateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  if (templateId) {
    if (!(await ownsTemplate(ctx, templateId))) return dbError("Refeição-modelo não encontrada.");
    const { error } = await ctx.supabase
      .from("nutrition_meal_templates")
      .update(parsed.data)
      .eq("id", templateId);
    if (error) return dbError("Não foi possível salvar a refeição-modelo.");
    revalidateAll();
    return { ok: true, data: { id: templateId } };
  }

  const { data: created, error } = await ctx.supabase
    .from("nutrition_meal_templates")
    .insert({ ...parsed.data, user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível criar a refeição-modelo.");

  revalidateAll();
  return { ok: true, data: { id: created.id } };
}

export async function setMealTemplateFavorite(
  templateId: string,
  isFavorite: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_meal_templates")
    .update({ is_favorite: isFavorite })
    .eq("id", templateId);
  if (error) return dbError("Não foi possível atualizar o favorito.");

  revalidateAll();
  return { ok: true, data: undefined };
}

export async function setMealTemplateArchived(
  templateId: string,
  archived: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_meal_templates")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", templateId);
  if (error) return dbError("Não foi possível arquivar.");

  revalidateAll();
  return { ok: true, data: undefined };
}

/** Excluir o modelo não mexe no consumo: `meal_template_id` é `on delete set null`. */
export async function deleteMealTemplate(templateId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_meal_templates")
    .delete()
    .eq("id", templateId);
  if (error) return dbError("Não foi possível excluir a refeição-modelo.");

  revalidateAll();
  return { ok: true, data: undefined };
}

/** Duplica o modelo com os itens; o histórico fica com o original (regra 6). */
export async function duplicateMealTemplate(
  templateId: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: source } = await ctx.supabase
    .from("nutrition_meal_templates")
    .select("id,name,description,meal_type_id,category_id,suggested_time,tags,notes")
    .eq("id", templateId)
    .maybeSingle();
  if (!source) return dbError("Refeição-modelo não encontrada.");

  const name = copyName(source.name);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_meal_templates")
    .insert({
      user_id: ctx.userId,
      name,
      description: source.description,
      meal_type_id: source.meal_type_id,
      category_id: source.category_id,
      suggested_time: source.suggested_time,
      tags: source.tags,
      notes: source.notes,
      origin_template_id: source.id,
      is_copy: DUPLICATION_RESET.isCopy,
      use_count: DUPLICATION_RESET.useCount,
      last_used_at: DUPLICATION_RESET.lastUsedAt,
      is_favorite: DUPLICATION_RESET.isFavorite,
      archived_at: DUPLICATION_RESET.archivedAt,
    })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível duplicar.");

  const { data: items } = await ctx.supabase
    .from("nutrition_meal_template_items")
    .select("item_kind,food_id,recipe_id,custom_label,quantity,measure_id,measure_label,portion_unit,is_optional,notes,position")
    .eq("template_id", templateId)
    .order("position");

  if (items?.length) {
    await ctx.supabase
      .from("nutrition_meal_template_items")
      .insert(items.map((item) => ({ ...item, user_id: ctx.userId, template_id: created.id })));
  }

  revalidateAll();
  return { ok: true, data: { id: created.id, name } };
}

/**
 * Transforma uma receita em refeição-modelo (critério de aceite da subfase).
 *
 * O modelo criado APONTA para a receita — não copia os ingredientes. Assim, melhorar a receita
 * melhora o modelo, que é o comportamento esperado de dois modelos vivos. O congelamento
 * continua acontecendo só no consumo.
 */
export async function createTemplateFromRecipe(
  recipeId: string,
  options: { quantity?: number; portionUnit?: "porcao" | "peso"; mealTypeId?: string | null } = {},
): Promise<ActionResult<{ id: string; name: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: recipe } = await ctx.supabase
    .from("nutrition_recipes")
    .select("id,name,description,category_id,total_weight_g")
    .eq("id", recipeId)
    .maybeSingle();
  if (!recipe) return dbError("Receita não encontrada.");

  const portionUnit = options.portionUnit ?? "porcao";
  if (portionUnit === "peso" && recipe.total_weight_g === null) {
    return dbError(RECIPE_SNAPSHOT_MESSAGES.peso_final_ausente);
  }

  const { data: created, error } = await ctx.supabase
    .from("nutrition_meal_templates")
    .insert({
      user_id: ctx.userId,
      name: recipe.name,
      description: recipe.description,
      category_id: recipe.category_id,
      meal_type_id: options.mealTypeId ?? null,
    })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível criar a refeição-modelo.");

  const { error: itemError } = await ctx.supabase.from("nutrition_meal_template_items").insert({
    user_id: ctx.userId,
    template_id: created.id,
    item_kind: "receita",
    recipe_id: recipe.id,
    quantity: options.quantity ?? 1,
    portion_unit: portionUnit,
    position: 0,
  });
  if (itemError) return dbError("A refeição-modelo foi criada, mas o item não pôde ser salvo.");

  revalidateAll();
  return { ok: true, data: { id: created.id, name: recipe.name } };
}

/* ═══════════════════════════ Itens do modelo ═══════════════════════════ */

export async function saveMealTemplateItem(
  input: unknown,
  itemId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = mealTemplateItemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (!(await ownsTemplate(ctx, data.template_id))) {
    return dbError("Refeição-modelo não encontrada.");
  }

  // A medida precisa ser do alimento escolhido — a mesma checagem do planejamento.
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

  // Receita em gramas exige peso final informado. Sem ele, a conversão não existe.
  if (data.item_kind === "receita" && data.portion_unit === "peso" && data.recipe_id) {
    const { data: recipe } = await ctx.supabase
      .from("nutrition_recipes")
      .select("total_weight_g")
      .eq("id", data.recipe_id)
      .maybeSingle();
    if (!recipe || recipe.total_weight_g === null) {
      return dbError(RECIPE_SNAPSHOT_MESSAGES.peso_final_ausente);
    }
  }

  const payload = {
    template_id: data.template_id,
    item_kind: data.item_kind,
    food_id: data.item_kind === "alimento" ? data.food_id : null,
    recipe_id: data.item_kind === "receita" ? data.recipe_id : null,
    custom_label: data.custom_label,
    quantity: data.quantity,
    measure_id: data.item_kind === "alimento" ? data.measure_id : null,
    measure_label: data.item_kind === "alimento" ? measureLabel : null,
    portion_unit: data.item_kind === "receita" ? (data.portion_unit ?? "porcao") : null,
    is_optional: data.is_optional,
    notes: data.notes,
  };

  if (itemId) {
    const { error } = await ctx.supabase
      .from("nutrition_meal_template_items")
      .update(payload)
      .eq("id", itemId);
    if (error) return dbError("Não foi possível salvar o item.");
    revalidateAll();
    return { ok: true, data: { id: itemId } };
  }

  const { count } = await ctx.supabase
    .from("nutrition_meal_template_items")
    .select("id", { count: "exact", head: true })
    .eq("template_id", data.template_id);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_meal_template_items")
    .insert({ ...payload, user_id: ctx.userId, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível adicionar o item.");

  revalidateAll();
  return { ok: true, data: { id: created.id } };
}

export async function deleteMealTemplateItem(itemId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_meal_template_items")
    .delete()
    .eq("id", itemId);
  if (error) return dbError("Não foi possível excluir o item.");

  revalidateAll();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Receita → diário ═══════════════════════════ */

/**
 * Registra o consumo de uma receita.
 *
 * O snapshot é montado AQUI, no servidor, a partir do total da receita NESTE instante — e pelo
 * mesmo `buildDiaryEntrySnapshot` do alimento. O cliente manda apenas receita + quantidade +
 * unidade; nenhum valor nutricional vem do navegador.
 */
export async function addRecipeToDiary(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = diaryRecipeEntrySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: meal } = await ctx.supabase
    .from("nutrition_diary_meals")
    .select("id")
    .eq("id", data.diary_meal_id)
    .maybeSingle();
  if (!meal) return dbError("Refeição não encontrada.");

  const loaded = await getRecipeTotals(data.recipe_id);
  if (!loaded) return dbError("Receita não encontrada.");

  const built = buildRecipeEntrySnapshot({
    recipe: {
      name: loaded.recipe.name,
      servings: loaded.recipe.servings,
      servingLabel: loaded.recipe.servingLabel,
      totalWeightG: loaded.recipe.totalWeightG,
    },
    totals: loaded.calc.totals,
    quantity: data.quantity,
    portionUnit: data.portion_unit,
  });
  if (!built.ok) return dbError(RECIPE_SNAPSHOT_MESSAGES[built.reason]);

  const { count } = await ctx.supabase
    .from("nutrition_diary_entries")
    .select("id", { count: "exact", head: true })
    .eq("diary_meal_id", data.diary_meal_id);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_diary_entries")
    .insert({
      user_id: ctx.userId,
      diary_meal_id: data.diary_meal_id,
      recipe_id: data.recipe_id,
      entry_kind: "receita",
      planned_item_id: data.planned_item_id,
      change_kind: data.planned_item_id ? "igual" : "extra",
      changed_at: data.planned_item_id ? new Date().toISOString() : null,
      notes: data.notes,
      position: count ?? 0,
      ...snapshotColumns(built.snapshot),
    })
    .select("id")
    .single();
  if (error || !created) {
    return dbError(
      error?.code === "23505"
        ? "Este item do planejamento já foi registrado nesta refeição."
        : "Não foi possível registrar a receita.",
    );
  }

  await touchUsage(ctx, "nutrition_recipes", data.recipe_id);
  revalidateAll();
  return { ok: true, data: { id: created.id } };
}

/* ═══════════════════════════ Refeição-modelo → diário ═══════════════════════════ */

/** Monta o contexto de cálculo de um modelo (alimentos, medidas e receitas citadas). */
async function templateContext(template: MealTemplate): Promise<TemplateCalcContext> {
  const foodIds = template.items.map((item) => item.foodId).filter(Boolean) as string[];
  const measureIds = template.items.map((item) => item.measureId).filter(Boolean) as string[];
  const recipeIds = new Set(template.items.map((item) => item.recipeId).filter(Boolean) as string[]);

  const base = await buildRecipeCalcContext(foodIds, measureIds);

  const recipes = new Map<
    string,
    { servings: number; totalWeightG: number | null; totals: Record<string, never> }
  >();
  if (recipeIds.size === 0) {
    return { ...base, recipes: new Map() };
  }

  // As receitas citadas são calculadas com UMA leitura do catálogo — nada de N+1.
  const all = await getRecipes();
  const used = all.filter((recipe) => recipeIds.has(recipe.id));
  const recipeCtx = await buildRecipeCalcContext(
    used.flatMap((recipe) => recipe.ingredients.map((i) => i.foodId).filter(Boolean) as string[]),
    used.flatMap((recipe) => recipe.ingredients.map((i) => i.measureId).filter(Boolean) as string[]),
  );

  const resolved = new Map(
    used.map((recipe) => [
      recipe.id,
      {
        servings: recipe.servings,
        totalWeightG: recipe.totalWeightG,
        totals: recipeTotals(recipe.ingredients.map(toCalcIngredient), recipeCtx).totals,
      },
    ]),
  );

  void recipes;
  return { ...base, recipes: resolved };
}

/**
 * Adiciona uma refeição-modelo ao diário.
 *
 * Dois modos, ambos passando pelo mesmo snapshot:
 *  • DETALHADO (padrão) — cada item vira uma linha (alimento, receita ou item livre), com
 *    `meal_template_id` de procedência. É o modo que permite ajustar item a item depois.
 *  • RESUMIDO — uma única linha `entry_kind = 'modelo'` com o total do modelo congelado. A
 *    qualidade agregada vai junto, então um modelo parcial não vira um dia "exato".
 *
 * NÃO DUPLICA: se a refeição já tem itens deste modelo, nada é gravado e a action diz isso.
 */
export async function addMealTemplateToDiary(
  input: unknown,
): Promise<ActionResult<{ registrados: number; jaRegistrado: boolean; falhas: string[] }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = diaryTemplateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: meal } = await ctx.supabase
    .from("nutrition_diary_meals")
    .select("id")
    .eq("id", data.diary_meal_id)
    .maybeSingle();
  if (!meal) return dbError("Refeição não encontrada.");

  const template = await getMealTemplate(data.template_id);
  if (!template) return dbError("Refeição-modelo não encontrada.");

  // O que já está registrado nesta refeição decide se há o que fazer.
  const { data: existing } = await ctx.supabase
    .from("nutrition_diary_entries")
    .select("meal_template_id")
    .eq("diary_meal_id", data.diary_meal_id);

  const plan = templateItemsToRegister(
    data.template_id,
    template.items,
    (existing ?? []).map((row) => ({ mealTemplateId: row.meal_template_id })),
    { force: data.force },
  );

  if (plan.items.length === 0) {
    return {
      ok: true,
      data: { registrados: 0, jaRegistrado: plan.alreadyRegistered, falhas: [] },
    };
  }

  const { count } = await ctx.supabase
    .from("nutrition_diary_entries")
    .select("id", { count: "exact", head: true })
    .eq("diary_meal_id", data.diary_meal_id);

  const ctxCalc = await templateContext(template);
  const falhas: string[] = [];
  let registrados = 0;
  let position = count ?? 0;

  /* ── Modo resumido: uma linha com o total do modelo ── */
  if (data.mode === "resumido") {
    const totals = templateTotals(plan.items, ctxCalc);
    if (Object.keys(totals.totals).length === 0) {
      return dbError(
        "Nenhum item deste modelo tem valor nutricional calculável. Registre os itens em detalhe.",
      );
    }

    // O modelo é tratado como uma "preparação" de 1 porção: a mesma função de receita monta o
    // snapshot, então o formato gravado é idêntico ao de qualquer outro item.
    const built = buildRecipeEntrySnapshot({
      recipe: { name: template.name, servings: 1, servingLabel: "porção", totalWeightG: null },
      totals: totals.totals,
      quantity: 1,
      portionUnit: "porcao",
    });
    if (!built.ok) return dbError(RECIPE_SNAPSHOT_MESSAGES[built.reason]);

    const { error } = await ctx.supabase.from("nutrition_diary_entries").insert({
      user_id: ctx.userId,
      diary_meal_id: data.diary_meal_id,
      meal_template_id: template.id,
      entry_kind: "modelo",
      change_kind: "extra",
      position,
      ...snapshotColumns(built.snapshot),
    });
    if (error) return dbError("Não foi possível registrar a refeição-modelo.");

    await touchUsage(ctx, "nutrition_meal_templates", template.id);
    revalidateAll();
    return { ok: true, data: { registrados: 1, jaRegistrado: plan.alreadyRegistered, falhas: [] } };
  }

  /* ── Modo detalhado: um item por linha ── */
  for (const item of plan.items) {
    const label = item.customLabel?.trim() || "Item do modelo";

    if (item.itemKind === "livre" || item.quantity === null) {
      const { error } = await ctx.supabase.from("nutrition_diary_entries").insert({
        user_id: ctx.userId,
        diary_meal_id: data.diary_meal_id,
        meal_template_id: template.id,
        entry_kind: "livre",
        change_kind: "extra",
        food_name_snapshot: label,
        nutrients_snapshot: {},
        position: position++,
      });
      if (error) falhas.push(`${label}: não foi possível registrar.`);
      else registrados += 1;
      continue;
    }

    if (item.itemKind === "receita") {
      const recipe = item.recipeId ? ctxCalc.recipes.get(item.recipeId) : null;
      if (!recipe || !item.recipeId) {
        falhas.push(`${label}: a receita não está mais cadastrada.`);
        continue;
      }
      const { data: meta } = await ctx.supabase
        .from("nutrition_recipes")
        .select("name,serving_label")
        .eq("id", item.recipeId)
        .maybeSingle();

      const built = buildRecipeEntrySnapshot({
        recipe: {
          name: meta?.name ?? label,
          servings: recipe.servings,
          servingLabel: meta?.serving_label ?? null,
          totalWeightG: recipe.totalWeightG,
        },
        totals: recipe.totals,
        quantity: item.quantity,
        portionUnit: item.portionUnit ?? "porcao",
      });
      if (!built.ok) {
        falhas.push(`${meta?.name ?? label}: ${RECIPE_SNAPSHOT_MESSAGES[built.reason]}`);
        continue;
      }

      const { error } = await ctx.supabase.from("nutrition_diary_entries").insert({
        user_id: ctx.userId,
        diary_meal_id: data.diary_meal_id,
        recipe_id: item.recipeId,
        meal_template_id: template.id,
        entry_kind: "receita",
        change_kind: "extra",
        position: position++,
        ...snapshotColumns(built.snapshot),
      });
      if (error) falhas.push(`${meta?.name ?? label}: não foi possível registrar.`);
      else {
        registrados += 1;
        await touchUsage(ctx, "nutrition_recipes", item.recipeId);
      }
      continue;
    }

    /* Alimento: exatamente o caminho da 16-B. */
    if (!item.foodId) {
      falhas.push(`${label}: o alimento não está mais no catálogo.`);
      continue;
    }
    const source = await getFoodSnapshotInput(item.foodId, item.measureId);
    if (!source) {
      falhas.push(`${label}: o alimento não está mais no catálogo.`);
      continue;
    }
    const built = buildDiaryEntrySnapshot({
      food: source.food,
      quantity: item.quantity,
      measure: source.measure,
    });
    if (!built.ok) {
      falhas.push(`${source.food.name}: ${CONVERSION_FAILURE_MESSAGES[built.reason]}`);
      continue;
    }

    const { error } = await ctx.supabase.from("nutrition_diary_entries").insert({
      user_id: ctx.userId,
      diary_meal_id: data.diary_meal_id,
      food_id: item.foodId,
      meal_template_id: template.id,
      entry_kind: "alimento",
      change_kind: "extra",
      position: position++,
      ...snapshotColumns(built.snapshot),
    });
    if (error) falhas.push(`${source.food.name}: não foi possível registrar.`);
    else registrados += 1;
  }

  if (registrados > 0) await touchUsage(ctx, "nutrition_meal_templates", template.id);
  revalidateAll();
  return { ok: true, data: { registrados, jaRegistrado: plan.alreadyRegistered, falhas } };
}

/* ═══════════════════════════ Planejamento ═══════════════════════════ */

/** Adiciona uma receita como item de uma refeição PLANEJADA (sem snapshot: é intenção). */
export async function addRecipeToPlannedMeal(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = plannedRecipeItemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: recipe } = await ctx.supabase
    .from("nutrition_recipes")
    .select("id,total_weight_g")
    .eq("id", data.recipe_id)
    .maybeSingle();
  if (!recipe) return dbError("Receita não encontrada.");
  if (data.portion_unit === "peso" && recipe.total_weight_g === null) {
    return dbError(RECIPE_SNAPSHOT_MESSAGES.peso_final_ausente);
  }

  const { count } = await ctx.supabase
    .from("nutrition_planned_meal_items")
    .select("id", { count: "exact", head: true })
    .eq("planned_meal_id", data.planned_meal_id);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_planned_meal_items")
    .insert({
      user_id: ctx.userId,
      planned_meal_id: data.planned_meal_id,
      item_kind: "receita",
      recipe_id: data.recipe_id,
      quantity: data.quantity,
      portion_unit: data.portion_unit,
      is_optional: data.is_optional,
      notes: data.notes,
      position: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível planejar a receita.");

  revalidateAll();
  return { ok: true, data: { id: created.id } };
}

/**
 * Aplica uma refeição-modelo a uma data do planejamento.
 *
 * EXPANDE os itens em linhas do planejamento, com `meal_template_id` de procedência. Não há
 * vínculo vivo: editar o modelo depois não reescreve o que já estava planejado — a mesma
 * regra da materialização de modelo de semana (16-B).
 */
export async function addMealTemplateToPlan(
  input: unknown,
): Promise<ActionResult<{ plannedMealId: string; itens: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = planTemplateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const template = await getMealTemplate(data.template_id);
  if (!template) return dbError("Refeição-modelo não encontrada.");

  const mealTypeId = data.meal_type_id ?? template.mealTypeId;
  if (!mealTypeId) {
    return dbError("Escolha o tipo de refeição: este modelo não tem um definido.");
  }

  const { count } = await ctx.supabase
    .from("nutrition_planned_meals")
    .select("id", { count: "exact", head: true })
    .eq("planned_date", data.planned_date);

  const { data: meal, error } = await ctx.supabase
    .from("nutrition_planned_meals")
    .insert({
      user_id: ctx.userId,
      planned_date: data.planned_date,
      meal_type_id: mealTypeId,
      planned_time: data.planned_time ?? template.suggestedTime,
      title: template.name,
      notes: template.notes,
      position: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !meal) return dbError("Não foi possível criar a refeição planejada.");

  const rows = template.items
    .filter((item: MealTemplateItem) => item.itemKind !== "livre" || item.customLabel)
    .map((item: MealTemplateItem, index) => ({
      user_id: ctx.userId,
      planned_meal_id: meal.id,
      meal_template_id: template.id,
      item_kind: item.itemKind,
      food_id: item.itemKind === "alimento" ? item.foodId : null,
      recipe_id: item.itemKind === "receita" ? item.recipeId : null,
      custom_label: item.customLabel,
      quantity: item.quantity,
      measure_id: item.itemKind === "alimento" ? item.measureId : null,
      measure_label: item.measureLabel,
      portion_unit: item.itemKind === "receita" ? (item.portionUnit ?? "porcao") : null,
      is_optional: item.isOptional,
      notes: item.notes,
      position: index,
    }));

  let itens = 0;
  if (rows.length > 0) {
    const { error: itemsError } = await ctx.supabase
      .from("nutrition_planned_meal_items")
      .insert(rows);
    if (!itemsError) itens = rows.length;
  }

  await touchUsage(ctx, "nutrition_meal_templates", template.id);
  revalidateAll();
  return { ok: true, data: { plannedMealId: meal.id, itens } };
}

/* ═══════════════════════════ Ações em massa ═══════════════════════════ */

export async function bulkMealTemplateAction(
  templateIds: string[],
  action: "favoritar" | "desfavoritar" | "arquivar" | "desarquivar" | "excluir",
): Promise<ActionResult<{ afetadas: number; ignoradas: number; motivos: string[] }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const ids = [...new Set(templateIds)].filter(Boolean);
  if (ids.length === 0) return dbError("Nenhuma refeição-modelo selecionada.");
  if (ids.length > 500) return dbError("Selecione no máximo 500 por vez.");

  const motivos: string[] = [];

  if (action === "excluir") {
    const { data: deleted, error } = await ctx.supabase
      .from("nutrition_meal_templates")
      .delete()
      .in("id", ids)
      .select("id");
    if (error) return dbError("Não foi possível excluir.");
    const afetadas = deleted?.length ?? 0;
    if (afetadas < ids.length) motivos.push("Algumas não foram encontradas.");
    revalidateAll();
    return { ok: true, data: { afetadas, ignoradas: ids.length - afetadas, motivos } };
  }

  const patch =
    action === "favoritar"
      ? { is_favorite: true }
      : action === "desfavoritar"
        ? { is_favorite: false }
        : action === "arquivar"
          ? { archived_at: new Date().toISOString() }
          : { archived_at: null };

  const { data: updated, error } = await ctx.supabase
    .from("nutrition_meal_templates")
    .update(patch)
    .in("id", ids)
    .select("id");
  if (error) return dbError("Não foi possível aplicar a ação.");

  const afetadas = updated?.length ?? 0;
  if (afetadas < ids.length) motivos.push("Algumas não foram encontradas.");

  revalidateAll();
  return { ok: true, data: { afetadas, ignoradas: ids.length - afetadas, motivos } };
}
