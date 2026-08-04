/**
 * Fase 16-D — Dieta e Alimentação · Lista de compras e despensa (PURO, sem I/O).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ A REGRA QUE ESTE ARQUIVO EXISTE PARA GARANTIR                                      ║
 * ║ A CONSOLIDAÇÃO NÃO SOMA UNIDADES INCOMPATÍVEIS.                                      ║
 * ║ 200 g de arroz + 1 xícara de arroz só viram UMA linha quando existe conversão REAL   ║
 * ║ cadastrada (a medida caseira daquele alimento, com o peso). Sem ela: DUAS linhas,    ║
 * ║ com o motivo escrito. Nunca uma estimativa.                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * É a mesma disciplina do módulo inteiro, aplicada a compras. Em `calc.ts`, "não analisado"
 * não vira zero; aqui, "não converte" não vira palpite. Massa converte com massa, volume com
 * volume — e g ↔ ml exige densidade, que ninguém informou. "3 unidades de tomate" só vira
 * gramas se existir uma medida cadastrada dizendo quanto pesa aquele tomate; senão a lista
 * mostra as duas linhas e a pessoa decide no mercado, que é onde ela tem a informação.
 *
 * ══ REUSO, NÃO REESCRITA ══
 * `toBaseUnitValue` (units.ts) faz a conversão entre unidades do mesmo tipo; `roundForDisplay`
 * e `formatAmount` cuidam da apresentação; `calendar.ts` faz toda a aritmética de data pura em
 * `Date.UTC`; `copyName` (meal-template.ts) nomeia a duplicata. Nenhuma fórmula nova nasce
 * aqui — e nada chama `Date.now()`: "hoje" é sempre injetado.
 */
import { roundForDisplay } from "./calc";
import { addDaysIso, diffDaysIso, startOfWeekIso } from "./calendar";
import {
  PANTRY_UNKNOWN_QUANTITY_NOTE,
  SHOPPING_OPEN_STATUSES,
  type BaseUnit,
  type ShoppingItemStatus,
  type ShoppingPriority,
  type ShoppingRecurrence,
  type ShoppingSort,
} from "./constants";
import { normalizeText } from "./filters";
import { copyName } from "./meal-template";
import { formatAmount, toBaseUnitValue } from "./units";
import type { MarketCategory, ShoppingListItem, ShoppingOrigin } from "./types";

/* ═══════════════════════════ Unidades ═══════════════════════════ */

/**
 * A que "família" uma unidade pertence. É o que decide o que pode somar com o quê.
 *
 * • massa   — mg, g, kg (convertem entre si por fator exato)
 * • volume  — ml, L     (idem)
 * • unidade — contagem. NÃO é massa: 3 tomates só viram gramas com uma medida cadastrada.
 * • medida  — medida caseira sem conversão ("colher de sopa", "xícara"). Só soma com uma
 *             medida de rótulo idêntico, porque não se sabe quanto ela pesa.
 */
export type UnitFamily = "massa" | "volume" | "unidade" | "medida";

/** Sinônimos que o usuário digita. Mapear aqui evita "kg" e "Kg" virarem duas linhas. */
const UNIT_ALIASES: Record<string, string> = {
  mg: "mg",
  g: "g",
  grama: "g",
  gramas: "g",
  kg: "kg",
  quilo: "kg",
  quilos: "kg",
  kilo: "kg",
  kilos: "kg",
  ml: "ml",
  mililitro: "ml",
  mililitros: "ml",
  l: "l",
  litro: "l",
  litros: "l",
  un: "un",
  und: "un",
  unid: "un",
  unidade: "un",
  unidades: "un",
};

/** Forma canônica de uma unidade. Medida caseira desconhecida volta normalizada, não traduzida. */
export function canonicalUnit(unit: string): string {
  const key = normalizeText(unit);
  return UNIT_ALIASES[key] ?? key;
}

export function unitFamily(unit: string): UnitFamily {
  const canon = canonicalUnit(unit);
  if (canon === "mg" || canon === "g" || canon === "kg") return "massa";
  if (canon === "ml" || canon === "l") return "volume";
  if (canon === "un") return "unidade";
  return "medida";
}

/** Como a unidade aparece na tela ("l" vira "L"; medida caseira mantém o texto do usuário). */
export function unitLabel(unit: string): string {
  const canon = canonicalUnit(unit);
  if (canon === "l") return "L";
  if (UNIT_ALIASES[canon]) return canon;
  return unit.trim();
}

/**
 * Quantidade formatada para leitura no mercado.
 *
 * Arredondar SÓ aqui (regra 7 do módulo): 1.400 g vira "1,4 kg" na apresentação, mas o valor
 * guardado continua em gramas. `null` é "a gosto" — nunca "0".
 */
export function formatShoppingQuantity(quantity: number | null, unit: string): string {
  if (quantity === null) return "a gosto";
  const canon = canonicalUnit(unit);
  if (canon === "g" && quantity >= 1000) return `${formatAmount(quantity / 1000, 3)} kg`;
  if (canon === "ml" && quantity >= 1000) return `${formatAmount(quantity / 1000, 3)} L`;
  return `${formatAmount(roundForDisplay(quantity, 2), 2)} ${unitLabel(unit)}`;
}

/* ═══════════════════════════ Identidade do item ═══════════════════════════ */

/**
 * Identidade de um item de compra.
 *
 * Alimento do catálogo casa por `id`; item livre casa pelo rótulo normalizado ("Papel toalha"
 * e "papel toalha" são a mesma coisa na lista do mercado). Nunca cruzamos os dois: um item
 * livre "arroz" NÃO se funde com o alimento "Arroz, integral, cru", porque não sabemos se são
 * o mesmo produto — e adivinhar aqui trocaria a quantidade de duas coisas diferentes.
 */
export function shoppingSubjectKey(foodId: string | null, label: string): string {
  return foodId ? `food:${foodId}` : `livre:${normalizeText(label)}`;
}

/* ═══════════════════════════ Consolidação ═══════════════════════════ */

/**
 * Uma parcela que a geração encontrou: "o almoço de terça pede 150 g de arroz".
 *
 * `baseAmount`/`baseUnit` chegam preenchidos quando a camada de leitura CONSEGUIU converter
 * (via `convertToBase`, ou via o `grams_equivalent` que a receita já resolveu). Nulos
 * significam "não deu para converter" — e é justamente isso que mantém a linha separada em vez
 * de virar zero.
 */
export type ShoppingSourceItem = {
  subjectKey: string;
  foodId: string | null;
  recipeId: string | null;
  label: string;
  brand: string | null;
  categoryId: string | null;
  /** O que a origem pediu, na unidade em que pediu. Nulo = sem quantidade ("a gosto"). */
  quantity: number | null;
  unit: string;
  /** Quantidade na unidade-base do alimento, quando existe conversão real. */
  baseAmount: number | null;
  baseUnit: BaseUnit | null;
  origin: ShoppingOrigin;
};

/** Em que "balde" uma parcela cai. Duas parcelas só somam quando caem no mesmo balde. */
export type ShoppingBucket = {
  key: string;
  amount: number | null;
  unit: string;
  family: UnitFamily | "indefinida";
};

/**
 * Decide o balde de uma parcela — o coração da regra.
 *
 * A ordem importa: a conversão JÁ RESOLVIDA vence. Se a camada de leitura conseguiu dizer "1
 * xícara deste arroz são 160 g", a parcela entra em gramas e soma com os 200 g. Se não
 * conseguiu, a medida caseira fica no seu próprio balde, com o rótulo dela.
 */
export function shoppingBucket(source: {
  quantity: number | null;
  unit: string;
  baseAmount: number | null;
  baseUnit: BaseUnit | null;
}): ShoppingBucket {
  if (source.baseAmount !== null && source.baseUnit !== null && source.baseAmount > 0) {
    return {
      key: `base:${source.baseUnit}`,
      amount: source.baseAmount,
      unit: source.baseUnit,
      family: source.baseUnit === "g" ? "massa" : "volume",
    };
  }

  const canon = canonicalUnit(source.unit);

  // Sem quantidade não há o que somar — mas o item PRECISA aparecer na lista ("sal a gosto").
  if (source.quantity === null) {
    return { key: "sem_quantidade", amount: null, unit: canon, family: "indefinida" };
  }

  const family = unitFamily(canon);
  if (family === "massa" || family === "volume") {
    const base = toBaseUnitValue(source.quantity, canon);
    // `toBaseUnitValue` só devolve null para unidade fora das duas famílias — impossível aqui,
    // mas a guarda evita que uma futura alias mal cadastrada vire uma soma errada em silêncio.
    if (base) return { key: `base:${base.base}`, amount: base.amount, unit: base.base, family };
  }

  if (family === "unidade") {
    return { key: "un", amount: source.quantity, unit: "un", family };
  }

  return { key: `medida:${canon}`, amount: source.quantity, unit: source.unit.trim(), family };
}

export type ConsolidatedItem = {
  /** Identidade + balde. É a chave que sobrevive à regeração. */
  consolidationKey: string;
  subjectKey: string;
  foodId: string | null;
  recipeId: string | null;
  label: string;
  brand: string | null;
  categoryId: string | null;
  quantity: number | null;
  unit: string;
  origins: ShoppingOrigin[];
  /** Quantas parcelas viraram esta linha. 1 = não houve consolidação. */
  mergedFrom: number;
  /** Preenchido só quando o MESMO item ficou em mais de uma linha. */
  separateReason: string | null;
};

/** Um item que precisou de mais de uma linha por incompatibilidade de unidade. */
export type ConsolidationSplit = {
  subjectKey: string;
  label: string;
  units: string[];
};

export type ConsolidationResult = {
  items: ConsolidatedItem[];
  splits: ConsolidationSplit[];
};

/** "a, b e c" — a UI nunca monta lista de texto na mão. */
function joinPtBR(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(", ")} e ${values[values.length - 1]}`;
}

/** A frase que explica a separação. Fica aqui para nunca ser reescrita "mais simpática". */
export function separationMessage(label: string, units: string[]): string {
  return `“${label}” foi pedido em unidades que não se convertem entre si (${joinPtBR(
    units.map(unitLabel),
  )}). Somar exigiria uma conversão que ninguém cadastrou, e estimar seria inventar dado — por isso as linhas ficam separadas.`;
}

/**
 * Junta as parcelas em linhas de compra.
 *
 * ⛔ Duas parcelas do MESMO item só somam quando caem no mesmo balde. Quando não caem, cada
 * balde vira uma linha e todas recebem `separateReason` explicando o motivo — em vez de o app
 * escolher uma unidade e converter no chute.
 *
 * A ordem de saída segue a ordem de entrada (primeiro item visto, primeiro balde visto), então
 * gerar a mesma lista duas vezes produz exatamente o mesmo resultado.
 */
export function consolidateShoppingItems(sources: ShoppingSourceItem[]): ConsolidationResult {
  type Group = {
    label: string;
    subjectKey: string;
    buckets: Map<string, ConsolidatedItem>;
  };

  const groups = new Map<string, Group>();

  for (const source of sources) {
    const bucket = shoppingBucket(source);
    const group = groups.get(source.subjectKey) ?? {
      label: source.label,
      subjectKey: source.subjectKey,
      buckets: new Map<string, ConsolidatedItem>(),
    };
    groups.set(source.subjectKey, group);

    const existing = group.buckets.get(bucket.key);
    if (!existing) {
      group.buckets.set(bucket.key, {
        consolidationKey: `${source.subjectKey}|${bucket.key}`,
        subjectKey: source.subjectKey,
        foodId: source.foodId,
        recipeId: source.recipeId,
        label: source.label,
        brand: source.brand,
        categoryId: source.categoryId,
        quantity: bucket.amount,
        unit: bucket.unit,
        origins: [source.origin],
        mergedFrom: 1,
        separateReason: null,
      });
      continue;
    }

    // Somar é seguro aqui: o balde já garantiu que as unidades são a mesma coisa.
    existing.quantity =
      existing.quantity === null || bucket.amount === null
        ? (existing.quantity ?? bucket.amount)
        : existing.quantity + bucket.amount;
    existing.origins.push(source.origin);
    existing.mergedFrom += 1;
    // A categoria da primeira parcela vence; a das seguintes só preenche o que faltava.
    existing.categoryId = existing.categoryId ?? source.categoryId;
    existing.recipeId = existing.recipeId ?? source.recipeId;
  }

  const items: ConsolidatedItem[] = [];
  const splits: ConsolidationSplit[] = [];

  for (const group of groups.values()) {
    const lines = [...group.buckets.values()];
    if (lines.length > 1) {
      const units = lines.map((line) => line.unit);
      const reason = separationMessage(group.label, units);
      for (const line of lines) line.separateReason = reason;
      splits.push({ subjectKey: group.subjectKey, label: group.label, units });
    }
    items.push(...lines);
  }

  return { items, splits };
}

/* ═══════════════════════════ Despensa ═══════════════════════════ */

/** O que a despensa oferece para o desconto. Um item pode ter várias linhas (dois pacotes). */
export type PantryStock = {
  id: string;
  subjectKey: string;
  label: string;
  /** NULA = "tenho, mas não sei quanto" → não desconta. ZERO = "acabou", fato medido. */
  quantity: number | null;
  unit: string;
};

export type PantryCoverage = "total" | "parcial" | "nenhuma" | "indisponivel";

export const PANTRY_COVERAGE_LABELS: Record<PantryCoverage, string> = {
  total: "Já tenho tudo",
  parcial: "Tenho parte",
  nenhuma: "Acabou",
  indisponivel: "Não dá para descontar",
};

export type PantryDiscountLine = {
  consolidationKey: string;
  label: string;
  unit: string;
  /** O que a lista pede. */
  needed: number | null;
  /** O que a despensa cobre, já convertido para a unidade da linha. */
  available: number | null;
  /** O que ainda falta comprar. */
  remaining: number | null;
  /** O que sobra na despensa depois de cobrir a necessidade. */
  surplus: number | null;
  coverage: PantryCoverage;
  /** Por que não deu para descontar. Nulo quando deu. */
  reason: string | null;
  pantryItemIds: string[];
};

export type PantryDiscountPreview = {
  lines: PantryDiscountLine[];
  cobertos: number;
  parciais: number;
  semDesconto: number;
};

/** Converte a quantidade da despensa para a unidade da linha. `null` = incompatível. */
export function convertPantryAmount(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const from = canonicalUnit(fromUnit);
  const to = canonicalUnit(toUnit);
  if (from === to) return quantity;

  const fromFamily = unitFamily(from);
  const toFamily = unitFamily(to);
  // Massa com massa, volume com volume. g ↔ ml exigiria densidade; unidade não é massa.
  if (fromFamily !== toFamily) return null;
  if (fromFamily !== "massa" && fromFamily !== "volume") return null;

  const a = toBaseUnitValue(quantity, from);
  const b = toBaseUnitValue(1, to);
  if (!a || !b || a.base !== b.base || b.amount <= 0) return null;
  return a.amount / b.amount;
}

const PANTRY_INCOMPATIBLE_NOTE =
  "A unidade da despensa não converte para a unidade da lista. Cadastre a mesma unidade (ou a medida caseira com o peso) para este item entrar no desconto.";

const PANTRY_NO_QUANTITY_NOTE =
  "O item da lista está sem quantidade definida, então não há o que descontar.";

/**
 * O que o desconto da despensa FARIA — sem fazer.
 *
 * Regra 3 da subfase: o desconto é opt-in e mostrado ANTES de aplicar. Esta função é a metade
 * "mostrar"; `pantryPatches` é a metade "aplicar", e só roda depois da confirmação.
 *
 * Itens sem correspondência na despensa não geram linha nenhuma: não há nada a dizer sobre eles.
 */
export function previewPantryDiscount(
  items: ConsolidatedItem[],
  pantry: PantryStock[],
): PantryDiscountPreview {
  const bySubject = new Map<string, PantryStock[]>();
  for (const stock of pantry) {
    const list = bySubject.get(stock.subjectKey);
    if (list) list.push(stock);
    else bySubject.set(stock.subjectKey, [stock]);
  }

  const lines: PantryDiscountLine[] = [];

  for (const item of items) {
    const stocks = bySubject.get(item.subjectKey);
    if (!stocks || stocks.length === 0) continue;

    const base: Omit<PantryDiscountLine, "coverage" | "reason"> = {
      consolidationKey: item.consolidationKey,
      label: item.label,
      unit: item.unit,
      needed: item.quantity,
      available: null,
      remaining: item.quantity,
      surplus: null,
      pantryItemIds: stocks.map((stock) => stock.id),
    };

    if (item.quantity === null) {
      lines.push({ ...base, coverage: "indisponivel", reason: PANTRY_NO_QUANTITY_NOTE });
      continue;
    }

    let available = 0;
    let usable = false;
    let unknownQuantity = false;
    let incompatible = false;
    const usedIds: string[] = [];

    for (const stock of stocks) {
      if (stock.quantity === null) {
        unknownQuantity = true;
        continue;
      }
      const converted = convertPantryAmount(stock.quantity, stock.unit, item.unit);
      if (converted === null) {
        incompatible = true;
        continue;
      }
      available += converted;
      usable = true;
      usedIds.push(stock.id);
    }

    if (!usable) {
      lines.push({
        ...base,
        coverage: "indisponivel",
        reason: unknownQuantity ? PANTRY_UNKNOWN_QUANTITY_NOTE : PANTRY_INCOMPATIBLE_NOTE,
        pantryItemIds: stocks.map((stock) => stock.id),
      });
      continue;
    }

    const remaining = Math.max(0, item.quantity - available);
    const surplus = Math.max(0, available - item.quantity);
    // Um aviso pendurado na linha não impede o desconto do que É conversível.
    const partialReason = unknownQuantity
      ? PANTRY_UNKNOWN_QUANTITY_NOTE
      : incompatible
        ? PANTRY_INCOMPATIBLE_NOTE
        : null;

    lines.push({
      ...base,
      available,
      remaining,
      surplus,
      coverage: available <= 0 ? "nenhuma" : remaining === 0 ? "total" : "parcial",
      reason: partialReason,
      pantryItemIds: usedIds,
    });
  }

  return {
    lines,
    cobertos: lines.filter((line) => line.coverage === "total").length,
    parciais: lines.filter((line) => line.coverage === "parcial").length,
    semDesconto: lines.filter(
      (line) => line.coverage === "indisponivel" || line.coverage === "nenhuma",
    ).length,
  };
}

export type PantryPatch = {
  consolidationKey: string;
  /** Nova quantidade a comprar. Preservada quando o item sai da compra por cobertura total. */
  quantity: number | null;
  /** Cobertura total: o item sai da compra (status `removido`), mas continua na lista. */
  covered: boolean;
  note: string;
};

/**
 * O que aplicar depois da confirmação.
 *
 * DUAS ESCOLHAS DELIBERADAS:
 *
 * 1. Cobertura TOTAL não zera a quantidade nem apaga a linha. Zerar afirmaria "preciso de 0 g
 *    de arroz", que é falso — eu preciso, só já tenho. A linha vira `removido` ("não vou
 *    comprar"), continua visível pelo filtro e volta a pendente com um toque.
 * 2. Cobertura PARCIAL grava só o que falta, e a observação registra o número que saiu. Sem
 *    isso, o usuário abriria a lista no mercado sem saber por que a quantidade mudou.
 */
export function pantryPatches(lines: PantryDiscountLine[]): PantryPatch[] {
  const patches: PantryPatch[] = [];
  for (const line of lines) {
    if (line.coverage === "total") {
      patches.push({
        consolidationKey: line.consolidationKey,
        quantity: line.needed,
        covered: true,
        note: `Já tenho na despensa (${formatShoppingQuantity(line.available, line.unit)}).`,
      });
      continue;
    }
    if (line.coverage === "parcial" && line.remaining !== null) {
      patches.push({
        consolidationKey: line.consolidationKey,
        quantity: line.remaining,
        covered: false,
        note: `Descontado da despensa: já tenho ${formatShoppingQuantity(
          line.available,
          line.unit,
        )}.`,
      });
    }
  }
  return patches;
}

/* ═══════════════════════════ Recorrência ═══════════════════════════ */

/**
 * Chave DETERMINÍSTICA do período (regra 6: lista recorrente não gera duplicata).
 *
 * A mesma data sempre produz a mesma chave, então "criar a lista da semana" cinco vezes
 * encontra a mesma lista em vez de criar cinco. Toda a aritmética passa por `calendar.ts`
 * (`Date.UTC`), e `hoje` é injetado — nada de `new Date()` no fuso local.
 *
 * A quinzena é ancorada em 05/01/1970 (uma segunda-feira) para não depender de "quando o
 * usuário começou a usar o app": a mesma data cai sempre na mesma quinzena, para sempre.
 */
export function shoppingRecurrenceKey(
  recurrence: ShoppingRecurrence,
  date: string,
  weekStartDay = 1,
): string | null {
  if (recurrence === "nenhuma") return null;

  if (recurrence === "mensal") return `mensal:${date.slice(0, 7)}`;

  const weekStart = startOfWeekIso(date, weekStartDay);
  if (recurrence === "semanal") return `semanal:${weekStart}`;

  const weeks = Math.floor(diffDaysIso("1970-01-05", weekStart) / 7);
  const anchor = ((weeks % 2) + 2) % 2 === 0 ? weekStart : addDaysIso(weekStart, -7);
  return `quinzenal:${anchor}`;
}

/** A lista já existente daquele período, se houver. Puro: quem consulta o banco é a action. */
export function findRecurringList<T extends { recurrenceKey: string | null }>(
  lists: T[],
  key: string | null,
): T | null {
  if (!key) return null;
  return lists.find((list) => list.recurrenceKey === key) ?? null;
}

/* ═══════════════════════════ Filtros e seleção ═══════════════════════════ */

export type ShoppingStatusFilter = ShoppingItemStatus | "todos" | "abertos";
export type ShoppingOriginFilter = "todos" | "planejamento" | "receita" | "manual";

export type ShoppingFilterState = {
  search: string;
  status: ShoppingStatusFilter;
  categoryId: string | null;
  store: string | null;
  origin: ShoppingOriginFilter;
  priority: ShoppingPriority | null;
};

export const EMPTY_SHOPPING_FILTERS: ShoppingFilterState = {
  search: "",
  status: "todos",
  categoryId: null,
  store: null,
  origin: "todos",
  priority: null,
};

export function matchesShoppingFilters(
  item: ShoppingListItem,
  filters: ShoppingFilterState,
): boolean {
  if (filters.status === "abertos") {
    if (!SHOPPING_OPEN_STATUSES.includes(item.status)) return false;
  } else if (filters.status !== "todos" && item.status !== filters.status) {
    return false;
  }

  if (filters.categoryId !== null && item.categoryId !== filters.categoryId) return false;
  if (filters.priority !== null && item.priority !== filters.priority) return false;

  if (filters.store !== null) {
    if (normalizeText(item.store ?? "") !== normalizeText(filters.store)) return false;
  }

  if (filters.origin !== "todos") {
    if (filters.origin === "manual") {
      if (!item.isManual) return false;
    } else if (!item.origins.some((origin) => origin.kind === filters.origin)) {
      return false;
    }
  }

  const terms = normalizeText(filters.search).split(/\s+/).filter(Boolean);
  if (terms.length > 0) {
    const haystack = normalizeText(
      [item.label, item.brand ?? "", item.note ?? "", item.store ?? "", item.categoryName ?? ""]
        .concat(item.origins.map((origin) => origin.label))
        .join(" "),
    );
    if (!terms.every((term) => haystack.includes(term))) return false;
  }

  return true;
}

export function filterShoppingItems(
  items: ShoppingListItem[],
  filters: ShoppingFilterState,
): ShoppingListItem[] {
  return items.filter((item) => matchesShoppingFilters(item, filters));
}

/**
 * Regra 5 da subfase — AÇÃO EM MASSA NÃO ATINGE REGISTRO FORA DO FILTRO ATUAL.
 *
 * Selecionar 30 itens, filtrar para 5 e clicar em "excluir" não pode apagar os 30. A
 * interseção acontece aqui (puro e testado), e a action recebe só os ids que sobraram — a UI
 * mostra o número real antes de confirmar.
 */
export function selectionInScope(
  selectedIds: Iterable<string>,
  visible: { id: string }[],
): string[] {
  const selected = new Set(selectedIds);
  return visible.filter((item) => selected.has(item.id)).map((item) => item.id);
}

/* ═══════════════════════════ Agrupamento e ordenação ═══════════════════════════ */

export type ShoppingGroup = {
  category: MarketCategory | null;
  items: ShoppingListItem[];
};

/**
 * Agrupa por corredor, na ordem em que o usuário organizou os corredores.
 * Itens sem corredor vão para o fim, num grupo próprio — nunca somem.
 */
export function groupItemsByCategory(
  items: ShoppingListItem[],
  categories: MarketCategory[],
): ShoppingGroup[] {
  const groups: ShoppingGroup[] = categories.map((category) => ({ category, items: [] }));
  const byId = new Map(groups.map((group) => [group.category?.id, group]));
  const semCorredor: ShoppingGroup = { category: null, items: [] };

  for (const item of items) {
    const group = item.categoryId ? byId.get(item.categoryId) : undefined;
    (group ?? semCorredor).items.push(item);
  }

  const result = groups.filter((group) => group.items.length > 0);
  if (semCorredor.items.length > 0) result.push(semCorredor);
  return result;
}

const PRIORITY_ORDER: Record<ShoppingPriority, number> = { alta: 0, normal: 1, baixa: 2 };
const STATUS_ORDER: Record<ShoppingItemStatus, number> = {
  pendente: 0,
  no_carrinho: 1,
  indisponivel: 2,
  comprado: 3,
  removido: 4,
};

export function sortShoppingItems(
  items: ShoppingListItem[],
  sort: ShoppingSort,
  categories: MarketCategory[],
): ShoppingListItem[] {
  const categoryPosition = new Map(categories.map((c, index) => [c.id, index]));
  // Sem corredor vai para o fim, não para o começo.
  const positionOf = (item: ShoppingListItem) =>
    item.categoryId ? (categoryPosition.get(item.categoryId) ?? categories.length) : categories.length + 1;

  const byName = (a: ShoppingListItem, b: ShoppingListItem) =>
    a.label.localeCompare(b.label, "pt-BR");

  return [...items].sort((a, b) => {
    switch (sort) {
      case "nome":
        return byName(a, b);
      case "prioridade":
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || byName(a, b);
      case "status":
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || byName(a, b);
      default:
        return positionOf(a) - positionOf(b) || a.position - b.position || byName(a, b);
    }
  });
}

/* ═══════════════════════════ Resumo ═══════════════════════════ */

export type ShoppingSummary = {
  total: number;
  pendentes: number;
  noCarrinho: number;
  comprados: number;
  indisponiveis: number;
  removidos: number;
  /** Soma dos preços informados, em centavos. */
  estimadoCents: number;
  realCents: number;
  /** Quantos itens não têm preço. Sem isto, um total baixo pareceria "compra barata". */
  semPrecoEstimado: number;
  semPrecoReal: number;
  /** Nada em aberto: todo item foi comprado, marcado como indisponível ou removido. */
  tudoResolvido: boolean;
};

/**
 * Contadores e totais da lista.
 *
 * AUSÊNCIA DE PREÇO NÃO É ZERO: `semPrecoEstimado`/`semPrecoReal` existem para a tela poder
 * dizer "R$ 84,20 em 12 de 19 itens" em vez de deixar o número parecer o total da compra.
 * Item `removido` não entra em nenhuma soma — ele não vai ser comprado.
 */
export function summarizeShoppingList(items: ShoppingListItem[]): ShoppingSummary {
  const summary: ShoppingSummary = {
    total: items.length,
    pendentes: 0,
    noCarrinho: 0,
    comprados: 0,
    indisponiveis: 0,
    removidos: 0,
    estimadoCents: 0,
    realCents: 0,
    semPrecoEstimado: 0,
    semPrecoReal: 0,
    tudoResolvido: items.length > 0,
  };

  for (const item of items) {
    switch (item.status) {
      case "pendente":
        summary.pendentes += 1;
        summary.tudoResolvido = false;
        break;
      case "no_carrinho":
        summary.noCarrinho += 1;
        summary.tudoResolvido = false;
        break;
      case "comprado":
        summary.comprados += 1;
        break;
      case "indisponivel":
        summary.indisponiveis += 1;
        break;
      default:
        summary.removidos += 1;
        break;
    }

    if (item.status === "removido") continue;

    if (item.estimatedPriceCents === null) summary.semPrecoEstimado += 1;
    else summary.estimadoCents += item.estimatedPriceCents;

    if (item.actualPriceCents === null) summary.semPrecoReal += 1;
    else summary.realCents += item.actualPriceCents;
  }

  return summary;
}

/* ═══════════════════════════ Regeração ═══════════════════════════ */

export type ExistingItemRef = {
  id: string;
  consolidationKey: string | null;
  quantityOverridden: boolean;
  isManual: boolean;
  label: string;
};

export type RegenerationPlan = {
  toInsert: ConsolidatedItem[];
  toUpdate: { id: string; item: ConsolidatedItem; keepQuantity: boolean }[];
  /** Itens gerados que o planejamento não pede mais. NADA é apagado sem confirmação. */
  obsolete: { id: string; label: string }[];
  /** Quantos ajustes manuais foram preservados — a UI diz o número. */
  preservedOverrides: number;
};

/**
 * O que fazer ao regerar uma lista que já existe.
 *
 * ══ TRÊS GARANTIAS ══
 * 1. O AJUSTE MANUAL SOBREVIVE (regra 2). Item com `quantity_overridden` volta com
 *    `keepQuantity: true`: origem e categoria são atualizadas, a quantidade não. Quem comprou
 *    2 kg porque o pacote é de 2 kg não quer ver 1,4 kg de volta a cada recálculo.
 * 2. ITEM DIGITADO À MÃO NUNCA É TOCADO. Ele não tem chave de consolidação e não aparece em
 *    `obsolete`: são as palavras do usuário, não um cálculo nosso.
 * 3. NADA SOME SOZINHO (regra 4). O que o planejamento não pede mais vira `obsolete`, uma
 *    LISTA PARA CONFIRMAR — a action só apaga se o usuário mandar.
 */
export function planRegeneration(
  incoming: ConsolidatedItem[],
  existing: ExistingItemRef[],
): RegenerationPlan {
  const generated = existing.filter((item) => !item.isManual && item.consolidationKey !== null);
  const byKey = new Map(generated.map((item) => [item.consolidationKey as string, item]));

  const plan: RegenerationPlan = {
    toInsert: [],
    toUpdate: [],
    obsolete: [],
    preservedOverrides: 0,
  };

  const seen = new Set<string>();
  for (const item of incoming) {
    seen.add(item.consolidationKey);
    const match = byKey.get(item.consolidationKey);
    if (!match) {
      plan.toInsert.push(item);
      continue;
    }
    plan.toUpdate.push({ id: match.id, item, keepQuantity: match.quantityOverridden });
    if (match.quantityOverridden) plan.preservedOverrides += 1;
  }

  for (const item of generated) {
    if (!seen.has(item.consolidationKey as string)) {
      plan.obsolete.push({ id: item.id, label: item.label });
    }
  }

  return plan;
}

/* ═══════════════════════════ Duplicação ═══════════════════════════ */

export type ShoppingListDuplicationDraft = {
  name: string;
  status: "ativa";
  /** A cópia nasce avulsa: herdar a chave do período colidiria com a lista original. */
  recurrence: "nenhuma";
  recurrenceKey: null;
  pantryAppliedAt: null;
};

/**
 * Rascunho da duplicação de uma lista.
 *
 * A recorrência NÃO é herdada de propósito: duas listas com a mesma `recurrence_key` seriam
 * exatamente a duplicata que a regra 6 proíbe (e o índice único recusaria a segunda).
 */
export function duplicateShoppingListDraft(list: { name: string }): ShoppingListDuplicationDraft {
  return {
    name: copyName(list.name),
    status: "ativa",
    recurrence: "nenhuma",
    recurrenceKey: null,
    pantryAppliedAt: null,
  };
}

/** O que uma cópia de item NÃO herda: a compra da vez passada. */
export const SHOPPING_ITEM_DUPLICATION_RESET = {
  status: "pendente" as ShoppingItemStatus,
  actualPriceCents: null,
  purchasedAt: null,
};

/**
 * Itens de uma lista duplicada.
 *
 * Copiar a lista é para a PRÓXIMA compra: carregar "comprado" e o preço realmente pago diria
 * que a pessoa já comprou algo que ela não comprou. O preço ESTIMADO fica — ele é a memória
 * útil ("da última vez custou uns R$ 12").
 */
export function duplicateShoppingItems<
  T extends { status: ShoppingItemStatus; actualPriceCents: number | null; purchasedAt: string | null },
>(items: T[]): T[] {
  return items.map((item) => ({ ...item, ...SHOPPING_ITEM_DUPLICATION_RESET }));
}

/* ═══════════════════════════ Exportar / imprimir ═══════════════════════════ */

/**
 * A lista em texto, agrupada por corredor.
 *
 * Existe porque compartilhar por LINK PÚBLICO não existe neste módulo (a lista conta o que a
 * pessoa come e quanto gasta). Exportar e imprimir resolvem o caso real — levar a lista a
 * alguém — sem publicar nada.
 */
export function shoppingListToText(
  list: { name: string; items: ShoppingListItem[] },
  categories: MarketCategory[],
): string {
  const linhas: string[] = [list.name, "=".repeat(list.name.length), ""];

  for (const group of groupItemsByCategory(list.items, categories)) {
    linhas.push(group.category ? group.category.name : "Sem corredor");
    for (const item of group.items) {
      const marca = item.status === "comprado" ? "[x]" : item.status === "removido" ? "[-]" : "[ ]";
      const quantidade = formatShoppingQuantity(item.quantity, item.unit);
      const extras = [item.brand, item.note].filter(Boolean).join(" · ");
      linhas.push(
        `  ${marca} ${item.label} — ${quantidade}${extras ? ` (${extras})` : ""}`,
      );
    }
    linhas.push("");
  }

  const resumo = summarizeShoppingList(list.items);
  linhas.push(
    `${resumo.total} itens · ${resumo.pendentes} pendentes · ${resumo.comprados} comprados`,
  );
  return linhas.join("\n");
}
