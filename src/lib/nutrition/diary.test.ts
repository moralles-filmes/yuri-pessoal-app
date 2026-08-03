import { describe, expect, it } from "vitest";
import {
  comparePlannedVsConsumed,
  dailyAverage,
  dayTotals,
  effectiveMealStatus,
  entryCounts,
  followedPlan,
  groupMealsByDate,
  mealTotals,
  plannedItemBag,
  rangeTotals,
  sortMealsByTime,
  suggestMealStatus,
  summarizeDay,
  upcomingMeals,
  type NowContext,
} from "./diary";
import { buildDiaryEntrySnapshot } from "./snapshot";
import type { DiaryEntry, FoodNutrientValue, PlannedMealItem } from "./types";

/* ───────────────────────────── Ajudantes ───────────────────────────── */

const disponivel = (code: string, amount: number): FoodNutrientValue => ({
  code,
  amount,
  state: "disponivel",
  method: "analitico",
  sourceNote: null,
});

const semValor = (code: string, state: FoodNutrientValue["state"]): FoodNutrientValue => ({
  code,
  amount: null,
  state,
  method: "analitico",
  sourceNote: null,
});

let entrySeq = 0;

/** Cria um item do diário já com o snapshot montado pelo caminho real de gravação. */
function entry(options: {
  name: string;
  nutrients: FoodNutrientValue[];
  quantity?: number;
  baseQuantity?: number;
  changeKind?: DiaryEntry["changeKind"];
  plannedItemId?: string | null;
  id?: string;
}): DiaryEntry {
  entrySeq += 1;
  const built = buildDiaryEntrySnapshot({
    food: {
      name: options.name,
      preparationState: null,
      brand: null,
      baseQuantity: options.baseQuantity ?? 100,
      baseUnit: "g",
      sourceId: null,
      sourceName: null,
      sourceVersion: null,
      sourceFoodCode: null,
      nutrients: options.nutrients,
    },
    quantity: options.quantity ?? 100,
    measure: null,
  });
  if (!built.ok) throw new Error("snapshot deveria funcionar no fixture");

  return {
    ...built.snapshot,
    id: options.id ?? `entry-${entrySeq}`,
    diaryMealId: "meal-1",
    foodId: `food-${entrySeq}`,
    entryKind: "alimento",
    plannedItemId: options.plannedItemId ?? null,
    changeKind: options.changeKind ?? "extra",
    changedAt: null,
    notes: null,
    position: entrySeq,
  };
}

const now = (hoje: string, hora: number, minuto = 0): NowContext => ({
  hoje,
  minutosAgora: hora * 60 + minuto,
});

/* ═══════════════════ Totais ═══════════════════ */

describe("totais do diário — somados do SNAPSHOT", () => {
  it("soma os itens de uma refeição", () => {
    const totals = mealTotals([
      entry({ name: "Arroz", nutrients: [disponivel("energia_kcal", 128), disponivel("proteina", 2.5)], quantity: 150 }),
      entry({ name: "Feijão", nutrients: [disponivel("energia_kcal", 76), disponivel("proteina", 4.8)], quantity: 100 }),
    ]);
    expect(totals.energia_kcal.amount).toBeCloseTo(128 * 1.5 + 76, 10);
    expect(totals.proteina.amount).toBeCloseTo(2.5 * 1.5 + 4.8, 10);
    expect(totals.energia_kcal.quality).toBe("exato");
  });

  it("soma o dia inteiro a partir das refeições", () => {
    const totals = dayTotals([
      { entries: [entry({ name: "Café", nutrients: [disponivel("energia_kcal", 200)] })] },
      { entries: [entry({ name: "Almoço", nutrients: [disponivel("energia_kcal", 600)] })] },
      { entries: [entry({ name: "Jantar", nutrients: [disponivel("energia_kcal", 500)] })] },
    ]);
    expect(totals.energia_kcal.amount).toBeCloseTo(1300, 10);
  });

  it("soma a semana com mergeTotals, propagando a qualidade", () => {
    const diaExato = dayTotals([
      { entries: [entry({ name: "A", nutrients: [disponivel("energia_kcal", 1000)] })] },
    ]);
    const diaParcial = dayTotals([
      {
        entries: [
          entry({ name: "B", nutrients: [disponivel("energia_kcal", 800)] }),
          // Item sem energia analisada: o dia (e a semana) viram parciais.
          entry({ name: "C", nutrients: [disponivel("proteina", 10)] }),
        ],
      },
    ]);

    expect(diaExato.energia_kcal.quality).toBe("exato");
    expect(diaParcial.energia_kcal.quality).toBe("parcial");

    const semana = rangeTotals([diaExato, diaParcial]);
    expect(semana.energia_kcal.amount).toBeCloseTo(1800, 10);
    expect(semana.energia_kcal.quality).toBe("parcial");
  });

  it("um item com 'traço' deixa o total aproximado, nunca exato", () => {
    const totals = mealTotals([
      entry({ name: "A", nutrients: [disponivel("sodio", 100)] }),
      entry({ name: "B", nutrients: [semValor("sodio", "traco")] }),
    ]);
    expect(totals.sodio.amount).toBeCloseTo(100, 10);
    expect(totals.sodio.quality).toBe("aproximado");
    expect(totals.sodio.trace).toBe(1);
  });

  it("'não aplicável' é ignorado sem degradar o total", () => {
    const totals = mealTotals([
      entry({ name: "A", nutrients: [disponivel("energia_kcal", 100)] }),
      entry({ name: "Sal, grosso", nutrients: [semValor("energia_kcal", "nao_aplicavel")] }),
    ]);
    expect(totals.energia_kcal.amount).toBeCloseTo(100, 10);
    expect(totals.energia_kcal.quality).toBe("exato");
  });

  it("item removido do plano NÃO entra na soma", () => {
    const items = [
      entry({ name: "Comido", nutrients: [disponivel("energia_kcal", 300)] }),
      entry({
        name: "Pulado",
        nutrients: [disponivel("energia_kcal", 500)],
        changeKind: "removido",
        plannedItemId: "pi-1",
      }),
    ];
    expect(entryCounts(items[1])).toBe(false);
    expect(mealTotals(items).energia_kcal.amount).toBeCloseTo(300, 10);
  });

  it("média diária divide pelos dias pedidos, não pelos dias com registro", () => {
    const semana = rangeTotals([
      dayTotals([{ entries: [entry({ name: "A", nutrients: [disponivel("energia_kcal", 2000)] })] }]),
      dayTotals([{ entries: [entry({ name: "B", nutrients: [disponivel("energia_kcal", 1000)] })] }]),
    ]);
    // 3000 kcal em 7 dias — quem não registrou nada não some da conta da semana.
    expect(dailyAverage(semana, 7).energia_kcal.amount).toBeCloseTo(3000 / 7, 10);
  });
});

/* ═══════════════════ Status derivado ═══════════════════ */

describe("effectiveMealStatus — derivado, nunca gravado", () => {
  const base = { status: "planejada" as const, diaryDate: "2026-08-03", plannedTime: "12:30:00" };

  it("dia futuro continua planejada", () => {
    const state = effectiveMealStatus({ ...base, diaryDate: "2026-08-05" }, now("2026-08-03", 23));
    expect(state.status).toBe("planejada");
    expect(state.isLate).toBe(false);
  });

  it("hoje, antes do horário, continua planejada", () => {
    expect(effectiveMealStatus(base, now("2026-08-03", 11)).status).toBe("planejada");
  });

  it("hoje, passado o horário, vira pendente", () => {
    const state = effectiveMealStatus(base, now("2026-08-03", 12, 40));
    expect(state.status).toBe("pendente");
    expect(state.minutesLate).toBe(10);
    // Dentro da tolerância: pendente, mas ainda não atrasada.
    expect(state.isLate).toBe(false);
  });

  it("passada a tolerância, fica atrasada", () => {
    const state = effectiveMealStatus(base, now("2026-08-03", 14));
    expect(state.status).toBe("pendente");
    expect(state.minutesLate).toBe(90);
    expect(state.isLate).toBe(true);
  });

  it("dia passado sem desfecho é pendente e atrasada em dias", () => {
    const state = effectiveMealStatus(base, now("2026-08-06", 9));
    expect(state.status).toBe("pendente");
    expect(state.daysLate).toBe(3);
    expect(state.isLate).toBe(true);
  });

  it("hoje sem horário previsto NÃO vira pendente — não há como saber se atrasou", () => {
    const state = effectiveMealStatus({ ...base, plannedTime: null }, now("2026-08-03", 23, 59));
    expect(state.status).toBe("planejada");
    expect(state.isLate).toBe(false);
  });

  it("desfecho já declarado não muda com a passagem do tempo", () => {
    for (const status of ["consumida", "nao_consumida", "substituida", "parcialmente_consumida"] as const) {
      const state = effectiveMealStatus({ ...base, status }, now("2026-09-01", 23));
      expect(state.status).toBe(status);
      expect(state.isLate).toBe(false);
    }
  });

  it("funciona na virada do mês e do ano", () => {
    const reveillon = { status: "planejada" as const, diaryDate: "2026-12-31", plannedTime: "22:00:00" };
    expect(effectiveMealStatus(reveillon, now("2027-01-01", 1)).daysLate).toBe(1);
    expect(effectiveMealStatus(reveillon, now("2026-12-31", 21)).status).toBe("planejada");
  });
});

describe("summarizeDay", () => {
  const meals = [
    { status: "consumida" as const, diaryDate: "2026-08-03", plannedTime: "07:00:00", entries: [entry({ name: "A", nutrients: [] })] },
    { status: "planejada" as const, diaryDate: "2026-08-03", plannedTime: "12:30:00", entries: [] },
    { status: "planejada" as const, diaryDate: "2026-08-03", plannedTime: "19:30:00", entries: [] },
    { status: "nao_consumida" as const, diaryDate: "2026-08-03", plannedTime: "16:00:00", entries: [] },
    { status: "fora_do_planejamento" as const, diaryDate: "2026-08-03", plannedTime: null, entries: [entry({ name: "B", nutrients: [] })] },
  ];

  it("conta consumidas, pendentes e atrasadas às 14h", () => {
    const summary = summarizeDay(meals, now("2026-08-03", 14));
    expect(summary.total).toBe(5);
    expect(summary.consumidas).toBe(2); // consumida + fora do planejamento
    expect(summary.foraDoPlano).toBe(1);
    expect(summary.naoConsumidas).toBe(1);
    expect(summary.pendentes).toBe(1); // o almoço das 12h30
    expect(summary.atrasadas).toBe(1);
    expect(summary.itens).toBe(2);
  });

  it("às 20h o jantar também está pendente", () => {
    const summary = summarizeDay(meals, now("2026-08-03", 20));
    expect(summary.pendentes).toBe(2);
    expect(summary.atrasadas).toBe(1); // o jantar ainda está dentro da tolerância
  });
});

describe("upcomingMeals", () => {
  const meals = [
    { status: "planejada" as const, diaryDate: "2026-08-03", plannedTime: "19:30:00", id: "jantar" },
    { status: "planejada" as const, diaryDate: "2026-08-03", plannedTime: "16:00:00", id: "lanche" },
    { status: "consumida" as const, diaryDate: "2026-08-03", plannedTime: "12:30:00", id: "almoco" },
    { status: "planejada" as const, diaryDate: "2026-08-03", plannedTime: null, id: "livre" },
  ];

  it("ordena por horário e ignora o que já teve desfecho", () => {
    const next = upcomingMeals(meals, now("2026-08-03", 14));
    expect(next.map((m) => m.id)).toEqual(["lanche", "jantar", "livre"]);
  });

  it("respeita o limite", () => {
    expect(upcomingMeals(meals, now("2026-08-03", 14), 1).map((m) => m.id)).toEqual(["lanche"]);
  });
});

/* ═══════════════════ Planejado × consumido ═══════════════════ */

describe("comparePlannedVsConsumed — o plano nunca é reescrito", () => {
  const arroz = { baseQuantity: 100, baseUnit: "g" as const, nutrients: [disponivel("energia_kcal", 128)] };
  const frango = { baseQuantity: 100, baseUnit: "g" as const, nutrients: [disponivel("energia_kcal", 163)] };

  const context = {
    foodNames: new Map([
      ["f-arroz", "Arroz, tipo 1, cozido"],
      ["f-frango", "Frango, peito, grelhado"],
    ]),
    foodData: new Map([
      ["f-arroz", arroz],
      ["f-frango", frango],
    ]),
    measures: new Map(),
  };

  const plannedItem = (patch: Partial<PlannedMealItem>): PlannedMealItem => ({
    id: "pi-1",
    plannedMealId: "pm-1",
    foodId: "f-arroz",
    customLabel: null,
    quantity: 150,
    measureId: null,
    measureLabel: null,
    isOptional: false,
    notes: null,
    position: 0,
    ...patch,
  });

  it("consumo integral: tudo 'igual' e a diferença é zero", () => {
    const items = [plannedItem({})];
    const entries = [
      entry({ name: "Arroz, tipo 1, cozido", nutrients: arroz.nutrients, quantity: 150, plannedItemId: "pi-1", changeKind: "igual" }),
    ];

    const result = comparePlannedVsConsumed(items, entries, context);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].kind).toBe("igual");
    expect(result.diff.energia_kcal.diff).toBeCloseTo(0, 10);
    expect(followedPlan(result.rows)).toBe(true);
    expect(suggestMealStatus(result.rows)).toBe("consumida");
  });

  it("quantidade ajustada mostra a diferença nutricional", () => {
    const items = [plannedItem({})];
    const entries = [
      entry({ name: "Arroz, tipo 1, cozido", nutrients: arroz.nutrients, quantity: 100, plannedItemId: "pi-1", changeKind: "quantidade_ajustada" }),
    ];

    const result = comparePlannedVsConsumed(items, entries, context);
    expect(result.planned.energia_kcal.amount).toBeCloseTo(192, 10); // 128 × 1,5
    expect(result.consumed.energia_kcal.amount).toBeCloseTo(128, 10);
    expect(result.diff.energia_kcal.diff).toBeCloseTo(-64, 10);
    expect(followedPlan(result.rows)).toBe(false);
    expect(suggestMealStatus(result.rows)).toBe("consumida");
  });

  it("substituição registra os dois lados sem apagar o planejado", () => {
    const items = [plannedItem({})];
    const entries = [
      entry({ name: "Frango, peito, grelhado", nutrients: frango.nutrients, quantity: 150, plannedItemId: "pi-1", changeKind: "substituido" }),
    ];

    const result = comparePlannedVsConsumed(items, entries, context);
    expect(result.rows[0].plannedLabel).toBe("Arroz, tipo 1, cozido");
    expect(result.rows[0].consumedLabel).toBe("Frango, peito, grelhado");
    expect(suggestMealStatus(result.rows)).toBe("substituida");
  });

  it("item removido não soma, mas aparece no comparativo", () => {
    const items = [plannedItem({ id: "pi-1" }), plannedItem({ id: "pi-2", foodId: "f-frango", quantity: 100 })];
    const entries = [
      entry({ name: "Arroz", nutrients: arroz.nutrients, quantity: 150, plannedItemId: "pi-1", changeKind: "igual" }),
      entry({ name: "Frango", nutrients: frango.nutrients, quantity: 100, plannedItemId: "pi-2", changeKind: "removido" }),
    ];

    const result = comparePlannedVsConsumed(items, entries, context);
    expect(result.rows.map((r) => r.kind)).toEqual(["igual", "removido"]);
    expect(result.planned.energia_kcal.amount).toBeCloseTo(192 + 163, 10);
    expect(result.consumed.energia_kcal.amount).toBeCloseTo(192, 10);
    expect(suggestMealStatus(result.rows)).toBe("parcialmente_consumida");
  });

  it("item extra aparece sem par no planejamento", () => {
    const items = [plannedItem({})];
    const entries = [
      entry({ name: "Arroz", nutrients: arroz.nutrients, quantity: 150, plannedItemId: "pi-1", changeKind: "igual" }),
      entry({ name: "Brigadeiro", nutrients: [disponivel("energia_kcal", 400)], quantity: 50 }),
    ];

    const result = comparePlannedVsConsumed(items, entries, context);
    const extra = result.rows.find((row) => row.kind === "extra");
    expect(extra?.plannedItemId).toBeNull();
    expect(extra?.consumedLabel).toBe("Brigadeiro");
    expect(result.diff.energia_kcal.diff).toBeCloseTo(200, 10); // 400 × 0,5
    expect(followedPlan(result.rows)).toBe(false);
  });

  it("nada registrado: 'nao_registrado' e status sugerido 'não consumida'", () => {
    const result = comparePlannedVsConsumed([plannedItem({})], [], context);
    expect(result.rows[0].kind).toBe("nao_registrado");
    expect(result.consumed).toEqual({});
    expect(suggestMealStatus(result.rows)).toBe("nao_consumida");
  });

  it("item opcional não registrado não conta contra o plano", () => {
    const items = [plannedItem({ id: "pi-1" }), plannedItem({ id: "pi-2", isOptional: true })];
    const entries = [
      entry({ name: "Arroz", nutrients: arroz.nutrients, quantity: 150, plannedItemId: "pi-1", changeKind: "igual" }),
    ];

    const result = comparePlannedVsConsumed(items, entries, context);
    expect(followedPlan(result.rows)).toBe(true);
    expect(suggestMealStatus(result.rows)).toBe("consumida");
  });

  it("item livre sem alimento deixa o planejado PARCIAL, nunca zero", () => {
    const items = [
      plannedItem({ id: "pi-1" }),
      plannedItem({ id: "pi-2", foodId: null, quantity: null, customLabel: "Salada à vontade" }),
    ];
    const result = comparePlannedVsConsumed(items, [], context);

    expect(result.planned.energia_kcal.quality).toBe("parcial");
    expect(result.planned.energia_kcal.missing).toBe(1);
    expect(result.rows[1].plannedLabel).toBe("Salada à vontade");
  });

  it("alimento excluído do catálogo não zera o planejado — marca parcial", () => {
    const items = [plannedItem({ id: "pi-1", foodId: "f-sumiu" })];
    const result = comparePlannedVsConsumed(items, [], context);
    expect(result.planned).toEqual({});
    expect(result.rows[0].plannedLabel).toBeNull();
  });

  it("refeição só com extras é sugerida como fora do planejamento", () => {
    const entries = [entry({ name: "Pastel", nutrients: [disponivel("energia_kcal", 300)] })];
    const result = comparePlannedVsConsumed([], entries, context);
    expect(suggestMealStatus(result.rows)).toBe("fora_do_planejamento");
  });

  it("sem plano e sem consumo, o status sugerido continua 'planejada'", () => {
    expect(suggestMealStatus([])).toBe("planejada");
  });
});

describe("plannedItemBag — o plano usa o catálogo ATUAL", () => {
  const food = { baseQuantity: 100, baseUnit: "g" as const, nutrients: [disponivel("proteina", 20)] };

  it("calcula quando há alimento, quantidade e conversão", () => {
    const bag = plannedItemBag({ quantity: 200, foodId: "f" }, food, null);
    expect(bag.proteina.amount).toBeCloseTo(40, 10);
  });

  it("devolve conjunto vazio (= ausente, logo parcial) sem alimento", () => {
    expect(plannedItemBag({ quantity: 200, foodId: null }, null, null)).toEqual({});
  });

  it("devolve conjunto vazio quando a conversão é impossível", () => {
    const bebida = { ...food, baseUnit: "ml" as const };
    const bag = plannedItemBag({ quantity: 1, foodId: "f" }, bebida, {
      label: "Colher",
      grams: 15,
      milliliters: null,
    });
    expect(bag).toEqual({});
  });
});

/* ═══════════════════ Agrupamento e ordenação ═══════════════════ */

describe("agrupamento e ordenação", () => {
  it("agrupa refeições por data", () => {
    const grouped = groupMealsByDate([
      { diaryDate: "2026-08-03", id: 1 },
      { diaryDate: "2026-08-03", id: 2 },
      { diaryDate: "2026-08-04", id: 3 },
    ]);
    expect(grouped.get("2026-08-03")).toHaveLength(2);
    expect(grouped.get("2026-08-04")).toHaveLength(1);
  });

  it("ordena por horário e joga o que não tem hora para o fim", () => {
    const sorted = sortMealsByTime([
      { plannedTime: null, position: 5, id: "livre" },
      { plannedTime: "19:30:00", position: 2, id: "jantar" },
      { plannedTime: "07:00:00", position: 1, id: "cafe" },
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["cafe", "jantar", "livre"]);
  });

  it("empata pelo campo de posição quando não há horário", () => {
    const sorted = sortMealsByTime([
      { plannedTime: null, position: 3, id: "b" },
      { plannedTime: null, position: 1, id: "a" },
    ]);
    expect(sorted.map((m) => m.id)).toEqual(["a", "b"]);
  });
});
