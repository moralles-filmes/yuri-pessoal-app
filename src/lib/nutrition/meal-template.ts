/**
 * Fase 16-C — Dieta e Alimentação · Refeições-modelo e duplicação (PURO, sem I/O).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ DUAS REGRAS DA SUBFASE VIVEM AQUI:                                                   ║
 * ║  • Regra 6 — DUPLICAR não copia histórico de consumo nem logs de substituição.       ║
 * ║  • Adicionar o mesmo modelo duas vezes NÃO duplica o consumo.                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ══ POR QUE A IDEMPOTÊNCIA É AQUI, E NÃO UM ÍNDICE ÚNICO ══
 * No diário, um modelo vira VÁRIAS linhas (uma por item), todas com o mesmo
 * `meal_template_id`. Um índice único em (refeição, modelo) impediria justamente o caso
 * normal. Então a verificação é de leitura: se a refeição já tem itens daquele modelo, o
 * modelo já foi adicionado — e a action avisa em vez de dobrar o almoço em silêncio.
 * Repetir de propósito continua possível, mas só com escolha explícita (`force`), como manda
 * a disciplina de "nenhuma ação silenciosa".
 *
 * ══ O TOTAL DO MODELO REUSA TUDO ══
 * Alimento passa por `convertToBase` + `scaleNutrients`; receita passa por `recipeTotals` +
 * `recipePortionFactor`. Nenhuma fórmula nova — e a qualidade (exato/aproximado/parcial)
 * propaga dos dois lados.
 *
 * Nada aqui chama `Date.now()` nem toca no banco.
 */
import { scaleNutrients, sumNutrients, type NutrientBag, type NutrientTotal } from "./calc";
import type { PortionUnit } from "./constants";
import {
  recipePortionFactor,
  totalsToNutrientValues,
  type IngredientFoodData,
} from "./recipe";
import { convertToBase, type ConvertibleMeasure } from "./units";
import type { TemplateItemKind } from "./constants";

/**
 * O mínimo que o cálculo precisa de um item — o que a refeição-modelo e o item PLANEJADO têm
 * em comum (16-C deu a `nutrition_planned_meal_items` o mesmo vocabulário: `item_kind`,
 * `recipe_id` e `portion_unit`). Tipar pela forma, e não pela tabela, é o que permite os dois
 * somarem pelo mesmo caminho em vez de cada um ter a sua conta.
 */
export type CalcTemplateItem = {
  id: string;
  itemKind: TemplateItemKind;
  foodId: string | null;
  recipeId: string | null;
  quantity: number | null;
  measureId: string | null;
  portionUnit: PortionUnit | null;
};

/* ───────────────────────────── Total de um modelo ───────────────────────────── */

/** O que o cálculo precisa saber de uma receita usada dentro de um modelo. */
export type TemplateRecipeData = {
  servings: number;
  totalWeightG: number | null;
  /** Total da receita INTEIRA, vindo de `recipeTotals`. */
  totals: Record<string, NutrientTotal>;
};

export type TemplateCalcContext = {
  foods: Map<string, IngredientFoodData>;
  measures: Map<string, ConvertibleMeasure>;
  recipes: Map<string, TemplateRecipeData>;
};

/** Por que um item do modelo não entrou na conta. */
export type TemplateSkipReason =
  | "item_livre"
  | "alimento_indisponivel"
  | "receita_indisponivel"
  | "sem_quantidade"
  | "conversao_impossivel"
  | "porcao_impossivel";

export const TEMPLATE_SKIP_MESSAGES: Record<TemplateSkipReason, string> = {
  item_livre: "Item sem alimento nem receita: não entra no cálculo, e o total fica parcial.",
  alimento_indisponivel: "O alimento não está mais no catálogo.",
  receita_indisponivel: "A receita não está mais cadastrada.",
  sem_quantidade: "Sem quantidade definida, não há o que calcular.",
  conversao_impossivel: "A medida escolhida não converte para a unidade do alimento.",
  porcao_impossivel:
    "A receita não tem peso final informado, então não é possível medi-la em gramas.",
};

export type TemplateCalcResult = {
  totals: Record<string, NutrientTotal>;
  counted: number;
  skipped: { id: string; reason: TemplateSkipReason }[];
};

/**
 * Nutrientes de um item do modelo.
 *
 * Conjunto vazio = ausência, e ausência marca o total como parcial. Nunca zero.
 */
export function templateItemBag(
  item: CalcTemplateItem,
  ctx: TemplateCalcContext,
): { bag: NutrientBag; skip: TemplateSkipReason | null } {
  if (item.itemKind === "livre") return { bag: {}, skip: "item_livre" };
  if (item.quantity === null) return { bag: {}, skip: "sem_quantidade" };

  if (item.itemKind === "receita") {
    if (!item.recipeId) return { bag: {}, skip: "receita_indisponivel" };
    const recipe = ctx.recipes.get(item.recipeId);
    if (!recipe) return { bag: {}, skip: "receita_indisponivel" };

    const factor = recipePortionFactor(
      recipe,
      item.quantity,
      (item.portionUnit ?? "porcao") as PortionUnit,
    );
    if (factor === null) return { bag: {}, skip: "porcao_impossivel" };

    // A qualidade da receita viaja junto: um modelo com receita parcial é parcial.
    return { bag: scaleNutrients(totalsToNutrientValues(recipe.totals), factor), skip: null };
  }

  if (!item.foodId) return { bag: {}, skip: "alimento_indisponivel" };
  const food = ctx.foods.get(item.foodId);
  if (!food) return { bag: {}, skip: "alimento_indisponivel" };

  const measure = item.measureId ? (ctx.measures.get(item.measureId) ?? null) : null;
  const conversion = convertToBase(item.quantity, measure, {
    baseQuantity: food.baseQuantity,
    baseUnit: food.baseUnit,
  });
  if (!conversion.ok) return { bag: {}, skip: "conversao_impossivel" };

  return { bag: scaleNutrients(food.nutrients, conversion.factor), skip: null };
}

/** Total de uma refeição-modelo: alimentos e receitas somados pelo mesmo núcleo. */
export function templateTotals(
  items: CalcTemplateItem[],
  ctx: TemplateCalcContext,
): TemplateCalcResult {
  const bags: NutrientBag[] = [];
  const skipped: { id: string; reason: TemplateSkipReason }[] = [];
  let counted = 0;

  for (const item of items) {
    const result = templateItemBag(item, ctx);
    bags.push(result.bag);
    if (result.skip) skipped.push({ id: item.id, reason: result.skip });
    else counted += 1;
  }

  return { totals: sumNutrients(bags), counted, skipped };
}

/* ───────────────────────────── Idempotência no diário ───────────────────────────── */

export type TemplateRegisterPlan<T> = {
  /** A refeição do diário já tem itens deste modelo. */
  alreadyRegistered: boolean;
  /** Itens que devem ser gravados agora. Vazio quando já estava registrado e não há `force`. */
  items: T[];
};

/**
 * O que registrar ao adicionar um modelo a uma refeição do diário.
 *
 * ADICIONAR O MESMO MODELO DUAS VEZES NÃO DUPLICA O CONSUMO: se a refeição já tem itens
 * daquele modelo, o plano volta vazio e a interface diz que já estava lá. Clicar duas vezes,
 * ou ter duas abas abertas, não dobra o café da manhã.
 *
 * `force` existe para o caso legítimo de comer o mesmo lanche duas vezes na mesma refeição —
 * mas é uma escolha explícita do usuário, nunca o padrão.
 */
export function templateItemsToRegister<T>(
  templateId: string,
  items: T[],
  existingEntries: { mealTemplateId: string | null }[],
  options: { force?: boolean } = {},
): TemplateRegisterPlan<T> {
  const alreadyRegistered = existingEntries.some(
    (entry) => entry.mealTemplateId === templateId,
  );

  if (alreadyRegistered && !options.force) {
    return { alreadyRegistered: true, items: [] };
  }
  return { alreadyRegistered, items: [...items] };
}

/* ───────────────────────────── Duplicação ─────────────────────────────
 * Regra 6: duplicar cria um item NOVO, marcado como cópia, editável antes de salvar, e que
 * NÃO herda histórico. Consumo já registrado pertence ao original — e histórico não se
 * transfere, porque a pessoa nunca comeu a cópia.
 */

/** Sufixo de cópia, incrementado quando o nome já é uma cópia. */
export function copyName(name: string): string {
  const base = name.trim();
  const match = /^(.*)\s\(cópia(?:\s(\d+))?\)$/u.exec(base);
  if (!match) return `${base} (cópia)`;
  const next = match[2] ? Number(match[2]) + 1 : 2;
  return `${match[1]} (cópia ${next})`;
}

/** Os campos que NENHUMA cópia herda. Ficam num lugar só para não serem esquecidos. */
export type DuplicationReset = {
  isCopy: true;
  /** Histórico de uso pertence ao original. */
  useCount: 0;
  lastUsedAt: null;
  /** Favorito e arquivamento são decisões sobre AQUELE item, não sobre a cópia. */
  isFavorite: false;
  archivedAt: null;
};

export const DUPLICATION_RESET: DuplicationReset = {
  isCopy: true,
  useCount: 0,
  lastUsedAt: null,
  isFavorite: false,
  archivedAt: null,
};

export type RecipeDuplicationSource = {
  id: string;
  name: string;
  useCount: number;
  lastUsedAt: string | null;
  isFavorite: boolean;
};

export type DuplicationDraft = DuplicationReset & {
  name: string;
  /** Aponta para o item de origem — a procedência fica registrada. */
  originId: string;
};

/**
 * Rascunho de uma duplicação.
 *
 * O que NÃO vem junto é o ponto: contagem de uso, último uso, favorito, arquivamento — e,
 * fora daqui, o histórico de consumo (`nutrition_diary_entries`) e os logs de substituição,
 * que sequer são lidos por esta função. A cópia nasce sem passado porque ela não tem passado.
 */
export function duplicateDraft(source: RecipeDuplicationSource): DuplicationDraft {
  return {
    ...DUPLICATION_RESET,
    name: copyName(source.name),
    originId: source.id,
  };
}
