import { describe, expect, it } from "vitest";
import { CORE_NUTRIENTS } from "./constants";
import { buildMonthView, cellIntensity, cellLabel, type MonthDayCell } from "./diary-month";
import type {
  DiaryEntry,
  DiaryMeal,
  GoalItemRow,
  GoalPeriod,
  NutrientSnapshotBag,
  PlannedMeal,
} from "./types";

const E = CORE_NUTRIENTS.energia;

function entry(id: string, kcal: number | null, overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id,
    diaryMealId: "m",
    foodId: null,
    recipeId: null,
    mealTemplateId: null,
    entryKind: "alimento",
    plannedItemId: null,
    changeKind: "igual",
    changedAt: null,
    foodNameSnapshot: `Item ${id}`,
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
    nutrientsSnapshot: {
      [E]:
        kcal === null
          ? { amount: null, state: "nao_disponivel", method: "desconhecido" }
          : { amount: kcal, state: "disponivel", method: "analitico" },
    } satisfies NutrientSnapshotBag,
    energyKcal: kcal,
    proteinG: null,
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

function plannedMeal(date: string, id = `p-${date}`): PlannedMeal {
  return {
    id,
    planId: null,
    planDayId: null,
    plannedDate: date,
    mealTypeId: "cafe",
    mealTypeName: "Café da manhã",
    mealTypeIcon: null,
    plannedTime: "08:00",
    title: null,
    notes: null,
    position: 0,
    items: [],
  };
}

function period(startsOn: string, endsOn: string | null, kcal: number): GoalPeriod {
  const item: GoalItemRow = {
    id: `gi-${startsOn}`,
    periodId: `p-${startsOn}`,
    nutrientCode: E,
    weekday: null,
    dayKind: null,
    mealTypeId: null,
    targetAmount: kcal,
    targetPercent: null,
    minAmount: null,
    maxAmount: null,
    notes: null,
    createdAt: `${startsOn}T00:00:00Z`,
  };
  return {
    id: `p-${startsOn}`,
    name: null,
    reason: null,
    startsOn,
    endsOn,
    goalType: "fixa",
    notes: null,
    isActive: true,
    createdAt: `${startsOn}T00:00:00Z`,
    items: [item],
  };
}

/** Agosto de 2026: 01 é sábado, 31 é segunda. */
const now = { hoje: "2026-08-15", minutosAgora: 12 * 60 };

const flat = (view: ReturnType<typeof buildMonthView>): MonthDayCell[] => view.weeks.flat();
const cellOf = (view: ReturnType<typeof buildMonthView>, date: string) =>
  flat(view).find((cell) => cell.date === date);

describe("buildMonthView — grade do mês", () => {
  const view = buildMonthView("2026-08-15", [], [], [], now);

  it("monta semanas completas de 7 dias", () => {
    expect(view.weeks.every((week) => week.length === 7)).toBe(true);
  });

  it("cobre o mês inteiro", () => {
    const dates = flat(view).map((cell) => cell.date);
    expect(dates).toContain("2026-08-01");
    expect(dates).toContain("2026-08-31");
  });

  it("marca os dias vizinhos da borda como fora do mês", () => {
    expect(cellOf(view, "2026-07-31")?.inMonth).toBe(false);
    expect(cellOf(view, "2026-08-01")?.inMonth).toBe(true);
  });

  it("delimita o mês corretamente, com 31 dias em agosto", () => {
    expect(view.monthStart).toBe("2026-08-01");
    expect(view.monthEnd).toBe("2026-08-31");
    expect(view.daily).toHaveLength(31);
  });

  it("respeita o primeiro dia da semana configurável", () => {
    const domingo = buildMonthView("2026-08-15", [], [], [], now, { weekStartDay: 0 });
    expect(domingo.weeks[0][0].date).toBe("2026-07-26"); // domingo
    const segunda = buildMonthView("2026-08-15", [], [], [], now, { weekStartDay: 1 });
    expect(segunda.weeks[0][0].date).toBe("2026-07-27"); // segunda
  });

  it("marca hoje e distingue o futuro", () => {
    expect(cellOf(view, "2026-08-15")?.isToday).toBe(true);
    expect(cellOf(view, "2026-08-16")?.isFuture).toBe(true);
    expect(cellOf(view, "2026-08-14")?.isFuture).toBe(false);
  });

  it("fevereiro de ano bissexto fecha em 29", () => {
    const fev = buildMonthView("2028-02-10", [], [], [], { hoje: "2028-02-10", minutosAgora: 0 });
    expect(fev.monthEnd).toBe("2028-02-29");
    expect(fev.daily).toHaveLength(29);
  });
});

describe("⛔ DIA SEM REGISTRO NÃO É DIA DE ZERO CALORIA", () => {
  const meals = [meal("2026-08-10", [entry("a", 1800)])];
  const view = buildMonthView("2026-08-15", meals, [], [], now);

  it("o dia sem registro tem energyKcal null", () => {
    expect(cellOf(view, "2026-08-11")?.energyKcal).toBeNull();
    expect(cellOf(view, "2026-08-11")?.hasRecord).toBe(false);
  });

  it("nenhuma célula do mês inteiro inventa um zero", () => {
    const semRegistro = flat(view).filter((cell) => !cell.hasRecord);
    expect(semRegistro.every((cell) => cell.energyKcal === null)).toBe(true);
    expect(semRegistro.every((cell) => cell.quality === null)).toBe(true);
  });

  it("o dia com registro mostra o total", () => {
    const cell = cellOf(view, "2026-08-10");
    expect(cell?.energyKcal).toBe(1800);
    expect(cell?.hasRecord).toBe(true);
    expect(cell?.entries).toBe(1);
    expect(cell?.meals).toBe(1);
  });

  it("dia COM registro mas com item sem energia analisada vale 0 e fica PARCIAL", () => {
    const semEnergia = buildMonthView("2026-08-15", [meal("2026-08-12", [entry("x", null)])], [], [], now);
    const cell = cellOf(semEnergia, "2026-08-12");
    expect(cell?.hasRecord).toBe(true);
    expect(cell?.energyKcal).toBe(0);
    expect(cell?.quality).toBe("parcial");
  });
});

describe("meta vigente por dia no calendário", () => {
  // Meta de 1800 até 14/08; 2200 a partir de 15/08.
  const periods = [period("2026-08-01", "2026-08-14", 1800), period("2026-08-15", null, 2200)];
  const meals = [meal("2026-08-10", [entry("a", 1800)]), meal("2026-08-20", [entry("b", 1800)])];
  const view = buildMonthView("2026-08-15", meals, [], periods, now);

  it("cada célula usa a meta que valia NAQUELE dia", () => {
    expect(cellOf(view, "2026-08-10")?.targetKcal).toBe(1800);
    expect(cellOf(view, "2026-08-20")?.targetKcal).toBe(2200);
  });

  it("o MESMO consumo dá percentuais diferentes conforme a meta da época", () => {
    expect(cellOf(view, "2026-08-10")?.goalPercent).toBeCloseTo(100, 6);
    expect(cellOf(view, "2026-08-20")?.goalPercent).toBeCloseTo((1800 / 2200) * 100, 6);
  });

  it("dia sem registro não ganha percentual, mesmo tendo meta", () => {
    const cell = cellOf(view, "2026-08-05");
    expect(cell?.targetKcal).toBe(1800);
    expect(cell?.goalPercent).toBeNull();
    expect(cell?.adherence).toBeNull();
  });
});

describe("planejamento e pendências no calendário", () => {
  it("conta refeições planejadas por dia sem confundir com consumo", () => {
    const view = buildMonthView(
      "2026-08-15",
      [],
      [plannedMeal("2026-08-20"), plannedMeal("2026-08-20", "p2")],
      [],
      now,
    );
    const cell = cellOf(view, "2026-08-20");
    expect(cell?.planned).toBe(2);
    expect(cell?.hasRecord).toBe(false);
    expect(cell?.energyKcal).toBeNull();
  });

  it("ignora linha de modelo (sem data)", () => {
    const modelo: PlannedMeal = { ...plannedMeal("2026-08-20"), plannedDate: null };
    const view = buildMonthView("2026-08-15", [], [modelo], [], now);
    expect(flat(view).every((cell) => cell.planned === 0)).toBe(true);
  });

  it("marca refeição pendente — status DERIVADO, nunca gravado", () => {
    // Refeição de um dia passado que ficou 'planejada' vira pendente na leitura.
    const pendente = meal("2026-08-10", [], { status: "planejada", plannedTime: "08:00" });
    const view = buildMonthView("2026-08-15", [pendente], [], [], now);
    expect(cellOf(view, "2026-08-10")?.pending).toBe(1);
  });

  it("refeição futura ainda planejada não é pendente", () => {
    const futura = meal("2026-08-20", [], { status: "planejada", plannedTime: "08:00" });
    const view = buildMonthView("2026-08-15", [futura], [], [], now);
    expect(cellOf(view, "2026-08-20")?.pending).toBe(0);
  });
});

describe("resumo do mês", () => {
  it("NÃO inclui os dias vizinhos da grade no total do mês", () => {
    const meals = [
      meal("2026-07-31", [entry("julho", 5000)]), // borda: aparece na grade, não no total
      meal("2026-08-05", [entry("agosto", 1000)]),
    ];
    const view = buildMonthView("2026-08-15", meals, [], [], now);
    expect(view.summary.totals[E].amount).toBe(1000);
    // Mas a célula da borda continua mostrando o dado — a grade não mente.
    expect(cellOf(view, "2026-07-31")?.energyKcal).toBe(5000);
  });

  it("conta dias com registro do mês", () => {
    const meals = [meal("2026-08-05", [entry("a", 1000)]), meal("2026-08-06", [entry("b", 1000)])];
    const view = buildMonthView("2026-08-15", meals, [], [], now);
    expect(view.summary.daysWithRecord).toBe(2);
    expect(view.summary.totalDays).toBe(31);
  });

  it("mês vazio não estoura nem vira NaN", () => {
    const view = buildMonthView("2026-08-15", [], [], [], now);
    expect(view.summary.daysWithRecord).toBe(0);
    expect(view.summary.adherence.percent).toBeNull();
  });
});

describe("cellIntensity e cellLabel — leitura textual equivalente", () => {
  const periods = [period("2026-08-01", null, 2000)];
  const view = buildMonthView("2026-08-15", [meal("2026-08-10", [entry("a", 1000)])], [], periods, now);

  it("intensidade é null sem registro — cor neutra, não 'dia ruim'", () => {
    expect(cellIntensity(cellOf(view, "2026-08-11") as MonthDayCell)).toBeNull();
  });

  it("intensidade é null sem meta, mesmo com registro", () => {
    const semMeta = buildMonthView("2026-08-15", [meal("2026-08-10", [entry("a", 1000)])], [], [], now);
    expect(cellIntensity(cellOf(semMeta, "2026-08-10") as MonthDayCell)).toBeNull();
  });

  it("intensidade fica entre 0 e 1 e não estoura acima da meta", () => {
    expect(cellIntensity(cellOf(view, "2026-08-10") as MonthDayCell)).toBeCloseTo(0.5, 6);
    const acima = buildMonthView("2026-08-15", [meal("2026-08-10", [entry("a", 6000)])], [], periods, now);
    expect(cellIntensity(cellOf(acima, "2026-08-10") as MonthDayCell)).toBe(1);
  });

  it("o rótulo diz 'Sem registro' em vez de 0 kcal", () => {
    expect(cellLabel(cellOf(view, "2026-08-11") as MonthDayCell)).toBe("Sem registro");
  });

  it("o rótulo do dia registrado traz energia, meta e contagem", () => {
    const label = cellLabel(cellOf(view, "2026-08-10") as MonthDayCell);
    expect(label).toContain("1000 kcal");
    expect(label).toContain("50% da meta");
    expect(label).toContain("1 item");
  });

  it("dia futuro sem registro fala de planejamento, não de ausência", () => {
    const comPlano = buildMonthView("2026-08-15", [], [plannedMeal("2026-08-20")], [], now);
    expect(cellLabel(cellOf(comPlano, "2026-08-20") as MonthDayCell)).toContain("planejada");
    expect(cellLabel(cellOf(comPlano, "2026-08-25") as MonthDayCell)).toBe("Sem planejamento");
  });

  it("o rótulo avisa quando o total é parcial", () => {
    const parcial = buildMonthView(
      "2026-08-15",
      [meal("2026-08-10", [entry("a", 1000), entry("b", null)])],
      [],
      periods,
      now,
    );
    expect(cellLabel(cellOf(parcial, "2026-08-10") as MonthDayCell)).toContain("parcial");
  });
});
