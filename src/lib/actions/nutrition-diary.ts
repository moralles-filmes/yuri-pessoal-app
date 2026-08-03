"use server";

/**
 * Fase 16-B — Dieta e Alimentação · Server Actions do diário alimentar.
 *
 * Contrato do projeto (molde: `src/lib/actions/accounts.ts`):
 *   1. `authContext()` → `{ supabase, userId }`; `user_id` SEMPRE de `auth.getUser()`.
 *   2. Zod no servidor; erro → `invalid(...)`.
 *   3. Query com `user_id: ctx.userId` nos inserts; erro de DB → `dbError(...)`.
 *   4. `revalidatePath` + `ActionResult`.
 *
 * ══ AS TRÊS REGRAS QUE ESTE ARQUIVO PRECISA GARANTIR ══
 *
 * • O SNAPSHOT É MONTADO AQUI, NUNCA RECEBIDO. O cliente manda alimento + quantidade +
 *   medida; o servidor lê o catálogo e congela o resultado. Aceitar `nutrients_snapshot`
 *   pronto do navegador permitiria gravar história nutricional arbitrária.
 *
 * • O PLANEJAMENTO NÃO É TOCADO. Nenhuma action daqui escreve em `nutrition_planned_*`.
 *   Consumo cria/edita linha do diário e pronto.
 *
 * • CONFIRMAR DUAS VEZES NÃO DUPLICA. Os índices únicos parciais em `planned_meal_id` e
 *   `(diary_meal_id, planned_item_id)` sustentam isso no banco; aqui a action é escrita para
 *   ser idempotente (reaproveita a refeição já criada em vez de tentar criar outra).
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { hojeISO } from "@/lib/format";
import { NUTRITION_BASE_PATH } from "@/lib/nutrition/constants";
import { getFoodSnapshotInput } from "@/lib/nutrition/diary-queries";
import { buildDiaryEntrySnapshot } from "@/lib/nutrition/snapshot";
import { CONVERSION_FAILURE_MESSAGES } from "@/lib/nutrition/units";
import type { DiaryEntrySnapshot } from "@/lib/nutrition/types";
import {
  confirmPlannedMealSchema,
  diaryEntryQuantitySchema,
  diaryEntrySchema,
  diaryFreeEntrySchema,
  diaryMealSchema,
  diaryMealStatusSchema,
} from "@/lib/validators/nutrition-diary";
import type { ActionResult } from "@/types/finance";

const DIARY_PATH = `${NUTRITION_BASE_PATH}/diario`;

function revalidateDiary() {
  revalidatePath(NUTRITION_BASE_PATH);
  revalidatePath(DIARY_PATH);
  revalidatePath(`${NUTRITION_BASE_PATH}/planejamento`);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/** A refeição do diário é do usuário? A RLS já barra, mas a mensagem em pt-BR vem daqui. */
async function ownsMeal(ctx: Ctx, mealId: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("nutrition_diary_meals")
    .select("id")
    .eq("id", mealId)
    .maybeSingle();
  return Boolean(data);
}

/** Colunas do snapshot, prontas para o insert. */
function snapshotColumns(snapshot: DiaryEntrySnapshot) {
  return {
    food_name_snapshot: snapshot.foodNameSnapshot,
    preparation_state_snapshot: snapshot.preparationStateSnapshot,
    brand_snapshot: snapshot.brandSnapshot,
    quantity: snapshot.quantity,
    measure_label: snapshot.measureLabel,
    grams_equivalent: snapshot.gramsEquivalent,
    base_quantity: snapshot.baseQuantity,
    base_unit: snapshot.baseUnit,
    source_id_snapshot: snapshot.sourceIdSnapshot,
    source_name_snapshot: snapshot.sourceNameSnapshot,
    source_version_snapshot: snapshot.sourceVersionSnapshot,
    source_food_code_snapshot: snapshot.sourceFoodCodeSnapshot,
    nutrients_snapshot: snapshot.nutrientsSnapshot,
    energy_kcal: snapshot.energyKcal,
    protein_g: snapshot.proteinG,
    carb_g: snapshot.carbG,
    fat_g: snapshot.fatG,
    fiber_g: snapshot.fiberG,
  };
}

/**
 * Registra que o alimento foi usado — alimenta as ordenações "mais usados" e "recentes" do
 * catálogo. Best-effort: falhar aqui não pode derrubar o registro de consumo, que é o que
 * realmente importa.
 */
async function touchFoodUsage(ctx: Ctx, foodId: string): Promise<void> {
  const { data: pref } = await ctx.supabase
    .from("nutrition_food_prefs")
    .select("use_count")
    .eq("food_id", foodId)
    .maybeSingle();

  await ctx.supabase.from("nutrition_food_prefs").upsert(
    {
      user_id: ctx.userId,
      food_id: foodId,
      use_count: (pref?.use_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "user_id,food_id" },
  );
}

/* ═══════════════════════════ Refeições do diário ═══════════════════════════ */

export async function saveDiaryMeal(
  input: unknown,
  mealId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = diaryMealSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const payload = {
    diary_date: data.diary_date,
    meal_type_id: data.meal_type_id,
    planned_meal_id: data.planned_meal_id,
    planned_time: data.planned_time,
    consumed_time: data.consumed_time,
    status: data.status,
    title: data.title,
    notes: data.notes,
  };

  if (mealId) {
    if (!(await ownsMeal(ctx, mealId))) return dbError("Refeição não encontrada.");
    const { error } = await ctx.supabase
      .from("nutrition_diary_meals")
      .update(payload)
      .eq("id", mealId);
    if (error) return dbError("Não foi possível salvar a refeição.");
    revalidateDiary();
    return { ok: true, data: { id: mealId } };
  }

  // Posição: no fim do dia, respeitando a ordem que já existe.
  const { count } = await ctx.supabase
    .from("nutrition_diary_meals")
    .select("id", { count: "exact", head: true })
    .eq("diary_date", data.diary_date);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_diary_meals")
    .insert({ ...payload, user_id: ctx.userId, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível criar a refeição.");

  revalidateDiary();
  return { ok: true, data: { id: created.id } };
}

export async function setDiaryMealStatus(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = diaryMealStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { error } = await ctx.supabase
    .from("nutrition_diary_meals")
    .update({
      // 'pendente' nem chega aqui: não está no enum do schema nem no CHECK do banco.
      status: data.status,
      consumed_time: data.consumed_time,
      notes: data.notes,
    })
    .eq("id", data.meal_id);
  if (error) return dbError("Não foi possível atualizar a refeição.");

  revalidateDiary();
  return { ok: true, data: undefined };
}

export async function deleteDiaryMeal(mealId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // Os itens somem junto (cascade). O PLANEJAMENTO fica intacto: `planned_meal_id` é apenas
  // uma referência, e a refeição planejada vive em outra tabela.
  const { error } = await ctx.supabase.from("nutrition_diary_meals").delete().eq("id", mealId);
  if (error) return dbError("Não foi possível excluir a refeição.");

  revalidateDiary();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Itens consumidos (SNAPSHOT) ═══════════════════════════ */

export async function addDiaryEntry(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = diaryEntrySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (!(await ownsMeal(ctx, data.diary_meal_id))) return dbError("Refeição não encontrada.");

  // O catálogo é lido AQUI, no servidor. Nada de nutriente vindo do navegador.
  const source = await getFoodSnapshotInput(data.food_id, data.measure_id);
  if (!source) return dbError("Alimento não encontrado.");

  const built = buildDiaryEntrySnapshot({
    food: source.food,
    quantity: data.quantity,
    measure: source.measure,
  });
  // Conversão impossível é erro explícito com a mensagem certa — nunca uma estimativa.
  if (!built.ok) return dbError(CONVERSION_FAILURE_MESSAGES[built.reason]);

  const { count } = await ctx.supabase
    .from("nutrition_diary_entries")
    .select("id", { count: "exact", head: true })
    .eq("diary_meal_id", data.diary_meal_id);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_diary_entries")
    .insert({
      user_id: ctx.userId,
      diary_meal_id: data.diary_meal_id,
      food_id: data.food_id,
      entry_kind: "alimento",
      planned_item_id: data.planned_item_id,
      change_kind: data.change_kind,
      changed_at: data.planned_item_id ? new Date().toISOString() : null,
      notes: data.notes,
      position: count ?? 0,
      ...snapshotColumns(built.snapshot),
    })
    .select("id")
    .single();
  if (error || !created) {
    // O unique parcial (user_id, diary_meal_id, planned_item_id) é o que impede duplicar ao
    // confirmar a mesma refeição duas vezes.
    return dbError(
      error?.code === "23505"
        ? "Este item do planejamento já foi registrado nesta refeição."
        : "Não foi possível registrar o consumo.",
    );
  }

  await touchFoodUsage(ctx, data.food_id);
  revalidateDiary();
  return { ok: true, data: { id: created.id } };
}

/**
 * Item consumido SEM alimento do catálogo ("comi na casa da minha mãe").
 *
 * Grava com `nutrients_snapshot` vazio, o que faz o total do dia ficar PARCIAL — e a tela
 * dizer isso. Inventar um valor calórico para um prato desconhecido seria a mesma mentira que
 * tratar ausência de dado como zero.
 */
export async function addDiaryFreeEntry(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = diaryFreeEntrySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (!(await ownsMeal(ctx, data.diary_meal_id))) return dbError("Refeição não encontrada.");

  const { count } = await ctx.supabase
    .from("nutrition_diary_entries")
    .select("id", { count: "exact", head: true })
    .eq("diary_meal_id", data.diary_meal_id);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_diary_entries")
    .insert({
      user_id: ctx.userId,
      diary_meal_id: data.diary_meal_id,
      food_id: null,
      entry_kind: "livre",
      planned_item_id: data.planned_item_id,
      change_kind: data.change_kind,
      changed_at: data.planned_item_id ? new Date().toISOString() : null,
      food_name_snapshot: data.label,
      nutrients_snapshot: {},
      notes: data.notes,
      position: count ?? 0,
    })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível registrar o item.");

  revalidateDiary();
  return { ok: true, data: { id: created.id } };
}

/**
 * Ajusta a quantidade de um item já registrado.
 *
 * REGRAVA O SNAPSHOT com o catálogo de agora — e isso é correto: mudar a quantidade é um novo
 * registro do que foi consumido, feito neste momento. O que a regra proíbe é o passado mudar
 * SOZINHO, sem o usuário pedir; uma edição explícita é justamente o usuário pedindo.
 */
export async function updateDiaryEntryQuantity(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = diaryEntryQuantitySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: entry } = await ctx.supabase
    .from("nutrition_diary_entries")
    .select("id,food_id,entry_kind,planned_item_id")
    .eq("id", data.entry_id)
    .maybeSingle();
  if (!entry) return dbError("Item não encontrado.");

  if (entry.entry_kind !== "alimento" || !entry.food_id) {
    return dbError(
      "Este item foi registrado sem alimento do catálogo, então não tem quantidade para recalcular. Exclua e registre de novo.",
    );
  }

  const source = await getFoodSnapshotInput(entry.food_id, data.measure_id);
  if (!source) {
    return dbError(
      "O alimento não está mais no catálogo. O registro antigo foi preservado — exclua e registre de novo se quiser mudar a quantidade.",
    );
  }

  const built = buildDiaryEntrySnapshot({
    food: source.food,
    quantity: data.quantity,
    measure: source.measure,
  });
  if (!built.ok) return dbError(CONVERSION_FAILURE_MESSAGES[built.reason]);

  const { error } = await ctx.supabase
    .from("nutrition_diary_entries")
    .update({
      ...snapshotColumns(built.snapshot),
      // Quantidade diferente da planejada passa a ser registrada como ajuste.
      change_kind: entry.planned_item_id ? "quantidade_ajustada" : "extra",
      changed_at: new Date().toISOString(),
    })
    .eq("id", data.entry_id);
  if (error) return dbError("Não foi possível atualizar a quantidade.");

  revalidateDiary();
  return { ok: true, data: undefined };
}

export async function deleteDiaryEntry(entryId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("nutrition_diary_entries").delete().eq("id", entryId);
  if (error) return dbError("Não foi possível excluir o item.");

  revalidateDiary();
  return { ok: true, data: undefined };
}

/**
 * Marca um item planejado como NÃO consumido, sem apagar o planejamento.
 *
 * O registro fica no diário com `change_kind = 'removido'`, então a soma o ignora mas o
 * comparativo mostra "você decidiu pular isto" — diferente de "você não registrou nada".
 */
export async function skipPlannedItem(
  diaryMealId: string,
  plannedItemId: string,
  label: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!(await ownsMeal(ctx, diaryMealId))) return dbError("Refeição não encontrada.");

  // Reler e decidir, em vez de `upsert`: o índice que impede a duplicação é PARCIAL
  // (`where planned_item_id is not null`), e o Postgres não infere índice parcial num
  // `ON CONFLICT` sem repetir o predicado — o upsert falharia em runtime.
  const { data: existing } = await ctx.supabase
    .from("nutrition_diary_entries")
    .select("id")
    .eq("diary_meal_id", diaryMealId)
    .eq("planned_item_id", plannedItemId)
    .maybeSingle();

  const payload = {
    entry_kind: "livre" as const,
    change_kind: "removido" as const,
    changed_at: new Date().toISOString(),
    food_name_snapshot: label || "Item do plano",
    // O snapshot é zerado de propósito: um item pulado não tem valor nutricional consumido.
    nutrients_snapshot: {},
    energy_kcal: null,
    protein_g: null,
    carb_g: null,
    fat_g: null,
    fiber_g: null,
  };

  const { error } = existing
    ? await ctx.supabase.from("nutrition_diary_entries").update(payload).eq("id", existing.id)
    : await ctx.supabase.from("nutrition_diary_entries").insert({
        ...payload,
        user_id: ctx.userId,
        diary_meal_id: diaryMealId,
        planned_item_id: plannedItemId,
      });
  if (error) return dbError("Não foi possível marcar o item.");

  revalidateDiary();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Confirmar refeição planejada ═══════════════════════════ */

/**
 * Transforma uma refeição PLANEJADA em consumo registrado.
 *
 * IDEMPOTENTE POR CONSTRUÇÃO: se a refeição do diário já existe (unique parcial em
 * `planned_meal_id`), ela é reaproveitada; itens já registrados são pulados em vez de
 * duplicados. Clicar duas vezes, ou ter duas abas abertas, não dobra o almoço.
 *
 * O PLANEJAMENTO NÃO É ALTERADO em nenhum momento — nem os itens, nem a refeição.
 */
export async function confirmPlannedMeal(
  input: unknown,
): Promise<ActionResult<{ mealId: string; registrados: number; pulados: number; falhas: string[] }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = confirmPlannedMealSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: planned } = await ctx.supabase
    .from("nutrition_planned_meals")
    .select("id,meal_type_id,planned_time,title,notes")
    .eq("id", data.planned_meal_id)
    .maybeSingle();
  if (!planned) return dbError("Refeição planejada não encontrada.");

  // 1. Refeição do diário: reaproveita a existente em vez de criar uma segunda.
  const { data: existing } = await ctx.supabase
    .from("nutrition_diary_meals")
    .select("id")
    .eq("planned_meal_id", planned.id)
    .maybeSingle();

  let mealId = existing?.id ?? null;
  if (!mealId) {
    const { data: created, error } = await ctx.supabase
      .from("nutrition_diary_meals")
      .insert({
        user_id: ctx.userId,
        diary_date: data.diary_date,
        meal_type_id: planned.meal_type_id,
        planned_meal_id: planned.id,
        planned_time: planned.planned_time,
        consumed_time: data.consumed_time,
        status: "consumida",
        title: planned.title,
      })
      .select("id")
      .single();
    if (error || !created) return dbError("Não foi possível criar a refeição no diário.");
    mealId = created.id;
  } else {
    await ctx.supabase
      .from("nutrition_diary_meals")
      .update({ status: "consumida", consumed_time: data.consumed_time })
      .eq("id", mealId);
  }

  // 2. Itens do plano.
  const [{ data: items }, { data: alreadyRegistered }] = await Promise.all([
    ctx.supabase
      .from("nutrition_planned_meal_items")
      .select("id,food_id,custom_label,quantity,measure_id,measure_label")
      .eq("planned_meal_id", planned.id)
      .order("position"),
    ctx.supabase
      .from("nutrition_diary_entries")
      .select("planned_item_id")
      .eq("diary_meal_id", mealId)
      .not("planned_item_id", "is", null),
  ]);

  const registeredIds = new Set(
    (alreadyRegistered ?? []).map((row) => row.planned_item_id).filter(Boolean) as string[],
  );
  const skipped = new Set(data.skipped_item_ids);

  let registrados = 0;
  let pulados = 0;
  const falhas: string[] = [];

  for (const [index, item] of (items ?? []).entries()) {
    if (registeredIds.has(item.id)) continue; // já registrado: idempotência.

    const label = item.custom_label ?? "Item do plano";

    if (skipped.has(item.id)) {
      await ctx.supabase.from("nutrition_diary_entries").insert({
        user_id: ctx.userId,
        diary_meal_id: mealId,
        planned_item_id: item.id,
        entry_kind: "livre",
        change_kind: "removido",
        changed_at: new Date().toISOString(),
        food_name_snapshot: label,
        nutrients_snapshot: {},
        position: index,
      });
      pulados += 1;
      continue;
    }

    // Item sem alimento entra como livre: sem valor nutricional, e o total fica parcial.
    if (!item.food_id || item.quantity === null) {
      await ctx.supabase.from("nutrition_diary_entries").insert({
        user_id: ctx.userId,
        diary_meal_id: mealId,
        planned_item_id: item.id,
        entry_kind: "livre",
        change_kind: "igual",
        food_name_snapshot: label,
        nutrients_snapshot: {},
        position: index,
      });
      registrados += 1;
      continue;
    }

    const source = await getFoodSnapshotInput(item.food_id, item.measure_id);
    if (!source) {
      falhas.push(`${label}: o alimento não está mais no catálogo.`);
      continue;
    }

    const built = buildDiaryEntrySnapshot({
      food: source.food,
      quantity: Number(item.quantity),
      measure: source.measure,
    });
    if (!built.ok) {
      falhas.push(`${source.food.name}: ${CONVERSION_FAILURE_MESSAGES[built.reason]}`);
      continue;
    }

    const { error } = await ctx.supabase.from("nutrition_diary_entries").insert({
      user_id: ctx.userId,
      diary_meal_id: mealId,
      food_id: item.food_id,
      entry_kind: "alimento",
      planned_item_id: item.id,
      change_kind: "igual",
      position: index,
      ...snapshotColumns(built.snapshot),
    });
    if (error) {
      falhas.push(`${source.food.name}: não foi possível registrar.`);
      continue;
    }
    registrados += 1;
    await touchFoodUsage(ctx, item.food_id);
  }

  revalidateDiary();
  return { ok: true, data: { mealId, registrados, pulados, falhas } };
}

/**
 * Cria as refeições do diário a partir do que estava planejado para o dia, sem registrar
 * consumo: cada uma nasce como 'planejada' e o usuário confirma uma a uma.
 */
export async function importPlannedDay(
  date: string,
): Promise<ActionResult<{ criadas: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const dia = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : hojeISO();

  const [{ data: planned }, { data: existing }] = await Promise.all([
    ctx.supabase
      .from("nutrition_planned_meals")
      .select("id,meal_type_id,planned_time,title,notes,position")
      .eq("planned_date", dia)
      .order("position"),
    ctx.supabase
      .from("nutrition_diary_meals")
      .select("planned_meal_id")
      .eq("diary_date", dia)
      .not("planned_meal_id", "is", null),
  ]);

  const already = new Set(
    (existing ?? []).map((row) => row.planned_meal_id).filter(Boolean) as string[],
  );
  const rows = (planned ?? [])
    .filter((meal) => !already.has(meal.id))
    .map((meal) => ({
      user_id: ctx.userId,
      diary_date: dia,
      meal_type_id: meal.meal_type_id,
      planned_meal_id: meal.id,
      planned_time: meal.planned_time,
      status: "planejada" as const,
      title: meal.title,
      notes: meal.notes,
      position: meal.position,
    }));

  if (rows.length === 0) return { ok: true, data: { criadas: 0 } };

  const { error } = await ctx.supabase.from("nutrition_diary_meals").insert(rows);
  if (error) return dbError("Não foi possível trazer o planejamento para o diário.");

  revalidateDiary();
  return { ok: true, data: { criadas: rows.length } };
}
