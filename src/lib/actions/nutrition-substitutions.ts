"use server";

/**
 * Fase 16-C — Dieta e Alimentação · Server Actions de substituições.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ REGRA 4: SUBSTITUIR EXIGE CONFIRMAÇÃO EXPLÍCITA E GRAVA HISTÓRICO. Nada troca sozinho.║
 * ║ REGRA 5: nenhuma equivalência clínica é afirmada — o app compara números.             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `applySubstitution` só é chamada depois de a tela mostrar original × alternativa, a
 * diferença de kcal/P/C/G/fibra, o impacto no total do dia e o que resta da meta. Ainda assim,
 * a diferença é RECALCULADA aqui antes de gravar: o que o navegador mostrou é conferido, nunca
 * copiado — o mesmo princípio que impede o cliente de mandar snapshot pronto.
 *
 * ══ O QUE ACONTECE NO DIÁRIO ══
 * • Nível ALIMENTO: a própria linha do diário é regravada com o snapshot da alternativa e
 *   `change_kind = 'substituido'`. Manter a mesma linha preserva o vínculo com o item
 *   planejado — é assim que o comparativo "planejado × consumido" continua contando a história.
 * • Nível REFEIÇÃO: os itens que estavam lá viram `change_kind = 'removido'` (deixam de somar,
 *   mas não somem do registro) e a alternativa entra como item novo. A refeição passa a
 *   'substituida', que é um status que já existia na 16-B.
 *
 * ══ O HISTÓRICO É IMUTÁVEL ══
 * `nutrition_substitution_logs` congela rótulos, quantidades e a diferença nutricional. Todas
 * as FKs são `on delete set null`: excluir depois o alimento, a receita ou o grupo apaga o
 * link, jamais o registro.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { sumNutrients, type NutrientTotal } from "@/lib/nutrition/calc";
import { CORE_NUTRIENTS, NUTRITION_BASE_PATH, SUBSTITUTION_COMPARE_NUTRIENTS } from "@/lib/nutrition/constants";
import { getFoodSnapshotInput } from "@/lib/nutrition/diary-queries";
import { snapshotColumns } from "@/lib/nutrition/entry-columns";
import { templateTotals } from "@/lib/nutrition/meal-template";
import { buildRecipeEntrySnapshot, RECIPE_SNAPSHOT_MESSAGES } from "@/lib/nutrition/recipe";
import { recipeTotals } from "@/lib/nutrition/recipe";
import {
  buildRecipeCalcContext,
  getMealTemplate,
  getRecipeTotals,
  getRecipes,
  toCalcIngredient,
} from "@/lib/nutrition/recipe-queries";
import { buildDiaryEntrySnapshot, parseNutrientSnapshot, snapshotToBag } from "@/lib/nutrition/snapshot";
import {
  compareNutrients,
  comparisonsToSnapshot,
  deltaOf,
} from "@/lib/nutrition/substitution";
import { CONVERSION_FAILURE_MESSAGES } from "@/lib/nutrition/units";
import type { DiaryEntrySnapshot } from "@/lib/nutrition/types";
import {
  applySubstitutionSchema,
  substitutionGroupSchema,
  substitutionOptionSchema,
} from "@/lib/validators/nutrition-recipes";
import type { ActionResult } from "@/types/finance";

const SUBSTITUTIONS_PATH = `${NUTRITION_BASE_PATH}/substituicoes`;

function revalidateSubstitutions() {
  revalidatePath(NUTRITION_BASE_PATH);
  revalidatePath(SUBSTITUTIONS_PATH);
  revalidatePath(`${NUTRITION_BASE_PATH}/diario`);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/* ═══════════════════════════ Grupos ═══════════════════════════ */

export async function saveSubstitutionGroup(
  input: unknown,
  groupId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = substitutionGroupSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  // Guarda o rótulo da medida junto, para o grupo continuar legível se ela for excluída.
  let baseMeasureLabel: string | null = null;
  if (data.base_measure_id) {
    const { data: measure } = await ctx.supabase
      .from("nutrition_food_measures")
      .select("label,food_id")
      .eq("id", data.base_measure_id)
      .maybeSingle();
    if (measure && data.food_id && measure.food_id !== data.food_id) {
      return dbError("Esta medida caseira é de outro alimento.");
    }
    baseMeasureLabel = measure?.label ?? null;
  }

  const payload = {
    name: data.name,
    group_kind: data.group_kind,
    description: data.description,
    food_id: data.food_id,
    recipe_id: data.recipe_id,
    meal_template_id: data.meal_template_id,
    custom_label: data.custom_label,
    base_quantity: data.base_quantity,
    base_measure_id: data.base_measure_id,
    base_measure_label: baseMeasureLabel,
    base_portion_unit: data.base_portion_unit,
    tolerance_energy_percent: data.tolerance_energy_percent,
    tolerance_protein_percent: data.tolerance_protein_percent,
    tolerance_carb_percent: data.tolerance_carb_percent,
    tolerance_fat_percent: data.tolerance_fat_percent,
    tolerance_fiber_percent: data.tolerance_fiber_percent,
    restrictions: data.restrictions,
    notes: data.notes,
    is_active: data.is_active,
  };

  if (groupId) {
    const { error } = await ctx.supabase
      .from("nutrition_substitution_groups")
      .update(payload)
      .eq("id", groupId);
    if (error) return dbError("Não foi possível salvar o grupo.");
    revalidateSubstitutions();
    return { ok: true, data: { id: groupId } };
  }

  const { count } = await ctx.supabase
    .from("nutrition_substitution_groups")
    .select("id", { count: "exact", head: true });

  const { data: created, error } = await ctx.supabase
    .from("nutrition_substitution_groups")
    .insert({ ...payload, user_id: ctx.userId, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível criar o grupo.");

  revalidateSubstitutions();
  return { ok: true, data: { id: created.id } };
}

/**
 * Exclui o grupo e suas alternativas (cascade).
 *
 * O HISTÓRICO SOBREVIVE: `nutrition_substitution_logs.group_id` é `on delete set null`. As
 * trocas que já aconteceram continuam registradas, com rótulos e diferença congelados.
 */
export async function deleteSubstitutionGroup(groupId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_substitution_groups")
    .delete()
    .eq("id", groupId);
  if (error) return dbError("Não foi possível excluir o grupo.");

  revalidateSubstitutions();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Alternativas ═══════════════════════════ */

export async function saveSubstitutionOption(
  input: unknown,
  optionId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = substitutionOptionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  let measureLabel: string | null = null;
  if (data.measure_id) {
    const { data: measure } = await ctx.supabase
      .from("nutrition_food_measures")
      .select("label,food_id")
      .eq("id", data.measure_id)
      .maybeSingle();
    if (measure && data.food_id && measure.food_id !== data.food_id) {
      return dbError("Esta medida caseira é de outro alimento.");
    }
    measureLabel = measure?.label ?? null;
  }

  const payload = {
    group_id: data.group_id,
    option_kind: data.option_kind,
    food_id: data.food_id,
    recipe_id: data.recipe_id,
    meal_template_id: data.meal_template_id,
    custom_label: data.custom_label,
    quantity: data.quantity,
    measure_id: data.measure_id,
    measure_label: measureLabel,
    portion_unit: data.portion_unit,
    priority: data.priority,
    notes: data.notes,
    is_active: data.is_active,
  };

  if (optionId) {
    const { error } = await ctx.supabase
      .from("nutrition_substitution_options")
      .update(payload)
      .eq("id", optionId);
    if (error) return dbError("Não foi possível salvar a alternativa.");
    revalidateSubstitutions();
    return { ok: true, data: { id: optionId } };
  }

  const { count } = await ctx.supabase
    .from("nutrition_substitution_options")
    .select("id", { count: "exact", head: true })
    .eq("group_id", data.group_id);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_substitution_options")
    .insert({ ...payload, user_id: ctx.userId, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível adicionar a alternativa.");

  revalidateSubstitutions();
  return { ok: true, data: { id: created.id } };
}

export async function deleteSubstitutionOption(optionId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_substitution_options")
    .delete()
    .eq("id", optionId);
  if (error) return dbError("Não foi possível excluir a alternativa.");

  revalidateSubstitutions();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Cálculo do sujeito ═══════════════════════════ */

type Subject = {
  kind: "alimento" | "receita" | "modelo" | "livre";
  foodId: string | null;
  recipeId: string | null;
  mealTemplateId: string | null;
  quantity: number;
  measureId: string | null;
  portionUnit: "porcao" | "peso" | null;
};

type SubjectResult =
  | { ok: true; totals: Record<string, NutrientTotal>; snapshot: DiaryEntrySnapshot; label: string }
  | { ok: false; error: string };

/**
 * Resolve "o que é + quanto" em total nutricional + snapshot pronto para gravar.
 *
 * Reusa o MESMO caminho do diário: alimento por `buildDiaryEntrySnapshot`, receita por
 * `buildRecipeEntrySnapshot`. A comparação e o registro da troca falam a mesma língua do
 * resto do módulo — se aqui houvesse uma conta própria, a tela mostraria uma diferença e o
 * diário registraria outra.
 */
async function resolveSubject(ctx: Ctx, subject: Subject): Promise<SubjectResult> {
  if (subject.kind === "alimento" && subject.foodId) {
    const source = await getFoodSnapshotInput(subject.foodId, subject.measureId);
    if (!source) return { ok: false, error: "Alimento não encontrado." };

    const built = buildDiaryEntrySnapshot({
      food: source.food,
      quantity: subject.quantity,
      measure: source.measure,
    });
    if (!built.ok) return { ok: false, error: CONVERSION_FAILURE_MESSAGES[built.reason] };

    return {
      ok: true,
      totals: sumNutrients([snapshotToBag(built.snapshot.nutrientsSnapshot)]),
      snapshot: built.snapshot,
      label: source.food.name,
    };
  }

  if (subject.kind === "receita" && subject.recipeId) {
    const loaded = await getRecipeTotals(subject.recipeId);
    if (!loaded) return { ok: false, error: "Receita não encontrada." };

    const built = buildRecipeEntrySnapshot({
      recipe: {
        name: loaded.recipe.name,
        servings: loaded.recipe.servings,
        servingLabel: loaded.recipe.servingLabel,
        totalWeightG: loaded.recipe.totalWeightG,
      },
      totals: loaded.calc.totals,
      quantity: subject.quantity,
      portionUnit: subject.portionUnit ?? "porcao",
    });
    if (!built.ok) return { ok: false, error: RECIPE_SNAPSHOT_MESSAGES[built.reason] };

    return {
      ok: true,
      totals: sumNutrients([snapshotToBag(built.snapshot.nutrientsSnapshot)]),
      snapshot: built.snapshot,
      label: loaded.recipe.name,
    };
  }

  if (subject.kind === "modelo" && subject.mealTemplateId) {
    const template = await getMealTemplate(subject.mealTemplateId);
    if (!template) return { ok: false, error: "Refeição-modelo não encontrada." };

    const foodIds = template.items.map((item) => item.foodId).filter(Boolean) as string[];
    const measureIds = template.items.map((item) => item.measureId).filter(Boolean) as string[];
    const base = await buildRecipeCalcContext(foodIds, measureIds);

    const recipeIds = new Set(
      template.items.map((item) => item.recipeId).filter(Boolean) as string[],
    );
    const recipes = new Map<
      string,
      { servings: number; totalWeightG: number | null; totals: Record<string, NutrientTotal> }
    >();

    if (recipeIds.size > 0) {
      const all = await getRecipes();
      const used = all.filter((recipe) => recipeIds.has(recipe.id));
      const recipeCtx = await buildRecipeCalcContext(
        used.flatMap((r) => r.ingredients.map((i) => i.foodId).filter(Boolean) as string[]),
        used.flatMap((r) => r.ingredients.map((i) => i.measureId).filter(Boolean) as string[]),
      );
      for (const recipe of used) {
        recipes.set(recipe.id, {
          servings: recipe.servings,
          totalWeightG: recipe.totalWeightG,
          totals: recipeTotals(recipe.ingredients.map(toCalcIngredient), recipeCtx).totals,
        });
      }
    }

    const totals = templateTotals(template.items, { ...base, recipes });
    if (Object.keys(totals.totals).length === 0) {
      return { ok: false, error: "Esta refeição-modelo não tem valor nutricional calculável." };
    }

    // O modelo entra como uma "preparação" de uma porção — mesmo formato de snapshot.
    const built = buildRecipeEntrySnapshot({
      recipe: { name: template.name, servings: 1, servingLabel: "porção", totalWeightG: null },
      totals: totals.totals,
      quantity: subject.quantity,
      portionUnit: "porcao",
    });
    if (!built.ok) return { ok: false, error: RECIPE_SNAPSHOT_MESSAGES[built.reason] };

    return {
      ok: true,
      totals: sumNutrients([snapshotToBag(built.snapshot.nutrientsSnapshot)]),
      snapshot: built.snapshot,
      label: template.name,
    };
  }

  return { ok: false, error: "Escolha o que entra no lugar." };
}

/* ═══════════════════════════ Aplicar a substituição ═══════════════════════════ */

/**
 * Confirma uma troca.
 *
 * A tela já mostrou a comparação; aqui ela é RECALCULADA e congelada no histórico. Nenhuma
 * substituição acontece sem esta chamada, e esta chamada só existe atrás de um botão de
 * confirmação — nada troca sozinho.
 */
export async function applySubstitution(
  input: unknown,
): Promise<ActionResult<{ logId: string; deltaEnergy: number | null }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = applySubstitutionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: meal } = await ctx.supabase
    .from("nutrition_diary_meals")
    .select("id")
    .eq("id", data.diary_meal_id)
    .maybeSingle();
  if (!meal) return dbError("Refeição não encontrada.");

  /* ── 1. O que sai ── */
  let originalTotals: Record<string, NutrientTotal> = {};
  let originalLabel = "Refeição";
  let originalQuantity: number | null = null;
  let originalMeasureLabel: string | null = null;
  let originalFoodId: string | null = null;
  let originalRecipeId: string | null = null;

  if (data.level === "alimento") {
    if (!data.diary_entry_id) return dbError("Diga qual item está sendo substituído.");
    const { data: entry } = await ctx.supabase
      .from("nutrition_diary_entries")
      .select("id,food_id,recipe_id,food_name_snapshot,quantity,measure_label,nutrients_snapshot,planned_item_id,diary_meal_id")
      .eq("id", data.diary_entry_id)
      .maybeSingle();
    if (!entry) return dbError("Item não encontrado.");

    // O original é o que está REGISTRADO — o snapshot congelado, não o catálogo de agora.
    originalTotals = sumNutrients([snapshotToBag(parseNutrientSnapshot(entry.nutrients_snapshot))]);
    originalLabel = entry.food_name_snapshot;
    originalQuantity = entry.quantity === null ? null : Number(entry.quantity);
    originalMeasureLabel = entry.measure_label;
    originalFoodId = entry.food_id;
    originalRecipeId = entry.recipe_id;
  } else {
    const { data: entries } = await ctx.supabase
      .from("nutrition_diary_entries")
      .select("id,nutrients_snapshot,change_kind")
      .eq("diary_meal_id", data.diary_meal_id);

    const contando = (entries ?? []).filter((row) => row.change_kind !== "removido");
    originalTotals = sumNutrients(
      contando.map((row) => snapshotToBag(parseNutrientSnapshot(row.nutrients_snapshot))),
    );
    originalLabel = `Refeição com ${contando.length} item${contando.length === 1 ? "" : "s"}`;
  }

  /* ── 2. O que entra ── */
  const replacement = await resolveSubject(ctx, {
    kind: data.replacement_kind,
    foodId: data.replacement_food_id,
    recipeId: data.replacement_recipe_id,
    mealTemplateId: data.replacement_meal_template_id,
    quantity: data.replacement_quantity,
    measureId: data.replacement_measure_id,
    portionUnit: data.replacement_portion_unit,
  });
  if (!replacement.ok) return dbError(replacement.error);

  /* ── 3. A diferença, recalculada no servidor ── */
  const comparisons = compareNutrients(
    originalTotals,
    replacement.totals,
    SUBSTITUTION_COMPARE_NUTRIENTS,
  );

  /* ── 4. O diário ── */
  const entryKind =
    data.replacement_kind === "receita"
      ? "receita"
      : data.replacement_kind === "modelo"
        ? "modelo"
        : "alimento";

  let diaryEntryId: string | null = data.diary_entry_id;

  if (data.level === "alimento" && data.diary_entry_id) {
    // A MESMA linha é regravada: o vínculo com o item planejado é preservado, e é assim que
    // o comparativo "planejado × consumido" registra a troca.
    const { error } = await ctx.supabase
      .from("nutrition_diary_entries")
      .update({
        food_id: data.replacement_food_id,
        recipe_id: data.replacement_recipe_id,
        meal_template_id: data.replacement_meal_template_id,
        entry_kind: entryKind,
        change_kind: "substituido",
        changed_at: new Date().toISOString(),
        ...snapshotColumns(replacement.snapshot),
      })
      .eq("id", data.diary_entry_id);
    if (error) return dbError("Não foi possível aplicar a substituição no diário.");
  } else {
    // Refeição inteira: o que estava lá deixa de contar (mas continua visível) e a alternativa
    // entra como item novo.
    await ctx.supabase
      .from("nutrition_diary_entries")
      .update({ change_kind: "removido", changed_at: new Date().toISOString() })
      .eq("diary_meal_id", data.diary_meal_id)
      .neq("change_kind", "removido");

    const { data: created, error } = await ctx.supabase
      .from("nutrition_diary_entries")
      .insert({
        user_id: ctx.userId,
        diary_meal_id: data.diary_meal_id,
        food_id: data.replacement_food_id,
        recipe_id: data.replacement_recipe_id,
        meal_template_id: data.replacement_meal_template_id,
        entry_kind: entryKind,
        change_kind: "substituido",
        changed_at: new Date().toISOString(),
        position: 0,
        ...snapshotColumns(replacement.snapshot),
      })
      .select("id")
      .single();
    if (error || !created) return dbError("Não foi possível registrar a alternativa.");
    diaryEntryId = created.id;

    // 'substituida' já existia no CHECK da 16-B — nenhum status novo foi inventado.
    await ctx.supabase
      .from("nutrition_diary_meals")
      .update({ status: "substituida" })
      .eq("id", data.diary_meal_id);
  }

  /* ── 5. O histórico (congelado) ── */
  const { data: log, error: logError } = await ctx.supabase
    .from("nutrition_substitution_logs")
    .insert({
      user_id: ctx.userId,
      group_id: data.group_id,
      option_id: data.option_id,
      substitution_level: data.level,
      applied_on: data.applied_on,
      diary_meal_id: data.diary_meal_id,
      diary_entry_id: diaryEntryId,
      original_label: originalLabel,
      original_food_id: originalFoodId,
      original_recipe_id: originalRecipeId,
      original_quantity: originalQuantity,
      original_measure_label: originalMeasureLabel,
      replacement_label: data.replacement_label ?? replacement.label,
      replacement_food_id: data.replacement_food_id,
      replacement_recipe_id: data.replacement_recipe_id,
      replacement_meal_template_id: data.replacement_meal_template_id,
      replacement_quantity: data.replacement_quantity,
      replacement_measure_label: replacement.snapshot.measureLabel,
      diff_snapshot: comparisonsToSnapshot(comparisons),
      // NULO quando não deu para comparar — jamais 0, que significaria "não mudou".
      delta_energy_kcal: deltaOf(comparisons, CORE_NUTRIENTS.energia),
      delta_protein_g: deltaOf(comparisons, CORE_NUTRIENTS.proteina),
      delta_carb_g: deltaOf(comparisons, CORE_NUTRIENTS.carboidrato),
      delta_fat_g: deltaOf(comparisons, CORE_NUTRIENTS.lipidios),
      delta_fiber_g: deltaOf(comparisons, CORE_NUTRIENTS.fibra),
      reason: data.reason,
    })
    .select("id")
    .single();
  if (logError || !log) {
    return dbError("A troca foi aplicada, mas o histórico não pôde ser gravado.");
  }

  revalidateSubstitutions();
  return {
    ok: true,
    data: { logId: log.id, deltaEnergy: deltaOf(comparisons, CORE_NUTRIENTS.energia) },
  };
}

/** Apaga uma linha do histórico (o usuário pode limpar registros que não quer manter). */
export async function deleteSubstitutionLog(logId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_substitution_logs")
    .delete()
    .eq("id", logId);
  if (error) return dbError("Não foi possível excluir o registro.");

  revalidateSubstitutions();
  return { ok: true, data: undefined };
}
