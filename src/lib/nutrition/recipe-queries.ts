import "server-only";

/**
 * Fase 16-C — Dieta e Alimentação · Leitura de receitas, refeições-modelo e substituições.
 *
 * Padrão do módulo: poucas consultas amplas + derivação em memória. A RLS faz o recorte por
 * usuário — nenhuma query aqui filtra `user_id` na mão, e nem deve.
 *
 * ══ NENHUM TOTAL VEM DO BANCO ══
 * Não existe coluna com o valor nutricional de uma receita. O total é sempre calculado por
 * `recipe.ts` a partir dos ingredientes e do catálogo ATUAL — a receita é um modelo mutável.
 * Materializar o total criaria uma segunda verdade que envelheceria no primeiro ingrediente
 * corrigido (regra 5 do módulo).
 *
 * O que É congelado, e por isso NÃO passa por aqui, é o consumo: `nutrition_diary_entries`
 * guarda o snapshot da receita no instante do registro.
 */
import { createClient } from "@/lib/supabase/server";
import { scaleNutrients, sumNutrients, type NutrientTotal } from "./calc";
import {
  asPortionUnit,
  asSubstitutionLevel,
  asSubstitutionOptionKind,
  asTemplateItemKind,
  RECIPE_PHOTO_BUCKET,
  RECIPE_PHOTO_ENTITY_TYPE,
  RECIPE_PHOTO_SIGNED_URL_TTL_SECONDS,
  type PortionUnit,
} from "./constants";
import { getFoodBasics, getFoodNutrientsFor } from "./diary-queries";
import {
  templateTotals,
  type TemplateCalcContext,
  type TemplateCalcResult,
  type TemplateRecipeData,
} from "./meal-template";
import {
  recipePortionFactor,
  recipeTotals,
  RECIPE_SNAPSHOT_MESSAGES,
  scaleTotals,
  type CalcIngredient,
  type RecipeCalcContext,
  type RecipeCalcResult,
} from "./recipe";
import { convertToBase, CONVERSION_FAILURE_MESSAGES, type ConvertibleMeasure } from "./units";
import type {
  MealTemplate,
  MealTemplateItem,
  Recipe,
  RecipeCategory,
  RecipeIngredient,
  SubstitutionGroup,
  SubstitutionLog,
  SubstitutionOption,
} from "./types";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Teto de segurança das leituras. */
const LIMIT = 2000;

/* ═══════════════════════════ Categorias ═══════════════════════════ */

export async function getRecipeCategories(): Promise<RecipeCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_recipe_categories")
    .select("id,name,icon,color,position")
    .order("position")
    .order("name");

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    position: row.position,
  }));
}

/* ═══════════════════════════ Receitas ═══════════════════════════ */

const RECIPE_SELECT =
  "id,name,description,category_id,instructions,prep_minutes,cook_minutes,servings,serving_label,yield_note,total_weight_g,source,tags,notes,is_favorite,archived_at,origin_recipe_id,is_copy,use_count,last_used_at,created_at,updated_at";

const INGREDIENT_SELECT =
  "id,recipe_id,food_id,custom_label,quantity,measure_id,measure_label,grams_equivalent,is_optional,note,position";

/** Receitas com ingredientes e foto. Três consultas, independentemente do número de receitas. */
export async function getRecipes(): Promise<Recipe[]> {
  const supabase = await createClient();

  const [recipesResult, ingredientsResult, categories, photosResult] = await Promise.all([
    supabase.from("nutrition_recipes").select(RECIPE_SELECT).order("name").limit(LIMIT),
    supabase
      .from("nutrition_recipe_ingredients")
      .select(INGREDIENT_SELECT)
      .order("position")
      .limit(LIMIT * 10),
    getRecipeCategories(),
    // A foto reusa a tabela genérica de anexos + o bucket privado `attachments` (Fase 14).
    supabase
      .from("attachments")
      .select("id,entity_id,storage_path,file_name,created_at")
      .eq("entity_type", RECIPE_PHOTO_ENTITY_TYPE)
      .order("created_at", { ascending: false }),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const ingredientsByRecipe = new Map<string, RecipeIngredient[]>();
  for (const row of ingredientsResult.data ?? []) {
    const ingredient: RecipeIngredient = {
      id: row.id,
      recipeId: row.recipe_id,
      foodId: row.food_id,
      customLabel: row.custom_label,
      quantity: num(row.quantity),
      measureId: row.measure_id,
      measureLabel: row.measure_label,
      gramsEquivalent: num(row.grams_equivalent),
      isOptional: row.is_optional,
      note: row.note,
      position: row.position,
    };
    const list = ingredientsByRecipe.get(ingredient.recipeId);
    if (list) list.push(ingredient);
    else ingredientsByRecipe.set(ingredient.recipeId, [ingredient]);
  }

  // Só a foto mais recente de cada receita interessa (a lista já vem ordenada por data).
  const latestByRecipe = new Map<string, { id: string; storagePath: string; fileName: string }>();
  for (const row of photosResult.data ?? []) {
    if (!row.entity_id || latestByRecipe.has(row.entity_id)) continue;
    latestByRecipe.set(row.entity_id, {
      id: row.id,
      storagePath: row.storage_path,
      fileName: row.file_name,
    });
  }

  // ⛔ 16-F — o caminho no Storage NÃO desce para o navegador. O cliente recebe uma URL
  // assinada de 5 min, gerada agora, igual às fotos de evolução (16-E). Uma chamada só de
  // `createSignedUrls` para todas as receitas: não é N+1.
  const photoByRecipe = new Map<string, { id: string; fileName: string; url: string | null }>();
  if (latestByRecipe.size > 0) {
    const entries = [...latestByRecipe.entries()];
    const { data: signed } = await supabase.storage
      .from(RECIPE_PHOTO_BUCKET)
      .createSignedUrls(
        entries.map(([, photo]) => photo.storagePath),
        RECIPE_PHOTO_SIGNED_URL_TTL_SECONDS,
      );
    const urlByPath = new Map<string, string>();
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
    }
    for (const [recipeId, photo] of entries) {
      photoByRecipe.set(recipeId, {
        id: photo.id,
        fileName: photo.fileName,
        url: urlByPath.get(photo.storagePath) ?? null,
      });
    }
  }

  return (recipesResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_id ? (categoryById.get(row.category_id)?.name ?? null) : null,
    instructions: row.instructions,
    prepMinutes: row.prep_minutes,
    cookMinutes: row.cook_minutes,
    servings: num(row.servings) ?? 1,
    servingLabel: row.serving_label,
    yieldNote: row.yield_note,
    totalWeightG: num(row.total_weight_g),
    source: row.source,
    tags: row.tags ?? [],
    notes: row.notes,
    isFavorite: row.is_favorite,
    isArchived: Boolean(row.archived_at),
    originRecipeId: row.origin_recipe_id,
    isCopy: row.is_copy,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ingredients: ingredientsByRecipe.get(row.id) ?? [],
    photo: photoByRecipe.get(row.id) ?? null,
  }));
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  const recipes = await getRecipes();
  return recipes.find((recipe) => recipe.id === id) ?? null;
}

/* ═══════════════════════════ Contexto de cálculo ═══════════════════════════ */

/**
 * Carrega o catálogo necessário para calcular um conjunto de receitas/modelos.
 *
 * Duas consultas fixas: nutrientes dos alimentos citados e as medidas caseiras usadas. Nada de
 * uma consulta por ingrediente.
 */
export async function buildRecipeCalcContext(
  foodIds: string[],
  measureIds: string[],
): Promise<RecipeCalcContext> {
  const uniqueFoods = [...new Set(foodIds.filter(Boolean))];
  const uniqueMeasures = [...new Set(measureIds.filter(Boolean))];

  const supabase = await createClient();
  const [basics, nutrients, measuresResult] = await Promise.all([
    getFoodBasics(uniqueFoods),
    getFoodNutrientsFor(uniqueFoods),
    uniqueMeasures.length > 0
      ? supabase
          .from("nutrition_food_measures")
          .select("id,food_id,label,grams,milliliters")
          .in("id", uniqueMeasures)
      : Promise.resolve({ data: [] as { id: string; food_id: string; label: string; grams: number | string | null; milliliters: number | string | null }[] }),
  ]);

  const foods = new Map(
    [...basics.entries()].map(([id, food]) => [
      id,
      {
        baseQuantity: food.baseQuantity,
        baseUnit: food.baseUnit,
        nutrients: nutrients.get(id) ?? [],
      },
    ]),
  );

  const measures = new Map<string, ConvertibleMeasure>();
  for (const row of measuresResult.data ?? []) {
    measures.set(row.id, {
      label: row.label,
      grams: num(row.grams),
      milliliters: num(row.milliliters),
    });
  }

  return { foods, measures };
}

/** Ingrediente do domínio → entrada do cálculo. */
export const toCalcIngredient = (ingredient: RecipeIngredient): CalcIngredient => ({
  id: ingredient.id,
  foodId: ingredient.foodId,
  quantity: ingredient.quantity,
  measureId: ingredient.measureId,
  isOptional: ingredient.isOptional,
});

export type RecipeWithTotals = Recipe & { calc: RecipeCalcResult };

/**
 * Receitas já com o total calculado.
 *
 * O cálculo acontece AQUI, no servidor, com o catálogo atual — e não no navegador, que não
 * tem (nem deve ter) a tabela de nutrientes inteira.
 */
export async function getRecipesWithTotals(): Promise<RecipeWithTotals[]> {
  const recipes = await getRecipes();
  if (recipes.length === 0) return [];

  const foodIds: string[] = [];
  const measureIds: string[] = [];
  for (const recipe of recipes) {
    for (const ingredient of recipe.ingredients) {
      if (ingredient.foodId) foodIds.push(ingredient.foodId);
      if (ingredient.measureId) measureIds.push(ingredient.measureId);
    }
  }

  const ctx = await buildRecipeCalcContext(foodIds, measureIds);

  return recipes.map((recipe) => ({
    ...recipe,
    calc: recipeTotals(recipe.ingredients.map(toCalcIngredient), ctx),
  }));
}

/** Total de UMA receita — usado pelas actions que gravam snapshot. */
export async function getRecipeTotals(
  recipeId: string,
): Promise<{ recipe: Recipe; calc: RecipeCalcResult } | null> {
  const recipe = await getRecipe(recipeId);
  if (!recipe) return null;

  const ctx = await buildRecipeCalcContext(
    recipe.ingredients.map((i) => i.foodId).filter(Boolean) as string[],
    recipe.ingredients.map((i) => i.measureId).filter(Boolean) as string[],
  );

  return { recipe, calc: recipeTotals(recipe.ingredients.map(toCalcIngredient), ctx) };
}

/* ═══════════════════════════ Refeições-modelo ═══════════════════════════ */

const TEMPLATE_SELECT =
  "id,name,description,meal_type_id,category_id,suggested_time,tags,notes,is_favorite,archived_at,origin_template_id,is_copy,use_count,last_used_at,created_at,updated_at";

const TEMPLATE_ITEM_SELECT =
  "id,template_id,item_kind,food_id,recipe_id,custom_label,quantity,measure_id,measure_label,portion_unit,is_optional,notes,position";

export async function getMealTemplates(): Promise<MealTemplate[]> {
  const supabase = await createClient();

  const [templatesResult, itemsResult, categories, mealTypesResult] = await Promise.all([
    supabase.from("nutrition_meal_templates").select(TEMPLATE_SELECT).order("name").limit(LIMIT),
    supabase
      .from("nutrition_meal_template_items")
      .select(TEMPLATE_ITEM_SELECT)
      .order("position")
      .limit(LIMIT * 10),
    getRecipeCategories(),
    supabase.from("nutrition_meal_types").select("id,name"),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const mealTypeById = new Map((mealTypesResult.data ?? []).map((type) => [type.id, type.name]));

  const itemsByTemplate = new Map<string, MealTemplateItem[]>();
  for (const row of itemsResult.data ?? []) {
    const item: MealTemplateItem = {
      id: row.id,
      templateId: row.template_id,
      itemKind: asTemplateItemKind(row.item_kind),
      foodId: row.food_id,
      recipeId: row.recipe_id,
      customLabel: row.custom_label,
      quantity: num(row.quantity),
      measureId: row.measure_id,
      measureLabel: row.measure_label,
      portionUnit: asPortionUnit(row.portion_unit),
      isOptional: row.is_optional,
      notes: row.notes,
      position: row.position,
    };
    const list = itemsByTemplate.get(item.templateId);
    if (list) list.push(item);
    else itemsByTemplate.set(item.templateId, [item]);
  }

  return (templatesResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    mealTypeId: row.meal_type_id,
    mealTypeName: row.meal_type_id ? (mealTypeById.get(row.meal_type_id) ?? null) : null,
    categoryId: row.category_id,
    categoryName: row.category_id ? (categoryById.get(row.category_id)?.name ?? null) : null,
    suggestedTime: row.suggested_time,
    tags: row.tags ?? [],
    notes: row.notes,
    isFavorite: row.is_favorite,
    isArchived: Boolean(row.archived_at),
    originTemplateId: row.origin_template_id,
    isCopy: row.is_copy,
    useCount: row.use_count,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: itemsByTemplate.get(row.id) ?? [],
  }));
}

export async function getMealTemplate(id: string): Promise<MealTemplate | null> {
  const templates = await getMealTemplates();
  return templates.find((template) => template.id === id) ?? null;
}

export type MealTemplateWithTotals = MealTemplate & { calc: TemplateCalcResult };

/**
 * Refeições-modelo já com o total calculado.
 *
 * As receitas citadas são resolvidas uma única vez para todos os modelos — o custo não cresce
 * com o número de modelos que usam a mesma receita.
 */
export async function getMealTemplatesWithTotals(): Promise<MealTemplateWithTotals[]> {
  const templates = await getMealTemplates();
  if (templates.length === 0) return [];

  const foodIds: string[] = [];
  const measureIds: string[] = [];
  const recipeIds = new Set<string>();
  for (const template of templates) {
    for (const item of template.items) {
      if (item.foodId) foodIds.push(item.foodId);
      if (item.measureId) measureIds.push(item.measureId);
      if (item.recipeId) recipeIds.add(item.recipeId);
    }
  }

  const base = await buildRecipeCalcContext(foodIds, measureIds);

  const recipes = new Map<string, TemplateRecipeData>();
  if (recipeIds.size > 0) {
    const withTotals = await getRecipesWithTotals();
    for (const recipe of withTotals) {
      if (!recipeIds.has(recipe.id)) continue;
      recipes.set(recipe.id, {
        servings: recipe.servings,
        totalWeightG: recipe.totalWeightG,
        totals: recipe.calc.totals,
      });
    }
  }

  const ctx: TemplateCalcContext = { ...base, recipes };
  return templates.map((template) => ({
    ...template,
    calc: templateTotals(template.items, ctx),
  }));
}

/* ═══════════════════════════ Substituições ═══════════════════════════ */

const GROUP_SELECT =
  "id,name,group_kind,description,food_id,recipe_id,meal_template_id,custom_label,base_quantity,base_measure_id,base_measure_label,base_portion_unit,tolerance_energy_percent,tolerance_protein_percent,tolerance_carb_percent,tolerance_fat_percent,tolerance_fiber_percent,restrictions,notes,is_active,position";

const OPTION_SELECT =
  "id,group_id,option_kind,food_id,recipe_id,meal_template_id,custom_label,quantity,measure_id,measure_label,portion_unit,priority,notes,is_active,position";

/**
 * Grupos com suas alternativas, já com os rótulos resolvidos.
 *
 * O rótulo é derivado na leitura (nome do alimento/receita/modelo, ou o texto livre) para a
 * tela nunca precisar de uma consulta extra — e para um item excluído aparecer como
 * "removido do catálogo" em vez de sumir.
 */
export async function getSubstitutionGroups(): Promise<SubstitutionGroup[]> {
  const supabase = await createClient();

  const [groupsResult, optionsResult] = await Promise.all([
    supabase.from("nutrition_substitution_groups").select(GROUP_SELECT).order("position").limit(LIMIT),
    supabase
      .from("nutrition_substitution_options")
      .select(OPTION_SELECT)
      .order("priority")
      .order("position")
      .limit(LIMIT * 5),
  ]);

  const groups = groupsResult.data ?? [];
  const options = optionsResult.data ?? [];
  if (groups.length === 0) return [];

  // Nomes de tudo que os grupos e as alternativas citam — três consultas, não N.
  const foodIds = new Set<string>();
  const recipeIds = new Set<string>();
  const templateIds = new Set<string>();
  for (const row of [...groups, ...options]) {
    if (row.food_id) foodIds.add(row.food_id);
    if (row.recipe_id) recipeIds.add(row.recipe_id);
    if (row.meal_template_id) templateIds.add(row.meal_template_id);
  }

  const [foodsResult, recipesResult, templatesResult] = await Promise.all([
    foodIds.size > 0
      ? supabase.from("nutrition_foods").select("id,name").in("id", [...foodIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    recipeIds.size > 0
      ? supabase.from("nutrition_recipes").select("id,name").in("id", [...recipeIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    templateIds.size > 0
      ? supabase.from("nutrition_meal_templates").select("id,name").in("id", [...templateIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const foodNames = new Map((foodsResult.data ?? []).map((row) => [row.id, row.name]));
  const recipeNames = new Map((recipesResult.data ?? []).map((row) => [row.id, row.name]));
  const templateNames = new Map((templatesResult.data ?? []).map((row) => [row.id, row.name]));

  const labelOf = (row: {
    food_id: string | null;
    recipe_id: string | null;
    meal_template_id: string | null;
    custom_label: string | null;
  }): string => {
    if (row.custom_label?.trim()) return row.custom_label.trim();
    if (row.food_id) return foodNames.get(row.food_id) ?? "Alimento removido do catálogo";
    if (row.recipe_id) return recipeNames.get(row.recipe_id) ?? "Receita removida";
    if (row.meal_template_id) {
      return templateNames.get(row.meal_template_id) ?? "Refeição-modelo removida";
    }
    return "Item";
  };

  const optionsByGroup = new Map<string, SubstitutionOption[]>();
  for (const row of options) {
    const option: SubstitutionOption = {
      id: row.id,
      groupId: row.group_id,
      optionKind: asSubstitutionOptionKind(row.option_kind),
      foodId: row.food_id,
      recipeId: row.recipe_id,
      mealTemplateId: row.meal_template_id,
      customLabel: row.custom_label,
      quantity: num(row.quantity),
      measureId: row.measure_id,
      measureLabel: row.measure_label,
      portionUnit: asPortionUnit(row.portion_unit),
      priority: row.priority,
      notes: row.notes,
      isActive: row.is_active,
      position: row.position,
      label: labelOf(row),
    };
    const list = optionsByGroup.get(option.groupId);
    if (list) list.push(option);
    else optionsByGroup.set(option.groupId, [option]);
  }

  return groups.map((row) => ({
    id: row.id,
    name: row.name,
    groupKind: asSubstitutionLevel(row.group_kind),
    description: row.description,
    foodId: row.food_id,
    recipeId: row.recipe_id,
    mealTemplateId: row.meal_template_id,
    customLabel: row.custom_label,
    baseQuantity: num(row.base_quantity),
    baseMeasureId: row.base_measure_id,
    baseMeasureLabel: row.base_measure_label,
    basePortionUnit: asPortionUnit(row.base_portion_unit),
    tolerances: {
      energy: num(row.tolerance_energy_percent),
      protein: num(row.tolerance_protein_percent),
      carb: num(row.tolerance_carb_percent),
      fat: num(row.tolerance_fat_percent),
      fiber: num(row.tolerance_fiber_percent),
    },
    restrictions: row.restrictions ?? [],
    notes: row.notes,
    isActive: row.is_active,
    position: row.position,
    originalLabel: labelOf(row),
    options: optionsByGroup.get(row.id) ?? [],
  }));
}

export type SubstitutionSubjectTotals = {
  /** Total do item na quantidade cadastrada. Vazio quando não dá para calcular. */
  totals: Record<string, NutrientTotal>;
  /** Por que não deu, quando não deu. A tela mostra em vez de exibir zeros. */
  reason: string | null;
};

export type SubstitutionGroupWithTotals = SubstitutionGroup & {
  original: SubstitutionSubjectTotals;
  optionTotals: Record<string, SubstitutionSubjectTotals>;
};

/**
 * Grupos com o total do original e de cada alternativa, calculados no SERVIDOR.
 *
 * A comparação precisa dos dois lados em números, e o navegador não tem (nem deve ter) a
 * tabela de nutrientes. Tudo passa pelo mesmo núcleo: alimento por `convertToBase` +
 * `scaleNutrients`, receita por `recipePortionFactor`, modelo por `templateTotals`.
 *
 * Quando um lado não pode ser calculado, o total vem VAZIO com o motivo — e a comparação
 * marca a diferença como desconhecida, nunca como zero.
 */
export async function getSubstitutionGroupsWithTotals(): Promise<SubstitutionGroupWithTotals[]> {
  const groups = await getSubstitutionGroups();
  if (groups.length === 0) return [];

  /* Uma passada só coletando tudo que precisa ser resolvido. */
  const foodIds: string[] = [];
  const measureIds: string[] = [];
  const recipeIds = new Set<string>();
  const templateIds = new Set<string>();

  const collect = (row: {
    foodId: string | null;
    recipeId: string | null;
    mealTemplateId: string | null;
    measureId?: string | null;
    baseMeasureId?: string | null;
  }) => {
    if (row.foodId) foodIds.push(row.foodId);
    if (row.recipeId) recipeIds.add(row.recipeId);
    if (row.mealTemplateId) templateIds.add(row.mealTemplateId);
    if (row.measureId) measureIds.push(row.measureId);
    if (row.baseMeasureId) measureIds.push(row.baseMeasureId);
  };

  for (const group of groups) {
    collect(group);
    for (const option of group.options) collect(option);
  }

  const [foodCtx, allRecipes, allTemplates] = await Promise.all([
    buildRecipeCalcContext(foodIds, measureIds),
    recipeIds.size > 0 ? getRecipesWithTotals() : Promise.resolve([]),
    templateIds.size > 0 ? getMealTemplatesWithTotals() : Promise.resolve([]),
  ]);

  const recipeById = new Map(allRecipes.map((recipe) => [recipe.id, recipe]));
  const templateById = new Map(allTemplates.map((template) => [template.id, template]));

  const resolve = (subject: {
    foodId: string | null;
    recipeId: string | null;
    mealTemplateId: string | null;
    quantity: number | null;
    measureId: string | null;
    portionUnit: PortionUnit | null;
  }): SubstitutionSubjectTotals => {
    if (subject.quantity === null) {
      return { totals: {}, reason: "Sem quantidade de referência definida." };
    }

    if (subject.foodId) {
      const food = foodCtx.foods.get(subject.foodId);
      if (!food) return { totals: {}, reason: "O alimento não está mais no catálogo." };
      const measure = subject.measureId ? (foodCtx.measures.get(subject.measureId) ?? null) : null;
      const conversion = convertToBase(subject.quantity, measure, {
        baseQuantity: food.baseQuantity,
        baseUnit: food.baseUnit,
      });
      if (!conversion.ok) {
        return { totals: {}, reason: CONVERSION_FAILURE_MESSAGES[conversion.reason] };
      }
      return { totals: sumNutrients([scaleNutrients(food.nutrients, conversion.factor)]), reason: null };
    }

    if (subject.recipeId) {
      const recipe = recipeById.get(subject.recipeId);
      if (!recipe) return { totals: {}, reason: "A receita não está mais cadastrada." };
      const factor = recipePortionFactor(
        recipe,
        subject.quantity,
        subject.portionUnit ?? "porcao",
      );
      if (factor === null) {
        return { totals: {}, reason: RECIPE_SNAPSHOT_MESSAGES.peso_final_ausente };
      }
      return { totals: scaleTotals(recipe.calc.totals, factor), reason: null };
    }

    if (subject.mealTemplateId) {
      const template = templateById.get(subject.mealTemplateId);
      if (!template) return { totals: {}, reason: "A refeição-modelo não está mais cadastrada." };
      return { totals: scaleTotals(template.calc.totals, subject.quantity), reason: null };
    }

    return { totals: {}, reason: "Item livre: sem valor nutricional para comparar." };
  };

  return groups.map((group) => ({
    ...group,
    original: resolve({
      foodId: group.foodId,
      recipeId: group.recipeId,
      mealTemplateId: group.mealTemplateId,
      quantity: group.baseQuantity,
      measureId: group.baseMeasureId,
      portionUnit: group.basePortionUnit,
    }),
    optionTotals: Object.fromEntries(
      group.options.map((option) => [
        option.id,
        resolve({
          foodId: option.foodId,
          recipeId: option.recipeId,
          mealTemplateId: option.mealTemplateId,
          quantity: option.quantity,
          measureId: option.measureId,
          portionUnit: option.portionUnit,
        }),
      ]),
    ),
  }));
}

/** Histórico de trocas, do mais recente para o mais antigo. */
export async function getSubstitutionLogs(limit = 100): Promise<SubstitutionLog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_substitution_logs")
    .select(
      "id,group_id,option_id,substitution_level,applied_on,diary_meal_id,diary_entry_id,original_label,original_quantity,original_measure_label,replacement_label,replacement_quantity,replacement_measure_label,delta_energy_kcal,delta_protein_g,delta_carb_g,delta_fat_g,delta_fiber_g,reason,created_at",
    )
    .order("applied_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    groupId: row.group_id,
    optionId: row.option_id,
    level: asSubstitutionLevel(row.substitution_level),
    appliedOn: row.applied_on,
    diaryMealId: row.diary_meal_id,
    diaryEntryId: row.diary_entry_id,
    originalLabel: row.original_label,
    originalQuantity: num(row.original_quantity),
    originalMeasureLabel: row.original_measure_label,
    replacementLabel: row.replacement_label,
    replacementQuantity: num(row.replacement_quantity),
    replacementMeasureLabel: row.replacement_measure_label,
    deltaEnergyKcal: num(row.delta_energy_kcal),
    deltaProteinG: num(row.delta_protein_g),
    deltaCarbG: num(row.delta_carb_g),
    deltaFatG: num(row.delta_fat_g),
    deltaFiberG: num(row.delta_fiber_g),
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
