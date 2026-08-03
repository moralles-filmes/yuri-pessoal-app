import { describe, expect, it } from "vitest";
import {
  copyDayPlan,
  countMaterialization,
  describeCycle,
  duplicateWeekPlan,
  materializationTargets,
  planDayForDate,
  plannedMealsInScope,
  scopeImpact,
  weekIndexForDate,
} from "./plan-recurrence";
import type { NutritionPlan, PlanDay, PlannedMeal } from "./types";

const planDay = (patch: Partial<PlanDay>): PlanDay => ({
  id: `day-${patch.weekIndex ?? 0}-${patch.weekday ?? 0}`,
  planId: "plan-1",
  weekIndex: 0,
  weekday: 1,
  label: null,
  dayKind: null,
  notes: null,
  meals: [],
  ...patch,
});

const plannedMeal = (patch: Partial<PlannedMeal>): PlannedMeal => ({
  id: "pm-1",
  planId: "plan-1",
  planDayId: "day-0-1",
  plannedDate: "2026-08-03",
  mealTypeId: "almoco",
  mealTypeName: "Almoço",
  mealTypeIcon: null,
  plannedTime: "12:30:00",
  title: null,
  notes: null,
  position: 0,
  items: [],
  ...patch,
});

const plan = (patch: Partial<NutritionPlan>): NutritionPlan => ({
  id: "plan-1",
  name: "Semana padrão",
  description: null,
  cycleWeeks: 1,
  weekStartDay: 1,
  anchorDate: null,
  isActive: true,
  isDefault: false,
  days: [],
  ...patch,
});

/* ═══════════════════ Ciclo ═══════════════════ */

describe("weekIndexForDate", () => {
  it("ciclo de 1 semana é sempre o índice 0, mesmo sem âncora", () => {
    const p = { cycleWeeks: 1, weekStartDay: 1, anchorDate: null };
    expect(weekIndexForDate(p, "2026-08-03")).toBe(0);
    expect(weekIndexForDate(p, "2027-03-15")).toBe(0);
  });

  it("ciclo de 2 semanas alterna a partir da âncora", () => {
    const p = { cycleWeeks: 2, weekStartDay: 1, anchorDate: "2026-08-03" };
    expect(weekIndexForDate(p, "2026-08-03")).toBe(0); // semana da âncora
    expect(weekIndexForDate(p, "2026-08-09")).toBe(0); // domingo da mesma semana
    expect(weekIndexForDate(p, "2026-08-10")).toBe(1); // semana seguinte
    expect(weekIndexForDate(p, "2026-08-17")).toBe(0); // volta ao começo
  });

  it("datas ANTES da âncora caem no ciclo certo (resto sempre positivo)", () => {
    const p = { cycleWeeks: 2, weekStartDay: 1, anchorDate: "2026-08-03" };
    expect(weekIndexForDate(p, "2026-07-27")).toBe(1);
    expect(weekIndexForDate(p, "2026-07-20")).toBe(0);
  });

  it("ciclo de 3 semanas percorre 0, 1, 2", () => {
    const p = { cycleWeeks: 3, weekStartDay: 1, anchorDate: "2026-08-03" };
    expect(
      ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"].map((d) => weekIndexForDate(p, d)),
    ).toEqual([0, 1, 2, 0]);
  });

  it("sem âncora e com ciclo > 1 devolve nulo em vez de chutar a semana", () => {
    expect(weekIndexForDate({ cycleWeeks: 2, weekStartDay: 1, anchorDate: null }, "2026-08-03")).toBeNull();
  });

  it("respeita a semana começando no domingo", () => {
    const p = { cycleWeeks: 2, weekStartDay: 0, anchorDate: "2026-08-02" };
    expect(weekIndexForDate(p, "2026-08-02")).toBe(0); // domingo
    expect(weekIndexForDate(p, "2026-08-08")).toBe(0); // sábado da mesma semana
    expect(weekIndexForDate(p, "2026-08-09")).toBe(1); // domingo seguinte
  });

  it("atravessa a virada do ano", () => {
    const p = { cycleWeeks: 2, weekStartDay: 1, anchorDate: "2026-12-28" };
    expect(weekIndexForDate(p, "2026-12-31")).toBe(0);
    expect(weekIndexForDate(p, "2027-01-04")).toBe(1);
    expect(weekIndexForDate(p, "2027-01-11")).toBe(0);
  });
});

describe("planDayForDate", () => {
  const p = plan({
    days: [
      planDay({ weekday: 1, label: "Segunda" }),
      planDay({ weekday: 3, label: "Quarta" }),
    ],
  });

  it("acha o dia do modelo pelo dia da semana", () => {
    expect(planDayForDate(p, "2026-08-03")?.label).toBe("Segunda");
    expect(planDayForDate(p, "2026-08-05")?.label).toBe("Quarta");
  });

  it("devolve nulo para dia que o modelo não cobre", () => {
    expect(planDayForDate(p, "2026-08-04")).toBeNull(); // terça
    expect(planDayForDate(p, "2026-08-08")).toBeNull(); // sábado
  });
});

/* ═══════════════════ Materialização ═══════════════════ */

describe("materializationTargets — aplicar modelo a um período", () => {
  const p = plan({
    days: [
      planDay({ weekday: 1, id: "d-seg" }),
      planDay({ weekday: 3, id: "d-qua" }),
      planDay({ weekday: 5, id: "d-sex" }),
    ],
  });

  it("materializa só os dias que o modelo define", () => {
    const targets = materializationTargets(p, "2026-08-03", "2026-08-09");
    expect(targets.map((t) => t.date)).toEqual(["2026-08-03", "2026-08-05", "2026-08-07"]);
  });

  it("atravessa a virada do mês", () => {
    const targets = materializationTargets(p, "2026-08-28", "2026-09-03");
    expect(targets.map((t) => t.date)).toEqual(["2026-08-28", "2026-08-31", "2026-09-02"]);
  });

  it("intervalo invertido não materializa nada", () => {
    expect(materializationTargets(p, "2026-08-09", "2026-08-03")).toEqual([]);
  });

  it("ciclo de 2 semanas alterna os dias aplicados", () => {
    const alternado = plan({
      cycleWeeks: 2,
      anchorDate: "2026-08-03",
      days: [
        planDay({ weekIndex: 0, weekday: 1, id: "a-seg" }),
        planDay({ weekIndex: 1, weekday: 2, id: "b-ter" }),
      ],
    });
    const targets = materializationTargets(alternado, "2026-08-03", "2026-08-16");
    expect(targets.map((t) => `${t.date}:${t.day.id}`)).toEqual([
      "2026-08-03:a-seg",
      "2026-08-11:b-ter",
    ]);
  });

  it("conta o impacto antes de aplicar", () => {
    const comRefeicoes = plan({
      days: [
        planDay({
          weekday: 1,
          meals: [
            plannedMeal({ id: "m1", items: [] }),
            plannedMeal({ id: "m2", items: [] }),
          ],
        }),
      ],
    });
    expect(countMaterialization(comRefeicoes, "2026-08-03", "2026-08-17")).toEqual({
      dias: 3,
      refeicoes: 6,
      itens: 0,
    });
  });
});

/* ═══════════════════ Escopo de edição ═══════════════════ */

describe("plannedMealsInScope — a escolha é sempre do usuário", () => {
  const hoje = "2026-08-10";
  const modelo = plannedMeal({ id: "modelo", plannedDate: null });
  const passada = plannedMeal({ id: "passada", plannedDate: "2026-08-03" });
  const alvo = plannedMeal({ id: "alvo", plannedDate: "2026-08-10" });
  const futura1 = plannedMeal({ id: "futura1", plannedDate: "2026-08-17" });
  const futura2 = plannedMeal({ id: "futura2", plannedDate: "2026-08-24" });
  const outroTipo = plannedMeal({ id: "outro", plannedDate: "2026-08-17", mealTypeId: "jantar" });
  const todas = [modelo, passada, alvo, futura1, futura2, outroTipo];

  it("somente este dia atinge só a refeição escolhida", () => {
    const scope = plannedMealsInScope("somente_este_dia", alvo, todas, hoje);
    expect(scope.map((m) => m.id)).toEqual(["alvo"]);
  });

  it("este e os próximos NÃO toca no passado", () => {
    const scope = plannedMealsInScope("este_e_proximos", alvo, todas, hoje);
    expect(scope.map((m) => m.id).sort()).toEqual(["alvo", "futura1", "futura2"]);
    expect(scope.map((m) => m.id)).not.toContain("passada");
    expect(scope.map((m) => m.id)).not.toContain("modelo");
  });

  it("todo o modelo atinge a linha do modelo e as futuras, nunca o passado", () => {
    const scope = plannedMealsInScope("todo_o_modelo", alvo, todas, hoje);
    expect(scope.map((m) => m.id).sort()).toEqual(["alvo", "futura1", "futura2", "modelo"]);
    expect(scope.map((m) => m.id)).not.toContain("passada");
  });

  it("nenhum escopo atinge refeição de outro tipo", () => {
    for (const scope of ["somente_este_dia", "este_e_proximos", "todo_o_modelo"] as const) {
      const result = plannedMealsInScope(scope, alvo, todas, hoje);
      expect(result.map((m) => m.id)).not.toContain("outro");
    }
  });

  it("refeição avulsa (sem modelo) só pode ser editada nela mesma", () => {
    const avulsa = plannedMeal({ id: "avulsa", planDayId: null, plannedDate: "2026-08-10" });
    for (const scope of ["somente_este_dia", "este_e_proximos", "todo_o_modelo"] as const) {
      expect(plannedMealsInScope(scope, avulsa, [...todas, avulsa], hoje).map((m) => m.id)).toEqual([
        "avulsa",
      ]);
    }
  });

  it("editar uma refeição JÁ PASSADA por 'todo o modelo' ainda protege as outras passadas", () => {
    const scope = plannedMealsInScope("todo_o_modelo", passada, todas, hoje);
    expect(scope.map((m) => m.id).sort()).toEqual(["alvo", "futura1", "futura2", "modelo", "passada"]);
  });

  it("mostra o impacto de cada escopo antes de confirmar", () => {
    expect(scopeImpact(alvo, todas, hoje)).toEqual({
      somente_este_dia: 1,
      este_e_proximos: 3,
      todo_o_modelo: 4,
    });
  });
});

/* ═══════════════════ Copiar ═══════════════════ */

describe("copiar dia e duplicar semana", () => {
  it("copia as refeições de um dia para outro sem tocar na origem", () => {
    const source = [
      plannedMeal({ id: "a", mealTypeId: "cafe", plannedTime: "07:00:00" }),
      plannedMeal({ id: "b", mealTypeId: "almoco", plannedTime: "12:30:00" }),
    ];
    const copies = copyDayPlan(source, "2026-08-05");

    expect(copies).toHaveLength(2);
    expect(copies.every((c) => c.targetDate === "2026-08-05")).toBe(true);
    expect(copies[0].mealTypeId).toBe("cafe");
    // A origem continua intocada.
    expect(source[0].plannedDate).toBe("2026-08-03");
  });

  it("duplicar semana preserva o dia da semana de cada refeição", () => {
    const source = [
      plannedMeal({ id: "seg", plannedDate: "2026-08-03" }),
      plannedMeal({ id: "qua", plannedDate: "2026-08-05" }),
      plannedMeal({ id: "dom", plannedDate: "2026-08-09" }),
    ];
    const copies = duplicateWeekPlan(source, "2026-08-03", "2026-08-10");

    expect(copies.map((c) => c.targetDate)).toEqual(["2026-08-10", "2026-08-12", "2026-08-16"]);
  });

  it("duplicar semana atravessa a virada do mês e do ano", () => {
    const source = [plannedMeal({ id: "x", plannedDate: "2026-12-28" })];
    expect(duplicateWeekPlan(source, "2026-12-28", "2027-01-04")[0].targetDate).toBe("2027-01-04");
  });

  it("ignora linhas de modelo (sem data) ao duplicar semana", () => {
    const source = [plannedMeal({ id: "modelo", plannedDate: null })];
    expect(duplicateWeekPlan(source, "2026-08-03", "2026-08-10")).toEqual([]);
  });
});

describe("describeCycle", () => {
  it("descreve o ciclo semanal", () => {
    expect(describeCycle({ cycleWeeks: 1, weekStartDay: 1, anchorDate: null })).toBe(
      "Repete toda semana.",
    );
  });

  it("pede a âncora quando o ciclo tem mais de uma semana", () => {
    expect(describeCycle({ cycleWeeks: 2, weekStartDay: 1, anchorDate: null })).toContain(
      "defina a semana inicial",
    );
  });

  it("mostra a data-âncora em formato brasileiro", () => {
    expect(describeCycle({ cycleWeeks: 2, weekStartDay: 1, anchorDate: "2026-08-03" })).toContain(
      "03/08/2026",
    );
  });
});
