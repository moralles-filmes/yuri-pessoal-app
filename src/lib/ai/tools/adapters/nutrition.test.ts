/**
 * Fase 18-C — IA · Dieta: a qualidade viaja com o número.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A INVARIANTE 1 DO MÓDULO, APLICADA A UM MODELO DE LINGUAGEM.                          ║
 * ║                                                                                       ║
 * ║ Um alimento sem o nutriente analisado NÃO entra como zero: ele degrada o total para   ║
 * ║ `parcial`. Relatar só `amount` transformaria um PISO numa afirmação exata — "você     ║
 * ║ consumiu 78 g de proteína" onde o certo é "pelo menos 78 g".                           ║
 * ║                                                                                       ║
 * ║ A fixture monta os totais À MÃO, com a qualidade escolhida em cada nutriente. Chamar  ║
 * ║ `dayTotals` de verdade aqui provaria que `calc.ts` soma certo (que é teste dele) e     ║
 * ║ nada sobre o que este adapter faz com a qualidade — que é o ponto.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NutrientTotal } from "@/lib/nutrition/calc";
import type { DiaryMeal, GoalPeriod, MealType } from "@/lib/nutrition/types";

const HOJE = "2026-08-07";

let refeicoesFalsas: DiaryMeal[] = [];
let periodosFalsos: GoalPeriod[] = [];
let tiposFalsos: MealType[] = [];
let totaisFalsos: Record<string, NutrientTotal> = {};
let janelaPedida: { from: string; to: string } | null = null;

vi.mock("@/lib/format", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/format")>()),
  hojeISO: () => HOJE,
}));

vi.mock("@/lib/nutrition/diary-queries", () => ({
  getDiaryMeals: async (from: string, to: string) => {
    janelaPedida = { from, to };
    return refeicoesFalsas.filter((m) => m.diaryDate >= from && m.diaryDate <= to);
  },
  getGoalPeriods: async () => periodosFalsos,
  getMealTypes: async () => tiposFalsos,
}));

/**
 * `dayTotals` e `rangeTotals` são substituídos para que a FIXTURE controle a qualidade. O
 * comportamento real deles é testado em `nutrition/diary.test.ts` — aqui o que se julga é o
 * que o adapter FAZ com a qualidade que recebe.
 */
vi.mock("@/lib/nutrition/diary", () => ({
  dayTotals: () => totaisFalsos,
  rangeTotals: () => totaisFalsos,
}));

const { getDay, getPeriod, getGoals } = await import("./nutrition");

/* ═══════════════════════════ Fixtures mínimas ═══════════════════════════ */

function total(
  code: string,
  amount: number,
  quality: NutrientTotal["quality"] = "exato",
): NutrientTotal {
  return { code, amount, quality, contributing: 1, trace: 0, missing: 0 } as NutrientTotal;
}

function refeicao(
  over: Partial<DiaryMeal> & { id: string; diaryDate: string; entries: DiaryMeal["entries"] },
): DiaryMeal {
  return {
    mealTypeId: "mt1",
    mealTypeName: "Almoço",
    mealTypeIcon: null,
    plannedMealId: null,
    plannedTime: null,
    consumedTime: "12:30",
    status: "consumida",
    title: null,
    notes: null,
    position: 0,
    ...over,
  } as DiaryMeal;
}

const UMA_ENTRADA = [{ id: "e1" }] as unknown as DiaryMeal["entries"];

beforeEach(() => {
  janelaPedida = null;
  tiposFalsos = [{ id: "mt1", name: "Almoço" } as MealType];
  refeicoesFalsas = [
    refeicao({ id: "m1", diaryDate: HOJE, entries: UMA_ENTRADA }),
    refeicao({ id: "m2", diaryDate: "2026-08-06", entries: UMA_ENTRADA }),
    // Refeição criada e VAZIA: não conta como dia com registro.
    refeicao({ id: "m3", diaryDate: "2026-08-05", entries: [] }),
  ];
  totaisFalsos = {
    energia_kcal: total("energia_kcal", 1850),
    proteina: total("proteina", 78),
    carboidrato: total("carboidrato", 210),
  };
  periodosFalsos = [];
});

/* ═══════════════════════════════ Testes ═══════════════════════════════ */

describe("nutrition.get_day — a qualidade viaja com o número", () => {
  it("com todos os totais exatos, o resultado é exato e sem ressalva", async () => {
    const saida = await getDay({});
    expect(saida.completude).toBe("exato");
    expect(saida.motivo_incompleto).toBeUndefined();
    expect((saida.agregados as { qualidade_do_total: string }).qualidade_do_total).toBe("exato");
  });

  /** ⚠️ O TESTE CENTRAL: um nutriente parcial torna o DIA parcial, com a frase do "piso". */
  it("um único nutriente parcial torna o dia parcial e manda dizer 'pelo menos'", async () => {
    totaisFalsos = {
      ...totaisFalsos,
      proteina: total("proteina", 78, "parcial"),
    };

    const saida = await getDay({});
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toContain("PISO");
    expect(saida.motivo_incompleto).toContain("pelo menos");
  });

  /** `aproximado` não é `parcial` — mas também não é silêncio. */
  it("aproximado não vira parcial, mas ganha a sua própria ressalva", async () => {
    totaisFalsos = { ...totaisFalsos, carboidrato: total("carboidrato", 210, "aproximado") };

    const saida = await getDay({});
    expect(saida.completude).toBe("exato");
    expect(saida.motivo_incompleto).toContain("estimativa");
    expect((saida.agregados as { qualidade_do_total: string }).qualidade_do_total).toBe(
      "aproximado",
    );
  });

  it("cada macro leva a própria qualidade colada no valor", async () => {
    totaisFalsos = { ...totaisFalsos, proteina: total("proteina", 78, "parcial") };

    const macros = (await getDay({})).agregados as {
      macros: Record<string, { valor: number; qualidade: string }>;
    };
    expect(macros.macros.proteina).toEqual({ valor: 78, qualidade: "parcial" });
    expect(macros.macros.energia_kcal).toEqual({ valor: 1850, qualidade: "exato" });
  });

  /** ⚠️ Nutriente ausente NÃO é relatado como zero — ele simplesmente não aparece. */
  it("nutriente ausente do total não vira zero", async () => {
    const macros = (await getDay({})).agregados as {
      macros: Record<string, unknown>;
    };
    // A fixture não tem lipídios nem fibra.
    expect(macros.macros).not.toHaveProperty("lipidios");
    expect(macros.macros).not.toHaveProperty("fibra");
  });

  it("dia sem registro é ausência, nunca zero caloria", async () => {
    refeicoesFalsas = [refeicao({ id: "m3", diaryDate: HOJE, entries: [] })];
    const saida = await getDay({});

    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("AUSÊNCIA DE REGISTRO");
    expect(saida.observacao).toContain("não é um dia de zero caloria");
  });

  it("usa hoje quando nenhuma data é pedida, e a data pedida quando há", async () => {
    await getDay({});
    expect(janelaPedida).toEqual({ from: HOJE, to: HOJE });

    await getDay({ data: "2026-08-06" });
    expect(janelaPedida).toEqual({ from: "2026-08-06", to: "2026-08-06" });
  });

  it("não prescreve: o resultado diz explicitamente para não sugerir nada", async () => {
    const saida = await getDay({});
    expect((saida.agregados as { sem_prescricao: string }).sem_prescricao).toContain(
      "Não sugira meta",
    );
  });
});

describe("nutrition.get_period", () => {
  it("conta dias COM registro, e declara quantos ficaram sem", async () => {
    const saida = await getPeriod({ dias: 7 });
    // A fixture tem registro em 07/08 e 06/08; 05/08 tem refeição vazia (não conta).
    expect(saida.agregados).toMatchObject({
      dias_pedidos: 7,
      dias_com_registro: 2,
      dias_sem_registro: 5,
    });
    expect(saida.contagem).toBe(2);
  });

  /**
   * ⚠️ A ferramenta NÃO calcula média de propósito: dividir por dias sem registro produziria
   * um número falso ("você comeu metade do que comeu"). A ausência do campo é o comportamento,
   * e a frase existe para o modelo não fazer a divisão por conta própria.
   */
  it("não calcula média diária, e diz por quê", async () => {
    const saida = await getPeriod({ dias: 7 });
    const chaves = Object.keys(saida.agregados);
    expect(chaves).not.toContain("media_diaria");
    expect(chaves).not.toContain("media");
    expect(
      (saida.agregados as { observacao_da_media: string }).observacao_da_media,
    ).toContain("NÃO calcula média");
  });

  it("a janela é inclusiva nos dois extremos", async () => {
    await getPeriod({ dias: 7 });
    // 7 dias terminando hoje = de 01/08 a 07/08.
    expect(janelaPedida).toEqual({ from: "2026-08-01", to: HOJE });
  });

  it("a qualidade do período segue a pior dos dias", async () => {
    totaisFalsos = { ...totaisFalsos, proteina: total("proteina", 500, "parcial") };
    const saida = await getPeriod({ dias: 7 });
    expect(saida.completude).toBe("parcial");
  });

  it("período sem registro nenhum é ausência, não zero", async () => {
    refeicoesFalsas = [];
    const saida = await getPeriod({ dias: 7 });
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("não é um período de zero caloria");
  });
});

describe("nutrition.get_goals", () => {
  const PERIODO: GoalPeriod = {
    id: "p1",
    name: "Cutting",
    reason: null,
    startsOn: "2026-08-01",
    endsOn: null,
    goalType: "fixa",
    notes: null,
    isActive: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    items: [
      {
        id: "i1",
        periodId: "p1",
        nutrientCode: "proteina",
        weekday: null,
        dayKind: null,
        mealTypeId: null,
        // ⚠️ `targetAmount`, não `amount`. A primeira versão desta fixture usava o nome
        // errado e o `as unknown as` a escondeu do `tsc` — o teste ficou vermelho na
        // asserção, que é onde ele deveria mesmo morder, mas o tipo devia ter pegado antes.
        targetAmount: 150,
        targetPercent: null,
        minAmount: null,
        maxAmount: null,
        notes: null,
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  } as unknown as GoalPeriod;

  it("devolve as metas do período vigente", async () => {
    periodosFalsos = [PERIODO];
    const saida = await getGoals();
    expect(saida.contagem).toBe(1);
    expect(saida.itens[0]).toMatchObject({ nutriente: "proteina", alvo: 150 });
    expect(saida.agregados).toMatchObject({ vigente_desde: "2026-08-01" });
  });

  /** Sem meta cadastrada, a resposta não pode sugerir uma. */
  it("sem meta, manda explicitamente não sugerir nenhuma", async () => {
    const saida = await getGoals();
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("Não sugira uma");
  });

  it("com períodos que não valem hoje, diz que existem mas não vigem", async () => {
    periodosFalsos = [
      { ...PERIODO, startsOn: "2025-01-01", endsOn: "2025-12-31" } as GoalPeriod,
    ];
    const saida = await getGoals();
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("outras datas");
  });

  it("não prescreve: o resultado diz que as metas são do usuário", async () => {
    periodosFalsos = [PERIODO];
    const saida = await getGoals();
    expect((saida.agregados as { sem_prescricao: string }).sem_prescricao).toContain(
      "definidas PELO USUÁRIO",
    );
  });
});
