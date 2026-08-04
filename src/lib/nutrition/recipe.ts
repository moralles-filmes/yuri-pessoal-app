/**
 * Fase 16-C — Dieta e Alimentação · Cálculo de receitas (PURO, sem I/O).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ REGRA 1: total = SOMA DOS INGREDIENTES. "Por 100 g" usa o PESO FINAL INFORMADO.      ║
 * ║ Sem peso final, "por 100 g" fica INDISPONÍVEL — jamais estimado.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O erro que este arquivo existe para impedir: deduzir o peso do preparo somando os
 * ingredientes crus. Um refogado perde água, um bolo perde água e ganha volume, um feijão
 * ganha água — a variação depende do fogo, do tempo e da panela. Estimar isso é inventar
 * dado, exatamente como tratar "não analisado" como zero. Quando o usuário não informou o
 * peso final, a resposta honesta é "não sei", e a UI diz isso.
 *
 * ══ REUSO OBRIGATÓRIO ══
 * A conta é a de sempre: `convertToBase` (units.ts) + `scaleNutrients` + `sumNutrients`
 * (calc.ts). Nenhuma fórmula nova nasce aqui — se nascesse, receita e diário passariam a
 * discordar sobre quantas calorias tem a mesma comida.
 *
 * ══ INGREDIENTE SEM DADO NÃO ZERA O TOTAL ══
 * Ingrediente sem alimento ("tempero a gosto"), com alimento excluído do catálogo ou com
 * conversão impossível entra como conjunto VAZIO — e `sumNutrient` conta isso como ausência,
 * marcando o total como PARCIAL. Um total parcial com cara de exato seria mentira numérica.
 *
 * ══ A QUALIDADE VIAJA COM O NÚMERO ══
 * `totalsToNutrientValues` carimba a qualidade agregada em cada nutriente, e é isso que faz o
 * total do DIA continuar honesto depois que a receita vira um item do diário.
 *
 * Nada aqui chama `Date.now()` nem toca no banco.
 */
import {
  scaleNutrients,
  sumNutrients,
  type NutrientBag,
  type NutrientTotal,
  type NutrientTotalQuality,
} from "./calc";
import type { BaseUnit, PortionUnit } from "./constants";
import { buildDiaryEntrySnapshot, type SnapshotFoodInput } from "./snapshot";
import { convertToBase, formatAmount, type ConvertibleMeasure } from "./units";
import type { DiaryEntrySnapshot, FoodNutrientValue } from "./types";

/* ───────────────────────────── Entradas ───────────────────────────── */

/** O que o cálculo precisa saber do alimento de um ingrediente. */
export type IngredientFoodData = {
  baseQuantity: number;
  baseUnit: BaseUnit;
  nutrients: FoodNutrientValue[];
};

/** Um ingrediente, reduzido ao que importa para a conta. */
export type CalcIngredient = {
  id: string;
  foodId: string | null;
  quantity: number | null;
  measureId: string | null;
  isOptional: boolean;
};

export type RecipeCalcContext = {
  /** Dados do alimento, por `foodId`. */
  foods: Map<string, IngredientFoodData>;
  /** Medida caseira, por `measureId`. */
  measures: Map<string, ConvertibleMeasure>;
};

/** Por que um ingrediente não entrou na conta. Nunca vira "zero". */
export type IngredientSkipReason =
  | "sem_alimento"
  | "alimento_indisponivel"
  | "sem_quantidade"
  | "conversao_impossivel";

export const INGREDIENT_SKIP_MESSAGES: Record<IngredientSkipReason, string> = {
  sem_alimento:
    "Item sem alimento do catálogo: não contribui com valor nutricional, e o total fica parcial.",
  alimento_indisponivel:
    "O alimento não está mais no catálogo. O ingrediente continua na receita, mas fora do cálculo.",
  sem_quantidade: "Sem quantidade definida, não há o que calcular.",
  conversao_impossivel:
    "A medida escolhida não converte para a unidade do alimento. Cadastre a conversão para incluir no cálculo.",
};

export type SkippedIngredient = { id: string; reason: IngredientSkipReason };

export type RecipeCalcResult = {
  /** Total da receita INTEIRA. */
  totals: Record<string, NutrientTotal>;
  /** Quantos ingredientes entraram na conta. */
  counted: number;
  /** Quais ficaram de fora e por quê — a UI mostra, em vez de somar zero em silêncio. */
  skipped: SkippedIngredient[];
  /**
   * Soma do peso dos ingredientes que converteram para GRAMAS. Serve só para comparar com o
   * peso final informado; não substitui esse peso em hipótese nenhuma.
   */
  rawWeightG: number | null;
  /** Falso quando algum ingrediente não converteu ou era medido em volume (ml). */
  rawWeightComplete: boolean;
};

/* ───────────────────────────── Um ingrediente ───────────────────────────── */

/**
 * Nutrientes de um ingrediente, já ajustados à quantidade.
 *
 * Devolve o motivo quando não dá para calcular — e um conjunto VAZIO, que `sumNutrient` lê
 * como ausência. Ausência degrada o total para parcial; zero fingiria uma medição.
 */
export function ingredientBag(
  ingredient: CalcIngredient,
  ctx: RecipeCalcContext,
): { bag: NutrientBag; grams: number | null; skip: IngredientSkipReason | null } {
  if (!ingredient.foodId) {
    return { bag: {}, grams: null, skip: "sem_alimento" };
  }
  const food = ctx.foods.get(ingredient.foodId);
  if (!food) {
    return { bag: {}, grams: null, skip: "alimento_indisponivel" };
  }
  if (ingredient.quantity === null) {
    return { bag: {}, grams: null, skip: "sem_quantidade" };
  }

  const measure = ingredient.measureId ? (ctx.measures.get(ingredient.measureId) ?? null) : null;
  const conversion = convertToBase(ingredient.quantity, measure, {
    baseQuantity: food.baseQuantity,
    baseUnit: food.baseUnit,
  });
  if (!conversion.ok) {
    return { bag: {}, grams: null, skip: "conversao_impossivel" };
  }

  return {
    bag: scaleNutrients(food.nutrients, conversion.factor),
    // Só massa entra no peso: somar ml com g exigiria densidade, e densidade presumida é
    // dado inventado (a mesma regra de `convertToBase`).
    grams: food.baseUnit === "g" ? conversion.amount : null,
    skip: null,
  };
}

/* ───────────────────────────── A receita inteira ───────────────────────────── */

/**
 * Total da receita: a soma dos ingredientes, com a qualidade propagada.
 *
 * Ingrediente opcional entra normalmente — ele faz parte da receita como está escrita. Quem
 * decide não usar remove o item ou registra outra quantidade.
 */
export function recipeTotals(
  ingredients: CalcIngredient[],
  ctx: RecipeCalcContext,
): RecipeCalcResult {
  const bags: NutrientBag[] = [];
  const skipped: SkippedIngredient[] = [];
  let counted = 0;
  let rawWeightG = 0;
  let rawWeightComplete = ingredients.length > 0;

  for (const ingredient of ingredients) {
    const result = ingredientBag(ingredient, ctx);
    // O bag vazio É a informação: ele marca o total como parcial.
    bags.push(result.bag);

    if (result.skip) {
      skipped.push({ id: ingredient.id, reason: result.skip });
      rawWeightComplete = false;
      continue;
    }
    counted += 1;
    if (result.grams === null) rawWeightComplete = false;
    else rawWeightG += result.grams;
  }

  return {
    totals: sumNutrients(bags),
    counted,
    skipped,
    rawWeightG: counted > 0 && rawWeightG > 0 ? rawWeightG : null,
    rawWeightComplete,
  };
}

/* ───────────────────────────── Escalas ───────────────────────────── */

/**
 * Multiplica um total por um fator, preservando qualidade e contadores.
 *
 * É o que faz "alterar o rendimento recalcula por porção SEM alterar o total": o total da
 * receita é um dado só, e a divisão por porções acontece na leitura.
 */
export function scaleTotals(
  totals: Record<string, NutrientTotal>,
  factor: number,
): Record<string, NutrientTotal> {
  if (!Number.isFinite(factor)) return {};
  const scaled: Record<string, NutrientTotal> = {};
  for (const [code, total] of Object.entries(totals)) {
    scaled[code] = { ...total, amount: total.amount * factor };
  }
  return scaled;
}

/** Valores POR PORÇÃO. Rendimento inválido devolve vazio em vez de dividir por zero. */
export function perServing(
  totals: Record<string, NutrientTotal>,
  servings: number,
): Record<string, NutrientTotal> {
  if (!Number.isFinite(servings) || servings <= 0) return {};
  return scaleTotals(totals, 1 / servings);
}

export type Per100gResult =
  | { ok: true; totals: Record<string, NutrientTotal> }
  | { ok: false; reason: "peso_final_ausente" };

/**
 * Concentração POR 100 g, a partir do PESO FINAL INFORMADO.
 *
 * Sem peso final devolve erro tipado — nunca cai para a soma dos ingredientes crus. Essa
 * queda silenciosa é justamente o bug que a regra 1 da subfase proíbe: ela daria um número
 * plausível e errado, e ninguém perceberia.
 */
export function per100g(
  totals: Record<string, NutrientTotal>,
  totalWeightG: number | null,
): Per100gResult {
  if (totalWeightG === null || !Number.isFinite(totalWeightG) || totalWeightG <= 0) {
    return { ok: false, reason: "peso_final_ausente" };
  }
  return { ok: true, totals: scaleTotals(totals, 100 / totalWeightG) };
}

/** Peso de uma porção. `null` quando falta o peso final ou o rendimento é inválido. */
export function servingWeightG(
  totalWeightG: number | null,
  servings: number,
): number | null {
  if (totalWeightG === null || !Number.isFinite(totalWeightG) || totalWeightG <= 0) return null;
  if (!Number.isFinite(servings) || servings <= 0) return null;
  return totalWeightG / servings;
}

/**
 * Fator que converte "esta quantidade da receita" em fração da receita inteira.
 *
 * É a mesma conta que `buildRecipeEntrySnapshot` aplica; existe separada porque a refeição-
 * modelo e o planejamento precisam do total sem gravar snapshot nenhum.
 * `null` quando a medida é impossível — nunca um palpite.
 */
export function recipePortionFactor(
  recipe: { servings: number; totalWeightG: number | null },
  quantity: number,
  portionUnit: PortionUnit,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  if (portionUnit === "peso") {
    if (recipe.totalWeightG === null || recipe.totalWeightG <= 0) return null;
    return quantity / recipe.totalWeightG;
  }

  if (!Number.isFinite(recipe.servings) || recipe.servings <= 0) return null;
  return quantity / recipe.servings;
}

/* ───────────────────────────── Perda/ganho no preparo ───────────────────────────── */

export type PreparationDelta = {
  /** Peso final informado − soma dos ingredientes. Negativo = perdeu (evaporou). */
  deltaG: number;
  /** Variação relativa à soma dos ingredientes, em %. */
  percent: number;
  direction: "perda" | "ganho" | "igual";
  /**
   * Falso quando algum ingrediente ficou fora da soma (sem conversão, medido em ml…). O
   * número continua sendo exibido, mas rotulado como incompleto.
   */
  complete: boolean;
};

/**
 * Compara o peso final INFORMADO com a soma dos ingredientes.
 *
 * É uma CONSTATAÇÃO, nunca uma inferência: os dois números vêm do usuário (um pesado, outro
 * somado dos ingredientes que ele cadastrou). A função jamais preenche um a partir do outro.
 */
export function preparationDelta(
  rawWeightG: number | null,
  totalWeightG: number | null,
  complete = true,
): PreparationDelta | null {
  if (rawWeightG === null || totalWeightG === null) return null;
  if (!Number.isFinite(rawWeightG) || !Number.isFinite(totalWeightG) || rawWeightG <= 0) {
    return null;
  }
  const deltaG = totalWeightG - rawWeightG;
  return {
    deltaG,
    percent: (deltaG / rawWeightG) * 100,
    direction: deltaG < 0 ? "perda" : deltaG > 0 ? "ganho" : "igual",
    complete,
  };
}

/* ───────────────────────────── Total → valores de nutriente ───────────────────────────── */

/**
 * Converte o total de uma receita no formato que `buildDiaryEntrySnapshot` consome.
 *
 * DUAS DECISÕES QUE SUSTENTAM A HONESTIDADE DO NÚMERO:
 *
 * 1. Nutriente que NENHUM ingrediente tinha vira `nao_disponivel` com `amount` nulo. Gravar
 *    0 ali diria "a receita não tem esse nutriente", quando a verdade é "ninguém mediu".
 *
 * 2. A qualidade agregada viaja junto (`quality`). Sem ela, uma receita parcial entraria no
 *    total do dia como exata, e o dia inteiro passaria a mentir.
 */
export function totalsToNutrientValues(
  totals: Record<string, NutrientTotal>,
): FoodNutrientValue[] {
  const values: FoodNutrientValue[] = [];
  for (const total of Object.values(totals)) {
    const semNinguem = total.contributing === 0;
    values.push({
      code: total.code,
      amount: semNinguem ? null : total.amount,
      state: semNinguem ? "nao_disponivel" : "disponivel",
      // O valor da receita é sempre CALCULADO — nunca analisado. Fica registrado no snapshot.
      method: "calculado",
      sourceNote: null,
      ...(total.quality !== "exato" ? { quality: total.quality } : {}),
    });
  }
  return values;
}

/** Pior qualidade entre um conjunto de totais — usada nos rótulos de resumo. */
export function worstTotalQuality(
  totals: Record<string, NutrientTotal>,
  codes: readonly string[],
): NutrientTotalQuality {
  let worst: NutrientTotalQuality = "exato";
  for (const code of codes) {
    const quality = totals[code]?.quality;
    if (!quality) continue;
    if (quality === "parcial") return "parcial";
    if (quality === "aproximado") worst = "aproximado";
  }
  return worst;
}

/* ───────────────────────────── Receita → item do diário ───────────────────────────── */

export type RecipeSnapshotFailure =
  | "peso_final_ausente"
  | "rendimento_invalido"
  | "quantidade_invalida"
  | "sem_valor_calculado";

export const RECIPE_SNAPSHOT_MESSAGES: Record<RecipeSnapshotFailure, string> = {
  peso_final_ausente:
    "Esta receita não tem o peso final preparado informado, então não é possível registrá-la em gramas. Registre em porções ou informe o peso final.",
  rendimento_invalido: "A receita precisa de um rendimento maior que zero para dividir em porções.",
  quantidade_invalida: "Informe uma quantidade maior que zero.",
  sem_valor_calculado:
    "Nenhum ingrediente desta receita tem valor nutricional calculável, então não há o que registrar.",
};

export type RecipeSnapshotSubject = {
  name: string;
  servings: number;
  servingLabel: string | null;
  totalWeightG: number | null;
};

export type RecipeSnapshotInput = {
  recipe: RecipeSnapshotSubject;
  /** Total da receita INTEIRA, vindo de `recipeTotals`. */
  totals: Record<string, NutrientTotal>;
  quantity: number;
  portionUnit: PortionUnit;
};

export type RecipeSnapshotResult =
  | { ok: true; snapshot: DiaryEntrySnapshot }
  | { ok: false; reason: RecipeSnapshotFailure };

/** Rótulo da porção desta receita ("fatia", "concha"…), com um padrão neutro. */
export const portionLabelOf = (recipe: { servingLabel: string | null }): string =>
  recipe.servingLabel?.trim() || "porção";

/**
 * Plural do rótulo da porção em pt-BR.
 *
 * Cobre as terminações que aparecem em rótulo de porção — "porção" → "porções",
 * "colher" → "colheres" — porque `${label}s` produziria "porçãos", que é simplesmente errado
 * na tela do usuário. Palavras irregulares (pão → pães) não são tratadas: o rótulo é digitado
 * por ele, e inventar uma flexão errada seria pior do que a forma regular.
 */
export function pluralizePtBR(word: string): string {
  const label = word.trim();
  if (!label) return label;
  const lower = label.toLowerCase();

  if (lower.endsWith("ão")) return `${label.slice(0, -2)}ões`;
  if (lower.endsWith("m")) return `${label.slice(0, -1)}ns`;
  if (lower.endsWith("r") || lower.endsWith("z")) return `${label}es`;
  // Já está no plural (ou é invariável, como "lápis").
  if (lower.endsWith("s")) return label;
  return `${label}s`;
}

/**
 * Congela uma receita como item do diário.
 *
 * ⛔ ESTE É O PONTO MAIS IMPORTANTE DA SUBFASE: não existe um segundo caminho de gravação.
 * A conta passa por `buildDiaryEntrySnapshot`, o mesmo do alimento — é isso que mantém
 * diário, receita e relatório concordando. O que muda é só de onde vêm os nutrientes: em vez
 * do catálogo, vêm do total da receita NAQUELE INSTANTE.
 *
 * Editar ou excluir a receita depois não altera nada do que já foi registrado.
 *
 * ══ AS TRÊS FORMAS DE MEDIR ══
 * • em gramas (exige peso final)      → a receita inteira é a base; 150 g é 150 ÷ peso final.
 * • em porções COM peso final         → a porção vira uma medida caseira de verdade, com peso.
 * • em porções SEM peso final         → só a proporção é conhecida (1 de 4 porções = 25% do
 *   total). Aqui `gramsEquivalent`, `baseQuantity` e `baseUnit` ficam NULOS: não sabemos o
 *   peso, e escrever 0 ali seria afirmar que a porção não pesa nada.
 */
export function buildRecipeEntrySnapshot(input: RecipeSnapshotInput): RecipeSnapshotResult {
  const { recipe, totals, quantity, portionUnit } = input;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, reason: "quantidade_invalida" };
  }
  if (Object.keys(totals).length === 0) {
    return { ok: false, reason: "sem_valor_calculado" };
  }

  const nutrients = totalsToNutrientValues(totals);
  const label = portionLabelOf(recipe);

  const food: Omit<SnapshotFoodInput, "baseQuantity" | "baseUnit"> = {
    name: recipe.name,
    // Uma preparação pronta não tem "estado do alimento" nem marca; a procedência é a receita.
    preparationState: "pronto",
    brand: null,
    sourceId: null,
    sourceName: "Receita própria",
    sourceVersion: null,
    sourceFoodCode: null,
    nutrients,
  };

  /* ── Em gramas do preparo pronto ── */
  if (portionUnit === "peso") {
    if (recipe.totalWeightG === null || recipe.totalWeightG <= 0) {
      return { ok: false, reason: "peso_final_ausente" };
    }
    const built = buildDiaryEntrySnapshot({
      food: { ...food, baseQuantity: recipe.totalWeightG, baseUnit: "g" },
      quantity,
      measure: null,
    });
    return built.ok
      ? { ok: true, snapshot: built.snapshot }
      : { ok: false, reason: "quantidade_invalida" };
  }

  /* ── Em porções ── */
  if (!Number.isFinite(recipe.servings) || recipe.servings <= 0) {
    return { ok: false, reason: "rendimento_invalido" };
  }

  // Com peso final, a porção é uma medida caseira real: tem rótulo e tem peso.
  if (recipe.totalWeightG !== null && recipe.totalWeightG > 0) {
    const built = buildDiaryEntrySnapshot({
      food: { ...food, baseQuantity: recipe.totalWeightG, baseUnit: "g" },
      quantity,
      measure: {
        label,
        grams: recipe.totalWeightG / recipe.servings,
        milliliters: null,
      },
    });
    return built.ok
      ? { ok: true, snapshot: built.snapshot }
      : { ok: false, reason: "quantidade_invalida" };
  }

  // Sem peso final: só a PROPORÇÃO é conhecida. A base é o rendimento (a receita inteira rende
  // `servings` porções), então `quantity ÷ servings` é o fator correto — e é o mesmo cálculo
  // que `convertToBase` faz. O que não sabemos é o peso, e as colunas de peso ficam nulas.
  const built = buildDiaryEntrySnapshot({
    food: { ...food, baseQuantity: recipe.servings, baseUnit: "g" },
    quantity,
    measure: null,
  });
  if (!built.ok) return { ok: false, reason: "quantidade_invalida" };

  return {
    ok: true,
    snapshot: {
      ...built.snapshot,
      measureLabel: label,
      // "Não sei quanto pesa" — nunca "pesa zero".
      gramsEquivalent: null,
      baseQuantity: null,
      baseUnit: null,
    },
  };
}

/* ───────────────────────────── Rótulos ───────────────────────────── */

/** "2 fatias" · "150 g" — descrição da porção escolhida de uma receita. */
export function describeRecipePortion(
  recipe: { servingLabel: string | null },
  quantity: number,
  portionUnit: PortionUnit,
): string {
  if (portionUnit === "peso") return `${formatAmount(quantity)} g`;
  const label = portionLabelOf(recipe);
  return `${formatAmount(quantity)} ${quantity === 1 ? label : pluralizePtBR(label)}`;
}

/** "Rende 4 porções (250 g cada)" — o que a UI mostra no cabeçalho da receita. */
export function describeYield(recipe: RecipeSnapshotSubject): string {
  const label = portionLabelOf(recipe);
  const plural = recipe.servings === 1 ? label : pluralizePtBR(label);
  const base = `Rende ${formatAmount(recipe.servings)} ${plural}`;
  const weight = servingWeightG(recipe.totalWeightG, recipe.servings);
  return weight === null ? base : `${base} de ${formatAmount(weight)} g`;
}

/** Tempo total de preparo em minutos. `null` quando nenhum tempo foi informado. */
export function totalMinutes(
  prepMinutes: number | null,
  cookMinutes: number | null,
): number | null {
  if (prepMinutes === null && cookMinutes === null) return null;
  return (prepMinutes ?? 0) + (cookMinutes ?? 0);
}
