import { describe, expect, it } from "vitest";
import { CORE_NUTRIENTS } from "./constants";
import {
  copyName,
  duplicateDraft,
  templateItemBag,
  templateItemsToRegister,
  templateTotals,
  type TemplateCalcContext,
} from "./meal-template";
import { recipeTotals, type IngredientFoodData } from "./recipe";
import type { FoodNutrientValue, MealTemplateItem } from "./types";

const disponivel = (code: string, amount: number): FoodNutrientValue => ({
  code,
  amount,
  state: "disponivel",
  method: "analitico",
  sourceNote: null,
});

const semValor = (code: string): FoodNutrientValue => ({
  code,
  amount: null,
  state: "nao_disponivel",
  method: "analitico",
  sourceNote: null,
});

const pao: IngredientFoodData = {
  baseQuantity: 100,
  baseUnit: "g",
  nutrients: [
    disponivel(CORE_NUTRIENTS.energia, 300),
    disponivel(CORE_NUTRIENTS.proteina, 8),
    disponivel(CORE_NUTRIENTS.fibra, 6.5),
  ],
};

const ovo: IngredientFoodData = {
  baseQuantity: 100,
  baseUnit: "g",
  nutrients: [
    disponivel(CORE_NUTRIENTS.energia, 143),
    disponivel(CORE_NUTRIENTS.proteina, 13),
    // A fonte não analisou fibra do ovo.
    semValor(CORE_NUTRIENTS.fibra),
  ],
};

/** Uma receita simples: 200 g de pão viram um "pão de queijo caseiro" de 8 unidades. */
const receita = () =>
  recipeTotals(
    [{ id: "i1", foodId: "f-pao", quantity: 200, measureId: null, isOptional: false }],
    { foods: new Map([["f-pao", pao]]), measures: new Map() },
  ).totals;

const ctx = (): TemplateCalcContext => ({
  foods: new Map([
    ["f-pao", pao],
    ["f-ovo", ovo],
  ]),
  measures: new Map([["m-fatia", { label: "Fatia", grams: 25, milliliters: null }]]),
  recipes: new Map([
    ["r-1", { servings: 8, totalWeightG: 400, totals: receita() }],
    ["r-sem-peso", { servings: 4, totalWeightG: null, totals: receita() }],
  ]),
});

const item = (patch: Partial<MealTemplateItem> & { id: string }): MealTemplateItem => ({
  templateId: "t-1",
  itemKind: "alimento",
  foodId: null,
  recipeId: null,
  customLabel: null,
  quantity: null,
  measureId: null,
  measureLabel: null,
  portionUnit: null,
  isOptional: false,
  notes: null,
  position: 0,
  ...patch,
});

/* ═══════════════════════════ Total do modelo ═══════════════════════════ */

describe("templateTotals — alimentos e receitas no mesmo total", () => {
  it("soma alimento com medida caseira", () => {
    const result = templateTotals(
      [item({ id: "a", foodId: "f-pao", quantity: 2, measureId: "m-fatia" })],
      ctx(),
    );
    // 2 fatias = 50 g → 300 × 0,5
    expect(result.totals[CORE_NUTRIENTS.energia].amount).toBeCloseTo(150, 10);
    expect(result.counted).toBe(1);
  });

  it("soma receita em porções, aplicando o rendimento", () => {
    const result = templateTotals(
      [item({ id: "r", itemKind: "receita", recipeId: "r-1", quantity: 2, portionUnit: "porcao" })],
      ctx(),
    );
    // A receita inteira tem 600 kcal (200 g de pão); 2 de 8 porções = 25%.
    expect(result.totals[CORE_NUTRIENTS.energia].amount).toBeCloseTo(150, 10);
  });

  it("soma receita em gramas quando há peso final", () => {
    const result = templateTotals(
      [item({ id: "r", itemKind: "receita", recipeId: "r-1", quantity: 100, portionUnit: "peso" })],
      ctx(),
    );
    // 100 g de um preparo de 400 g = 25% de 600 kcal.
    expect(result.totals[CORE_NUTRIENTS.energia].amount).toBeCloseTo(150, 10);
  });

  it("receita SEM peso final não pode ser medida em gramas", () => {
    const result = templateTotals(
      [
        item({
          id: "r",
          itemKind: "receita",
          recipeId: "r-sem-peso",
          quantity: 100,
          portionUnit: "peso",
        }),
      ],
      ctx(),
    );
    expect(result.skipped).toEqual([{ id: "r", reason: "porcao_impossivel" }]);
    expect(result.counted).toBe(0);
  });

  it("item livre não zera o total: deixa parcial", () => {
    const result = templateTotals(
      [
        item({ id: "a", foodId: "f-pao", quantity: 100 }),
        item({ id: "l", itemKind: "livre", customLabel: "Café sem açúcar" }),
      ],
      ctx(),
    );
    expect(result.counted).toBe(1);
    expect(result.skipped).toEqual([{ id: "l", reason: "item_livre" }]);
    expect(result.totals[CORE_NUTRIENTS.energia].amount).toBeCloseTo(300, 10);
    expect(result.totals[CORE_NUTRIENTS.energia].quality).toBe("parcial");
  });

  it("nutriente não analisado em um item deixa o total do modelo parcial", () => {
    const result = templateTotals(
      [
        item({ id: "a", foodId: "f-pao", quantity: 100 }),
        item({ id: "b", foodId: "f-ovo", quantity: 100 }),
      ],
      ctx(),
    );
    expect(result.totals[CORE_NUTRIENTS.proteina].quality).toBe("exato");
    // O ovo não tem fibra analisada: o total é um piso.
    expect(result.totals[CORE_NUTRIENTS.fibra].amount).toBeCloseTo(6.5, 10);
    expect(result.totals[CORE_NUTRIENTS.fibra].quality).toBe("parcial");
  });

  it("alimento e receita excluídos saem do cálculo com motivo próprio", () => {
    const result = templateTotals(
      [
        item({ id: "a", foodId: "f-sumiu", quantity: 100 }),
        item({ id: "r", itemKind: "receita", recipeId: "r-sumiu", quantity: 1 }),
      ],
      ctx(),
    );
    expect(result.skipped).toEqual([
      { id: "a", reason: "alimento_indisponivel" },
      { id: "r", reason: "receita_indisponivel" },
    ]);
  });

  it("item sem quantidade não entra na conta", () => {
    const result = templateItemBag(item({ id: "a", foodId: "f-pao" }), ctx());
    expect(result.skip).toBe("sem_quantidade");
  });
});

/* ═══════════════════════════ Não duplicar consumo ═══════════════════════════ */

describe("templateItemsToRegister — adicionar o modelo duas vezes NÃO duplica", () => {
  const itens = [
    item({ id: "a", foodId: "f-pao", quantity: 100 }),
    item({ id: "b", foodId: "f-ovo", quantity: 50 }),
  ];

  it("na primeira vez registra tudo", () => {
    const plan = templateItemsToRegister("t-1", itens, []);
    expect(plan.alreadyRegistered).toBe(false);
    expect(plan.items).toHaveLength(2);
  });

  it("na segunda vez não registra nada e avisa", () => {
    const jaRegistrado = [
      { mealTemplateId: "t-1" },
      { mealTemplateId: "t-1" },
      { mealTemplateId: null },
    ];
    const plan = templateItemsToRegister("t-1", itens, jaRegistrado);
    expect(plan.alreadyRegistered).toBe(true);
    expect(plan.items).toEqual([]);
  });

  it("um modelo diferente na mesma refeição continua sendo adicionado", () => {
    const plan = templateItemsToRegister("t-2", itens, [{ mealTemplateId: "t-1" }]);
    expect(plan.alreadyRegistered).toBe(false);
    expect(plan.items).toHaveLength(2);
  });

  it("repetir de propósito exige escolha explícita", () => {
    const plan = templateItemsToRegister("t-1", itens, [{ mealTemplateId: "t-1" }], {
      force: true,
    });
    expect(plan.alreadyRegistered).toBe(true);
    expect(plan.items).toHaveLength(2);
  });

  it("itens registrados manualmente (sem modelo) não bloqueiam", () => {
    const plan = templateItemsToRegister("t-1", itens, [
      { mealTemplateId: null },
      { mealTemplateId: null },
    ]);
    expect(plan.alreadyRegistered).toBe(false);
    expect(plan.items).toHaveLength(2);
  });
});

/* ═══════════════════════════ Duplicação ═══════════════════════════ */

describe("duplicateDraft — a cópia não herda histórico", () => {
  const original = {
    id: "r-1",
    name: "Bolo de fubá",
    useCount: 42,
    lastUsedAt: "2026-08-01T12:00:00.000Z",
    isFavorite: true,
  };

  it("NÃO copia contagem de uso, último uso, favorito nem arquivamento", () => {
    const draft = duplicateDraft(original);
    expect(draft.useCount).toBe(0);
    expect(draft.lastUsedAt).toBeNull();
    expect(draft.isFavorite).toBe(false);
    expect(draft.archivedAt).toBeNull();
  });

  it("marca como cópia e registra a origem", () => {
    const draft = duplicateDraft(original);
    expect(draft.isCopy).toBe(true);
    expect(draft.originId).toBe("r-1");
  });

  it("o original continua intacto", () => {
    duplicateDraft(original);
    expect(original.useCount).toBe(42);
    expect(original.isFavorite).toBe(true);
  });

  it("nomeia a cópia e incrementa quando já é uma cópia", () => {
    expect(copyName("Bolo de fubá")).toBe("Bolo de fubá (cópia)");
    expect(copyName("Bolo de fubá (cópia)")).toBe("Bolo de fubá (cópia 2)");
    expect(copyName("Bolo de fubá (cópia 2)")).toBe("Bolo de fubá (cópia 3)");
    expect(copyName("  Bolo de fubá  ")).toBe("Bolo de fubá (cópia)");
  });
});
