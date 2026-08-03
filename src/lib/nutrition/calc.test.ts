import { describe, expect, it } from "vitest";
import {
  ATWATER_FACTORS,
  energyDivergence,
  estimateEnergyKcal,
  formatNutrientAmount,
  goalPercent,
  goalRemaining,
  mergeTotals,
  roundForDisplay,
  scaleNutrient,
  scaleNutrients,
  sumNutrient,
  sumNutrients,
  totalAmount,
  totalQuality,
  type NutrientBag,
} from "./calc";
import { convertToBase } from "./units";
import type { FoodNutrientValue, NutrientDefinition } from "./types";

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

/** Arroz, tipo 1, cozido (TACO 4, código 3), por 100 g. */
const arrozCozido: FoodNutrientValue[] = [
  disponivel("energia_kcal", 128.258),
  disponivel("proteina", 2.5208),
  disponivel("carboidrato", 28.0598),
  disponivel("lipidios", 0.227),
  disponivel("fibra", 1.561),
  semValor("colesterol", "nao_aplicavel"),
  semValor("riboflavina", "traco"),
];

describe("scaleNutrient — a fórmula", () => {
  it("aplica nutriente × quantidade ÷ base", () => {
    // 150 g de um alimento com base 100 g → fator 1,5.
    const result = scaleNutrient(disponivel("proteina", 2.5208), 1.5);
    expect(result.amount).toBeCloseTo(3.7812, 10);
    expect(result.state).toBe("disponivel");
  });

  it("mantém o valor nulo e o estado quando não há número", () => {
    for (const state of ["traco", "nao_disponivel", "nao_aplicavel", "em_revisao"] as const) {
      const result = scaleNutrient(semValor("ferro", state), 2);
      expect(result.amount).toBeNull();
      expect(result.state).toBe(state);
    }
  });

  it("não arredonda no meio do caminho", () => {
    const result = scaleNutrient(disponivel("energia_kcal", 128.258), 0.37);
    expect(result.amount).toBe(128.258 * 0.37);
  });
});

describe("scaleNutrients + convertToBase — caminho completo", () => {
  it("calcula 150 g de arroz cozido", () => {
    const conv = convertToBase(150, null, { baseQuantity: 100, baseUnit: "g" });
    expect(conv.ok).toBe(true);
    const bag = scaleNutrients(arrozCozido, conv.ok ? conv.factor : 0);
    expect(bag.energia_kcal.amount).toBeCloseTo(192.387, 3);
    expect(bag.proteina.amount).toBeCloseTo(3.7812, 4);
  });

  it("calcula por medida caseira (2 colheres de 25 g)", () => {
    const conv = convertToBase(2, { label: "Colher", grams: 25, milliliters: null }, {
      baseQuantity: 100,
      baseUnit: "g",
    });
    const bag = scaleNutrients(arrozCozido, conv.ok ? conv.factor : 0);
    // 50 g = metade da base.
    expect(bag.energia_kcal.amount).toBeCloseTo(64.129, 3);
  });

  it("respeita base diferente de 100 (whey com base de 30 g)", () => {
    const conv = convertToBase(45, null, { baseQuantity: 30, baseUnit: "g" });
    const bag = scaleNutrients([disponivel("proteina", 24)], conv.ok ? conv.factor : 0);
    expect(bag.proteina.amount).toBe(36);
  });
});

/* ─────────────── A regra central: ausência não é zero ─────────────── */

const bagCom = (entries: Record<string, FoodNutrientValue>): NutrientBag =>
  scaleNutrients(Object.values(entries), 1);

describe("sumNutrient — propagação de qualidade", () => {
  it("exato quando todos os itens têm o valor publicado", () => {
    const total = sumNutrient(
      [bagCom({ p: disponivel("proteina", 10) }), bagCom({ p: disponivel("proteina", 5) })],
      "proteina",
    );
    expect(total).toMatchObject({ amount: 15, quality: "exato", contributing: 2, missing: 0 });
  });

  it("aproximado quando há traço — conta como zero mas avisa", () => {
    const total = sumNutrient(
      [bagCom({ p: disponivel("proteina", 10) }), bagCom({ p: semValor("proteina", "traco") })],
      "proteina",
    );
    expect(total.amount).toBe(10);
    expect(total.quality).toBe("aproximado");
    expect(total.trace).toBe(1);
  });

  it("parcial quando algum item NÃO tem o nutriente analisado", () => {
    const total = sumNutrient(
      [
        bagCom({ f: disponivel("fibra", 3) }),
        bagCom({ f: semValor("fibra", "nao_disponivel") }),
      ],
      "fibra",
    );
    expect(total.amount).toBe(3);
    expect(total.quality).toBe("parcial");
    expect(total.missing).toBe(1);
  });

  it("parcial quando o item sequer tem a linha do nutriente", () => {
    const total = sumNutrient(
      [bagCom({ f: disponivel("fibra", 3) }), bagCom({ p: disponivel("proteina", 1) })],
      "fibra",
    );
    expect(total.quality).toBe("parcial");
    expect(total.missing).toBe(1);
  });

  it('"em revisão" também torna o total parcial', () => {
    const total = sumNutrient([bagCom({ e: semValor("energia_kcal", "em_revisao") })], "energia_kcal");
    expect(total.quality).toBe("parcial");
  });

  it('"não aplicável" é ignorado e NÃO degrada o total', () => {
    const total = sumNutrient(
      [
        bagCom({ c: disponivel("colesterol", 30) }),
        bagCom({ c: semValor("colesterol", "nao_aplicavel") }),
      ],
      "colesterol",
    );
    expect(total.amount).toBe(30);
    expect(total.quality).toBe("exato");
    expect(total.missing).toBe(0);
  });

  it("zero medido é diferente de não medido", () => {
    const zero = sumNutrient([bagCom({ f: disponivel("fibra", 0) })], "fibra");
    const ausente = sumNutrient([bagCom({ f: semValor("fibra", "nao_disponivel") })], "fibra");
    expect(zero).toMatchObject({ amount: 0, quality: "exato", contributing: 1 });
    expect(ausente).toMatchObject({ amount: 0, quality: "parcial", contributing: 0 });
  });

  it("nutriente ausente de todos os itens vira total parcial, não exato", () => {
    const totals = sumNutrients([bagCom({ p: disponivel("proteina", 1) })]);
    expect(totalQuality(totals, "ferro")).toBe("parcial");
    expect(totalAmount(totals, "ferro")).toBe(0);
  });
});

describe("sumNutrients", () => {
  it("soma todos os nutrientes que aparecem em algum item", () => {
    const totals = sumNutrients([
      scaleNutrients(arrozCozido, 1),
      scaleNutrients([disponivel("proteina", 20), disponivel("ferro", 1.2)], 1),
    ]);
    expect(totals.proteina.amount).toBeCloseTo(22.5208, 4);
    expect(totals.ferro.amount).toBe(1.2);
    // O arroz não tem ferro → o total de ferro é parcial.
    expect(totals.ferro.quality).toBe("parcial");
  });
});

describe("mergeTotals — refeição → dia → semana", () => {
  it("soma e mantém a pior qualidade", () => {
    const almoco = sumNutrients([bagCom({ p: disponivel("proteina", 30) })]);
    const jantar = sumNutrients([bagCom({ p: semValor("proteina", "nao_disponivel") })]);
    const dia = mergeTotals([almoco, jantar]);
    expect(dia.proteina.amount).toBe(30);
    expect(dia.proteina.quality).toBe("parcial");
  });

  it("dia exato + dia exato continua exato", () => {
    const a = sumNutrients([bagCom({ p: disponivel("proteina", 10) })]);
    const b = sumNutrients([bagCom({ p: disponivel("proteina", 20) })]);
    expect(mergeTotals([a, b]).proteina).toMatchObject({ amount: 30, quality: "exato" });
  });

  it("traço em um dia deixa a semana aproximada", () => {
    const a = sumNutrients([bagCom({ p: disponivel("proteina", 10) })]);
    const b = sumNutrients([bagCom({ p: semValor("proteina", "traco") })]);
    expect(mergeTotals([a, b]).proteina.quality).toBe("aproximado");
  });
});

/* ─────────────── Energia ─────────────── */

describe("estimateEnergyKcal", () => {
  it("usa os fatores de Atwater declarados", () => {
    expect(ATWATER_FACTORS).toEqual({
      proteina: 4,
      carboidrato: 4,
      lipidios: 9,
      fibra: 2,
      alcool: 7,
    });
    expect(estimateEnergyKcal({ proteina: 10, carboidrato: 20, lipidios: 5 })).toBe(
      10 * 4 + 20 * 4 + 5 * 9,
    );
  });

  it("considera fibra e álcool quando informados", () => {
    expect(estimateEnergyKcal({ fibra: 10 })).toBe(20);
    expect(estimateEnergyKcal({ alcool: 10 })).toBe(70);
  });

  it("devolve nulo quando não há macro nenhum (não estima do nada)", () => {
    expect(estimateEnergyKcal({})).toBeNull();
    expect(estimateEnergyKcal({ proteina: null, carboidrato: undefined })).toBeNull();
  });
});

describe("energyDivergence", () => {
  it("mede a diferença relativa entre declarada e estimada", () => {
    expect(energyDivergence(100, 110)).toBeCloseTo(0.1, 10);
    expect(energyDivergence(100, 90)).toBeCloseTo(0.1, 10);
  });

  it("devolve nulo quando falta um dos lados", () => {
    expect(energyDivergence(null, 100)).toBeNull();
    expect(energyDivergence(100, null)).toBeNull();
    expect(energyDivergence(0, 100)).toBeNull();
  });
});

/* ─────────────── Apresentação ─────────────── */

describe("roundForDisplay", () => {
  it("arredonda com a precisão pedida", () => {
    expect(roundForDisplay(128.258, 0)).toBe(128);
    expect(roundForDisplay(2.5208, 1)).toBe(2.5);
    expect(roundForDisplay(0.001863, 3)).toBe(0.002);
  });

  it("resolve o erro clássico de ponto flutuante", () => {
    expect(roundForDisplay(1.005, 2)).toBe(1.01);
    expect(roundForDisplay(8.165, 2)).toBe(8.17);
  });

  it("preserva o sinal em valores negativos", () => {
    // Carboidrato por diferença pode ser levemente negativo na própria TACO.
    expect(roundForDisplay(-0.0267, 2)).toBe(-0.03);
    expect(roundForDisplay(-0.0267, 1)).toBe(-0);
  });

  it("aguenta valor inválido sem quebrar a tela", () => {
    expect(roundForDisplay(Number.NaN)).toBe(0);
    expect(roundForDisplay(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("formatNutrientAmount", () => {
  const proteina: NutrientDefinition = {
    code: "proteina",
    name: "Proteína",
    shortName: "Prot",
    unit: "g",
    group: "macro",
    position: 10,
    isCore: true,
    precision: 1,
  };
  const energia: NutrientDefinition = { ...proteina, code: "energia_kcal", unit: "kcal", precision: 0 };

  it("respeita as casas decimais do nutriente e o padrão pt-BR", () => {
    expect(formatNutrientAmount(2.5208, proteina)).toBe("2,5");
    expect(formatNutrientAmount(128.258, energia)).toBe("128");
    expect(formatNutrientAmount(1234.5, energia)).toBe("1.235");
  });
});

describe("metas", () => {
  it("calcula percentual e restante", () => {
    expect(goalPercent(50, 200)).toBe(25);
    expect(goalRemaining(50, 200)).toBe(150);
  });

  it("restante negativo indica que passou da meta", () => {
    expect(goalRemaining(250, 200)).toBe(-50);
  });

  it("distingue 'sem meta' de 'meta zero'", () => {
    expect(goalPercent(50, null)).toBeNull();
    expect(goalPercent(50, 0)).toBeNull();
    expect(goalRemaining(50, null)).toBeNull();
  });
});
