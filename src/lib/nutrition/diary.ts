/**
 * Fase 16-B — Dieta e Alimentação · Diário alimentar (PURO, sem I/O).
 *
 * Três responsabilidades, todas derivações — nada aqui é gravado:
 *
 * 1. TOTAIS a partir do SNAPSHOT. O total do dia soma `nutrients_snapshot`, congelado no
 *    momento do registro, e NUNCA consulta o catálogo. É isso que faz "editar um alimento não
 *    altera o passado" ser verdade estrutural, e não uma promessa. Repare que não existe
 *    nenhuma função aqui que receba um alimento do catálogo para somar consumo.
 *
 * 2. STATUS DERIVADO. "Pendente" e o atraso saem de `planned_time` + hora atual, como
 *    'atrasada' no TO-DO (Fase 15) e o status da fatura (Fase 03). O banco nem aceita
 *    'pendente' no CHECK.
 *
 * 3. PLANEJADO × CONSUMIDO. O planejamento fica intacto; a diferença é calculada na leitura
 *    cruzando `planned_item_id`.
 *
 * `agora` é sempre INJETADO — nenhuma função chama `Date.now()`.
 */
import {
  mergeTotals,
  scaleNutrients,
  sumNutrients,
  type NutrientBag,
  type NutrientTotal,
  type NutrientTotalQuality,
} from "./calc";
import { diffDaysIso, timeToMinutes } from "./calendar";
import {
  MEAL_LATE_TOLERANCE_MINUTES,
  type BaseUnit,
  type ChangeKind,
  type EffectiveMealStatus,
  type MealStatus,
} from "./constants";
import { snapshotToBag } from "./snapshot";
import { convertToBase, type ConvertibleMeasure } from "./units";
import type {
  DiaryEntry,
  DiaryMeal,
  FoodNutrientValue,
  PlannedMeal,
  PlannedMealItem,
} from "./types";

/* ───────────────────────────── Totais do consumo ───────────────────────────── */

/**
 * Um item consumido contribui para o total?
 *
 * 'removido' registra a DECISÃO de não comer um item que estava planejado — é informação
 * valiosa para o comparativo, mas somá-la contaria como consumido algo que não foi.
 */
export const entryCounts = (entry: { changeKind: ChangeKind }): boolean =>
  entry.changeKind !== "removido";

/** Nutrientes de um item consumido, lidos do SNAPSHOT. Nunca do catálogo. */
export function entryBag(entry: Pick<DiaryEntry, "nutrientsSnapshot">): NutrientBag {
  return snapshotToBag(entry.nutrientsSnapshot);
}

/** Total de uma refeição: soma dos snapshots dos itens que contam. */
export function mealTotals(entries: DiaryEntry[]): Record<string, NutrientTotal> {
  return sumNutrients(entries.filter(entryCounts).map(entryBag));
}

/** Total do dia: soma dos itens de todas as refeições, com a qualidade propagada. */
export function dayTotals(meals: { entries: DiaryEntry[] }[]): Record<string, NutrientTotal> {
  const bags: NutrientBag[] = [];
  for (const meal of meals) {
    for (const entry of meal.entries) {
      if (entryCounts(entry)) bags.push(entryBag(entry));
    }
  }
  return sumNutrients(bags);
}

/**
 * Total de um intervalo (semana, mês) a partir dos totais de cada dia.
 * Usa `mergeTotals` para a qualidade continuar propagando: um dia parcial torna a semana
 * parcial — o número da semana não pode parecer mais preciso que os dias que o formam.
 */
export function rangeTotals(
  days: Record<string, NutrientTotal>[],
): Record<string, NutrientTotal> {
  return mergeTotals(days);
}

/** Média diária de um intervalo. Divide pelos dias PEDIDOS, não pelos que tiveram registro. */
export function dailyAverage(
  totals: Record<string, NutrientTotal>,
  days: number,
): Record<string, NutrientTotal> {
  if (days <= 0) return {};
  const result: Record<string, NutrientTotal> = {};
  for (const [code, total] of Object.entries(totals)) {
    result[code] = { ...total, amount: total.amount / days };
  }
  return result;
}

/* ───────────────────────────── Status derivado ───────────────────────────── */

export type NowContext = {
  /** Data pura de hoje ('yyyy-MM-dd'), no fuso de Brasília. */
  hoje: string;
  /** Minutos desde a meia-noite, em Brasília. */
  minutosAgora: number;
};

export type MealState = {
  status: EffectiveMealStatus;
  /** Passou do horário previsto (com tolerância) ou é de um dia anterior sem registro. */
  isLate: boolean;
  /** Minutos de atraso. Só existe quando é hoje e há horário previsto. */
  minutesLate: number | null;
  /** Dias de atraso, quando a refeição ficou num dia passado sem desfecho. */
  daysLate: number | null;
};

/**
 * Status como a tela deve exibir.
 *
 * Só refeição ainda 'planejada' pode virar 'pendente': um desfecho já declarado
 * (consumida, não consumida, substituída…) é fato e não muda com a passagem do tempo.
 *
 * Sem horário previsto, um dia que ainda está correndo NÃO vira pendente — não há como saber
 * se atrasou, e marcar atraso por suposição seria cobrar o usuário por algo inventado.
 */
export function effectiveMealStatus(
  meal: { status: MealStatus; diaryDate: string; plannedTime: string | null },
  now: NowContext,
): MealState {
  if (meal.status !== "planejada") {
    return { status: meal.status, isLate: false, minutesLate: null, daysLate: null };
  }

  const dayDiff = diffDaysIso(now.hoje, meal.diaryDate);

  // Dia futuro: continua só planejada.
  if (dayDiff > 0) {
    return { status: "planejada", isLate: false, minutesLate: null, daysLate: null };
  }

  // Dia passado sem desfecho: pendente e atrasada, medida em dias.
  if (dayDiff < 0) {
    return { status: "pendente", isLate: true, minutesLate: null, daysLate: -dayDiff };
  }

  const plannedMinutes = timeToMinutes(meal.plannedTime);
  if (plannedMinutes === null) {
    return { status: "planejada", isLate: false, minutesLate: null, daysLate: null };
  }
  if (now.minutosAgora < plannedMinutes) {
    return { status: "planejada", isLate: false, minutesLate: null, daysLate: null };
  }

  const minutesLate = now.minutosAgora - plannedMinutes;
  return {
    status: "pendente",
    isLate: minutesLate > MEAL_LATE_TOLERANCE_MINUTES,
    minutesLate,
    daysLate: null,
  };
}

/** Contadores do dia para os cards da visão geral. */
export type DaySummary = {
  total: number;
  consumidas: number;
  pendentes: number;
  atrasadas: number;
  naoConsumidas: number;
  foraDoPlano: number;
  itens: number;
};

export function summarizeDay(
  meals: { status: MealStatus; diaryDate: string; plannedTime: string | null; entries: DiaryEntry[] }[],
  now: NowContext,
): DaySummary {
  const summary: DaySummary = {
    total: meals.length,
    consumidas: 0,
    pendentes: 0,
    atrasadas: 0,
    naoConsumidas: 0,
    foraDoPlano: 0,
    itens: 0,
  };

  for (const meal of meals) {
    const state = effectiveMealStatus(meal, now);
    summary.itens += meal.entries.filter(entryCounts).length;

    switch (state.status) {
      case "consumida":
      case "parcialmente_consumida":
      case "substituida":
        summary.consumidas += 1;
        break;
      case "nao_consumida":
        summary.naoConsumidas += 1;
        break;
      case "fora_do_planejamento":
        summary.consumidas += 1;
        summary.foraDoPlano += 1;
        break;
      case "pendente":
        summary.pendentes += 1;
        if (state.isLate) summary.atrasadas += 1;
        break;
      default:
        break;
    }
  }
  return summary;
}

/**
 * As próximas refeições ainda sem desfecho, em ordem de horário.
 * Refeição sem horário vai para o fim: ela não compete por "próxima".
 */
export function upcomingMeals<
  T extends { status: MealStatus; diaryDate: string; plannedTime: string | null },
>(meals: T[], now: NowContext, limit = 3): T[] {
  return meals
    .filter((meal) => {
      const state = effectiveMealStatus(meal, now);
      return state.status === "planejada" || state.status === "pendente";
    })
    .sort((a, b) => {
      if (a.diaryDate !== b.diaryDate) return a.diaryDate < b.diaryDate ? -1 : 1;
      const at = timeToMinutes(a.plannedTime);
      const bt = timeToMinutes(b.plannedTime);
      if (at === null && bt === null) return 0;
      if (at === null) return 1;
      if (bt === null) return -1;
      return at - bt;
    })
    .slice(0, limit);
}

/* ───────────────────────────── Planejado × consumido ───────────────────────────── */

/** Dados do catálogo necessários para calcular o valor de um item PLANEJADO. */
export type PlannedFoodData = {
  baseQuantity: number;
  baseUnit: BaseUnit;
  nutrients: FoodNutrientValue[];
};

/**
 * Nutrientes de um item planejado.
 *
 * Aqui o catálogo ATUAL é a fonte certa — ao contrário do consumo. O plano é uma intenção
 * sobre o futuro, então deve refletir o alimento como ele está hoje.
 *
 * Devolve conjunto VAZIO quando não dá para calcular (item livre como "salada à vontade",
 * alimento excluído, conversão impossível). Um conjunto vazio não é zero: `sumNutrient` o
 * conta como ausente e marca o total como PARCIAL — que é a verdade.
 */
export function plannedItemBag(
  item: Pick<PlannedMealItem, "quantity" | "foodId">,
  food: PlannedFoodData | null,
  measure: ConvertibleMeasure | null,
): NutrientBag {
  if (!food || item.quantity === null) return {};
  const conversion = convertToBase(item.quantity, measure, {
    baseQuantity: food.baseQuantity,
    baseUnit: food.baseUnit,
  });
  if (!conversion.ok) return {};
  return scaleNutrients(food.nutrients, conversion.factor);
}

/** Como cada item planejado terminou. `nao_registrado` = nem consumo nem remoção explícita. */
export type ComparisonKind = ChangeKind | "nao_registrado";

export type PlanComparisonRow = {
  plannedItemId: string | null;
  entryId: string | null;
  kind: ComparisonKind;
  plannedLabel: string | null;
  plannedQuantity: number | null;
  plannedMeasureLabel: string | null;
  consumedLabel: string | null;
  consumedQuantity: number | null;
  consumedMeasureLabel: string | null;
  isOptional: boolean;
};

export type NutrientDiff = {
  code: string;
  planned: number;
  consumed: number;
  /** consumido − planejado. Positivo = comeu mais que o previsto. */
  diff: number;
  /** Pior qualidade entre os dois lados: comparar total parcial não produz certeza. */
  quality: NutrientTotalQuality;
};

export type PlanComparison = {
  rows: PlanComparisonRow[];
  planned: Record<string, NutrientTotal>;
  consumed: Record<string, NutrientTotal>;
  diff: Record<string, NutrientDiff>;
};

const worstQuality = (a: NutrientTotalQuality, b: NutrientTotalQuality): NutrientTotalQuality => {
  if (a === "parcial" || b === "parcial") return "parcial";
  if (a === "aproximado" || b === "aproximado") return "aproximado";
  return "exato";
};

/** Rótulo do item planejado: o apelido livre vence, senão o nome do alimento. */
function plannedLabelOf(
  item: PlannedMealItem,
  foodName: string | null,
): string | null {
  return item.customLabel?.trim() || foodName || null;
}

/**
 * Cruza o que estava planejado com o que foi consumido.
 *
 * O planejamento entra somente para leitura: nenhuma linha de `nutrition_planned_meal_items`
 * é alterada por esta função nem pelo registro de consumo. Toda a história ("comi menos",
 * "troquei", "pulei", "comi algo a mais") é derivada do cruzamento.
 */
export function comparePlannedVsConsumed(
  plannedItems: PlannedMealItem[],
  entries: DiaryEntry[],
  context: {
    /** Nome do alimento planejado, por `foodId`. */
    foodNames: Map<string, string>;
    /** Nutrientes do alimento planejado, por `foodId`. */
    foodData: Map<string, PlannedFoodData>;
    /** Medida do item planejado, por `measureId`. */
    measures: Map<string, ConvertibleMeasure>;
  },
): PlanComparison {
  const entryByPlannedItem = new Map<string, DiaryEntry>();
  for (const entry of entries) {
    if (entry.plannedItemId) entryByPlannedItem.set(entry.plannedItemId, entry);
  }

  const rows: PlanComparisonRow[] = [];
  const plannedBags: NutrientBag[] = [];

  for (const item of plannedItems) {
    const foodName = item.foodId ? (context.foodNames.get(item.foodId) ?? null) : null;
    const food = item.foodId ? (context.foodData.get(item.foodId) ?? null) : null;
    const measure = item.measureId ? (context.measures.get(item.measureId) ?? null) : null;

    plannedBags.push(plannedItemBag(item, food, measure));

    const entry = entryByPlannedItem.get(item.id);
    rows.push({
      plannedItemId: item.id,
      entryId: entry?.id ?? null,
      kind: entry ? entry.changeKind : "nao_registrado",
      plannedLabel: plannedLabelOf(item, foodName),
      plannedQuantity: item.quantity,
      plannedMeasureLabel: item.measureLabel ?? measure?.label ?? null,
      consumedLabel: entry?.foodNameSnapshot ?? null,
      consumedQuantity: entry?.quantity ?? null,
      consumedMeasureLabel: entry?.measureLabel ?? null,
      isOptional: item.isOptional,
    });
  }

  // Itens consumidos que não vieram do plano.
  for (const entry of entries) {
    if (entry.plannedItemId) continue;
    rows.push({
      plannedItemId: null,
      entryId: entry.id,
      kind: "extra",
      plannedLabel: null,
      plannedQuantity: null,
      plannedMeasureLabel: null,
      consumedLabel: entry.foodNameSnapshot,
      consumedQuantity: entry.quantity,
      consumedMeasureLabel: entry.measureLabel,
      isOptional: false,
    });
  }

  const planned = sumNutrients(plannedBags);
  const consumed = mealTotals(entries);

  const diff: Record<string, NutrientDiff> = {};
  for (const code of new Set([...Object.keys(planned), ...Object.keys(consumed)])) {
    const p = planned[code];
    const c = consumed[code];
    diff[code] = {
      code,
      planned: p?.amount ?? 0,
      consumed: c?.amount ?? 0,
      diff: (c?.amount ?? 0) - (p?.amount ?? 0),
      quality: worstQuality(p?.quality ?? "parcial", c?.quality ?? "parcial"),
    };
  }

  return { rows, planned, consumed, diff };
}

/**
 * A refeição foi seguida conforme o planejado?
 * Itens opcionais não registrados não contam contra — foi para isso que foram marcados.
 */
export function followedPlan(rows: PlanComparisonRow[]): boolean {
  return rows.every((row) => {
    if (row.kind === "igual") return true;
    if (row.kind === "nao_registrado" && row.isOptional) return true;
    return false;
  });
}

/* ───────────────────────────── Sugestão de status ─────────────────────────────
 * SUGESTÃO, não automatismo: a action usa isto para preencher o status ao confirmar uma
 * refeição de uma vez, e o usuário pode trocar depois. Nada aqui grava nada.
 */
export function suggestMealStatus(rows: PlanComparisonRow[]): MealStatus {
  if (rows.length === 0) return "planejada";

  const fromPlan = rows.filter((row) => row.plannedItemId !== null);
  if (fromPlan.length === 0) return "fora_do_planejamento";

  const registered = fromPlan.filter(
    (row) => row.kind !== "nao_registrado" && row.kind !== "removido",
  );
  if (registered.length === 0) return "nao_consumida";

  if (fromPlan.some((row) => row.kind === "substituido")) return "substituida";

  const pendingRequired = fromPlan.filter(
    (row) => (row.kind === "nao_registrado" || row.kind === "removido") && !row.isOptional,
  );
  if (pendingRequired.length > 0) return "parcialmente_consumida";

  return "consumida";
}

/* ───────────────────────────── Agrupamento ───────────────────────────── */

/** Refeições agrupadas por dia, para as visões de semana e mês. */
export function groupMealsByDate<T extends { diaryDate: string }>(
  meals: T[],
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const meal of meals) {
    const list = grouped.get(meal.diaryDate);
    if (list) list.push(meal);
    else grouped.set(meal.diaryDate, [meal]);
  }
  return grouped;
}

/** Refeições planejadas agrupadas por data (linhas de modelo, sem data, ficam de fora). */
export function groupPlannedByDate(meals: PlannedMeal[]): Map<string, PlannedMeal[]> {
  const grouped = new Map<string, PlannedMeal[]>();
  for (const meal of meals) {
    if (!meal.plannedDate) continue;
    const list = grouped.get(meal.plannedDate);
    if (list) list.push(meal);
    else grouped.set(meal.plannedDate, [meal]);
  }
  return grouped;
}

/** Ordena refeições do dia por horário; sem horário vai para o fim, preservando a posição. */
export function sortMealsByTime<T extends { plannedTime: string | null; position: number }>(
  meals: T[],
): T[] {
  return [...meals].sort((a, b) => {
    const at = timeToMinutes(a.plannedTime);
    const bt = timeToMinutes(b.plannedTime);
    if (at !== null && bt !== null && at !== bt) return at - bt;
    if (at === null && bt !== null) return 1;
    if (at !== null && bt === null) return -1;
    return a.position - b.position;
  });
}

/** Total de um dia do DIÁRIO, a partir das refeições já carregadas. */
export function totalsForMeals(meals: DiaryMeal[]): Record<string, NutrientTotal> {
  return dayTotals(meals);
}
