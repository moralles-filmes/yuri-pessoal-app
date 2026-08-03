import { describe, expect, it } from "vitest";
import type { NutrientTotal } from "./calc";
import {
  ACTIVITY_FACTORS,
  adherence,
  adherenceForNutrient,
  ageOn,
  dayTargets,
  distributedPercent,
  estimateEnergyExpenditure,
  goalPeriodForDate,
  goalProgress,
  mealTargets,
  missingForEstimate,
  overlappingPeriods,
  progressForDay,
  resolveTarget,
} from "./goals";
import type { GoalItemRow, GoalPeriod } from "./types";

let seq = 0;
const item = (patch: Partial<GoalItemRow>): GoalItemRow => {
  seq += 1;
  return {
    id: `item-${String(seq).padStart(3, "0")}`,
    periodId: "p1",
    nutrientCode: "proteina",
    weekday: null,
    dayKind: null,
    mealTypeId: null,
    targetAmount: null,
    targetPercent: null,
    minAmount: null,
    maxAmount: null,
    notes: null,
    createdAt: `2026-08-0${(seq % 9) + 1}T10:00:00Z`,
    ...patch,
  };
};

const period = (patch: Partial<GoalPeriod>): GoalPeriod => ({
  id: "p1",
  name: null,
  reason: null,
  startsOn: "2026-08-01",
  endsOn: null,
  goalType: "fixa",
  notes: null,
  isActive: true,
  createdAt: "2026-08-01T10:00:00Z",
  items: [],
  ...patch,
});

const total = (amount: number, quality: NutrientTotal["quality"] = "exato"): NutrientTotal => ({
  code: "x",
  amount,
  quality,
  contributing: 1,
  trace: 0,
  missing: quality === "parcial" ? 1 : 0,
});

/* ═══════════════════ Meta vigente por data ═══════════════════ */

describe("goalPeriodForDate — o passado responde pela meta que valia nele", () => {
  const julho = period({ id: "julho", startsOn: "2026-07-01", endsOn: "2026-07-31" });
  const agosto = period({
    id: "agosto",
    startsOn: "2026-08-01",
    endsOn: null,
    createdAt: "2026-08-01T10:00:00Z",
  });
  const periods = [julho, agosto];

  it("usa o período do dia consultado, não o mais recente", () => {
    expect(goalPeriodForDate(periods, "2026-07-15")?.id).toBe("julho");
    expect(goalPeriodForDate(periods, "2026-08-15")?.id).toBe("agosto");
  });

  it("criar uma meta nova hoje não muda o mês passado", () => {
    const setembro = period({
      id: "setembro",
      startsOn: "2026-09-01",
      createdAt: "2026-09-01T08:00:00Z",
    });
    expect(goalPeriodForDate([...periods, setembro], "2026-07-15")?.id).toBe("julho");
    expect(goalPeriodForDate([...periods, setembro], "2026-08-15")?.id).toBe("agosto");
  });

  it("devolve nulo quando nenhum período cobre a data", () => {
    expect(goalPeriodForDate(periods, "2026-06-01")).toBeNull();
  });

  it("período em aberto vale de sua data em diante", () => {
    expect(goalPeriodForDate(periods, "2030-01-01")?.id).toBe("agosto");
  });

  it("na sobreposição vence o que começou mais tarde, de forma determinística", () => {
    const antigo = period({ id: "a", startsOn: "2026-08-01", endsOn: "2026-08-31" });
    const novo = period({ id: "b", startsOn: "2026-08-10", endsOn: "2026-08-20" });
    expect(goalPeriodForDate([antigo, novo], "2026-08-15")?.id).toBe("b");
    // A ordem de entrada não pode mudar a resposta.
    expect(goalPeriodForDate([novo, antigo], "2026-08-15")?.id).toBe("b");
  });

  it("detecta sobreposições para a tela avisar", () => {
    const a = period({ id: "a", startsOn: "2026-08-01", endsOn: "2026-08-31" });
    const b = period({ id: "b", startsOn: "2026-08-10", endsOn: "2026-09-10" });
    const c = period({ id: "c", startsOn: "2026-10-01", endsOn: "2026-10-31" });
    expect(overlappingPeriods([a, b, c])).toHaveLength(1);
    expect(overlappingPeriods([a, c])).toHaveLength(0);
  });

  it("conta como sobreposição um período em aberto que engole os seguintes", () => {
    const aberto = period({ id: "aberto", startsOn: "2026-01-01", endsOn: null });
    const depois = period({ id: "depois", startsOn: "2026-08-01", endsOn: "2026-08-31" });
    expect(overlappingPeriods([aberto, depois])).toHaveLength(1);
  });
});

/* ═══════════════════ Escopo do valor ═══════════════════ */

describe("resolveTarget — do mais específico para o mais geral", () => {
  it("meta fixa ignora linhas com dia da semana", () => {
    const items = [
      item({ nutrientCode: "proteina", targetAmount: 140 }),
      item({ nutrientCode: "proteina", weekday: 1, targetAmount: 999 }),
    ];
    // 2026-08-03 é segunda-feira, mas a meta é fixa.
    const target = resolveTarget(items, { date: "2026-08-03", dayKind: null }, "fixa", "proteina");
    expect(target?.amount).toBe(140);
  });

  it("por dia da semana prefere o dia específico", () => {
    const items = [
      item({ nutrientCode: "proteina", targetAmount: 140 }),
      item({ nutrientCode: "proteina", weekday: 1, targetAmount: 180 }),
    ];
    const segunda = resolveTarget(
      items,
      { date: "2026-08-03", dayKind: null },
      "por_dia_semana",
      "proteina",
    );
    const terca = resolveTarget(
      items,
      { date: "2026-08-04", dayKind: null },
      "por_dia_semana",
      "proteina",
    );
    expect(segunda?.amount).toBe(180);
    expect(terca?.amount).toBe(140); // cai no curinga
  });

  it("treino/descanso escolhe pelo tipo do dia", () => {
    const items = [
      item({ nutrientCode: "carboidrato", targetAmount: 200 }),
      item({ nutrientCode: "carboidrato", dayKind: "treino", targetAmount: 320 }),
      item({ nutrientCode: "carboidrato", dayKind: "descanso", targetAmount: 160 }),
    ];
    const ctx = { date: "2026-08-03" };
    expect(
      resolveTarget(items, { ...ctx, dayKind: "treino" }, "treino_descanso", "carboidrato")?.amount,
    ).toBe(320);
    expect(
      resolveTarget(items, { ...ctx, dayKind: "descanso" }, "treino_descanso", "carboidrato")
        ?.amount,
    ).toBe(160);
    // Dia não classificado cai no curinga.
    expect(
      resolveTarget(items, { ...ctx, dayKind: null }, "treino_descanso", "carboidrato")?.amount,
    ).toBe(200);
  });

  it("trocar o tipo da meta não apaga os valores do outro eixo", () => {
    const items = [
      item({ nutrientCode: "proteina", targetAmount: 140 }),
      item({ nutrientCode: "proteina", weekday: 1, targetAmount: 180 }),
      item({ nutrientCode: "proteina", dayKind: "treino", targetAmount: 200 }),
    ];
    const ctx = { date: "2026-08-03", dayKind: "treino" as const };
    expect(resolveTarget(items, ctx, "fixa", "proteina")?.amount).toBe(140);
    expect(resolveTarget(items, ctx, "por_dia_semana", "proteina")?.amount).toBe(180);
    expect(resolveTarget(items, ctx, "treino_descanso", "proteina")?.amount).toBe(200);
  });

  it("devolve nulo quando não há meta do nutriente", () => {
    expect(
      resolveTarget([item({ nutrientCode: "proteina", targetAmount: 1 })], { date: "2026-08-03", dayKind: null }, "fixa", "sodio"),
    ).toBeNull();
  });

  it("preserva a faixa mínimo/máximo", () => {
    const target = resolveTarget(
      [item({ nutrientCode: "proteina", minAmount: 120, maxAmount: 160 })],
      { date: "2026-08-03", dayKind: null },
      "fixa",
      "proteina",
    );
    expect(target?.min).toBe(120);
    expect(target?.max).toBe(160);
    expect(target?.amount).toBeNull();
  });
});

/* ═══════════════════ Distribuição por refeição ═══════════════════ */

describe("distribuição por refeição", () => {
  const p = period({
    items: [
      item({ nutrientCode: "energia_kcal", targetAmount: 2000 }),
      item({ nutrientCode: "energia_kcal", mealTypeId: "cafe", targetPercent: 25 }),
      item({ nutrientCode: "energia_kcal", mealTypeId: "almoco", targetPercent: 40 }),
      item({ nutrientCode: "energia_kcal", mealTypeId: "jantar", targetAmount: 600 }),
    ],
  });
  const ctx = { date: "2026-08-03", dayKind: null };

  it("percentual vira valor a partir da meta do dia", () => {
    const day = dayTargets(p, ctx);
    expect(day.energia_kcal.amount).toBe(2000);

    const cafe = mealTargets(p, ctx, "cafe", day);
    expect(cafe.energia_kcal.amount).toBe(500); // 25% de 2000
    expect(cafe.energia_kcal.origin).toBe("percentual");
    expect(cafe.energia_kcal.percentOfDay).toBe(25);
  });

  it("valor absoluto por refeição passa direto", () => {
    const jantar = mealTargets(p, ctx, "jantar");
    expect(jantar.energia_kcal.amount).toBe(600);
    expect(jantar.energia_kcal.origin).toBe("absoluto");
  });

  it("sem meta do dia, o percentual fica sem valor absoluto em vez de virar zero", () => {
    const semDia = period({
      items: [item({ nutrientCode: "proteina", mealTypeId: "cafe", targetPercent: 30 })],
    });
    const cafe = mealTargets(semDia, ctx, "cafe");
    expect(cafe.proteina.amount).toBeNull();
    expect(cafe.proteina.percentOfDay).toBe(30);
  });

  it("soma o quanto já foi distribuído, misturando percentual e valor", () => {
    // 25% + 40% + (600/2000 = 30%) = 95%
    expect(distributedPercent(p, ctx, "energia_kcal", 2000)).toBeCloseTo(95, 10);
  });

  it("acusa distribuição acima de 100%", () => {
    const demais = period({
      items: [
        item({ nutrientCode: "energia_kcal", targetAmount: 2000 }),
        item({ nutrientCode: "energia_kcal", mealTypeId: "a", targetPercent: 60 }),
        item({ nutrientCode: "energia_kcal", mealTypeId: "b", targetPercent: 60 }),
      ],
    });
    expect(distributedPercent(demais, ctx, "energia_kcal", 2000)).toBe(120);
  });

  it("devolve nulo quando não há distribuição nenhuma", () => {
    const semDistribuicao = period({
      items: [item({ nutrientCode: "energia_kcal", targetAmount: 2000 })],
    });
    expect(distributedPercent(semDistribuicao, ctx, "energia_kcal", 2000)).toBeNull();
  });

  it("dayTargets ignora as linhas de refeição", () => {
    expect(Object.keys(dayTargets(p, ctx))).toEqual(["energia_kcal"]);
  });

  it("sem período não há meta nenhuma", () => {
    expect(dayTargets(null, ctx)).toEqual({});
    expect(mealTargets(null, ctx, "cafe")).toEqual({});
  });
});

/* ═══════════════════ Progresso e restante ═══════════════════ */

describe("goalProgress — restante e percentual", () => {
  const target = { code: "proteina", amount: 140, min: null, max: null, origin: "absoluto" as const, percentOfDay: null };

  it("calcula restante e percentual", () => {
    const p = goalProgress("proteina", total(98), target);
    expect(p.remaining).toBe(42);
    expect(p.percent).toBeCloseTo(70, 10);
    expect(p.status).toBe("abaixo");
  });

  it("restante negativo quando passa da meta", () => {
    const p = goalProgress("proteina", total(160), target);
    expect(p.remaining).toBe(-20);
    expect(p.status).toBe("acima");
  });

  it("bater exatamente a meta conta como dentro", () => {
    expect(goalProgress("proteina", total(140), target).status).toBe("na_faixa");
  });

  it("sem meta devolve nulo, não zero — são coisas diferentes", () => {
    const p = goalProgress("proteina", total(98), null);
    expect(p.percent).toBeNull();
    expect(p.remaining).toBeNull();
    expect(p.status).toBe("sem_meta");
    expect(p.consumed).toBe(98);
  });

  it("usa a faixa quando ela existe", () => {
    const faixa = { code: "proteina", amount: null, min: 120, max: 160, origin: "absoluto" as const, percentOfDay: null };
    expect(goalProgress("proteina", total(130), faixa).status).toBe("na_faixa");
    expect(goalProgress("proteina", total(100), faixa).status).toBe("abaixo");
    expect(goalProgress("proteina", total(200), faixa).status).toBe("acima");
  });

  it("propaga a qualidade do total — progresso sobre parcial não é exato", () => {
    expect(goalProgress("proteina", total(98, "parcial"), target).quality).toBe("parcial");
    expect(goalProgress("proteina", total(98, "aproximado"), target).quality).toBe("aproximado");
  });

  it("sem consumo registrado o total é parcial, não exato", () => {
    const p = goalProgress("proteina", undefined, target);
    expect(p.consumed).toBe(0);
    expect(p.quality).toBe("parcial");
  });

  it("progressForDay cobre metas sem consumo e consumo sem meta", () => {
    const progress = progressForDay(
      { proteina: total(98), sodio: total(3000) },
      { proteina: target, fibra: { ...target, code: "fibra", amount: 25 } },
    );
    expect(Object.keys(progress).sort()).toEqual(["fibra", "proteina", "sodio"]);
    expect(progress.fibra.consumed).toBe(0);
    expect(progress.sodio.status).toBe("sem_meta");
  });
});

/* ═══════════════════ Aderência ═══════════════════ */

describe("aderência — proximidade, não razão simples", () => {
  const alvo = (amount: number) => ({
    code: "x",
    amount,
    min: null,
    max: null,
    origin: "absoluto" as const,
    percentOfDay: null,
  });

  it("bater a meta é 100%", () => {
    expect(adherenceForNutrient(goalProgress("x", total(2000), alvo(2000)))).toBe(100);
  });

  it("comer o dobro NÃO dá 200% — dá 0%", () => {
    expect(adherenceForNutrient(goalProgress("x", total(4000), alvo(2000)))).toBe(0);
  });

  it("desvio de 10% para menos ou para mais custa 10 pontos", () => {
    expect(adherenceForNutrient(goalProgress("x", total(1800), alvo(2000)))).toBeCloseTo(90, 10);
    expect(adherenceForNutrient(goalProgress("x", total(2200), alvo(2000)))).toBeCloseTo(90, 10);
  });

  it("dentro da faixa é 100%, fora conta a distância até a borda", () => {
    const faixa = { code: "x", amount: null, min: 100, max: 200, origin: "absoluto" as const, percentOfDay: null };
    expect(adherenceForNutrient(goalProgress("x", total(150), faixa))).toBe(100);
    expect(adherenceForNutrient(goalProgress("x", total(90), faixa))).toBeCloseTo(90, 10);
    expect(adherenceForNutrient(goalProgress("x", total(220), faixa))).toBeCloseTo(90, 10);
  });

  it("sem meta não entra na conta", () => {
    expect(adherenceForNutrient(goalProgress("x", total(150), null))).toBeNull();
  });

  it("média simples dos nutrientes com meta", () => {
    const progress = progressForDay(
      {
        energia_kcal: total(2000),
        proteina: total(126),
        carboidrato: total(250),
        lipidios: total(70),
      },
      {
        energia_kcal: { ...alvo(2000), code: "energia_kcal" },
        proteina: { ...alvo(140), code: "proteina" },
        carboidrato: { ...alvo(250), code: "carboidrato" },
        lipidios: { ...alvo(70), code: "lipidios" },
      },
    );
    // 100 + 90 + 100 + 100 = 390 / 4
    const result = adherence(progress);
    expect(result.percent).toBeCloseTo(97.5, 10);
    expect(result.counted).toBe(4);
    expect(result.quality).toBe("exato");
  });

  it("um total parcial torna a aderência parcial", () => {
    const progress = progressForDay(
      { energia_kcal: total(2000, "parcial") },
      { energia_kcal: { ...alvo(2000), code: "energia_kcal" } },
    );
    expect(adherence(progress).quality).toBe("parcial");
  });

  it("sem nenhuma meta a aderência é nula, não zero", () => {
    expect(adherence({}).percent).toBeNull();
    expect(adherence({}).counted).toBe(0);
  });
});

/* ═══════════════════ Estimador opcional ═══════════════════ */

describe("estimador de gasto energético — opcional, auditável, sem prescrição", () => {
  const perfil = {
    sex: "masculino" as const,
    weightKg: 80,
    heightCm: 178,
    birthDate: "1996-05-10",
    activityLevel: "moderado" as const,
  };

  it("aplica Mifflin-St Jeor e devolve a fórmula junto", () => {
    const estimate = estimateEnergyExpenditure(perfil, "2026-08-03");
    expect(estimate).not.toBeNull();
    if (!estimate) return;

    // 10×80 + 6,25×178 − 5×30 + 5 = 800 + 1112,5 − 150 + 5
    expect(estimate.bmr).toBeCloseTo(1767.5, 10);
    expect(estimate.activityFactor).toBe(ACTIVITY_FACTORS.moderado);
    expect(estimate.total).toBeCloseTo(1767.5 * 1.55, 10);
    expect(estimate.formula).toContain("Mifflin-St Jeor");
    expect(estimate.formula).toContain("80 kg");
  });

  it("usa o termo correto para o sexo declarado", () => {
    const f = estimateEnergyExpenditure({ ...perfil, sex: "feminino" }, "2026-08-03");
    expect(f?.bmr).toBeCloseTo(1601.5, 10); // 800 + 1112,5 − 150 − 161
  });

  it("devolve nulo quando falta dado, em vez de inventar", () => {
    expect(estimateEnergyExpenditure({ ...perfil, weightKg: null }, "2026-08-03")).toBeNull();
    expect(estimateEnergyExpenditure({ ...perfil, birthDate: null }, "2026-08-03")).toBeNull();
    expect(
      estimateEnergyExpenditure({ ...perfil, sex: "nao_informado" }, "2026-08-03"),
    ).toBeNull();
    expect(
      estimateEnergyExpenditure({ ...perfil, activityLevel: "nao_informado" }, "2026-08-03"),
    ).toBeNull();
  });

  it("diz exatamente o que falta", () => {
    const missing = missingForEstimate({ ...perfil, weightKg: null, heightCm: null });
    expect(missing).toEqual(["peso", "altura"]);
    expect(missingForEstimate(perfil)).toEqual([]);
  });
});

describe("ageOn — idade sem fuso", () => {
  it("conta anos completos", () => {
    expect(ageOn("1996-05-10", "2026-08-03")).toBe(30);
    expect(ageOn("1996-05-10", "2026-05-10")).toBe(30);
    expect(ageOn("1996-05-10", "2026-05-09")).toBe(29);
  });

  it("trata 29 de fevereiro sem quebrar", () => {
    expect(ageOn("2000-02-29", "2026-02-28")).toBe(25);
    expect(ageOn("2000-02-29", "2026-03-01")).toBe(26);
  });

  it("rejeita entrada inválida", () => {
    expect(ageOn("nada", "2026-08-03")).toBeNull();
    expect(ageOn("2030-01-01", "2026-08-03")).toBeNull();
  });
});
