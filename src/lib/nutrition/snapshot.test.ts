import { describe, expect, it } from "vitest";
import { sumNutrients } from "./calc";
import {
  buildDiaryEntrySnapshot,
  describeSnapshotPortion,
  parseNutrientSnapshot,
  snapshotToBag,
  type SnapshotFoodInput,
} from "./snapshot";
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

/** Arroz, tipo 1, cozido (TACO 4, código 3), por 100 g. */
const arrozCozido = (): SnapshotFoodInput => ({
  name: "Arroz, tipo 1, cozido",
  preparationState: "cozido",
  brand: null,
  baseQuantity: 100,
  baseUnit: "g",
  sourceId: "src-taco",
  sourceName: "TACO — Tabela Brasileira de Composição de Alimentos",
  sourceVersion: "4",
  sourceFoodCode: "3",
  nutrients: [
    disponivel("energia_kcal", 128.258),
    disponivel("proteina", 2.5208),
    disponivel("carboidrato", 28.0598),
    semValor("riboflavina", "traco"),
    semValor("vitamina_b12", "nao_disponivel"),
  ],
});

describe("buildDiaryEntrySnapshot — congela o consumo", () => {
  it("aplica a fórmula do catálogo e guarda a conversão", () => {
    const result = buildDiaryEntrySnapshot({ food: arrozCozido(), quantity: 150, measure: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.snapshot.gramsEquivalent).toBe(150);
    expect(result.snapshot.baseQuantity).toBe(100);
    expect(result.snapshot.baseUnit).toBe("g");
    // 128,258 × 150 ÷ 100
    expect(result.snapshot.nutrientsSnapshot.energia_kcal.amount).toBeCloseTo(192.387, 10);
    expect(result.snapshot.energyKcal).toBeCloseTo(192.387, 10);
  });

  it("guarda identidade, preparo e procedência no momento do registro", () => {
    const result = buildDiaryEntrySnapshot({ food: arrozCozido(), quantity: 100, measure: null });
    if (!result.ok) throw new Error("conversão deveria funcionar");

    expect(result.snapshot.foodNameSnapshot).toBe("Arroz, tipo 1, cozido");
    expect(result.snapshot.preparationStateSnapshot).toBe("cozido");
    expect(result.snapshot.sourceVersionSnapshot).toBe("4");
    expect(result.snapshot.sourceFoodCodeSnapshot).toBe("3");
  });

  it("converte medida caseira e registra o rótulo usado", () => {
    const result = buildDiaryEntrySnapshot({
      food: arrozCozido(),
      quantity: 2,
      measure: { label: "Colher de sopa", grams: 25, milliliters: null },
    });
    if (!result.ok) throw new Error("conversão deveria funcionar");

    expect(result.snapshot.gramsEquivalent).toBe(50);
    expect(result.snapshot.measureLabel).toBe("Colher de sopa");
    expect(result.snapshot.nutrientsSnapshot.proteina.amount).toBeCloseTo(1.2604, 10);
  });

  it("preserva traço e não disponível — nenhum vira zero", () => {
    const result = buildDiaryEntrySnapshot({ food: arrozCozido(), quantity: 200, measure: null });
    if (!result.ok) throw new Error("conversão deveria funcionar");

    expect(result.snapshot.nutrientsSnapshot.riboflavina).toEqual({
      amount: null,
      state: "traco",
      method: "analitico",
    });
    expect(result.snapshot.nutrientsSnapshot.vitamina_b12.amount).toBeNull();
    expect(result.snapshot.nutrientsSnapshot.vitamina_b12.state).toBe("nao_disponivel");
  });

  it("deixa a coluna quente NULA quando o nutriente não está disponível", () => {
    const semFibra: SnapshotFoodInput = {
      ...arrozCozido(),
      nutrients: [disponivel("energia_kcal", 100), semValor("fibra", "nao_disponivel")],
    };
    const result = buildDiaryEntrySnapshot({ food: semFibra, quantity: 100, measure: null });
    if (!result.ok) throw new Error("conversão deveria funcionar");

    // Nulo, jamais 0: a coluna quente não tem onde guardar o estado, e um 0 seria lido
    // como "medido zero".
    expect(result.snapshot.fiberG).toBeNull();
    expect(result.snapshot.energyKcal).toBe(100);
  });

  it("respeita base diferente de 100", () => {
    const suplemento: SnapshotFoodInput = {
      ...arrozCozido(),
      name: "Whey, baunilha",
      baseQuantity: 30,
      baseUnit: "g",
      nutrients: [disponivel("proteina", 24)],
    };
    const result = buildDiaryEntrySnapshot({ food: suplemento, quantity: 45, measure: null });
    if (!result.ok) throw new Error("conversão deveria funcionar");

    // 24 g de proteína por 30 g → 45 g rendem 36 g.
    expect(result.snapshot.nutrientsSnapshot.proteina.amount).toBeCloseTo(36, 10);
  });

  it("recusa conversão impossível em vez de estimar", () => {
    const bebida: SnapshotFoodInput = { ...arrozCozido(), baseUnit: "ml" };
    const result = buildDiaryEntrySnapshot({
      food: bebida,
      quantity: 1,
      // Medida só em gramas para alimento medido em ml: exigiria densidade.
      measure: { label: "Colher", grams: 15, milliliters: null },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("unidade_incompativel");
  });

  it("recusa quantidade zero ou negativa", () => {
    for (const quantity of [0, -5]) {
      const result = buildDiaryEntrySnapshot({ food: arrozCozido(), quantity, measure: null });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("quantidade_invalida");
    }
  });
});

describe("IMUTABILIDADE — editar o alimento não muda o passado", () => {
  it("o total de ontem continua igual depois de o alimento ser corrigido hoje", () => {
    const food = arrozCozido();

    // Ontem: 150 g registrados com os valores da época.
    const ontem = buildDiaryEntrySnapshot({ food, quantity: 150, measure: null });
    if (!ontem.ok) throw new Error("conversão deveria funcionar");
    const totalOntem = sumNutrients([snapshotToBag(ontem.snapshot.nutrientsSnapshot)]);
    expect(totalOntem.energia_kcal.amount).toBeCloseTo(192.387, 10);

    // Hoje o alimento é EDITADO no catálogo: energia e proteína mudam, um nutriente some.
    food.name = "Arroz, tipo 1, cozido (revisado)";
    food.nutrients = [disponivel("energia_kcal", 999), disponivel("proteina", 50)];
    food.sourceVersion = "5";

    // O snapshot de ontem não sabe disso — e é esse o ponto.
    const totalDepois = sumNutrients([snapshotToBag(ontem.snapshot.nutrientsSnapshot)]);
    expect(totalDepois.energia_kcal.amount).toBeCloseTo(192.387, 10);
    expect(ontem.snapshot.foodNameSnapshot).toBe("Arroz, tipo 1, cozido");
    expect(ontem.snapshot.sourceVersionSnapshot).toBe("4");

    // E o registro de hoje reflete a versão nova, como deve.
    const hoje = buildDiaryEntrySnapshot({ food, quantity: 150, measure: null });
    if (!hoje.ok) throw new Error("conversão deveria funcionar");
    expect(hoje.snapshot.nutrientsSnapshot.energia_kcal.amount).toBeCloseTo(1498.5, 10);
    expect(hoje.snapshot.foodNameSnapshot).toBe("Arroz, tipo 1, cozido (revisado)");
  });

  it("excluir o alimento não apaga nem altera o snapshot", () => {
    const result = buildDiaryEntrySnapshot({ food: arrozCozido(), quantity: 100, measure: null });
    if (!result.ok) throw new Error("conversão deveria funcionar");

    // `food_id` vira nulo no banco (on delete set null); o snapshot é autossuficiente.
    const bag = snapshotToBag(result.snapshot.nutrientsSnapshot);
    expect(bag.energia_kcal.amount).toBeCloseTo(128.258, 10);
    expect(result.snapshot.foodNameSnapshot).toBe("Arroz, tipo 1, cozido");
  });
});

describe("parseNutrientSnapshot — jsonb do banco", () => {
  it("lê o formato gravado", () => {
    const bag = parseNutrientSnapshot({
      proteina: { amount: 12.5, state: "disponivel", method: "analitico" },
      fibra: { amount: null, state: "nao_disponivel", method: "desconhecido" },
    });
    expect(bag.proteina.amount).toBe(12.5);
    expect(bag.fibra.amount).toBeNull();
  });

  it("aceita número em texto (numeric do Postgres via JSON)", () => {
    const bag = parseNutrientSnapshot({ proteina: { amount: "12.5", state: "disponivel" } });
    expect(bag.proteina.amount).toBe(12.5);
  });

  it("rebaixa a 'não disponível' o valor marcado como disponível sem número", () => {
    // Incoerência não pode virar um total que parece exato.
    const bag = parseNutrientSnapshot({ proteina: { amount: null, state: "disponivel" } });
    expect(bag.proteina.state).toBe("nao_disponivel");
    expect(bag.proteina.amount).toBeNull();
  });

  it("descarta entrada malformada em vez de transformá-la em zero", () => {
    const bag = parseNutrientSnapshot({
      ok: { amount: 1, state: "disponivel" },
      lixo: "não é objeto",
      semEstado: { amount: 5 },
    });
    expect(Object.keys(bag)).toEqual(["ok"]);
  });

  it("tolera nulo, array e tipo errado", () => {
    expect(parseNutrientSnapshot(null)).toEqual({});
    expect(parseNutrientSnapshot([1, 2])).toEqual({});
    expect(parseNutrientSnapshot("texto")).toEqual({});
  });
});

describe("describeSnapshotPortion", () => {
  it("descreve a porção em unidade-base", () => {
    expect(
      describeSnapshotPortion({
        quantity: 150,
        measureLabel: null,
        gramsEquivalent: 150,
        baseUnit: "g",
      }),
    ).toBe("150 g");
  });

  it("descreve medida caseira com a conversão", () => {
    expect(
      describeSnapshotPortion({
        quantity: 2,
        measureLabel: "Colher de sopa",
        gramsEquivalent: 50,
        baseUnit: "g",
      }),
    ).toBe("2 × Colher de sopa (50 g)");
  });

  it("usa mililitros quando a base é volume", () => {
    expect(
      describeSnapshotPortion({
        quantity: 1,
        measureLabel: "Copo",
        gramsEquivalent: 200,
        baseUnit: "ml",
      }),
    ).toBe("1 × Copo (200 ml)");
  });
});
