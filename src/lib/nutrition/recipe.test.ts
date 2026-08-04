import { describe, expect, it } from "vitest";
import { sumNutrients } from "./calc";
import { CORE_NUTRIENTS } from "./constants";
import {
  buildRecipeEntrySnapshot,
  describeRecipePortion,
  describeYield,
  ingredientBag,
  per100g,
  perServing,
  preparationDelta,
  recipeTotals,
  scaleTotals,
  servingWeightG,
  totalMinutes,
  totalsToNutrientValues,
  worstTotalQuality,
  type CalcIngredient,
  type IngredientFoodData,
  type RecipeCalcContext,
} from "./recipe";
import { snapshotToBag } from "./snapshot";
import type { FoodNutrientValue } from "./types";

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

/* ── Fixture: bolo simples, três ingredientes, valores por 100 g ── */

const farinha: IngredientFoodData = {
  baseQuantity: 100,
  baseUnit: "g",
  nutrients: [
    disponivel(CORE_NUTRIENTS.energia, 360),
    disponivel(CORE_NUTRIENTS.proteina, 10),
    disponivel(CORE_NUTRIENTS.carboidrato, 75),
    disponivel(CORE_NUTRIENTS.fibra, 2.3),
  ],
};

const acucar: IngredientFoodData = {
  baseQuantity: 100,
  baseUnit: "g",
  nutrients: [
    disponivel(CORE_NUTRIENTS.energia, 387),
    disponivel(CORE_NUTRIENTS.carboidrato, 99.8),
    disponivel(CORE_NUTRIENTS.proteina, 0),
    // A fonte não analisou fibra do açúcar refinado: ausência, não zero.
    semValor(CORE_NUTRIENTS.fibra, "nao_disponivel"),
  ],
};

const leite: IngredientFoodData = {
  baseQuantity: 100,
  baseUnit: "ml",
  nutrients: [
    disponivel(CORE_NUTRIENTS.energia, 60),
    disponivel(CORE_NUTRIENTS.proteina, 3.2),
    disponivel(CORE_NUTRIENTS.carboidrato, 4.7),
  ],
};

const ctx = (): RecipeCalcContext => ({
  foods: new Map([
    ["f-farinha", farinha],
    ["f-acucar", acucar],
    ["f-leite", leite],
  ]),
  measures: new Map([
    ["m-xicara-farinha", { label: "Xícara", grams: 120, milliliters: null }],
    ["m-copo-leite", { label: "Copo", grams: null, milliliters: 200 }],
    // Medida só em gramas para um alimento medido em ml: exigiria densidade.
    ["m-colher-leite", { label: "Colher", grams: 15, milliliters: null }],
  ]),
});

const ing = (patch: Partial<CalcIngredient> & { id: string }): CalcIngredient => ({
  foodId: null,
  quantity: null,
  measureId: null,
  isOptional: false,
  ...patch,
});

/* ═══════════════════════════ Total da receita ═══════════════════════════ */

describe("recipeTotals — o total é a soma dos ingredientes", () => {
  it("soma os ingredientes aplicando a base de cada alimento", () => {
    const result = recipeTotals(
      [
        ing({ id: "i1", foodId: "f-farinha", quantity: 200 }),
        ing({ id: "i2", foodId: "f-acucar", quantity: 100 }),
      ],
      ctx(),
    );

    // 360 × 2 + 387 × 1
    expect(result.totals[CORE_NUTRIENTS.energia].amount).toBeCloseTo(1107, 10);
    expect(result.totals[CORE_NUTRIENTS.proteina].amount).toBeCloseTo(20, 10);
    expect(result.counted).toBe(2);
    expect(result.skipped).toEqual([]);
  });

  it("converte medida caseira antes de somar", () => {
    const result = recipeTotals(
      [ing({ id: "i1", foodId: "f-farinha", quantity: 2, measureId: "m-xicara-farinha" })],
      ctx(),
    );
    // 2 xícaras = 240 g → 360 × 2,4
    expect(result.totals[CORE_NUTRIENTS.energia].amount).toBeCloseTo(864, 10);
    expect(result.rawWeightG).toBeCloseTo(240, 10);
    expect(result.rawWeightComplete).toBe(true);
  });

  it("INGREDIENTE COM NUTRIENTE INDISPONÍVEL não zera o total: deixa parcial", () => {
    const result = recipeTotals(
      [
        ing({ id: "i1", foodId: "f-farinha", quantity: 200 }),
        ing({ id: "i2", foodId: "f-acucar", quantity: 100 }),
      ],
      ctx(),
    );

    const fibra = result.totals[CORE_NUTRIENTS.fibra];
    // A fibra da farinha continua contando…
    expect(fibra.amount).toBeCloseTo(4.6, 10);
    // …mas o total é um PISO, porque o açúcar não tem o valor analisado.
    expect(fibra.quality).toBe("parcial");
    expect(fibra.missing).toBe(1);
    expect(fibra.contributing).toBe(1);
  });

  it("ingrediente sem alimento entra como ausência e marca o total como parcial", () => {
    const result = recipeTotals(
      [
        ing({ id: "i1", foodId: "f-farinha", quantity: 100 }),
        ing({ id: "i2", customLabel: "Sal a gosto" } as Partial<CalcIngredient> & { id: string }),
      ],
      ctx(),
    );

    expect(result.counted).toBe(1);
    expect(result.skipped).toEqual([{ id: "i2", reason: "sem_alimento" }]);
    expect(result.totals[CORE_NUTRIENTS.energia].amount).toBeCloseTo(360, 10);
    expect(result.totals[CORE_NUTRIENTS.energia].quality).toBe("parcial");
  });

  it("alimento excluído do catálogo sai do cálculo com motivo próprio", () => {
    const result = recipeTotals(
      [ing({ id: "i1", foodId: "f-que-nao-existe", quantity: 100 })],
      ctx(),
    );
    expect(result.skipped).toEqual([{ id: "i1", reason: "alimento_indisponivel" }]);
    expect(result.totals).toEqual({});
  });

  it("conversão impossível é motivo explícito, nunca estimativa", () => {
    // Leite é medido em ml; a colher só declara gramas → exigiria densidade.
    const result = recipeTotals(
      [ing({ id: "i1", foodId: "f-leite", quantity: 2, measureId: "m-colher-leite" })],
      ctx(),
    );
    expect(result.skipped).toEqual([{ id: "i1", reason: "conversao_impossivel" }]);
    expect(result.counted).toBe(0);
  });

  it("volume não entra no peso dos ingredientes: somar ml com g exigiria densidade", () => {
    const result = recipeTotals(
      [
        ing({ id: "i1", foodId: "f-farinha", quantity: 100 }),
        ing({ id: "i2", foodId: "f-leite", quantity: 1, measureId: "m-copo-leite" }),
      ],
      ctx(),
    );
    expect(result.counted).toBe(2);
    expect(result.rawWeightG).toBeCloseTo(100, 10);
    // Incompleto: o leite converteu, mas em mililitros.
    expect(result.rawWeightComplete).toBe(false);
  });
});

describe("ingredientBag", () => {
  it("devolve o motivo quando falta quantidade", () => {
    const result = ingredientBag(ing({ id: "i1", foodId: "f-farinha" }), ctx());
    expect(result.skip).toBe("sem_quantidade");
    expect(result.bag).toEqual({});
  });
});

/* ═══════════════════════════ Porção, 100 g e rendimento ═══════════════════════════ */

describe("por porção / por 100 g / rendimento", () => {
  const totals = () =>
    recipeTotals(
      [
        ing({ id: "i1", foodId: "f-farinha", quantity: 200 }),
        ing({ id: "i2", foodId: "f-acucar", quantity: 100 }),
      ],
      ctx(),
    ).totals;

  it("divide o total pelo rendimento", () => {
    const porcao = perServing(totals(), 4);
    expect(porcao[CORE_NUTRIENTS.energia].amount).toBeCloseTo(1107 / 4, 10);
  });

  it("ALTERAR O RENDIMENTO recalcula por porção SEM alterar o total", () => {
    const inteira = totals();
    const antes = perServing(inteira, 4);
    const depois = perServing(inteira, 8);

    expect(antes[CORE_NUTRIENTS.energia].amount).toBeCloseTo(276.75, 10);
    expect(depois[CORE_NUTRIENTS.energia].amount).toBeCloseTo(138.375, 10);
    // O total da receita não se mexeu — é o mesmo objeto de origem.
    expect(inteira[CORE_NUTRIENTS.energia].amount).toBeCloseTo(1107, 10);
  });

  it("rendimento inválido devolve vazio em vez de dividir por zero", () => {
    expect(perServing(totals(), 0)).toEqual({});
    expect(perServing(totals(), -2)).toEqual({});
  });

  it("por 100 g usa o PESO FINAL informado, não a soma dos crus", () => {
    // Soma dos ingredientes = 300 g, mas o bolo pronto pesou 250 g (perdeu água).
    const result = per100g(totals(), 250);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 1107 × 100 ÷ 250 — e não ÷ 300.
    expect(result.totals[CORE_NUTRIENTS.energia].amount).toBeCloseTo(442.8, 10);
  });

  it("PESO FINAL AUSENTE: por 100 g fica indisponível, jamais estimado", () => {
    const result = per100g(totals(), null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("peso_final_ausente");
  });

  it("peso final zero ou negativo também é ausência", () => {
    expect(per100g(totals(), 0).ok).toBe(false);
    expect(per100g(totals(), -100).ok).toBe(false);
  });

  it("a qualidade sobrevive à divisão por porção e por 100 g", () => {
    const porcao = perServing(totals(), 4);
    expect(porcao[CORE_NUTRIENTS.fibra].quality).toBe("parcial");
    const cem = per100g(totals(), 250);
    if (!cem.ok) throw new Error("deveria calcular");
    expect(cem.totals[CORE_NUTRIENTS.fibra].quality).toBe("parcial");
  });

  it("servingWeightG só existe com peso final e rendimento válidos", () => {
    expect(servingWeightG(250, 4)).toBeCloseTo(62.5, 10);
    expect(servingWeightG(null, 4)).toBeNull();
    expect(servingWeightG(250, 0)).toBeNull();
  });

  it("scaleTotals recusa fator não finito", () => {
    expect(scaleTotals(totals(), Number.NaN)).toEqual({});
  });
});

/* ═══════════════════════════ Perda/ganho no preparo ═══════════════════════════ */

describe("preparationDelta — declarado, nunca inferido", () => {
  it("mede a perda entre a soma dos ingredientes e o peso final informado", () => {
    const delta = preparationDelta(300, 250);
    expect(delta).not.toBeNull();
    expect(delta!.deltaG).toBeCloseTo(-50, 10);
    expect(delta!.percent).toBeCloseTo(-16.666666, 4);
    expect(delta!.direction).toBe("perda");
  });

  it("reconhece ganho de peso (absorção de água)", () => {
    const delta = preparationDelta(200, 460);
    expect(delta!.direction).toBe("ganho");
    expect(delta!.deltaG).toBeCloseTo(260, 10);
  });

  it("sem peso final não há delta: nada é inferido", () => {
    expect(preparationDelta(300, null)).toBeNull();
    expect(preparationDelta(null, 250)).toBeNull();
  });

  it("propaga que a soma dos ingredientes estava incompleta", () => {
    const delta = preparationDelta(100, 250, false);
    expect(delta!.complete).toBe(false);
  });
});

/* ═══════════════════════════ Total → valores de nutriente ═══════════════════════════ */

describe("totalsToNutrientValues", () => {
  it("carimba a qualidade agregada para o total do dia não mentir", () => {
    const totals = recipeTotals(
      [
        ing({ id: "i1", foodId: "f-farinha", quantity: 200 }),
        ing({ id: "i2", foodId: "f-acucar", quantity: 100 }),
      ],
      ctx(),
    ).totals;

    const values = totalsToNutrientValues(totals);
    const fibra = values.find((v) => v.code === CORE_NUTRIENTS.fibra);
    expect(fibra?.quality).toBe("parcial");
    expect(fibra?.state).toBe("disponivel");

    const energia = values.find((v) => v.code === CORE_NUTRIENTS.energia);
    expect(energia?.quality).toBeUndefined(); // exato não precisa de carimbo
    expect(energia?.method).toBe("calculado");
  });

  it("nutriente que NINGUÉM tinha vira não disponível, não zero", () => {
    const totals = sumNutrients([
      { [CORE_NUTRIENTS.fibra]: { code: CORE_NUTRIENTS.fibra, amount: null, state: "nao_disponivel", method: "analitico" } },
    ]);
    const values = totalsToNutrientValues(totals);
    expect(values[0].amount).toBeNull();
    expect(values[0].state).toBe("nao_disponivel");
  });
});

describe("worstTotalQuality", () => {
  it("devolve a pior qualidade dos códigos pedidos", () => {
    const totals = recipeTotals(
      [
        ing({ id: "i1", foodId: "f-farinha", quantity: 200 }),
        ing({ id: "i2", foodId: "f-acucar", quantity: 100 }),
      ],
      ctx(),
    ).totals;
    expect(worstTotalQuality(totals, [CORE_NUTRIENTS.energia])).toBe("exato");
    expect(worstTotalQuality(totals, [CORE_NUTRIENTS.energia, CORE_NUTRIENTS.fibra])).toBe("parcial");
  });
});

/* ═══════════════════════════ Receita → item do diário ═══════════════════════════ */

const bolo = () => ({
  name: "Bolo de fubá da vó",
  servings: 8,
  servingLabel: "fatia",
  totalWeightG: 800 as number | null,
});

const boloTotals = () =>
  recipeTotals(
    [
      ing({ id: "i1", foodId: "f-farinha", quantity: 200 }),
      ing({ id: "i2", foodId: "f-acucar", quantity: 100 }),
    ],
    ctx(),
  ).totals;

describe("buildRecipeEntrySnapshot — mesmo caminho de gravação do alimento", () => {
  it("registra em porções com peso final: a porção vira medida caseira real", () => {
    const result = buildRecipeEntrySnapshot({
      recipe: bolo(),
      totals: boloTotals(),
      quantity: 2,
      portionUnit: "porcao",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 2 fatias de 100 g = 200 g de um bolo de 800 g → 25% do total.
    expect(result.snapshot.gramsEquivalent).toBeCloseTo(200, 10);
    expect(result.snapshot.measureLabel).toBe("fatia");
    expect(result.snapshot.nutrientsSnapshot[CORE_NUTRIENTS.energia].amount).toBeCloseTo(
      1107 * 0.25,
      10,
    );
    expect(result.snapshot.foodNameSnapshot).toBe("Bolo de fubá da vó");
  });

  it("registra em gramas do preparo pronto", () => {
    const result = buildRecipeEntrySnapshot({
      recipe: bolo(),
      totals: boloTotals(),
      quantity: 400,
      portionUnit: "peso",
    });
    if (!result.ok) throw new Error("deveria calcular");
    expect(result.snapshot.gramsEquivalent).toBeCloseTo(400, 10);
    expect(result.snapshot.nutrientsSnapshot[CORE_NUTRIENTS.energia].amount).toBeCloseTo(
      1107 * 0.5,
      10,
    );
  });

  it("SEM PESO FINAL: registra em porções e deixa o peso NULO, nunca zero", () => {
    const result = buildRecipeEntrySnapshot({
      recipe: { ...bolo(), totalWeightG: null },
      totals: boloTotals(),
      quantity: 2,
      portionUnit: "porcao",
    });
    if (!result.ok) throw new Error("deveria calcular");

    // A proporção é conhecida (2 de 8 porções = 25%)…
    expect(result.snapshot.nutrientsSnapshot[CORE_NUTRIENTS.energia].amount).toBeCloseTo(
      1107 * 0.25,
      10,
    );
    // …mas o peso não é. Nulo é a resposta honesta.
    expect(result.snapshot.gramsEquivalent).toBeNull();
    expect(result.snapshot.baseQuantity).toBeNull();
    expect(result.snapshot.baseUnit).toBeNull();
    expect(result.snapshot.measureLabel).toBe("fatia");
  });

  it("SEM PESO FINAL recusa registro em gramas em vez de estimar", () => {
    const result = buildRecipeEntrySnapshot({
      recipe: { ...bolo(), totalWeightG: null },
      totals: boloTotals(),
      quantity: 150,
      portionUnit: "peso",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("peso_final_ausente");
  });

  it("a QUALIDADE PARCIAL da receita viaja para o snapshot", () => {
    const result = buildRecipeEntrySnapshot({
      recipe: bolo(),
      totals: boloTotals(),
      quantity: 1,
      portionUnit: "porcao",
    });
    if (!result.ok) throw new Error("deveria calcular");
    expect(result.snapshot.nutrientsSnapshot[CORE_NUTRIENTS.fibra].quality).toBe("parcial");
    expect(result.snapshot.nutrientsSnapshot[CORE_NUTRIENTS.energia].quality).toBeUndefined();
  });

  it("o total do DIA fica parcial por causa da receita parcial", () => {
    const result = buildRecipeEntrySnapshot({
      recipe: bolo(),
      totals: boloTotals(),
      quantity: 1,
      portionUnit: "porcao",
    });
    if (!result.ok) throw new Error("deveria calcular");

    const dia = sumNutrients([snapshotToBag(result.snapshot.nutrientsSnapshot)]);
    expect(dia[CORE_NUTRIENTS.fibra].quality).toBe("parcial");
    expect(dia[CORE_NUTRIENTS.energia].quality).toBe("exato");
  });

  it("recusa quantidade zero, negativa e rendimento inválido", () => {
    for (const quantity of [0, -1]) {
      const result = buildRecipeEntrySnapshot({
        recipe: bolo(),
        totals: boloTotals(),
        quantity,
        portionUnit: "porcao",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("quantidade_invalida");
    }

    const semRendimento = buildRecipeEntrySnapshot({
      recipe: { ...bolo(), servings: 0, totalWeightG: null },
      totals: boloTotals(),
      quantity: 1,
      portionUnit: "porcao",
    });
    expect(semRendimento.ok).toBe(false);
    if (!semRendimento.ok) expect(semRendimento.reason).toBe("rendimento_invalido");
  });

  it("recusa receita sem nenhum valor calculável", () => {
    const result = buildRecipeEntrySnapshot({
      recipe: bolo(),
      totals: {},
      quantity: 1,
      portionUnit: "porcao",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("sem_valor_calculado");
  });
});

describe("IMUTABILIDADE — editar a receita não muda o passado", () => {
  it("o registro de ontem sobrevive à edição e à exclusão da receita", () => {
    const ontem = buildRecipeEntrySnapshot({
      recipe: bolo(),
      totals: boloTotals(),
      quantity: 2,
      portionUnit: "porcao",
    });
    if (!ontem.ok) throw new Error("deveria calcular");
    const totalOntem = sumNutrients([snapshotToBag(ontem.snapshot.nutrientsSnapshot)]);
    expect(totalOntem[CORE_NUTRIENTS.energia].amount).toBeCloseTo(276.75, 10);

    // Hoje a receita é editada: dobra o açúcar, muda o nome e o rendimento.
    const receitaNova = { ...bolo(), name: "Bolo de fubá (versão doce)", servings: 4 };
    const totaisNovos = recipeTotals(
      [
        ing({ id: "i1", foodId: "f-farinha", quantity: 200 }),
        ing({ id: "i2", foodId: "f-acucar", quantity: 300 }),
      ],
      ctx(),
    ).totals;

    // O snapshot de ontem não sabe disso — e é esse o ponto.
    const depois = sumNutrients([snapshotToBag(ontem.snapshot.nutrientsSnapshot)]);
    expect(depois[CORE_NUTRIENTS.energia].amount).toBeCloseTo(276.75, 10);
    expect(ontem.snapshot.foodNameSnapshot).toBe("Bolo de fubá da vó");

    // E o registro de hoje reflete a versão nova, como deve.
    const hoje = buildRecipeEntrySnapshot({
      recipe: receitaNova,
      totals: totaisNovos,
      quantity: 2,
      portionUnit: "porcao",
    });
    if (!hoje.ok) throw new Error("deveria calcular");
    expect(hoje.snapshot.foodNameSnapshot).toBe("Bolo de fubá (versão doce)");
    expect(hoje.snapshot.nutrientsSnapshot[CORE_NUTRIENTS.energia].amount).toBeCloseTo(
      (360 * 2 + 387 * 3) * (2 / 4),
      10,
    );
  });
});

/* ═══════════════════════════ Rótulos ═══════════════════════════ */

describe("rótulos", () => {
  it("descreve a porção escolhida", () => {
    expect(describeRecipePortion({ servingLabel: "fatia" }, 2, "porcao")).toBe("2 fatias");
    expect(describeRecipePortion({ servingLabel: "fatia" }, 1, "porcao")).toBe("1 fatia");
    expect(describeRecipePortion({ servingLabel: null }, 3, "porcao")).toBe("3 porções");
    expect(describeRecipePortion({ servingLabel: "fatia" }, 150, "peso")).toBe("150 g");
  });

  it("descreve o rendimento com e sem peso da porção", () => {
    expect(describeYield(bolo())).toBe("Rende 8 fatias de 100 g");
    expect(describeYield({ ...bolo(), totalWeightG: null })).toBe("Rende 8 fatias");
    expect(
      describeYield({ name: "x", servings: 1, servingLabel: null, totalWeightG: null }),
    ).toBe("Rende 1 porção");
  });

  it("soma os tempos de preparo, distinguindo ausência de zero", () => {
    expect(totalMinutes(15, 40)).toBe(55);
    expect(totalMinutes(15, null)).toBe(15);
    expect(totalMinutes(null, null)).toBeNull();
  });
});
