/**
 * Fase 16-A — Dieta e Alimentação · Filtro, busca e ordenação do catálogo (PURO).
 *
 * Roda em memória, não no banco: o catálogo é lido inteiro uma vez (uma consulta ampla, o
 * padrão do projeto) e todos os filtros combinam sem ida e volta ao servidor. Isso é o que
 * deixa a busca instantânea enquanto o usuário digita.
 *
 * Sem `Date.now()`, sem I/O — testável direto.
 */
import type { FoodFilterState, FoodListItem } from "./types";
import { EMPTY_FOOD_FILTERS } from "./types";

/**
 * Normaliza para busca: minúsculas e sem acento. Diferente do parser do TO-DO, aqui NÃO é
 * preciso preservar o comprimento (não há índice de token para casar), então `NFD` resolve.
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Texto pesquisável de um alimento: nome, nome alternativo, marca, código e categoria. */
function searchableText(food: FoodListItem): string {
  return normalizeText(
    [
      food.name,
      food.alternativeName ?? "",
      food.brand ?? "",
      food.barcode ?? "",
      food.categoryName ?? "",
      food.sourceFoodCode ?? "",
    ].join(" "),
  );
}

/**
 * Busca por termos: todos os pedaços precisam aparecer, em qualquer ordem.
 * "arroz cozido" acha "Arroz, integral, cozido"; "cozido arroz" também.
 */
export function matchesSearch(food: FoodListItem, search: string): boolean {
  const terms = normalizeText(search).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchableText(food);
  return terms.every((term) => haystack.includes(term));
}

const inRange = (value: number | null, min: number | null, max: number | null): boolean => {
  // Sem valor publicado: só aparece quando NÃO há filtro de faixa. Fingir 0 colocaria um
  // alimento "não analisado" na faixa "0 a 50 kcal", o que é falso.
  if (min === null && max === null) return true;
  if (value === null) return false;
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
};

export function matchesFilters(food: FoodListItem, filters: FoodFilterState): boolean {
  if (!filters.showArchived && food.isArchived) return false;
  if (filters.showArchived && !food.isArchived) return false;

  if (filters.origin === "sistema" && !food.isSystemFood) return false;
  if (filters.origin === "proprios" && food.isSystemFood) return false;

  if (filters.onlyFavorites && !food.isFavorite) return false;
  if (filters.categoryId && food.categoryId !== filters.categoryId) return false;
  if (filters.foodType && food.foodType !== filters.foodType) return false;
  if (filters.preparationState && food.preparationState !== filters.preparationState) return false;
  if (filters.sourceId && food.source?.id !== filters.sourceId) return false;
  if (filters.brand && normalizeText(food.brand ?? "") !== normalizeText(filters.brand)) return false;
  if (filters.tagId && !food.tagIds.includes(filters.tagId)) return false;

  if (filters.barcode === "com" && !food.barcode) return false;
  if (filters.barcode === "sem" && food.barcode) return false;

  if (!inRange(food.macros.energiaKcal, filters.minKcal, filters.maxKcal)) return false;
  if (!inRange(food.macros.proteina, filters.minProtein, filters.maxProtein)) return false;

  return matchesSearch(food, filters.search);
}

export function filterFoods(foods: FoodListItem[], filters: FoodFilterState): FoodListItem[] {
  return foods.filter((food) => matchesFilters(food, filters));
}

/** Comparação de nome estável e sensível a acento do jeito pt-BR. */
const byName = (a: FoodListItem, b: FoodListItem) =>
  a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });

/** Nulo vai sempre para o fim, em qualquer direção de ordenação. */
const byNumber = (a: number | null, b: number | null, desc: boolean) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return desc ? b - a : a - b;
};

export function sortFoods(foods: FoodListItem[], sort: string): FoodListItem[] {
  const list = [...foods];
  switch (sort) {
    case "calorias_desc":
      return list.sort(
        (a, b) => byNumber(a.macros.energiaKcal, b.macros.energiaKcal, true) || byName(a, b),
      );
    case "calorias_asc":
      return list.sort(
        (a, b) => byNumber(a.macros.energiaKcal, b.macros.energiaKcal, false) || byName(a, b),
      );
    case "proteina_desc":
      return list.sort((a, b) => byNumber(a.macros.proteina, b.macros.proteina, true) || byName(a, b));
    case "mais_usados":
      return list.sort((a, b) => b.useCount - a.useCount || byName(a, b));
    case "recentes":
      return list.sort((a, b) => {
        const aTime = a.lastUsedAt ? Date.parse(a.lastUsedAt) : Number.NEGATIVE_INFINITY;
        const bTime = b.lastUsedAt ? Date.parse(b.lastUsedAt) : Number.NEGATIVE_INFINITY;
        return bTime - aTime || byName(a, b);
      });
    default:
      return list.sort(byName);
  }
}

/**
 * Aplica filtro + ordenação. Favoritos sobem dentro da ordenação por nome — é o que torna o
 * registro rápido no dia a dia, sem esconder o resto do catálogo.
 */
export function applyFoodFilters(
  foods: FoodListItem[],
  filters: FoodFilterState,
): FoodListItem[] {
  const filtered = filterFoods(foods, filters);
  const sorted = sortFoods(filtered, filters.sort);
  if (filters.sort !== "nome") return sorted;
  return [...sorted].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
}

/** Quantos filtros estão ativos (para o botão "Limpar filtros" mostrar o número). */
export function countActiveFilters(filters: FoodFilterState): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.categoryId) count += 1;
  if (filters.foodType) count += 1;
  if (filters.preparationState) count += 1;
  if (filters.sourceId) count += 1;
  if (filters.brand) count += 1;
  if (filters.tagId) count += 1;
  if (filters.origin !== "todos") count += 1;
  if (filters.onlyFavorites) count += 1;
  if (filters.showArchived) count += 1;
  if (filters.barcode !== "todos") count += 1;
  if (filters.minKcal !== null || filters.maxKcal !== null) count += 1;
  if (filters.minProtein !== null || filters.maxProtein !== null) count += 1;
  return count;
}

export const hasActiveFilters = (filters: FoodFilterState): boolean =>
  countActiveFilters(filters) > 0;

/* ───────────────────────────── URL ↔ filtros ─────────────────────────────
 * O estado de filtro vive na URL (padrão do projeto), então voltar/compartilhar/recarregar
 * preserva a visão. Estas duas funções são inversas e são testadas como tal.
 */

const numberOrNull = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export function filtersFromParams(params: Record<string, string | undefined>): FoodFilterState {
  const origin = params.origem;
  const barcode = params.codigo;
  return {
    ...EMPTY_FOOD_FILTERS,
    search: params.q ?? "",
    categoryId: params.categoria || null,
    foodType: (params.tipo as FoodFilterState["foodType"]) || null,
    preparationState: (params.preparo as FoodFilterState["preparationState"]) || null,
    sourceId: params.fonte || null,
    brand: params.marca || null,
    tagId: params.etiqueta || null,
    origin: origin === "sistema" || origin === "proprios" ? origin : "todos",
    onlyFavorites: params.favoritos === "1",
    showArchived: params.arquivados === "1",
    barcode: barcode === "com" || barcode === "sem" ? barcode : "todos",
    minKcal: numberOrNull(params.kcal_min),
    maxKcal: numberOrNull(params.kcal_max),
    minProtein: numberOrNull(params.prot_min),
    maxProtein: numberOrNull(params.prot_max),
    sort: params.ordem ?? "nome",
  };
}

/** Só emite o que difere do padrão — a URL fica curta e legível. */
export function paramsFromFilters(filters: FoodFilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.search.trim()) params.q = filters.search.trim();
  if (filters.categoryId) params.categoria = filters.categoryId;
  if (filters.foodType) params.tipo = filters.foodType;
  if (filters.preparationState) params.preparo = filters.preparationState;
  if (filters.sourceId) params.fonte = filters.sourceId;
  if (filters.brand) params.marca = filters.brand;
  if (filters.tagId) params.etiqueta = filters.tagId;
  if (filters.origin !== "todos") params.origem = filters.origin;
  if (filters.onlyFavorites) params.favoritos = "1";
  if (filters.showArchived) params.arquivados = "1";
  if (filters.barcode !== "todos") params.codigo = filters.barcode;
  if (filters.minKcal !== null) params.kcal_min = String(filters.minKcal);
  if (filters.maxKcal !== null) params.kcal_max = String(filters.maxKcal);
  if (filters.minProtein !== null) params.prot_min = String(filters.minProtein);
  if (filters.maxProtein !== null) params.prot_max = String(filters.maxProtein);
  if (filters.sort !== "nome") params.ordem = filters.sort;
  return params;
}

/** Marcas distintas presentes no catálogo, para alimentar o seletor de filtro. */
export function distinctBrands(foods: FoodListItem[]): string[] {
  const brands = new Set<string>();
  for (const food of foods) if (food.brand?.trim()) brands.add(food.brand.trim());
  return [...brands].sort((a, b) => a.localeCompare(b, "pt-BR"));
}
