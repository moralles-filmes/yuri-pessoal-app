/**
 * Fase 16-A — Dieta e Alimentação · Tipos de domínio.
 *
 * O shape que a camada de leitura entrega e que a UI e o núcleo de cálculo consomem. Não
 * espelha o banco linha a linha: já vem com o que é derivado (favorito, arquivado, categoria
 * efetiva) resolvido.
 */
import type {
  BaseUnit,
  DataQuality,
  FoodType,
  MeasureUnitType,
  NutrientGroup,
  NutrientMethod,
  NutrientUnit,
  NutrientValueState,
  PreparationState,
} from "./constants";

/** Definição de um nutriente (catálogo global de referência). */
export type NutrientDefinition = {
  code: string;
  name: string;
  shortName: string | null;
  unit: NutrientUnit;
  group: NutrientGroup;
  position: number;
  isCore: boolean;
  /** Casas decimais NA APRESENTAÇÃO. O cálculo não arredonda. */
  precision: number;
};

/**
 * Valor de um nutriente para um alimento, na base declarada pelo alimento.
 *
 * `amount` é `null` sempre que `state !== 'disponivel'`. Nunca converta isso em 0 fora do
 * núcleo de cálculo — a diferença entre "zero medido" e "não medido" é o ponto do módulo.
 */
export type FoodNutrientValue = {
  code: string;
  amount: number | null;
  state: NutrientValueState;
  method: NutrientMethod;
  sourceNote: string | null;
};

/** Medida caseira com conversão real, específica de um alimento. */
export type FoodMeasure = {
  id: string;
  foodId: string;
  label: string;
  unitType: MeasureUnitType;
  grams: number | null;
  milliliters: number | null;
  isDefault: boolean;
  position: number;
  sourceNote: string | null;
  /** Falso para as medidas que vieram da base do sistema (não editáveis). */
  isOwn: boolean;
};

export type FoodSource = {
  id: string;
  code: string;
  name: string;
  publisher: string | null;
  edition: string | null;
  version: string | null;
  referenceUrl: string | null;
  licenseNote: string | null;
  citation: string | null;
  isOfficial: boolean;
  isOwn: boolean;
};

export type FoodCategory = {
  id: string;
  name: string;
  slug: string;
  position: number;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  isOwn: boolean;
};

export type FoodTag = {
  id: string;
  name: string;
  color: string | null;
  position: number;
};

/** Resumo dos macros que a view pivota — só para listar, ordenar e filtrar. */
export type FoodMacroSummary = {
  energiaKcal: number | null;
  proteina: number | null;
  carboidrato: number | null;
  lipidios: number | null;
  fibra: number | null;
  sodio: number | null;
  acucares: number | null;
  saturadas: number | null;
  /** Quantos nutrientes o alimento tem cadastrados (cobertura). */
  nutrientsAvailable: number;
};

/** Alimento como a lista do catálogo precisa dele. */
export type FoodListItem = {
  id: string;
  name: string;
  alternativeName: string | null;
  brand: string | null;
  barcode: string | null;
  foodType: FoodType;
  preparationState: PreparationState;
  baseQuantity: number;
  baseUnit: BaseUnit;
  ediblePortionPercent: number | null;
  dataQuality: DataQuality;
  isSystemFood: boolean;
  isVerified: boolean;
  lastVerifiedAt: string | null;
  notes: string | null;
  originFoodId: string | null;
  /** Categoria efetiva: o override do usuário vence a da fonte. */
  categoryId: string | null;
  categoryName: string | null;
  /** Categoria publicada pela fonte, quando houver override. */
  sourceCategoryName: string | null;
  source: FoodSource | null;
  sourceFoodCode: string | null;
  sourceVersion: string | null;
  macros: FoodMacroSummary;
  isFavorite: boolean;
  isArchived: boolean;
  useCount: number;
  lastUsedAt: string | null;
  tagIds: string[];
  /** O usuário pode editar? Falso para tudo que é da base do sistema. */
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Alimento completo, com todos os nutrientes e medidas (tela de detalhe). */
export type FoodDetail = FoodListItem & {
  nutrients: FoodNutrientValue[];
  measures: FoodMeasure[];
};

/** Contadores do catálogo exibidos na visão geral e nos filtros. */
export type NutritionCatalogSummary = {
  total: number;
  system: number;
  own: number;
  favorites: number;
  archived: number;
  withBarcode: number;
  categories: number;
  nutrientValues: number;
  sources: { name: string; edition: string | null; foods: number; citation: string | null }[];
};

/** Estado dos filtros do catálogo, espelhado na URL. */
export type FoodFilterState = {
  search: string;
  categoryId: string | null;
  foodType: FoodType | null;
  preparationState: PreparationState | null;
  sourceId: string | null;
  brand: string | null;
  tagId: string | null;
  origin: "todos" | "sistema" | "proprios";
  onlyFavorites: boolean;
  showArchived: boolean;
  barcode: "todos" | "com" | "sem";
  minKcal: number | null;
  maxKcal: number | null;
  minProtein: number | null;
  maxProtein: number | null;
  sort: string;
};

export const EMPTY_FOOD_FILTERS: FoodFilterState = {
  search: "",
  categoryId: null,
  foodType: null,
  preparationState: null,
  sourceId: null,
  brand: null,
  tagId: null,
  origin: "todos",
  onlyFavorites: false,
  showArchived: false,
  barcode: "todos",
  minKcal: null,
  maxKcal: null,
  minProtein: null,
  maxProtein: null,
  sort: "nome",
};
