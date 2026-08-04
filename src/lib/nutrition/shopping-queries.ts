import "server-only";

/**
 * Fase 16-D — Dieta e Alimentação · Leitura da lista de compras e da despensa.
 *
 * Padrão do módulo: poucas consultas amplas + derivação em memória (nada de N+1). A RLS faz o
 * recorte por usuário — nenhuma query aqui filtra `user_id` na mão, e nem deve.
 *
 * ══ ONDE MORA A HONESTIDADE DA CONVERSÃO ══
 * Este arquivo é quem SABE se a conversão existe: ele lê o alimento (base g ou ml) e a medida
 * caseira (gramas/mililitros cadastrados) e chama `convertToBase`. Quando a conversão sai, o
 * item viaja com `baseAmount`/`baseUnit` preenchidos e PODE somar com outro do mesmo alimento.
 * Quando não sai, os dois campos ficam NULOS — e `consolidateShoppingItems` mantém a linha
 * separada, com o motivo. Nulo aqui significa "não deu para converter", jamais "zero".
 *
 * O mesmo vale para o ingrediente de receita: `nutrition_recipe_ingredients.grams_equivalent`
 * guarda a quantidade NA UNIDADE-BASE DO ALIMENTO (g **ou** ml — o nome da coluna é herança da
 * 16-C), e nulo lá significa exatamente a mesma coisa.
 */
import { createClient } from "@/lib/supabase/server";
import {
  asShoppingItemStatus,
  asShoppingListStatus,
  asShoppingPriority,
  asShoppingRecurrence,
  asShoppingSourceKind,
  DEFAULT_MARKET_CATEGORIES,
  type BaseUnit,
  type PortionUnit,
} from "./constants";
import { getFoodBasics, getMeasures, getPlannedMeals } from "./diary-queries";
import { recipePortionFactor } from "./recipe";
import { getRecipes } from "./recipe-queries";
import { shoppingSubjectKey, type PantryStock, type ShoppingSourceItem } from "./shopping";
import { convertToBase } from "./units";
import type {
  MarketCategory,
  PantryItem,
  Recipe,
  ShoppingList,
  ShoppingListItem,
  ShoppingOrigin,
} from "./types";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const LIMIT = 2000;

/* ═══════════════════════════ Corredores de mercado ═══════════════════════════ */

/**
 * Cria os corredores padrão na primeira vez que a tela de compras é aberta.
 *
 * Mesma decisão dos tipos de refeição da 16-B: são dado do usuário (ele renomeia, reordena e
 * cria os seus), e uma migration não sabe quais usuários existem. O `onConflict` no unique
 * (user_id, slug) — que aqui NÃO é parcial do lado que importa, porque todas as linhas da
 * semente têm slug — torna a chamada idempotente.
 *
 * Falhar aqui não pode impedir a tela de abrir: a próxima leitura tenta de novo.
 */
export async function ensureMarketCategories(userId: string): Promise<void> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("nutrition_market_categories")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return;

  await supabase.from("nutrition_market_categories").upsert(
    DEFAULT_MARKET_CATEGORIES.map((category, index) => ({
      user_id: userId,
      slug: category.slug,
      name: category.name,
      icon: category.icon,
      position: index,
    })),
    { onConflict: "user_id,slug", ignoreDuplicates: true },
  );
}

export async function getMarketCategories(): Promise<MarketCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_market_categories")
    .select("id,slug,name,icon,color,position")
    .order("position")
    .order("name");

  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    icon: row.icon,
    color: row.color,
    position: row.position,
  }));
}

/* ═══════════════════════════ Listas ═══════════════════════════ */

const LIST_SELECT =
  "id,name,notes,status,source_kind,source_from,source_to,store,recurrence,recurrence_key,pantry_applied_at,archived_at,created_at,updated_at";

const ITEM_SELECT =
  "id,list_id,category_id,food_id,recipe_id,label,brand,quantity,unit,consolidation_key,quantity_overridden,origins,separate_reason,is_manual,status,priority,estimated_price_cents,actual_price_cents,store,note,position,purchased_at";

/** `origins` volta do jsonb como `unknown`: validar aqui evita a UI quebrar com dado antigo. */
function parseOrigins(value: unknown): ShoppingOrigin[] {
  if (!Array.isArray(value)) return [];
  const origins: ShoppingOrigin[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const kind = row.kind;
    origins.push({
      kind: kind === "receita" || kind === "manual" ? kind : "planejamento",
      label: typeof row.label === "string" ? row.label : "Origem",
      date: typeof row.date === "string" ? row.date : null,
      recipeId: typeof row.recipeId === "string" ? row.recipeId : null,
      plannedMealId: typeof row.plannedMealId === "string" ? row.plannedMealId : null,
      quantity: num(row.quantity),
      unit: typeof row.unit === "string" ? row.unit : "",
    });
  }
  return origins;
}

/** Listas com os itens. Três consultas, independentemente do número de listas. */
export async function getShoppingLists(): Promise<ShoppingList[]> {
  const supabase = await createClient();

  const [listsResult, itemsResult, categories] = await Promise.all([
    supabase
      .from("nutrition_shopping_lists")
      .select(LIST_SELECT)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("nutrition_shopping_list_items")
      .select(ITEM_SELECT)
      .order("position")
      .limit(LIMIT * 10),
    getMarketCategories(),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  const itemsByList = new Map<string, ShoppingListItem[]>();
  for (const row of itemsResult.data ?? []) {
    const item: ShoppingListItem = {
      id: row.id,
      listId: row.list_id,
      categoryId: row.category_id,
      categoryName: row.category_id ? (categoryById.get(row.category_id) ?? null) : null,
      foodId: row.food_id,
      recipeId: row.recipe_id,
      label: row.label,
      brand: row.brand,
      quantity: num(row.quantity),
      unit: row.unit,
      consolidationKey: row.consolidation_key,
      quantityOverridden: row.quantity_overridden,
      origins: parseOrigins(row.origins),
      separateReason: row.separate_reason,
      isManual: row.is_manual,
      status: asShoppingItemStatus(row.status),
      priority: asShoppingPriority(row.priority),
      estimatedPriceCents: row.estimated_price_cents,
      actualPriceCents: row.actual_price_cents,
      store: row.store,
      note: row.note,
      position: row.position,
      purchasedAt: row.purchased_at,
    };
    const list = itemsByList.get(item.listId);
    if (list) list.push(item);
    else itemsByList.set(item.listId, [item]);
  }

  return (listsResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    notes: row.notes,
    status: asShoppingListStatus(row.status),
    sourceKind: asShoppingSourceKind(row.source_kind),
    sourceFrom: row.source_from,
    sourceTo: row.source_to,
    store: row.store,
    recurrence: asShoppingRecurrence(row.recurrence),
    recurrenceKey: row.recurrence_key,
    pantryAppliedAt: row.pantry_applied_at,
    isArchived: Boolean(row.archived_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: itemsByList.get(row.id) ?? [],
  }));
}

export async function getShoppingList(id: string): Promise<ShoppingList | null> {
  const lists = await getShoppingLists();
  return lists.find((list) => list.id === id) ?? null;
}

/* ═══════════════════════════ Despensa ═══════════════════════════ */

export async function getPantryItems(): Promise<PantryItem[]> {
  const supabase = await createClient();
  const [{ data }, categories] = await Promise.all([
    supabase
      .from("nutrition_pantry_items")
      .select("id,food_id,label,quantity,unit,expires_on,min_quantity,note,category_id")
      .order("label")
      .limit(LIMIT),
    getMarketCategories(),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category.name]));

  return (data ?? []).map((row) => ({
    id: row.id,
    foodId: row.food_id,
    label: row.label,
    quantity: num(row.quantity),
    unit: row.unit,
    expiresOn: row.expires_on,
    minQuantity: num(row.min_quantity),
    note: row.note,
    categoryId: row.category_id,
    categoryName: row.category_id ? (categoryById.get(row.category_id) ?? null) : null,
  }));
}

/** A despensa no formato que o cálculo puro consome. */
export const toPantryStock = (item: PantryItem): PantryStock => ({
  id: item.id,
  subjectKey: shoppingSubjectKey(item.foodId, item.label),
  label: item.label,
  quantity: item.quantity,
  unit: item.unit,
});

export async function getPantryStocks(): Promise<PantryStock[]> {
  return (await getPantryItems()).map(toPantryStock);
}

/* ═══════════════════════════ Corredor sugerido ═══════════════════════════ */

/**
 * Em que corredor cada alimento costuma cair, POR OBSERVAÇÃO.
 *
 * Nada é inventado: a sugestão vem do que o próprio usuário já fez — a categoria que ele deu
 * ao alimento numa lista anterior, ou a que ele usou na despensa. Não existe uma tabela nossa
 * dizendo que "iogurte é frios": isso seria opinião sobre o mercado dele. Sem histórico, o
 * item nasce sem corredor e aparece no grupo "Sem corredor" para ele decidir.
 */
export async function suggestedCategoryByFood(): Promise<Map<string, string>> {
  const supabase = await createClient();
  const [itemsResult, pantryResult] = await Promise.all([
    supabase
      .from("nutrition_shopping_list_items")
      .select("food_id,category_id,created_at")
      .not("food_id", "is", null)
      .not("category_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(LIMIT),
    supabase
      .from("nutrition_pantry_items")
      .select("food_id,category_id")
      .not("food_id", "is", null)
      .not("category_id", "is", null)
      .limit(LIMIT),
  ]);

  const map = new Map<string, string>();
  // A despensa é a informação mais deliberada; entra primeiro e não é sobrescrita.
  for (const row of pantryResult.data ?? []) {
    if (row.food_id && row.category_id) map.set(row.food_id, row.category_id);
  }
  for (const row of itemsResult.data ?? []) {
    if (row.food_id && row.category_id && !map.has(row.food_id)) {
      map.set(row.food_id, row.category_id);
    }
  }
  return map;
}

/* ═══════════════════════════ Geração ═══════════════════════════ */

export type ShoppingGenerationInput = {
  /** Intervalo do planejamento (data pura). Ambos nulos = não puxa planejamento. */
  from: string | null;
  to: string | null;
  /** Receitas escolhidas diretamente, fora do planejamento. */
  recipes: { recipeId: string; quantity: number; portionUnit: PortionUnit }[];
};

export type ShoppingGenerationResult = {
  sources: ShoppingSourceItem[];
  /** O que não deu para incluir, com o motivo. A tela mostra em vez de omitir em silêncio. */
  skipped: { label: string; reason: string }[];
  /** Quantas refeições planejadas entraram. */
  meals: number;
};

/** Rótulo de uma origem de planejamento: "Almoço · 05/08". */
function mealOriginLabel(mealName: string, date: string | null): string {
  if (!date) return mealName;
  const [, month, day] = date.split("-");
  return `${mealName} · ${day}/${month}`;
}

/**
 * Transforma planejamento e receitas nas PARCELAS que a consolidação vai somar.
 *
 * A conversão de cada parcela é tentada aqui, uma única vez, com o catálogo carregado em bloco:
 *  • alimento → `convertToBase(quantidade, medida, alimento)`;
 *  • ingrediente de receita → `grams_equivalent` (já resolvido na 16-C) × o fator da porção.
 *
 * Quando a conversão falha, `baseAmount`/`baseUnit` ficam nulos e a parcela viaja com a unidade
 * ORIGINAL — é isso que faz a linha aparecer separada, com o motivo, em vez de sumir ou virar
 * zero. Nenhuma estimativa acontece em nenhum dos dois caminhos.
 */
export async function buildShoppingSources(
  input: ShoppingGenerationInput,
): Promise<ShoppingGenerationResult> {
  const sources: ShoppingSourceItem[] = [];
  const skipped: { label: string; reason: string }[] = [];

  const plannedMeals =
    input.from && input.to ? await getPlannedMeals(input.from, input.to) : [];

  /* ── Tudo que precisa ser resolvido, coletado numa passada ── */
  const foodIds = new Set<string>();
  const measureIds = new Set<string>();
  const recipeIds = new Set<string>(input.recipes.map((recipe) => recipe.recipeId));

  for (const meal of plannedMeals) {
    for (const item of meal.items) {
      if (item.foodId) foodIds.add(item.foodId);
      if (item.measureId) measureIds.add(item.measureId);
      if (item.recipeId) recipeIds.add(item.recipeId);
    }
  }

  const allRecipes: Recipe[] = recipeIds.size > 0 ? await getRecipes() : [];
  const recipeById = new Map(
    allRecipes.filter((recipe) => recipeIds.has(recipe.id)).map((recipe) => [recipe.id, recipe]),
  );
  for (const recipe of recipeById.values()) {
    for (const ingredient of recipe.ingredients) {
      if (ingredient.foodId) foodIds.add(ingredient.foodId);
    }
  }

  const [foods, measures, categoryByFood] = await Promise.all([
    getFoodBasics([...foodIds]),
    getMeasures([...measureIds]),
    suggestedCategoryByFood(),
  ]);

  /** Uma parcela de alimento, com a conversão tentada uma vez. */
  function pushFood(params: {
    foodId: string;
    quantity: number | null;
    measureId: string | null;
    measureLabel: string | null;
    /** Multiplicador da receita (1 fora dela). */
    factor: number;
    /** Base já resolvida (ingrediente de receita), na unidade-base do alimento. */
    resolvedBase: number | null;
    recipeId: string | null;
    origin: ShoppingOrigin;
    fallbackLabel: string;
  }): void {
    const food = foods.get(params.foodId);
    if (!food) {
      skipped.push({
        label: params.fallbackLabel,
        reason: "O alimento não está mais no catálogo.",
      });
      return;
    }

    const quantity =
      params.quantity === null ? null : params.quantity * params.factor;

    let baseAmount: number | null = null;
    const baseUnit: BaseUnit = food.baseUnit;

    if (params.resolvedBase !== null) {
      baseAmount = params.resolvedBase * params.factor;
    } else if (quantity !== null) {
      const measure = params.measureId ? measures.get(params.measureId) : null;
      const conversion = convertToBase(
        quantity,
        measure ? { label: measure.label, grams: measure.grams, milliliters: measure.milliliters } : null,
        { baseQuantity: food.baseQuantity, baseUnit: food.baseUnit },
      );
      // Conversão impossível deixa NULO de propósito: a linha fica separada, com o motivo.
      baseAmount = conversion.ok ? conversion.amount : null;
    }

    sources.push({
      subjectKey: shoppingSubjectKey(params.foodId, food.name),
      foodId: params.foodId,
      recipeId: params.recipeId,
      label: food.name,
      brand: food.brand,
      categoryId: categoryByFood.get(params.foodId) ?? null,
      quantity,
      unit: params.measureLabel ?? food.baseUnit,
      baseAmount,
      baseUnit: baseAmount === null ? null : baseUnit,
      origin: { ...params.origin, quantity, unit: params.measureLabel ?? food.baseUnit },
    });
  }

  /** Expande uma receita nos ingredientes dela, na proporção pedida. */
  function pushRecipe(params: {
    recipeId: string;
    quantity: number;
    portionUnit: PortionUnit;
    date: string | null;
    plannedMealId: string | null;
  }): void {
    const recipe = recipeById.get(params.recipeId);
    if (!recipe) {
      skipped.push({ label: "Receita", reason: "A receita não está mais cadastrada." });
      return;
    }

    const factor = recipePortionFactor(recipe, params.quantity, params.portionUnit);
    if (factor === null) {
      skipped.push({
        label: recipe.name,
        reason:
          "A receita não tem peso final informado, então não dá para medi-la em gramas. Use porções.",
      });
      return;
    }

    const origin: ShoppingOrigin = {
      kind: "receita",
      label: recipe.name,
      date: params.date,
      recipeId: recipe.id,
      plannedMealId: params.plannedMealId,
      quantity: null,
      unit: "",
    };

    for (const ingredient of recipe.ingredients) {
      if (!ingredient.foodId) {
        // Ingrediente livre ("tempero a gosto") vira item sem quantidade — nunca zero.
        sources.push({
          subjectKey: shoppingSubjectKey(null, ingredient.customLabel ?? "Ingrediente"),
          foodId: null,
          recipeId: recipe.id,
          label: ingredient.customLabel ?? "Ingrediente",
          brand: null,
          categoryId: null,
          quantity: null,
          unit: ingredient.measureLabel ?? "un",
          baseAmount: null,
          baseUnit: null,
          origin: { ...origin, quantity: null, unit: ingredient.measureLabel ?? "un" },
        });
        continue;
      }

      pushFood({
        foodId: ingredient.foodId,
        quantity: ingredient.quantity,
        measureId: ingredient.measureId,
        measureLabel: ingredient.measureLabel,
        factor,
        // `grams_equivalent` guarda a quantidade na unidade-base do alimento (g OU ml).
        // Nulo = não deu para converter na 16-C; continua nulo aqui.
        resolvedBase: ingredient.gramsEquivalent,
        recipeId: recipe.id,
        origin,
        fallbackLabel: ingredient.customLabel ?? "Ingrediente",
      });
    }
  }

  /* ── Planejamento ── */
  for (const meal of plannedMeals) {
    const label = mealOriginLabel(meal.title?.trim() || meal.mealTypeName, meal.plannedDate);
    for (const item of meal.items) {
      const origin: ShoppingOrigin = {
        kind: "planejamento",
        label,
        date: meal.plannedDate,
        recipeId: null,
        plannedMealId: meal.id,
        quantity: item.quantity,
        unit: item.measureLabel ?? "",
      };

      if (item.itemKind === "receita" && item.recipeId) {
        pushRecipe({
          recipeId: item.recipeId,
          quantity: item.quantity ?? 1,
          portionUnit: item.portionUnit ?? "porcao",
          date: meal.plannedDate,
          plannedMealId: meal.id,
        });
        continue;
      }

      if (item.itemKind === "alimento" && item.foodId) {
        pushFood({
          foodId: item.foodId,
          quantity: item.quantity,
          measureId: item.measureId,
          measureLabel: item.measureLabel,
          factor: 1,
          resolvedBase: null,
          recipeId: null,
          origin,
          fallbackLabel: item.customLabel ?? "Item planejado",
        });
        continue;
      }

      // Item livre do planejamento: entra na lista pelo rótulo, sem valor nutricional.
      const livre = item.customLabel?.trim();
      if (!livre) continue;
      sources.push({
        subjectKey: shoppingSubjectKey(null, livre),
        foodId: null,
        recipeId: null,
        label: livre,
        brand: null,
        categoryId: null,
        quantity: item.quantity,
        unit: item.measureLabel ?? "un",
        baseAmount: null,
        baseUnit: null,
        origin,
      });
    }
  }

  /* ── Receitas escolhidas diretamente ── */
  for (const recipe of input.recipes) {
    pushRecipe({
      recipeId: recipe.recipeId,
      quantity: recipe.quantity,
      portionUnit: recipe.portionUnit,
      date: null,
      plannedMealId: null,
    });
  }

  return { sources, skipped, meals: plannedMeals.length };
}

/* ═══════════════════════════ Pacote da tela ═══════════════════════════ */

export type ShoppingPackage = {
  lists: ShoppingList[];
  categories: MarketCategory[];
  pantry: PantryItem[];
};

/** Tudo que `/nutricao/compras` precisa, numa leitura só. */
export async function getShoppingPackage(userId: string): Promise<ShoppingPackage> {
  await ensureMarketCategories(userId);
  const [lists, categories, pantry] = await Promise.all([
    getShoppingLists(),
    getMarketCategories(),
    getPantryItems(),
  ]);
  return { lists, categories, pantry };
}
