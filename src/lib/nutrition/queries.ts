/**
 * Fase 16-A — Dieta e Alimentação · Camada de leitura (server-only).
 *
 * Padrão do projeto: UMA consulta ampla por entidade + derivação em memória (evitar N+1).
 * A RLS garante que só vem o que é do usuário **mais** o que é global (`user_id is null`) —
 * nenhuma query aqui filtra por `user_id` manualmente, e nem deve: quem faz isso é a policy.
 *
 * Tudo que é "favorito", "arquivado", "editável" e "categoria efetiva" é DERIVADO aqui,
 * combinando o alimento com a preferência do usuário. A base do sistema nunca é alterada.
 */
import { createClient } from "@/lib/supabase/server";
import {
  asBaseUnit,
  asFoodType,
  asMeasureUnitType,
  asMethod,
  asNutrientGroup,
  asNutrientUnit,
  asPreparationState,
  asValueState,
} from "./constants";
import type {
  FoodCategory,
  FoodDetail,
  FoodListItem,
  FoodMeasure,
  FoodNutrientValue,
  FoodSource,
  FoodTag,
  NutrientDefinition,
  NutritionCatalogSummary,
} from "./types";

/** Teto de segurança: nenhuma leitura traz mais que isto de uma vez. */
const FOOD_LIMIT = 5000;
const NUTRIENT_LIMIT = 100_000;

/**
 * Colunas da view. Precisa ser UM literal em uma linha só: o `select` tipado do
 * supabase-js infere o shape a partir do TIPO LITERAL da string, e concatenar com `+`
 * alarga para `string` — aí o retorno vira `GenericStringError` e o build quebra.
 */
const FOOD_SELECT =
  "id,user_id,name,alternative_name,brand,barcode,category_id,food_type,preparation_state,base_quantity,base_unit,edible_portion_percent,source_id,source_food_code,source_version,data_quality,is_system_food,is_verified,last_verified_at,notes,origin_food_id,archived_at,created_at,updated_at,energia_kcal,proteina,carboidrato,lipidios,fibra,sodio,acucares_totais,ag_saturados,nutrients_available";

const num = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/* ───────────────────────────── Referência ───────────────────────────── */

export async function getNutrientDefinitions(): Promise<NutrientDefinition[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_nutrients")
    .select("code,name,short_name,unit,nutrient_group,position,is_core,precision")
    .order("nutrient_group")
    .order("position");

  return (data ?? []).map((row) => ({
    code: row.code,
    name: row.name,
    shortName: row.short_name,
    unit: asNutrientUnit(row.unit),
    group: asNutrientGroup(row.nutrient_group),
    position: row.position,
    isCore: row.is_core,
    precision: row.precision,
  }));
}

/** Índice código → definição, para a UI não fazer `find` em loop. */
export function indexNutrients(definitions: NutrientDefinition[]): Record<string, NutrientDefinition> {
  const index: Record<string, NutrientDefinition> = {};
  for (const definition of definitions) index[definition.code] = definition;
  return index;
}

export async function getFoodSources(): Promise<FoodSource[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_food_sources")
    .select(
      "id,user_id,code,name,publisher,edition,version,reference_url,license_note,citation,is_official",
    )
    .order("is_official", { ascending: false })
    .order("name");

  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    publisher: row.publisher,
    edition: row.edition,
    version: row.version,
    referenceUrl: row.reference_url,
    licenseNote: row.license_note,
    citation: row.citation,
    isOfficial: row.is_official,
    isOwn: row.user_id !== null,
  }));
}

export async function getFoodCategories(): Promise<FoodCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_food_categories")
    .select("id,user_id,name,slug,position,icon,color,parent_id")
    .order("position")
    .order("name");

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    position: row.position,
    icon: row.icon,
    color: row.color,
    parentId: row.parent_id,
    isOwn: row.user_id !== null,
  }));
}

export async function getFoodTags(): Promise<FoodTag[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nutrition_food_tags")
    .select("id,name,color,position")
    .order("position")
    .order("name");

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    position: row.position,
  }));
}

/* ───────────────────────────── Alimentos ───────────────────────────── */

/**
 * Catálogo completo (base do sistema + do usuário), já com preferências aplicadas.
 *
 * São quatro consultas paralelas em vez de um join gigante: a view já traz os macros
 * pivotados e as três laterais (categorias, fontes, preferências) são pequenas. Cruzar em
 * memória é mais barato e mantém o SQL legível.
 */
export async function getFoods(): Promise<FoodListItem[]> {
  const supabase = await createClient();

  const [foodsResult, categories, sources, prefsResult, linksResult] = await Promise.all([
    supabase.from("nutrition_foods_view").select(FOOD_SELECT).order("name").limit(FOOD_LIMIT),
    getFoodCategories(),
    getFoodSources(),
    supabase
      .from("nutrition_food_prefs")
      .select("food_id,is_favorite,archived_at,use_count,last_used_at,category_override_id"),
    supabase.from("nutrition_food_tag_links").select("food_id,tag_id"),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const prefByFood = new Map((prefsResult.data ?? []).map((p) => [p.food_id, p]));

  const tagsByFood = new Map<string, string[]>();
  for (const link of linksResult.data ?? []) {
    const list = tagsByFood.get(link.food_id);
    if (list) list.push(link.tag_id);
    else tagsByFood.set(link.food_id, [link.tag_id]);
  }

  return (foodsResult.data ?? []).map((row) => {
    const pref = prefByFood.get(row.id!);
    // Categoria efetiva: o override do usuário vence a da fonte, sem tocar na base.
    const sourceCategory = row.category_id ? categoryById.get(row.category_id) : undefined;
    const override = pref?.category_override_id
      ? categoryById.get(pref.category_override_id)
      : undefined;
    const effective = override ?? sourceCategory;
    const isSystemFood = Boolean(row.is_system_food);

    return {
      id: row.id!,
      name: row.name!,
      alternativeName: row.alternative_name,
      brand: row.brand,
      barcode: row.barcode,
      foodType: asFoodType(row.food_type),
      preparationState: asPreparationState(row.preparation_state),
      baseQuantity: num(row.base_quantity) ?? 100,
      baseUnit: asBaseUnit(row.base_unit),
      ediblePortionPercent: num(row.edible_portion_percent),
      dataQuality: asMethod(row.data_quality),
      isSystemFood,
      isVerified: Boolean(row.is_verified),
      lastVerifiedAt: row.last_verified_at,
      notes: row.notes,
      originFoodId: row.origin_food_id,
      categoryId: effective?.id ?? null,
      categoryName: effective?.name ?? null,
      sourceCategoryName: override ? (sourceCategory?.name ?? null) : null,
      source: row.source_id ? (sourceById.get(row.source_id) ?? null) : null,
      sourceFoodCode: row.source_food_code,
      sourceVersion: row.source_version,
      macros: {
        energiaKcal: num(row.energia_kcal),
        proteina: num(row.proteina),
        carboidrato: num(row.carboidrato),
        lipidios: num(row.lipidios),
        fibra: num(row.fibra),
        sodio: num(row.sodio),
        acucares: num(row.acucares_totais),
        saturadas: num(row.ag_saturados),
        nutrientsAvailable: row.nutrients_available ?? 0,
      },
      isFavorite: pref?.is_favorite ?? false,
      // Arquivado pelo dono (alimento próprio) OU pela preferência (alimento global).
      isArchived: Boolean(row.archived_at) || Boolean(pref?.archived_at),
      useCount: pref?.use_count ?? 0,
      lastUsedAt: pref?.last_used_at ?? null,
      tagIds: tagsByFood.get(row.id!) ?? [],
      // A base do sistema é imutável — a policy impede a escrita, e a UI nem oferece.
      isEditable: !isSystemFood,
      createdAt: row.created_at!,
      updatedAt: row.updated_at!,
    } satisfies FoodListItem;
  });
}

/** Alimento completo, com todos os nutrientes e todas as medidas caseiras. */
export async function getFoodDetail(id: string): Promise<FoodDetail | null> {
  const supabase = await createClient();

  const [foods, nutrientsResult, measuresResult] = await Promise.all([
    getFoods(),
    supabase
      .from("nutrition_food_nutrients")
      .select("nutrient_code,amount,value_state,method,source_note")
      .eq("food_id", id)
      .limit(NUTRIENT_LIMIT),
    supabase
      .from("nutrition_food_measures")
      .select("id,user_id,food_id,label,unit_type,grams,milliliters,is_default,position,source_note")
      .eq("food_id", id)
      .order("position"),
  ]);

  const food = foods.find((item) => item.id === id);
  if (!food) return null;

  const nutrients: FoodNutrientValue[] = (nutrientsResult.data ?? []).map((row) => ({
    code: row.nutrient_code,
    amount: num(row.amount),
    state: asValueState(row.value_state),
    method: asMethod(row.method),
    sourceNote: row.source_note,
  }));

  const measures: FoodMeasure[] = (measuresResult.data ?? []).map((row) => ({
    id: row.id,
    foodId: row.food_id,
    label: row.label,
    unitType: asMeasureUnitType(row.unit_type),
    grams: num(row.grams),
    milliliters: num(row.milliliters),
    isDefault: row.is_default,
    position: row.position,
    sourceNote: row.source_note,
    isOwn: row.user_id !== null,
  }));

  return { ...food, nutrients, measures };
}

/* ───────────────────────────── Resumo ───────────────────────────── */

/**
 * Contadores do catálogo. Derivado da lista já carregada — não faz consulta nova.
 * `nutrientValues` vem do lote de importação, que é a fonte de auditoria da carga.
 */
export function summarizeCatalog(
  foods: FoodListItem[],
  categories: FoodCategory[],
  nutrientValues: number,
): NutritionCatalogSummary {
  const sources = new Map<string, { name: string; edition: string | null; foods: number; citation: string | null }>();
  let system = 0;
  let own = 0;
  let favorites = 0;
  let archived = 0;
  let withBarcode = 0;

  for (const food of foods) {
    if (food.isSystemFood) system += 1;
    else own += 1;
    if (food.isFavorite) favorites += 1;
    if (food.isArchived) archived += 1;
    if (food.barcode) withBarcode += 1;

    if (food.source) {
      const current = sources.get(food.source.id);
      if (current) current.foods += 1;
      else
        sources.set(food.source.id, {
          name: food.source.name,
          edition: food.source.edition,
          foods: 1,
          citation: food.source.citation,
        });
    }
  }

  return {
    total: foods.length,
    system,
    own,
    favorites,
    archived,
    withBarcode,
    categories: categories.length,
    nutrientValues,
    sources: [...sources.values()].sort((a, b) => b.foods - a.foods),
  };
}

/** Total de valores nutricionais carregados (auditoria das cargas de base). */
export async function getNutrientValueCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("nutrition_food_nutrients")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

/** Fontes oficiais com licença/citação, para o rodapé de atribuição da tela. */
export async function getOfficialSources(): Promise<FoodSource[]> {
  const sources = await getFoodSources();
  return sources.filter((source) => source.isOfficial);
}
