import { describe, expect, it } from "vitest";
import {
  CORE_NUTRIENTS,
  type NutrientTotalQuality,
  type NutrientValueState,
} from "./constants";
import {
  adherenceRanking,
  buildDailyReports,
  diaryFrequency,
  marketSpendReport,
  nutrientReport,
  nutrientSeries,
  substitutionRanking,
  summarizePeriod,
  topFoods,
  topMeals,
} from "./reports";
import type {
  DiaryEntry,
  DiaryMeal,
  GoalItemRow,
  GoalPeriod,
  NutrientDefinition,
  NutrientSnapshotBag,
  ShoppingList,
  ShoppingListItem,
  SubstitutionLog,
} from "./types";

/* ───────────────────────────── Fixtures ───────────────────────────── */

const E = CORE_NUTRIENTS.energia;
const P = CORE_NUTRIENTS.proteina;
const FERRO = "ferro";

/**
 * Um item do diário. O que importa nos testes é o `nutrients_snapshot` — que é de onde TODO
 * total sai. Nenhum teste deste arquivo passa um alimento do catálogo em lugar nenhum.
 */
type SnapshotSpec = {
  amount: number | null;
  state: NutrientValueState;
  quality?: NutrientTotalQuality;
};

function entry(
  id: string,
  name: string,
  snapshot: Record<string, SnapshotSpec>,
  overrides: Partial<DiaryEntry> = {},
): DiaryEntry {
  const bag: NutrientSnapshotBag = {};
  for (const [code, value] of Object.entries(snapshot)) {
    bag[code] = {
      amount: value.amount,
      state: value.state,
      method: "analitico",
      ...(value.quality ? { quality: value.quality } : {}),
    };
  }

  return {
    id,
    diaryMealId: "meal",
    foodId: `food-${id}`,
    recipeId: null,
    mealTemplateId: null,
    entryKind: "alimento",
    plannedItemId: null,
    changeKind: "igual",
    changedAt: null,
    foodNameSnapshot: name,
    preparationStateSnapshot: null,
    brandSnapshot: null,
    quantity: 100,
    measureLabel: null,
    gramsEquivalent: 100,
    baseQuantity: 100,
    baseUnit: "g",
    sourceIdSnapshot: null,
    sourceNameSnapshot: null,
    sourceVersionSnapshot: null,
    sourceFoodCodeSnapshot: null,
    nutrientsSnapshot: bag,
    energyKcal: snapshot[E]?.state === "disponivel" ? snapshot[E].amount : null,
    proteinG: snapshot[P]?.state === "disponivel" ? snapshot[P].amount : null,
    carbG: null,
    fatG: null,
    fiberG: null,
    notes: null,
    position: 0,
    ...overrides,
  };
}

function meal(date: string, entries: DiaryEntry[], overrides: Partial<DiaryMeal> = {}): DiaryMeal {
  return {
    id: `meal-${date}-${overrides.mealTypeId ?? "cafe"}`,
    diaryDate: date,
    mealTypeId: "cafe",
    mealTypeName: "Café da manhã",
    mealTypeIcon: null,
    plannedMealId: null,
    plannedTime: null,
    consumedTime: null,
    status: "consumida",
    title: null,
    notes: null,
    position: 0,
    entries,
    ...overrides,
  };
}

function goalItem(code: string, amount: number, overrides: Partial<GoalItemRow> = {}): GoalItemRow {
  return {
    id: `gi-${code}-${amount}`,
    periodId: "p",
    nutrientCode: code,
    weekday: null,
    dayKind: null,
    mealTypeId: null,
    targetAmount: amount,
    targetPercent: null,
    minAmount: null,
    maxAmount: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function period(
  id: string,
  startsOn: string,
  endsOn: string | null,
  items: GoalItemRow[],
): GoalPeriod {
  return {
    id,
    name: id,
    reason: null,
    startsOn,
    endsOn,
    goalType: "fixa",
    notes: null,
    isActive: true,
    createdAt: `${startsOn}T00:00:00Z`,
    items: items.map((item) => ({ ...item, periodId: id })),
  };
}

const definitions: Record<string, NutrientDefinition> = {
  [E]: { code: E, name: "Energia", shortName: null, unit: "kcal", group: "energia", position: 1, isCore: true, precision: 0 },
  [P]: { code: P, name: "Proteína", shortName: null, unit: "g", group: "macro", position: 2, isCore: true, precision: 1 },
  [FERRO]: { code: FERRO, name: "Ferro", shortName: null, unit: "mg", group: "mineral", position: 30, isCore: false, precision: 2 },
};

const disponivel = (amount: number): SnapshotSpec => ({ amount, state: "disponivel" });
const naoDisponivel: SnapshotSpec = { amount: null, state: "nao_disponivel" };
const traco: SnapshotSpec = { amount: null, state: "traco" };

/* ═══════════════════════════ Agregação do período ═══════════════════════════ */

describe("buildDailyReports — agregação a partir do SNAPSHOT", () => {
  const meals = [
    meal("2026-03-02", [entry("a", "Arroz", { [E]: disponivel(200), [P]: disponivel(4) })]),
    meal("2026-03-04", [entry("b", "Feijão", { [E]: disponivel(100), [P]: disponivel(6) })]),
  ];

  it("devolve um relatório por dia do intervalo, inclusive os sem registro", () => {
    const daily = buildDailyReports(meals, [], "2026-03-01", "2026-03-05");
    expect(daily).toHaveLength(5);
    expect(daily.map((day) => day.date)).toEqual([
      "2026-03-01",
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ]);
  });

  it("dia sem registro é marcado como tal — não some nem vira consumo zero", () => {
    const daily = buildDailyReports(meals, [], "2026-03-01", "2026-03-05");
    expect(daily[0].hasRecord).toBe(false);
    expect(daily[1].hasRecord).toBe(true);
    expect(daily[2].hasRecord).toBe(false);
  });

  it("soma o total de cada dia a partir do snapshot", () => {
    const daily = buildDailyReports(meals, [], "2026-03-01", "2026-03-05");
    expect(daily[1].totals[E].amount).toBe(200);
    expect(daily[3].totals[P].amount).toBe(6);
  });

  it("ignora refeições fora do intervalo pedido", () => {
    const daily = buildDailyReports(
      [...meals, meal("2026-05-01", [entry("z", "Fora", { [E]: disponivel(999) })])],
      [],
      "2026-03-01",
      "2026-03-05",
    );
    expect(daily.every((day) => (day.totals[E]?.amount ?? 0) !== 999)).toBe(true);
  });

  it("item removido não conta como consumido", () => {
    const daily = buildDailyReports(
      [
        meal("2026-03-02", [
          entry("a", "Arroz", { [E]: disponivel(200) }),
          entry("b", "Pão", { [E]: disponivel(150) }, { changeKind: "removido" }),
        ]),
      ],
      [],
      "2026-03-02",
      "2026-03-02",
    );
    expect(daily[0].totals[E].amount).toBe(200);
  });
});

describe("⛔ A META DE UM DIA É A QUE VALIA NELE (relatório retroativo)", () => {
  // Em janeiro a meta era 1800 kcal; em março passou para 2500.
  const periods = [
    period("janeiro", "2026-01-01", "2026-02-28", [goalItem(E, 1800)]),
    period("marco", "2026-03-01", null, [goalItem(E, 2500)]),
  ];

  const meals = [
    meal("2026-01-10", [entry("a", "Dia de janeiro", { [E]: disponivel(1800) })]),
    meal("2026-03-10", [entry("b", "Dia de março", { [E]: disponivel(1800) })]),
  ];

  it("o dia de janeiro é avaliado pela meta de JANEIRO, não pela atual", () => {
    const daily = buildDailyReports(meals, periods, "2026-01-10", "2026-01-10");
    expect(daily[0].targets[E].amount).toBe(1800);
    expect(daily[0].progress[E].percent).toBeCloseTo(100, 6);
  });

  it("o MESMO consumo em março é avaliado pela meta de março", () => {
    const daily = buildDailyReports(meals, periods, "2026-03-10", "2026-03-10");
    expect(daily[0].targets[E].amount).toBe(2500);
    expect(daily[0].progress[E].percent).toBeCloseTo(72, 6);
  });

  it("um relatório que cruza a virada usa as duas metas, cada uma no seu dia", () => {
    const daily = buildDailyReports(meals, periods, "2026-01-10", "2026-03-10");
    const janeiro = daily.find((day) => day.date === "2026-01-10");
    const marco = daily.find((day) => day.date === "2026-03-10");
    expect(janeiro?.targets[E].amount).toBe(1800);
    expect(marco?.targets[E].amount).toBe(2500);
  });

  it("dia anterior a qualquer período não ganha meta — nunca a 'meta de agora'", () => {
    const daily = buildDailyReports(meals, periods, "2025-12-01", "2025-12-01");
    expect(daily[0].targets[E]).toBeUndefined();
    expect(daily[0].adherence.percent).toBeNull();
  });
});

describe("propagação de qualidade — PARCIAL NÃO VIRA EXATO", () => {
  const meals = [
    meal("2026-03-01", [entry("a", "Completo", { [E]: disponivel(500), [FERRO]: disponivel(2) })]),
    // Este dia tem um item SEM ferro analisado: o total do ferro é um piso.
    meal("2026-03-02", [
      entry("b", "Completo", { [E]: disponivel(500), [FERRO]: disponivel(3) }),
      entry("c", "Sem ferro analisado", { [E]: disponivel(200), [FERRO]: naoDisponivel }),
    ]),
  ];

  it("o dia com item faltando fica PARCIAL", () => {
    const daily = buildDailyReports(meals, [], "2026-03-01", "2026-03-02");
    expect(daily[0].totals[FERRO].quality).toBe("exato");
    expect(daily[1].totals[FERRO].quality).toBe("parcial");
  });

  it("um dia parcial torna o PERÍODO INTEIRO parcial", () => {
    const daily = buildDailyReports(meals, [], "2026-03-01", "2026-03-02");
    const summary = summarizePeriod(daily, "2026-03-01", "2026-03-02");
    expect(summary.totals[FERRO].quality).toBe("parcial");
    expect(summary.quality).toBe("parcial");
  });

  it("a média do período TAMBÉM continua parcial — dividir não melhora o dado", () => {
    const daily = buildDailyReports(meals, [], "2026-03-01", "2026-03-02");
    const summary = summarizePeriod(daily, "2026-03-01", "2026-03-02");
    expect(summary.averagePerDay[FERRO].quality).toBe("parcial");
    expect(summary.averagePerRecordedDay[FERRO].quality).toBe("parcial");
  });

  it("traço deixa o total APROXIMADO, não exato nem parcial", () => {
    const comTraco = [
      meal("2026-03-01", [
        entry("a", "Com valor", { [FERRO]: disponivel(2) }),
        entry("b", "Traço", { [FERRO]: traco }),
      ]),
    ];
    const daily = buildDailyReports(comTraco, [], "2026-03-01", "2026-03-01");
    expect(daily[0].totals[FERRO].quality).toBe("aproximado");
  });

  it("período todo exato permanece exato", () => {
    const soExatos = [meal("2026-03-01", [entry("a", "Ok", { [E]: disponivel(500) })])];
    const daily = buildDailyReports(soExatos, [], "2026-03-01", "2026-03-01");
    expect(summarizePeriod(daily, "2026-03-01", "2026-03-01").quality).toBe("exato");
  });
});

describe("summarizePeriod — as duas médias", () => {
  // 4 dias de intervalo, só 2 com registro, 1000 kcal cada.
  const meals = [
    meal("2026-03-01", [entry("a", "A", { [E]: disponivel(1000) })]),
    meal("2026-03-03", [entry("b", "B", { [E]: disponivel(1000) })]),
  ];
  const daily = buildDailyReports(meals, [], "2026-03-01", "2026-03-04");
  const summary = summarizePeriod(daily, "2026-03-01", "2026-03-04");

  it("soma o período inteiro", () => {
    expect(summary.totals[E].amount).toBe(2000);
  });

  it("conta os dias pedidos e os dias com registro separadamente", () => {
    expect(summary.totalDays).toBe(4);
    expect(summary.daysWithRecord).toBe(2);
  });

  it("média por dia de CALENDÁRIO divide por 4", () => {
    expect(summary.averagePerDay[E].amount).toBe(500);
  });

  it("média por dia COM REGISTRO divide por 2 — 'não anotei' ≠ 'não comi'", () => {
    expect(summary.averagePerRecordedDay[E].amount).toBe(1000);
  });

  it("período sem registro nenhum não vira NaN", () => {
    const vazio = buildDailyReports([], [], "2026-03-01", "2026-03-04");
    const resumo = summarizePeriod(vazio, "2026-03-01", "2026-03-04");
    expect(resumo.daysWithRecord).toBe(0);
    expect(resumo.averagePerRecordedDay).toEqual({});
    expect(resumo.adherence.percent).toBeNull();
  });

  it("aderência média só considera dias que TINHAM meta", () => {
    const periods = [period("p", "2026-03-03", null, [goalItem(E, 1000)])];
    const comMeta = buildDailyReports(meals, periods, "2026-03-01", "2026-03-04");
    const resumo = summarizePeriod(comMeta, "2026-03-01", "2026-03-04");
    // 01/03 tem registro mas não tinha meta ainda; 04/03 tem meta mas não tem registro.
    // Sobra só 03/03, que tinha os dois.
    expect(resumo.adherence.counted).toBe(1);
    expect(resumo.adherence.percent).toBeCloseTo(100, 6);
  });

  it("⛔ dia COM META e SEM REGISTRO não entra como 0% — 'esqueci de anotar' ≠ 'falhei'", () => {
    const periods = [period("p", "2026-03-01", null, [goalItem(E, 1000)])];
    // 01 e 03 registrados (1000 kcal = 100%); 02 e 04 sem registro nenhum.
    const comMeta = buildDailyReports(meals, periods, "2026-03-01", "2026-03-04");
    const resumo = summarizePeriod(comMeta, "2026-03-01", "2026-03-04");
    expect(resumo.adherence.counted).toBe(2);
    // Se os dias vazios contassem como 0%, a média cairia para 50%.
    expect(resumo.adherence.percent).toBeCloseTo(100, 6);
  });
});

describe("adherenceRanking", () => {
  const periods = [period("p", "2026-03-01", null, [goalItem(E, 1000)])];
  const meals = [
    meal("2026-03-01", [entry("a", "A", { [E]: disponivel(1000) })]), // 100%
    meal("2026-03-02", [entry("b", "B", { [E]: disponivel(500) })]), // 50%
    meal("2026-03-03", [entry("c", "C", { [E]: disponivel(900) })]), // 90%
  ];
  const daily = buildDailyReports(meals, periods, "2026-03-01", "2026-03-04");

  it("ordena do melhor para o pior", () => {
    const { best, worst } = adherenceRanking(daily);
    expect(best[0].date).toBe("2026-03-01");
    expect(worst[0].date).toBe("2026-03-02");
  });

  it("dia SEM REGISTRO não entra como pior — esquecer de anotar não é falhar na meta", () => {
    const { worst } = adherenceRanking(daily);
    expect(worst.some((day) => day.date === "2026-03-04")).toBe(false);
  });

  it("respeita o limite pedido", () => {
    expect(adherenceRanking(daily, 2).best).toHaveLength(2);
  });
});

/* ═══════════════════════════ Micronutrientes ═══════════════════════════ */

describe("nutrientReport — o relatório de MICRONUTRIENTES", () => {
  const meals = [
    meal("2026-03-01", [entry("a", "A", { [E]: disponivel(500), [FERRO]: disponivel(2) })]),
    meal("2026-03-02", [
      entry("b", "B", { [E]: disponivel(500), [FERRO]: disponivel(3) }),
      entry("c", "Sem ferro", { [E]: disponivel(100), [FERRO]: naoDisponivel }),
    ]),
  ];
  const daily = buildDailyReports(meals, [], "2026-03-01", "2026-03-02");
  const summary = summarizePeriod(daily, "2026-03-01", "2026-03-02");

  it("filtra por grupo — minerais e vitaminas viram uma seção própria", () => {
    const rows = nutrientReport(daily, summary, definitions, ["mineral"]);
    expect(rows.map((row) => row.code)).toEqual([FERRO]);
  });

  it("traz total e média por dia com registro", () => {
    const [ferro] = nutrientReport(daily, summary, definitions, ["mineral"]);
    expect(ferro.amount).toBe(5);
    expect(ferro.averagePerDay).toBeCloseTo(2.5, 6);
  });

  it("conta em quantos dias o dado estava INCOMPLETO — o total é um piso", () => {
    const [ferro] = nutrientReport(daily, summary, definitions, ["mineral"]);
    expect(ferro.daysWithValue).toBe(2);
    expect(ferro.daysIncomplete).toBe(1);
    expect(ferro.quality).toBe("parcial");
  });

  it("sem meta no período, percent é null — 0% e 'sem meta' são coisas diferentes", () => {
    const [ferro] = nutrientReport(daily, summary, definitions, ["mineral"]);
    expect(ferro.target).toBeNull();
    expect(ferro.percent).toBeNull();
  });

  it("a meta comparada é a MÉDIA das vigentes no período, não a de hoje", () => {
    const periods = [
      period("a", "2026-03-01", "2026-03-01", [goalItem(FERRO, 10)]),
      period("b", "2026-03-02", null, [goalItem(FERRO, 20)]),
    ];
    const d = buildDailyReports(meals, periods, "2026-03-01", "2026-03-02");
    const s = summarizePeriod(d, "2026-03-01", "2026-03-02");
    const [ferro] = nutrientReport(d, s, definitions, ["mineral"]);
    expect(ferro.target).toBe(15);
  });

  it("ignora nutriente sem definição em vez de exibir um código cru", () => {
    const rows = nutrientReport(daily, summary, {}, undefined);
    expect(rows).toEqual([]);
  });

  it("sem filtro de grupo, devolve tudo em ordem de posição", () => {
    const rows = nutrientReport(daily, summary, definitions);
    expect(rows.map((row) => row.code)).toEqual([E, FERRO]);
  });
});

/* ═══════════════════════════ Rankings ═══════════════════════════ */

describe("topFoods", () => {
  const meals = [
    meal("2026-03-01", [
      entry("a", "Arroz", { [E]: disponivel(200) }),
      entry("b", "Feijão", { [E]: disponivel(100) }),
    ]),
    meal("2026-03-02", [entry("c", "Arroz", { [E]: disponivel(200) })]),
    meal("2026-03-03", [entry("d", "Arroz", { [E]: disponivel(200) })]),
  ];

  it("ordena pelo número de vezes", () => {
    const top = topFoods(meals);
    expect(top[0].label).toBe("Arroz");
    expect(top[0].times).toBe(3);
    expect(top[0].days).toBe(3);
  });

  it("agrupa pelo NOME CONGELADO — sobrevive ao alimento excluído do catálogo", () => {
    const excluido = [
      meal("2026-03-01", [entry("a", "Arroz", { [E]: disponivel(200) }, { foodId: null })]),
      meal("2026-03-02", [entry("b", "Arroz", { [E]: disponivel(200) }, { foodId: null })]),
    ];
    const top = topFoods(excluido);
    expect(top).toHaveLength(1);
    expect(top[0].times).toBe(2);
  });

  it("ocorrência sem energia é contada à parte — o total não finge estar completo", () => {
    const semEnergia = [
      meal("2026-03-01", [
        entry("a", "Arroz", { [E]: disponivel(200) }),
        entry("b", "Arroz", { [E]: naoDisponivel }),
      ]),
    ];
    const [arroz] = topFoods(semEnergia);
    expect(arroz.energyKcal).toBe(200);
    expect(arroz.withoutEnergy).toBe(1);
  });

  it("alimento com energia em NENHUMA ocorrência tem energyKcal null, não 0", () => {
    const [row] = topFoods([meal("2026-03-01", [entry("a", "X", { [E]: naoDisponivel })])]);
    expect(row.energyKcal).toBeNull();
    expect(row.withoutEnergy).toBe(1);
  });

  it("item removido não entra no ranking", () => {
    const top = topFoods([
      meal("2026-03-01", [entry("a", "Bolo", { [E]: disponivel(400) }, { changeKind: "removido" })]),
    ]);
    expect(top).toEqual([]);
  });

  it("respeita o limite", () => {
    expect(topFoods(meals, 1)).toHaveLength(1);
  });
});

describe("topMeals", () => {
  it("conta refeições registradas por tipo", () => {
    const meals = [
      meal("2026-03-01", [entry("a", "A", { [E]: disponivel(300) })], { mealTypeId: "cafe", mealTypeName: "Café" }),
      meal("2026-03-02", [entry("b", "B", { [E]: disponivel(300) })], { mealTypeId: "cafe", mealTypeName: "Café" }),
      meal("2026-03-02", [entry("c", "C", { [E]: disponivel(600) })], { mealTypeId: "almoco", mealTypeName: "Almoço" }),
    ];
    const top = topMeals(meals);
    expect(top[0].name).toBe("Café");
    expect(top[0].times).toBe(2);
    expect(top[0].energyKcal).toBe(600);
  });

  it("refeição sem nenhum item não conta como registrada", () => {
    expect(topMeals([meal("2026-03-01", [])])).toEqual([]);
  });
});

describe("substitutionRanking — histórico gravado desde a 16-C", () => {
  const log = (
    id: string,
    original: string,
    replacement: string,
    appliedOn: string,
    delta: number | null,
  ): SubstitutionLog => ({
    id,
    groupId: "g",
    optionId: "o",
    level: "alimento",
    appliedOn,
    diaryMealId: null,
    diaryEntryId: null,
    originalLabel: original,
    originalQuantity: 100,
    originalMeasureLabel: null,
    replacementLabel: replacement,
    replacementQuantity: 100,
    replacementMeasureLabel: null,
    deltaEnergyKcal: delta,
    deltaProteinG: null,
    deltaCarbG: null,
    deltaFatG: null,
    deltaFiberG: null,
    reason: null,
    createdAt: `${appliedOn}T10:00:00Z`,
  });

  it("agrupa por par original → alternativa e conta as vezes", () => {
    const ranking = substitutionRanking([
      log("1", "Arroz branco", "Arroz integral", "2026-03-01", -20),
      log("2", "Arroz branco", "Arroz integral", "2026-03-05", -20),
      log("3", "Pão", "Tapioca", "2026-03-02", 10),
    ]);
    expect(ranking[0].originalLabel).toBe("Arroz branco");
    expect(ranking[0].times).toBe(2);
    expect(ranking[0].deltaEnergyKcal).toBe(-40);
    expect(ranking[0].lastAppliedOn).toBe("2026-03-05");
  });

  it("troca sem diferença registrada é contada à parte, não como zero", () => {
    const ranking = substitutionRanking([
      log("1", "A", "B", "2026-03-01", null),
      log("2", "A", "B", "2026-03-02", -30),
    ]);
    expect(ranking[0].deltaEnergyKcal).toBe(-30);
    expect(ranking[0].withoutDelta).toBe(1);
  });

  it("sem histórico, devolve lista vazia", () => {
    expect(substitutionRanking([])).toEqual([]);
  });
});

/* ═══════════════════════════ Gasto com mercado ═══════════════════════════ */

describe("marketSpendReport — REUSA summarizeShoppingList", () => {
  const item = (
    id: string,
    status: ShoppingListItem["status"],
    actual: number | null,
    estimated: number | null = null,
  ): ShoppingListItem => ({
    id,
    listId: "l1",
    categoryId: null,
    categoryName: null,
    foodId: null,
    recipeId: null,
    label: id,
    brand: null,
    quantity: 1,
    unit: "un",
    consolidationKey: null,
    quantityOverridden: false,
    origins: [],
    separateReason: null,
    isManual: false,
    status,
    priority: "normal",
    estimatedPriceCents: estimated,
    actualPriceCents: actual,
    store: null,
    note: null,
    position: 0,
    purchasedAt: null,
  });

  const list = (id: string, items: ShoppingListItem[]): ShoppingList => ({
    id,
    name: `Lista ${id}`,
    notes: null,
    status: "concluida",
    sourceKind: "periodo",
    sourceFrom: "2026-03-01",
    sourceTo: "2026-03-07",
    store: null,
    recurrence: "nenhuma",
    recurrenceKey: null,
    pantryAppliedAt: null,
    isArchived: false,
    createdAt: "2026-03-01T00:00:00Z",
    updatedAt: "2026-03-07T00:00:00Z",
    items,
  });

  it("soma os centavos realmente pagos", () => {
    const report = marketSpendReport([
      list("a", [item("arroz", "comprado", 1250), item("feijao", "comprado", 890)]),
    ]);
    expect(report.realCents).toBe(2140);
    expect(report.lists).toBe(1);
  });

  it("conta os itens SEM preço — o total é um piso, não o gasto real", () => {
    const report = marketSpendReport([
      list("a", [item("arroz", "comprado", 1250), item("sal", "comprado", null)]),
    ]);
    expect(report.realCents).toBe(1250);
    expect(report.itemsWithoutPrice).toBe(1);
  });

  it("item REMOVIDO não entra na conta (mesma regra de summarizeShoppingList)", () => {
    const report = marketSpendReport([
      list("a", [item("arroz", "comprado", 1000), item("nao_vou", "removido", 9999)]),
    ]);
    expect(report.realCents).toBe(1000);
  });

  it("nenhum preço em lugar nenhum não é 'gastou R$ 0,00'", () => {
    const report = marketSpendReport([list("a", [item("arroz", "comprado", null)])]);
    expect(report.hasAnyPrice).toBe(false);
    expect(report.realCents).toBe(0);
    expect(report.itemsWithoutPrice).toBe(1);
  });

  it("soma várias listas e ordena por gasto", () => {
    const report = marketSpendReport([
      list("a", [item("x", "comprado", 500)]),
      list("b", [item("y", "comprado", 3000)]),
    ]);
    expect(report.realCents).toBe(3500);
    expect(report.byList[0].id).toBe("b");
  });

  it("sem listas, devolve zeros sem estourar", () => {
    const report = marketSpendReport([]);
    expect(report.lists).toBe(0);
    expect(report.hasAnyPrice).toBe(false);
  });
});

/* ═══════════════════════════ Frequência e série ═══════════════════════════ */

describe("diaryFrequency", () => {
  const meals = [
    meal("2026-03-01", [entry("a", "A", { [E]: disponivel(100) })]),
    meal("2026-03-02", [entry("b", "B", { [E]: disponivel(100) })]),
    meal("2026-03-06", [entry("c", "C", { [E]: disponivel(100) })]),
  ];

  it("conta os dias com registro sobre os dias do período", () => {
    const freq = diaryFrequency(buildDailyReports(meals, [], "2026-03-01", "2026-03-07"));
    expect(freq.totalDays).toBe(7);
    expect(freq.daysWithRecord).toBe(3);
    expect(freq.percent).toBeCloseTo((3 / 7) * 100, 6);
  });

  it("calcula a maior sequência com e sem registro", () => {
    const freq = diaryFrequency(buildDailyReports(meals, [], "2026-03-01", "2026-03-07"));
    expect(freq.longestStreak).toBe(2); // 01 e 02
    expect(freq.longestGap).toBe(3); // 03, 04, 05
  });

  it("período vazio não vira NaN", () => {
    const freq = diaryFrequency([]);
    expect(freq.percent).toBeNull();
    expect(freq.longestStreak).toBe(0);
  });
});

describe("nutrientSeries — buraco não é zero", () => {
  const meals = [meal("2026-03-01", [entry("a", "A", { [E]: disponivel(1500) })])];
  const periods = [period("p", "2026-03-01", null, [goalItem(E, 2000)])];

  it("dia sem registro tem value null, para o gráfico INTERROMPER a linha", () => {
    const series = nutrientSeries(buildDailyReports(meals, periods, "2026-03-01", "2026-03-03"), E);
    expect(series[0].value).toBe(1500);
    expect(series[1].value).toBeNull();
    expect(series[2].value).toBeNull();
  });

  it("dia COM registro mas sem aquele nutriente vale 0 de verdade (foi medido)", () => {
    const semNutriente = [meal("2026-03-01", [entry("a", "A", { [P]: disponivel(10) })])];
    const series = nutrientSeries(buildDailyReports(semNutriente, [], "2026-03-01", "2026-03-01"), E);
    expect(series[0].value).toBe(0);
  });

  it("a meta acompanha a série, dia a dia", () => {
    const series = nutrientSeries(buildDailyReports(meals, periods, "2026-03-01", "2026-03-02"), E);
    expect(series[0].target).toBe(2000);
  });
});
