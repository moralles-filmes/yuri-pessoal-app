"use server";

/**
 * Fase 16-F — apoio ao LANÇAMENTO RÁPIDO do módulo Dieta.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO NÃO GRAVA CONSUMO. Ele resolve a REFEIÇÃO (acha ou cria a linha de     ║
 * ║ diário do dia) e delega para as actions ORIGINAIS — `addDiaryEntry` (16-B) e           ║
 * ║ `addMealTemplateToDiary` (16-C).                                                      ║
 * ║                                                                                       ║
 * ║ O motivo é o que a subfase inteira existe para evitar: se o registro rápido montasse  ║
 * ║ o próprio snapshot, o mesmo alimento nasceria com procedência diferente do registro   ║
 * ║ normal — e o histórico teria duas verdades sobre a mesma comida.                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
import { z } from "zod";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";
import { addDiaryEntry } from "@/lib/actions/nutrition-diary";
import { addMealTemplateToDiary } from "@/lib/actions/nutrition-meal-templates";
import { getMeasuresForFoods, searchFoodsByTerm } from "@/lib/nutrition/diary-queries";
import { resolverRefeicaoDoDia } from "@/lib/nutrition/services";
import { isDateIso } from "@/lib/nutrition/calendar";
import { hojeISO } from "@/lib/format";

/* ═══════════════════════════ Opções dos selects ═══════════════════════════ */

export type NutritionQuickAddOptions = {
  mealTypes: { id: string; name: string; defaultTime: string | null }[];
  mealTemplates: { id: string; name: string }[];
  measurementTypes: { id: string; name: string; unit: string; decimals: number }[];
  shoppingLists: { id: string; name: string }[];
};

const EMPTY: NutritionQuickAddOptions = {
  mealTypes: [],
  mealTemplates: [],
  measurementTypes: [],
  shoppingLists: [],
};

/** Leituras enxutas para o modal (todas sob a sessão → a RLS define o escopo). */
export async function loadNutritionQuickAddOptions(): Promise<NutritionQuickAddOptions> {
  const ctx = await authContext();
  if (!ctx) return EMPTY;
  const { supabase } = ctx;

  const [mealTypes, templates, measurementTypes, lists] = await Promise.all([
    supabase
      .from("nutrition_meal_types")
      .select("id,name,default_time")
      .eq("is_active", true)
      .order("position"),
    supabase
      .from("nutrition_meal_templates")
      .select("id,name")
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("body_measurement_types")
      .select("id,name,unit,decimals")
      .eq("is_active", true)
      .order("position"),
    supabase
      .from("nutrition_shopping_lists")
      .select("id,name")
      .eq("status", "ativa")
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
  ]);

  return {
    mealTypes: ((mealTypes.data ?? []) as Array<{
      id: string;
      name: string;
      default_time: string | null;
    }>).map((t) => ({ id: t.id, name: t.name, defaultTime: t.default_time })),
    mealTemplates: (templates.data ?? []) as NutritionQuickAddOptions["mealTemplates"],
    measurementTypes: ((measurementTypes.data ?? []) as Array<{
      id: string;
      name: string;
      unit: string;
      decimals: number;
    }>).map((t) => ({
      id: t.id,
      name: t.name,
      unit: t.unit,
      decimals: Number(t.decimals ?? 1),
    })),
    shoppingLists: (lists.data ?? []) as NutritionQuickAddOptions["shoppingLists"],
  };
}

/* ═══════════════════════════ Busca de alimento ═══════════════════════════ */

export type QuickAddFood = {
  id: string;
  name: string;
  brand: string | null;
  baseQuantity: number;
  baseUnit: string;
  isSystemFood: boolean;
  measures: { id: string; label: string }[];
};

/**
 * Busca de alimento para o lançamento rápido — no SERVIDOR e limitada.
 *
 * O catálogo tem centenas de alimentos e milhares de valores; mandar tudo para o navegador
 * a cada abertura do modal seria caro sem necessidade. A RLS alcança a base do sistema
 * (`user_id is null`) e os alimentos do próprio usuário — nunca os de outro.
 */
export async function searchQuickAddFoods(term: string): Promise<QuickAddFood[]> {
  const ctx = await authContext();
  if (!ctx) return [];

  // ⚠️ A busca em si saiu daqui (18-C · Bloco 4) e virou `searchFoodsByTerm`, na camada de
  // leitura — o command da IA precisa dela e não pode importar Server Action.
  const rows = await searchFoodsByTerm(term);
  if (rows.length === 0) return [];

  const measuresByFood = await getMeasuresForFoods(rows.map((r) => r.id));

  return rows.map((r) => ({
    ...r,
    measures: (measuresByFood.get(r.id) ?? []).map((m) => ({ id: m.id, label: m.label })),
  }));
}

/* ═══════════════════════════ Resolver a refeição do dia ═══════════════════════════ */

/**
 * ⚠️ 18-C · Bloco 4 — a resolução da refeição saiu daqui e virou `resolverRefeicaoDoDia`, em
 * `nutrition/services.ts`. O command `registrarConsumo` precisa exatamente dela: a IA diz
 * "Almoço", não um uuid de linha de diário. Duas cópias divergiriam no primeiro dia em que
 * alguém mudasse a regra de "achar ou criar" — e uma delas criaria refeição duplicada.
 */
async function resolveDiaryMeal(
  ctx: NonNullable<Awaited<ReturnType<typeof authContext>>>,
  date: string,
  mealTypeId: string,
): Promise<{ id: string } | { error: string }> {
  const r = await resolverRefeicaoDoDia(ctx, date, mealTypeId);
  return r.ok ? { id: r.id } : { error: r.erro };
}

/* ═══════════════════════════ Ações do lançamento rápido ═══════════════════════════ */

const quickEntrySchema = z.object({
  date: z.string().refine(isDateIso, "Data inválida"),
  meal_type_id: z.uuid("Escolha a refeição"),
  food_id: z.uuid("Escolha o alimento"),
  quantity: z.coerce.number().positive("Informe a quantidade"),
  measure_id: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.uuid().nullable(),
  ),
});

/**
 * Registrar um alimento sem sair da tela em que o usuário está.
 * A gravação em si é `addDiaryEntry` — o snapshot sai do MESMO caminho do registro normal.
 */
export async function quickAddDiaryEntry(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = quickEntrySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const meal = await resolveDiaryMeal(ctx, data.date, data.meal_type_id);
  if ("error" in meal) return dbError(meal.error);

  return addDiaryEntry({
    diary_meal_id: meal.id,
    food_id: data.food_id,
    quantity: data.quantity,
    measure_id: data.measure_id,
  });
}

const quickTemplateSchema = z.object({
  date: z.string().refine(isDateIso, "Data inválida"),
  meal_type_id: z.uuid("Escolha a refeição"),
  template_id: z.uuid("Escolha a refeição-modelo"),
  mode: z.enum(["detalhado", "resumido"]).optional().transform((v) => v ?? "detalhado"),
});

/**
 * Registrar uma refeição-modelo inteira.
 * Delega para `addMealTemplateToDiary`, que já garante a idempotência de leitura da 16-C:
 * adicionar o mesmo modelo duas vezes não duplica o consumo sem interruptor explícito.
 */
export async function quickAddMealTemplate(
  input: unknown,
): Promise<ActionResult<{ registrados: number; jaRegistrado: boolean; falhas: string[] }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = quickTemplateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const meal = await resolveDiaryMeal(ctx, data.date, data.meal_type_id);
  if ("error" in meal) return dbError(meal.error);

  return addMealTemplateToDiary({
    diary_meal_id: meal.id,
    template_id: data.template_id,
    mode: data.mode,
  });
}

/** "Hoje" do servidor (Brasília) para o valor inicial dos campos de data. */
export async function nutritionToday(): Promise<string> {
  return hojeISO();
}
