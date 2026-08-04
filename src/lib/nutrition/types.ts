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
  DiaryEntryKind,
  FoodType,
  GoalDirection,
  GoalType,
  MealStatus,
  MeasureUnitType,
  NutrientGroup,
  NutrientMethod,
  NutrientTotalQuality,
  NutrientUnit,
  NutrientValueState,
  PortionUnit,
  PreparationState,
  ProfileSex,
  ShoppingItemStatus,
  ShoppingListStatus,
  ShoppingPriority,
  ShoppingRecurrence,
  ShoppingSourceKind,
  SubstitutionLevel,
  SubstitutionOptionKind,
  TemplateItemKind,
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
  /**
   * Só em valor JÁ AGREGADO (16-C): o total de uma receita é a soma dos ingredientes e carrega
   * a qualidade dessa soma. `calc.ts` propaga o campo para o total do dia não parecer exato
   * quando um ingrediente não tinha o nutriente analisado.
   */
  quality?: NutrientTotalQuality;
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
  /**
   * Presente quando a linha do diário é uma RECEITA ou uma REFEIÇÃO-MODELO (16-C): o valor é
   * a soma de vários itens e pode ser um piso. Congelar a qualidade junto do número é o que
   * impede o total do dia de parecer exato quando não é.
   */
  quality?: NutrientTotalQuality;
};

export type NutrientSnapshotBag = Record<string, SnapshotNutrient>;

/** O snapshot completo gravado ao registrar consumo. */
export type DiaryEntrySnapshot = {
  foodNameSnapshot: string;
  preparationStateSnapshot: PreparationState | null;
  brandSnapshot: string | null;
  quantity: number;
  measureLabel: string | null;
  /**
   * Quantidade na unidade-base do alimento (ver `baseUnit`).
   *
   * NULO só acontece com RECEITA registrada em porções sem peso final informado (16-C): não há
   * como converter porção em gramas sem estimar, e estimar é proibido. Nulo aqui significa
   * "não sei o peso" — nunca "pesa zero".
   */
  gramsEquivalent: number | null;
  baseQuantity: number | null;
  baseUnit: BaseUnit | null;
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
  /** Procedência (16-C). Nulos quando a receita/modelo foi excluída — o snapshot permanece. */
  recipeId: string | null;
  mealTemplateId: string | null;
  /** Discriminador ESTÁVEL da linha; não depende de nenhuma FK, que pode virar nula. */
  entryKind: DiaryEntryKind;
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
  /** Discriminador ESTÁVEL (16-C): `foodId`/`recipeId` viram nulos ao excluir a origem. */
  itemKind: TemplateItemKind;
  foodId: string | null;
  recipeId: string | null;
  /** Refeição-modelo que originou o item, quando veio de uma. Procedência, não vínculo vivo. */
  mealTemplateId: string | null;
  customLabel: string | null;
  quantity: number | null;
  measureId: string | null;
  measureLabel: string | null;
  /** Só para item de receita: a quantidade está em porções ou em gramas do preparo pronto. */
  portionUnit: PortionUnit | null;
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

/* ═════════════ Fase 16-C — Receitas, refeições-modelo e substituições ═════════════ */

export type RecipeCategory = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: number;
};

/** Ingrediente de uma receita. Sem snapshot: a receita é um MODELO mutável. */
export type RecipeIngredient = {
  id: string;
  recipeId: string;
  foodId: string | null;
  customLabel: string | null;
  quantity: number | null;
  measureId: string | null;
  measureLabel: string | null;
  /** Conversão para a unidade-base, resolvida ao salvar. Nula = conversão impossível. */
  gramsEquivalent: number | null;
  isOptional: boolean;
  note: string | null;
  position: number;
};

export type Recipe = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  instructions: string | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  /** Rendimento em porções. Alterar recalcula o POR PORÇÃO sem mexer no total. */
  servings: number;
  servingLabel: string | null;
  yieldNote: string | null;
  /**
   * Peso final preparado, INFORMADO. Nulo = sem "por 100 g" e sem registro em gramas.
   * Nunca estimado a partir dos ingredientes (regra 1 da subfase).
   */
  totalWeightG: number | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  isFavorite: boolean;
  isArchived: boolean;
  originRecipeId: string | null;
  isCopy: boolean;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ingredients: RecipeIngredient[];
  /**
   * Foto da receita (bucket PRIVADO `attachments`), quando houver.
   *
   * ⚠️ 16-F: `storagePath` NÃO sai mais do servidor — o cliente recebe apenas uma **URL
   * assinada de curta duração**, gerada a cada leitura, exatamente como as fotos de evolução
   * (invariante 21, 16-E). `url` é `null` quando a assinatura falha: a tela mostra um aviso,
   * não uma imagem quebrada.
   */
  photo: { id: string; fileName: string; url: string | null } | null;
};

export type MealTemplateItem = {
  id: string;
  templateId: string;
  itemKind: TemplateItemKind;
  foodId: string | null;
  recipeId: string | null;
  customLabel: string | null;
  quantity: number | null;
  measureId: string | null;
  measureLabel: string | null;
  portionUnit: PortionUnit | null;
  isOptional: boolean;
  notes: string | null;
  position: number;
};

export type MealTemplate = {
  id: string;
  name: string;
  description: string | null;
  mealTypeId: string | null;
  mealTypeName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  suggestedTime: string | null;
  tags: string[];
  notes: string | null;
  isFavorite: boolean;
  isArchived: boolean;
  originTemplateId: string | null;
  isCopy: boolean;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: MealTemplateItem[];
};

/* ───────────────────────────── Substituições ───────────────────────────── */

/** Tolerâncias por macro, em %. Nulo = "não defini", nunca "tolerância zero". */
export type SubstitutionTolerances = {
  energy: number | null;
  protein: number | null;
  carb: number | null;
  fat: number | null;
  fiber: number | null;
};

export type SubstitutionOption = {
  id: string;
  groupId: string;
  optionKind: SubstitutionOptionKind;
  foodId: string | null;
  recipeId: string | null;
  mealTemplateId: string | null;
  customLabel: string | null;
  quantity: number | null;
  measureId: string | null;
  measureLabel: string | null;
  portionUnit: PortionUnit | null;
  /** Preferência DO USUÁRIO (menor = preferida). Não é ranking nutricional calculado. */
  priority: number;
  notes: string | null;
  isActive: boolean;
  position: number;
  /** Rótulo já resolvido para exibição. */
  label: string;
};

export type SubstitutionGroup = {
  id: string;
  name: string;
  groupKind: SubstitutionLevel;
  description: string | null;
  foodId: string | null;
  recipeId: string | null;
  mealTemplateId: string | null;
  customLabel: string | null;
  baseQuantity: number | null;
  baseMeasureId: string | null;
  baseMeasureLabel: string | null;
  basePortionUnit: PortionUnit | null;
  tolerances: SubstitutionTolerances;
  restrictions: string[];
  notes: string | null;
  isActive: boolean;
  position: number;
  /** Rótulo do item original, já resolvido para exibição. */
  originalLabel: string;
  options: SubstitutionOption[];
};

/* ═════════════════ Fase 16-D — Lista de compras e despensa ═════════════════ */

/** Corredor de mercado. Dado do usuário, semeado na primeira leitura. */
export type MarketCategory = {
  id: string;
  slug: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  position: number;
};

/**
 * De onde veio uma parcela de um item da lista (regra 2 — rastreabilidade da origem).
 *
 * É SNAPSHOT: a refeição planejada pode ser editada ou apagada depois, e a lista que foi ao
 * mercado precisa continuar explicando de onde saiu cada número.
 */
export type ShoppingOrigin = {
  kind: "planejamento" | "receita" | "manual";
  /** "Almoço · 05/08" ou o nome da receita. Congelado. */
  label: string;
  /** Data pura do dia planejado, quando houver. */
  date: string | null;
  recipeId: string | null;
  plannedMealId: string | null;
  /** O que ESTA origem pediu, na unidade em que pediu. */
  quantity: number | null;
  unit: string;
};

export type ShoppingListItem = {
  id: string;
  listId: string;
  categoryId: string | null;
  categoryName: string | null;
  /** Referências informativas: `on delete set null`. O que sustenta a linha é `label`. */
  foodId: string | null;
  recipeId: string | null;
  label: string;
  brand: string | null;
  /** NULA = "a gosto"/sem quantidade definida. NUNCA zero. */
  quantity: number | null;
  unit: string;
  consolidationKey: string | null;
  /** Ajuste manual: regerar a lista não sobrescreve a quantidade deste item. */
  quantityOverridden: boolean;
  origins: ShoppingOrigin[];
  /** Por que a linha ficou separada de outra do mesmo item (unidades incompatíveis). */
  separateReason: string | null;
  isManual: boolean;
  status: ShoppingItemStatus;
  priority: ShoppingPriority;
  /** Centavos, como todo o financeiro. Nulo = não informado, nunca "custou zero". */
  estimatedPriceCents: number | null;
  actualPriceCents: number | null;
  store: string | null;
  note: string | null;
  position: number;
  purchasedAt: string | null;
};

export type ShoppingList = {
  id: string;
  name: string;
  notes: string | null;
  status: ShoppingListStatus;
  sourceKind: ShoppingSourceKind;
  sourceFrom: string | null;
  sourceTo: string | null;
  store: string | null;
  recurrence: ShoppingRecurrence;
  recurrenceKey: string | null;
  /** Quando o desconto da despensa foi aplicado. Nulo = nunca (é opt-in). */
  pantryAppliedAt: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  items: ShoppingListItem[];
};

/**
 * Item da despensa. Seis campos e ponto final — não é ERP de estoque.
 *
 * `quantity` nula = "tenho, mas não sei quanto" (não desconta); zero = "acabou", fato medido.
 */
export type PantryItem = {
  id: string;
  foodId: string | null;
  label: string;
  quantity: number | null;
  unit: string;
  expiresOn: string | null;
  minQuantity: number | null;
  note: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

/** Uma troca confirmada. Rótulos e diferença são CONGELADOS na gravação. */
export type SubstitutionLog = {
  id: string;
  groupId: string | null;
  optionId: string | null;
  level: SubstitutionLevel;
  appliedOn: string;
  diaryMealId: string | null;
  diaryEntryId: string | null;
  originalLabel: string;
  originalQuantity: number | null;
  originalMeasureLabel: string | null;
  replacementLabel: string;
  replacementQuantity: number | null;
  replacementMeasureLabel: string | null;
  deltaEnergyKcal: number | null;
  deltaProteinG: number | null;
  deltaCarbG: number | null;
  deltaFatG: number | null;
  deltaFiberG: number | null;
  reason: string | null;
  createdAt: string;
};
