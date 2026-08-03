/**
 * Fase 16-A — Dieta e Alimentação · Tipos de domínio.
 *
 * O shape que a camada de leitura entrega e que a UI e o núcleo de cálculo consomem. Não
 * espelha o banco linha a linha: já vem com o que é derivado (favorito, arquivado, categoria
 * efetiva) resolvido.
 */
import type {
  ActivityLevel,
  BaseUnit,
  ChangeKind,
  DataQuality,
  DayKind,
  FoodType,
  GoalDirection,
  GoalType,
  MealStatus,
  MeasureUnitType,
  NutrientGroup,
  NutrientMethod,
  NutrientUnit,
  NutrientValueState,
  PreparationState,
  ProfileSex,
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

/* ═════════════════════ Fase 16-B — Metas, diário e planejamento ═════════════════════ */

/* ───────────────────────────── Perfil e metas ───────────────────────────── */

/** Perfil informado pelo usuário. Nada aqui é obrigatório e nada é prescrição. */
export type NutritionProfile = {
  id: string;
  birthDate: string | null;
  sex: ProfileSex;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: ActivityLevel;
  goalDirection: GoalDirection;
  restrictions: string[];
  notes: string | null;
};

/**
 * Um valor de meta já resolvido para um escopo concreto (dia + tipo de dia + refeição).
 * `amount` nulo significa "não há alvo definido" — nunca zero: um alvo de 0 g de açúcar e
 * a ausência de meta de açúcar são coisas diferentes.
 */
export type GoalTarget = {
  code: string;
  amount: number | null;
  min: number | null;
  max: number | null;
  /** De onde o valor veio: digitado direto ou calculado como % da meta do dia. */
  origin: "absoluto" | "percentual";
  /** Percentual usado, quando `origin` é "percentual". Serve para a UI explicar o número. */
  percentOfDay: number | null;
};

export type GoalItemRow = {
  id: string;
  periodId: string;
  nutrientCode: string;
  weekday: number | null;
  dayKind: DayKind | null;
  mealTypeId: string | null;
  targetAmount: number | null;
  targetPercent: number | null;
  minAmount: number | null;
  maxAmount: number | null;
  notes: string | null;
  createdAt: string;
};

export type GoalPeriod = {
  id: string;
  name: string | null;
  reason: string | null;
  startsOn: string;
  endsOn: string | null;
  goalType: GoalType;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  items: GoalItemRow[];
};

/* ───────────────────────────── Refeições ───────────────────────────── */

export type MealType = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  defaultTime: string | null;
  position: number;
  isActive: boolean;
};

/* ───────────────────────────── Diário ─────────────────────────────
 * O snapshot é o coração da subfase: o que está aqui foi congelado no momento do registro e
 * NÃO é recalculado a partir do catálogo. Editar o alimento depois não muda nada disto.
 */

/** Um nutriente dentro do `nutrients_snapshot`. */
export type SnapshotNutrient = {
  amount: number | null;
  state: NutrientValueState;
  method: NutrientMethod;
};

export type NutrientSnapshotBag = Record<string, SnapshotNutrient>;

/** O snapshot completo gravado ao registrar consumo. */
export type DiaryEntrySnapshot = {
  foodNameSnapshot: string;
  preparationStateSnapshot: PreparationState | null;
  brandSnapshot: string | null;
  quantity: number;
  measureLabel: string | null;
  /** Quantidade na unidade-base do alimento (ver `baseUnit`). */
  gramsEquivalent: number;
  baseQuantity: number;
  baseUnit: BaseUnit;
  sourceIdSnapshot: string | null;
  sourceNameSnapshot: string | null;
  sourceVersionSnapshot: string | null;
  sourceFoodCodeSnapshot: string | null;
  nutrientsSnapshot: NutrientSnapshotBag;
  /** Derivadas do snapshot na gravação. `null` = não disponível, nunca zero. */
  energyKcal: number | null;
  proteinG: number | null;
  carbG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

/** Item do diário como a leitura entrega. */
export type DiaryEntry = DiaryEntrySnapshot & {
  id: string;
  diaryMealId: string;
  /** Referência informativa. Nulo quando o alimento foi excluído do catálogo. */
  foodId: string | null;
  entryKind: "alimento" | "livre";
  plannedItemId: string | null;
  changeKind: ChangeKind;
  changedAt: string | null;
  notes: string | null;
  position: number;
};

export type DiaryMeal = {
  id: string;
  diaryDate: string;
  mealTypeId: string;
  mealTypeName: string;
  mealTypeIcon: string | null;
  plannedMealId: string | null;
  plannedTime: string | null;
  consumedTime: string | null;
  /** Status GRAVADO. O que a tela exibe é o derivado — ver `effectiveMealStatus`. */
  status: MealStatus;
  title: string | null;
  notes: string | null;
  position: number;
  entries: DiaryEntry[];
};

/* ───────────────────────────── Planejamento ───────────────────────────── */

export type PlannedMealItem = {
  id: string;
  plannedMealId: string;
  foodId: string | null;
  customLabel: string | null;
  quantity: number | null;
  measureId: string | null;
  measureLabel: string | null;
  isOptional: boolean;
  notes: string | null;
  position: number;
};

export type PlannedMeal = {
  id: string;
  planId: string | null;
  planDayId: string | null;
  /** Nulo = linha de modelo (sem data). */
  plannedDate: string | null;
  mealTypeId: string;
  mealTypeName: string;
  mealTypeIcon: string | null;
  plannedTime: string | null;
  title: string | null;
  notes: string | null;
  position: number;
  items: PlannedMealItem[];
};

export type PlanDay = {
  id: string;
  planId: string;
  weekIndex: number;
  weekday: number;
  label: string | null;
  dayKind: DayKind | null;
  notes: string | null;
  meals: PlannedMeal[];
};

export type NutritionPlan = {
  id: string;
  name: string;
  description: string | null;
  cycleWeeks: number;
  weekStartDay: number;
  anchorDate: string | null;
  isActive: boolean;
  isDefault: boolean;
  days: PlanDay[];
};
