import { describe, expect, it } from "vitest";
import { sumNutrients, type NutrientBag, type NutrientTotal } from "./calc";
import { CORE_NUTRIENTS, SUBSTITUTION_COMPARE_NUTRIENTS } from "./constants";
import {
  assessSubstitution,
  availableOptions,
  compareNutrients,
  comparisonsToSnapshot,
  deltaOf,
  remainingAfterSubstitution,
  sortedOptions,
  toleranceFor,
  toleranceStatus,
  totalsAfterSubstitution,
} from "./substitution";
import type { GoalTarget, SubstitutionOption } from "./types";

const bag = (values: Record<string, number | null>): NutrientBag => {
  const result: NutrientBag = {};
  for (const [code, amount] of Object.entries(values)) {
    result[code] =
      amount === null
        ? { code, amount: null, state: "nao_disponivel", method: "analitico" }
        : { code, amount, state: "disponivel", method: "analitico" };
  }
  return result;
};

const totals = (values: Record<string, number | null>): Record<string, NutrientTotal> =>
  sumNutrients([bag(values)]);

const CODES = SUBSTITUTION_COMPARE_NUTRIENTS;

/* Arroz branco 150 g × batata-doce 150 g — o caso clássico de troca. */
const arroz = () =>
  totals({
    [CORE_NUTRIENTS.energia]: 193,
    [CORE_NUTRIENTS.proteina]: 3.8,
    [CORE_NUTRIENTS.carboidrato]: 42,
    [CORE_NUTRIENTS.lipidios]: 0.3,
    [CORE_NUTRIENTS.fibra]: 2.4,
  });

const batataDoce = () =>
  totals({
    [CORE_NUTRIENTS.energia]: 175,
    [CORE_NUTRIENTS.proteina]: 1.0,
    [CORE_NUTRIENTS.carboidrato]: 42,
    [CORE_NUTRIENTS.lipidios]: 0.1,
    [CORE_NUTRIENTS.fibra]: 3.3,
  });

/* ═══════════════════════════ Diferença nutricional ═══════════════════════════ */

describe("compareNutrients — diferença nutricional", () => {
  it("subtrai original de alternativa, com sinal", () => {
    const diff = compareNutrients(arroz(), batataDoce(), CODES);

    expect(diff[CORE_NUTRIENTS.energia].diff).toBeCloseTo(-18, 10);
    expect(diff[CORE_NUTRIENTS.proteina].diff).toBeCloseTo(-2.8, 10);
    // Comeu mais fibra: positivo.
    expect(diff[CORE_NUTRIENTS.fibra].diff).toBeCloseTo(0.9, 10);
    // Igual: diferença zero (o que é diferente de "não sei").
    expect(diff[CORE_NUTRIENTS.carboidrato].diff).toBe(0);
  });

  it("calcula o percentual relativo ao original", () => {
    const diff = compareNutrients(arroz(), batataDoce(), CODES);
    expect(diff[CORE_NUTRIENTS.energia].percent).toBeCloseTo((-18 / 193) * 100, 8);
  });

  it("NÃO MEDIDO não vira zero: a diferença fica desconhecida", () => {
    const semFibra = totals({
      [CORE_NUTRIENTS.energia]: 175,
      [CORE_NUTRIENTS.fibra]: null,
    });
    const diff = compareNutrients(arroz(), semFibra, CODES);

    expect(diff[CORE_NUTRIENTS.fibra].replacement).toBeNull();
    expect(diff[CORE_NUTRIENTS.fibra].diff).toBeNull();
    expect(diff[CORE_NUTRIENTS.fibra].percent).toBeNull();
    // Energia, que os dois têm, continua comparável.
    expect(diff[CORE_NUTRIENTS.energia].diff).toBeCloseTo(-18, 10);
  });

  it("nutriente ausente nos dois lados fica incomparável, não 'igual'", () => {
    const diff = compareNutrients(totals({}), totals({}), CODES);
    expect(diff[CORE_NUTRIENTS.energia].diff).toBeNull();
    expect(diff[CORE_NUTRIENTS.energia].original).toBeNull();
  });

  it("percentual é nulo quando o original é zero — nada de variação infinita", () => {
    const zero = totals({ [CORE_NUTRIENTS.lipidios]: 0 });
    const algum = totals({ [CORE_NUTRIENTS.lipidios]: 5 });
    const diff = compareNutrients(zero, algum, [CORE_NUTRIENTS.lipidios]);
    expect(diff[CORE_NUTRIENTS.lipidios].diff).toBe(5);
    expect(diff[CORE_NUTRIENTS.lipidios].percent).toBeNull();
  });

  it("propaga a PIOR qualidade dos dois lados", () => {
    const parcial = sumNutrients([
      bag({ [CORE_NUTRIENTS.energia]: 100 }),
      bag({ [CORE_NUTRIENTS.energia]: null }),
    ]);
    const diff = compareNutrients(arroz(), parcial, [CORE_NUTRIENTS.energia]);
    expect(diff[CORE_NUTRIENTS.energia].quality).toBe("parcial");
  });
});

/* ═══════════════════════════ Tolerância ═══════════════════════════ */

describe("toleranceStatus — dentro e fora", () => {
  const diff = () => compareNutrients(arroz(), batataDoce(), CODES);

  it("DENTRO quando a variação cabe no limite configurado", () => {
    // Energia varia −9,3%; tolerância de 15% acomoda.
    expect(toleranceStatus(diff()[CORE_NUTRIENTS.energia], 15)).toBe("dentro");
  });

  it("FORA quando a variação passa do limite", () => {
    // Proteína varia −73,7%; tolerância de 20% não acomoda.
    expect(toleranceStatus(diff()[CORE_NUTRIENTS.proteina], 20)).toBe("fora");
  });

  it("a fronteira exata conta como dentro", () => {
    const a = totals({ [CORE_NUTRIENTS.energia]: 100 });
    const b = totals({ [CORE_NUTRIENTS.energia]: 110 });
    const comparison = compareNutrients(a, b, [CORE_NUTRIENTS.energia])[CORE_NUTRIENTS.energia];
    expect(toleranceStatus(comparison, 10)).toBe("dentro");
    expect(toleranceStatus(comparison, 9.99)).toBe("fora");
  });

  it("sem tolerância definida a diferença é só informada", () => {
    expect(toleranceStatus(diff()[CORE_NUTRIENTS.proteina], null)).toBe("sem_tolerancia");
  });

  it("diferença desconhecida é INCOMPARÁVEL, nunca 'dentro'", () => {
    const semFibra = totals({ [CORE_NUTRIENTS.energia]: 175 });
    const comparison = compareNutrients(arroz(), semFibra, CODES)[CORE_NUTRIENTS.fibra];
    expect(toleranceStatus(comparison, 50)).toBe("incomparavel");
  });

  it("diferença zero cabe em qualquer tolerância, inclusive partindo de zero", () => {
    const zero = totals({ [CORE_NUTRIENTS.lipidios]: 0 });
    const comparison = compareNutrients(zero, zero, [CORE_NUTRIENTS.lipidios])[
      CORE_NUTRIENTS.lipidios
    ];
    expect(toleranceStatus(comparison, 0)).toBe("dentro");
  });

  it("sair de zero para algum valor não tem percentual que segure: fora", () => {
    const zero = totals({ [CORE_NUTRIENTS.lipidios]: 0 });
    const algum = totals({ [CORE_NUTRIENTS.lipidios]: 5 });
    const comparison = compareNutrients(zero, algum, [CORE_NUTRIENTS.lipidios])[
      CORE_NUTRIENTS.lipidios
    ];
    expect(toleranceStatus(comparison, 200)).toBe("fora");
  });
});

describe("assessSubstitution", () => {
  it("conta o que ficou fora e o que não deu para comparar", () => {
    const tolerances = toleranceFor(
      { energy: 15, protein: 20, carb: null, fat: null, fiber: 30 },
      {
        energia: CORE_NUTRIENTS.energia,
        proteina: CORE_NUTRIENTS.proteina,
        carboidrato: CORE_NUTRIENTS.carboidrato,
        lipidios: CORE_NUTRIENTS.lipidios,
        fibra: CORE_NUTRIENTS.fibra,
      },
    );
    const assessment = assessSubstitution(
      compareNutrients(arroz(), batataDoce(), CODES),
      tolerances,
    );

    expect(assessment.statuses[CORE_NUTRIENTS.energia]).toBe("dentro");
    // Proteína cai 73,7% (limite 20%) e fibra sobe 37,5% (limite 30%): os dois estouram.
    expect(assessment.statuses[CORE_NUTRIENTS.proteina]).toBe("fora");
    expect(assessment.statuses[CORE_NUTRIENTS.fibra]).toBe("fora");
    expect(assessment.statuses[CORE_NUTRIENTS.carboidrato]).toBe("sem_tolerancia");
    expect(assessment.outside).toBe(2);
    expect(assessment.incomparable).toBe(0);
    expect(assessment.quality).toBe("exato");
  });
});

/* ═══════════════════════════ Impacto no dia ═══════════════════════════ */

describe("totalsAfterSubstitution — impacto no total do dia", () => {
  const dia = () =>
    totals({
      [CORE_NUTRIENTS.energia]: 1800,
      [CORE_NUTRIENTS.proteina]: 110,
      [CORE_NUTRIENTS.carboidrato]: 200,
      [CORE_NUTRIENTS.lipidios]: 60,
      [CORE_NUTRIENTS.fibra]: 22,
    });

  it("aplica a diferença ao total do dia", () => {
    const depois = totalsAfterSubstitution(dia(), compareNutrients(arroz(), batataDoce(), CODES));

    expect(depois[CORE_NUTRIENTS.energia].amount).toBeCloseTo(1782, 10);
    expect(depois[CORE_NUTRIENTS.proteina].amount).toBeCloseTo(107.2, 10);
    expect(depois[CORE_NUTRIENTS.fibra].amount).toBeCloseTo(22.9, 10);
    expect(depois[CORE_NUTRIENTS.carboidrato].amount).toBeCloseTo(200, 10);
  });

  it("não altera o total de origem (a prévia não grava nada)", () => {
    const antes = dia();
    totalsAfterSubstitution(antes, compareNutrients(arroz(), batataDoce(), CODES));
    expect(antes[CORE_NUTRIENTS.energia].amount).toBe(1800);
  });

  it("EFEITO DESCONHECIDO marca o dia como parcial em vez de fingir que não muda", () => {
    const semFibra = totals({
      [CORE_NUTRIENTS.energia]: 175,
      [CORE_NUTRIENTS.proteina]: 1,
      [CORE_NUTRIENTS.carboidrato]: 42,
      [CORE_NUTRIENTS.lipidios]: 0.1,
    });
    const depois = totalsAfterSubstitution(dia(), compareNutrients(arroz(), semFibra, CODES));

    expect(depois[CORE_NUTRIENTS.fibra].amount).toBeCloseTo(22, 10);
    expect(depois[CORE_NUTRIENTS.fibra].quality).toBe("parcial");
    // Os comparáveis seguem exatos.
    expect(depois[CORE_NUTRIENTS.energia].quality).toBe("exato");
  });

  it("nutriente que o dia não tinha nasce parcial", () => {
    const dieta = totals({ [CORE_NUTRIENTS.energia]: 1000 });
    const depois = totalsAfterSubstitution(
      dieta,
      compareNutrients(totals({ [CORE_NUTRIENTS.fibra]: 2 }), totals({ [CORE_NUTRIENTS.fibra]: 5 }), [
        CORE_NUTRIENTS.fibra,
      ]),
    );
    expect(depois[CORE_NUTRIENTS.fibra].amount).toBeCloseTo(3, 10);
    expect(depois[CORE_NUTRIENTS.fibra].quality).toBe("parcial");
  });

  it("mantém intactos os nutrientes que a troca não toca", () => {
    const depois = totalsAfterSubstitution(dia(), {});
    expect(depois[CORE_NUTRIENTS.energia].amount).toBe(1800);
  });
});

/* ═══════════════════════════ O que resta da meta ═══════════════════════════ */

describe("remainingAfterSubstitution — o que sobra da meta depois da troca", () => {
  const target = (amount: number): GoalTarget => ({
    code: "x",
    amount,
    min: null,
    max: null,
    origin: "absoluto",
    percentOfDay: null,
  });

  it("mostra o antes e o depois do que falta para a meta", () => {
    const antes = totals({ [CORE_NUTRIENTS.energia]: 1800, [CORE_NUTRIENTS.proteina]: 110 });
    const depois = totalsAfterSubstitution(antes, compareNutrients(arroz(), batataDoce(), CODES));
    const targets = {
      [CORE_NUTRIENTS.energia]: target(2000),
      [CORE_NUTRIENTS.proteina]: target(130),
    };

    const restante = remainingAfterSubstitution(antes, depois, targets, [
      CORE_NUTRIENTS.energia,
      CORE_NUTRIENTS.proteina,
    ]);

    expect(restante[CORE_NUTRIENTS.energia].before.remaining).toBeCloseTo(200, 10);
    expect(restante[CORE_NUTRIENTS.energia].remainingAfter).toBeCloseTo(218, 10);
    // Trocar liberou 18 kcal de margem.
    expect(restante[CORE_NUTRIENTS.energia].remainingDelta).toBeCloseTo(18, 10);
    // E consumiu 2,8 g a menos de proteína, então falta mais para bater a meta.
    expect(restante[CORE_NUTRIENTS.proteina].remainingDelta).toBeCloseTo(2.8, 10);
  });

  it("sem meta não inventa número", () => {
    const antes = totals({ [CORE_NUTRIENTS.energia]: 1800 });
    const restante = remainingAfterSubstitution(antes, antes, {}, [CORE_NUTRIENTS.energia]);
    expect(restante[CORE_NUTRIENTS.energia].remainingAfter).toBeNull();
    expect(restante[CORE_NUTRIENTS.energia].remainingDelta).toBeNull();
    expect(restante[CORE_NUTRIENTS.energia].after.status).toBe("sem_meta");
  });
});

/* ═══════════════════════════ Alternativas ═══════════════════════════ */

describe("ordenação das alternativas", () => {
  const option = (patch: Partial<SubstitutionOption> & { id: string }): SubstitutionOption => ({
    groupId: "g1",
    optionKind: "alimento",
    foodId: null,
    recipeId: null,
    mealTemplateId: null,
    customLabel: null,
    quantity: 100,
    measureId: null,
    measureLabel: null,
    portionUnit: null,
    priority: 0,
    notes: null,
    isActive: true,
    position: 0,
    label: patch.id,
    ...patch,
  });

  it("usa a PRIORIDADE DO USUÁRIO, não critério nutricional", () => {
    const ordered = sortedOptions([
      option({ id: "c", priority: 2 }),
      option({ id: "a", priority: 0 }),
      option({ id: "b", priority: 1 }),
    ]);
    expect(ordered.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("empate de prioridade cai na ordem manual e depois no nome", () => {
    const ordered = sortedOptions([
      option({ id: "z", priority: 0, position: 1, label: "Zucchini" }),
      option({ id: "a", priority: 0, position: 1, label: "Abóbora" }),
      option({ id: "m", priority: 0, position: 0, label: "Mandioca" }),
    ]);
    expect(ordered.map((o) => o.id)).toEqual(["m", "a", "z"]);
  });

  it("availableOptions descarta as inativas", () => {
    const list = availableOptions([
      option({ id: "a", isActive: false }),
      option({ id: "b", isActive: true }),
    ]);
    expect(list.map((o) => o.id)).toEqual(["b"]);
  });
});

/* ═══════════════════════════ Histórico ═══════════════════════════ */

describe("gravação do histórico", () => {
  it("serializa a comparação com a qualidade de cada nutriente", () => {
    const snapshot = comparisonsToSnapshot(compareNutrients(arroz(), batataDoce(), CODES));
    expect(snapshot[CORE_NUTRIENTS.energia]).toEqual({
      original: 193,
      replacement: 175,
      diff: -18,
      quality: "exato",
    });
  });

  it("a coluna quente fica NULA quando não deu para comparar", () => {
    const comparisons = compareNutrients(arroz(), totals({ [CORE_NUTRIENTS.energia]: 175 }), CODES);
    expect(deltaOf(comparisons, CORE_NUTRIENTS.energia)).toBeCloseTo(-18, 10);
    // Sem fibra do outro lado: nulo, jamais 0 (que significaria "não mudou").
    expect(deltaOf(comparisons, CORE_NUTRIENTS.fibra)).toBeNull();
    expect(deltaOf(comparisons, "nutriente_inexistente")).toBeNull();
  });
});
