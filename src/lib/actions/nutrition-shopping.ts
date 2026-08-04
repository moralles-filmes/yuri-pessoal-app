"use server";

/**
 * Fase 16-D — Dieta e Alimentação · Server Actions da lista de compras e da despensa.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ NADA AQUI SOMA UNIDADE INCOMPATÍVEL, E NADA AQUI RECEBE UM TOTAL DO NAVEGADOR.     ║
 * ║ O cliente diz "gere a lista da semana"; quem lê o planejamento, tenta a conversão e   ║
 * ║ decide o que soma com o que é o servidor, por `consolidateShoppingItems` (puro).      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ══ AS QUATRO DISCIPLINAS DA SUBFASE, IMPLEMENTADAS AQUI ══
 * 1. REGERAR NÃO PERDE O AJUSTE MANUAL — `planRegeneration` devolve `keepQuantity` e a
 *    quantidade do usuário não é tocada.
 * 2. O DESCONTO DA DESPENSA É OPT-IN E CONFERIDO — a tela mostra a prévia, e o servidor
 *    RECALCULA antes de gravar (o que a tela mostrou é conferido, nunca copiado).
 * 3. NADA SOME SOZINHO — o que o planejamento não pede mais só é apagado com
 *    `remove_obsolete` explícito; a ação em massa padrão é marcar, não excluir.
 * 4. AÇÃO EM MASSA NÃO ALCANÇA REGISTRO FORA DO FILTRO — a UI recorta com `selectionInScope`
 *    e a action ainda confere que todo id pertence à lista informada.
 *
 * ⚠️ Os índices únicos de `recurrence_key` e de `consolidation_key` são PARCIAIS: o Postgres
 * não os infere num `ON CONFLICT` e o PostgREST não deixa repetir o predicado (42P10, falha só
 * em runtime — a armadilha documentada desde a 16-B). Todo caminho aqui é select-then-insert.
 */
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { hojeISO } from "@/lib/format";
import { NUTRITION_BASE_PATH } from "@/lib/nutrition/constants";
import {
  consolidateShoppingItems,
  duplicateShoppingListDraft,
  findRecurringList,
  pantryPatches,
  planRegeneration,
  previewPantryDiscount,
  shoppingRecurrenceKey,
  shoppingSubjectKey,
  type ConsolidatedItem,
  type ExistingItemRef,
  type PantryDiscountPreview,
} from "@/lib/nutrition/shopping";
import {
  buildShoppingSources,
  getPantryStocks,
  getShoppingList,
} from "@/lib/nutrition/shopping-queries";
import {
  applyPantrySchema,
  bulkShoppingItemsSchema,
  duplicateShoppingListSchema,
  generateShoppingListSchema,
  marketCategorySchema,
  pantryItemSchema,
  recurringShoppingListSchema,
  shoppingItemMoveSchema,
  shoppingItemQuantitySchema,
  shoppingItemSchema,
  shoppingItemStatusSchema,
  shoppingItemsReorderSchema,
  shoppingListSchema,
} from "@/lib/validators/nutrition-shopping";
import type { ActionResult } from "@/types/finance";

const SHOPPING_PATH = `${NUTRITION_BASE_PATH}/compras`;

function revalidateShopping() {
  revalidatePath(NUTRITION_BASE_PATH);
  revalidatePath(SHOPPING_PATH);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/** A lista existe e é do usuário? A RLS garante o recorte; isto dá a mensagem certa. */
async function ownsList(ctx: Ctx, listId: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("nutrition_shopping_lists")
    .select("id")
    .eq("id", listId)
    .maybeSingle();
  return Boolean(data);
}

async function nextPosition(ctx: Ctx, listId: string): Promise<number> {
  const { count } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .select("id", { count: "exact", head: true })
    .eq("list_id", listId);
  return count ?? 0;
}

/* ═══════════════════════════ Corredores de mercado ═══════════════════════════ */

export async function saveMarketCategory(
  input: unknown,
  categoryId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = marketCategorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  if (categoryId) {
    const { error } = await ctx.supabase
      .from("nutrition_market_categories")
      .update(parsed.data)
      .eq("id", categoryId);
    if (error) {
      return dbError(
        error.code === "23505" ? "Já existe um corredor com esse nome." : "Não foi possível salvar.",
      );
    }
    revalidateShopping();
    return { ok: true, data: { id: categoryId } };
  }

  const { count } = await ctx.supabase
    .from("nutrition_market_categories")
    .select("id", { count: "exact", head: true });

  const { data: created, error } = await ctx.supabase
    .from("nutrition_market_categories")
    .insert({ ...parsed.data, user_id: ctx.userId, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !created) {
    return dbError(
      error?.code === "23505" ? "Já existe um corredor com esse nome." : "Não foi possível criar.",
    );
  }

  revalidateShopping();
  return { ok: true, data: { id: created.id } };
}

/**
 * Excluir um corredor. Os itens não somem: `category_id` é `on delete set null` e eles caem no
 * grupo "Sem corredor", visíveis. A tela avisa quantos serão afetados antes de confirmar.
 */
export async function deleteMarketCategory(categoryId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_market_categories")
    .delete()
    .eq("id", categoryId);
  if (error) return dbError("Não foi possível excluir o corredor.");

  revalidateShopping();
  return { ok: true, data: undefined };
}

export async function reorderMarketCategories(ids: string[]): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (ids.length === 0 || ids.length > 100) return dbError("Ordem inválida.");

  for (const [index, id] of ids.entries()) {
    await ctx.supabase.from("nutrition_market_categories").update({ position: index }).eq("id", id);
  }

  revalidateShopping();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Lista ═══════════════════════════ */

export async function saveShoppingList(
  input: unknown,
  listId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = shoppingListSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  // A chave é DERIVADA no servidor. Se viesse do cliente, a lista da semana duplicaria.
  const recurrenceKey = shoppingRecurrenceKey(
    data.recurrence,
    data.reference_date ?? hojeISO(),
  );

  const payload = {
    name: data.name,
    notes: data.notes,
    status: data.status,
    store: data.store,
    recurrence: data.recurrence,
    recurrence_key: recurrenceKey,
  };

  if (listId) {
    if (!(await ownsList(ctx, listId))) return dbError("Lista não encontrada.");
    const { error } = await ctx.supabase
      .from("nutrition_shopping_lists")
      .update(payload)
      .eq("id", listId);
    if (error) {
      return dbError(
        error.code === "23505"
          ? "Já existe uma lista para este período com essa repetição."
          : "Não foi possível salvar a lista.",
      );
    }
    revalidateShopping();
    return { ok: true, data: { id: listId } };
  }

  const { data: created, error } = await ctx.supabase
    .from("nutrition_shopping_lists")
    .insert({ ...payload, user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !created) {
    return dbError(
      error?.code === "23505"
        ? "Já existe uma lista para este período com essa repetição."
        : "Não foi possível criar a lista.",
    );
  }

  revalidateShopping();
  return { ok: true, data: { id: created.id } };
}

export async function setShoppingListStatus(
  listId: string,
  status: "ativa" | "concluida" | "arquivada",
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_shopping_lists")
    .update({ status, archived_at: status === "arquivada" ? new Date().toISOString() : null })
    .eq("id", listId);
  if (error) return dbError("Não foi possível atualizar a lista.");

  revalidateShopping();
  return { ok: true, data: undefined };
}

/** Excluir a lista leva os itens junto (`on delete cascade`). A tela confirma antes. */
export async function deleteShoppingList(listId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("nutrition_shopping_lists").delete().eq("id", listId);
  if (error) return dbError("Não foi possível excluir a lista.");

  revalidateShopping();
  return { ok: true, data: undefined };
}

/**
 * Duplicar uma lista.
 *
 * A cópia é para a PRÓXIMA compra: ela não herda a recorrência (herdar colidiria com a lista
 * do período) nem o que já foi comprado — status volta a pendente, preço real e data de compra
 * saem. O preço ESTIMADO fica: é a memória útil de quanto costuma custar.
 */
export async function duplicateShoppingList(
  input: unknown,
): Promise<ActionResult<{ id: string; name: string; itens: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = duplicateShoppingListSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data: source } = await ctx.supabase
    .from("nutrition_shopping_lists")
    .select("id,name,notes,source_kind,source_from,source_to,store")
    .eq("id", parsed.data.list_id)
    .maybeSingle();
  if (!source) return dbError("Lista não encontrada.");

  const draft = duplicateShoppingListDraft({ name: source.name });
  const name = parsed.data.name ?? draft.name;

  const { data: created, error } = await ctx.supabase
    .from("nutrition_shopping_lists")
    .insert({
      user_id: ctx.userId,
      name,
      notes: source.notes,
      source_kind: source.source_kind,
      source_from: source.source_from,
      source_to: source.source_to,
      store: source.store,
      status: draft.status,
      recurrence: draft.recurrence,
      recurrence_key: draft.recurrenceKey,
      pantry_applied_at: draft.pantryAppliedAt,
    })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível duplicar a lista.");

  const { data: items } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .select(
      "category_id,food_id,recipe_id,label,brand,quantity,unit,consolidation_key,quantity_overridden,origins,separate_reason,is_manual,priority,estimated_price_cents,store,note,position",
    )
    .eq("list_id", parsed.data.list_id)
    .order("position");

  let itens = 0;
  if (items?.length) {
    const { error: itemsError } = await ctx.supabase.from("nutrition_shopping_list_items").insert(
      items.map((item) => ({
        ...item,
        user_id: ctx.userId,
        list_id: created.id,
        // O que a cópia NÃO herda: a compra da vez passada.
        status: "pendente" as const,
        actual_price_cents: null,
        purchased_at: null,
      })),
    );
    if (!itemsError) itens = items.length;
  }

  revalidateShopping();
  return { ok: true, data: { id: created.id, name, itens } };
}

/**
 * Reencontrar (ou criar) a lista recorrente de um período — regra 6.
 *
 * A chave é determinística, então abrir a tela cinco vezes na mesma semana devolve a MESMA
 * lista. O select-then-insert é obrigatório aqui: o índice único é parcial e `upsert` quebraria
 * em runtime com 42P10.
 */
export async function ensureRecurringShoppingList(
  input: unknown,
): Promise<ActionResult<{ id: string; criada: boolean; name: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = recurringShoppingListSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const key = shoppingRecurrenceKey(data.recurrence, data.reference_date);
  if (!key) return dbError("Escolha uma repetição para a lista recorrente.");

  const { data: existing } = await ctx.supabase
    .from("nutrition_shopping_lists")
    .select("id,name,recurrence_key")
    .eq("recurrence_key", key);

  const found = findRecurringList(
    (existing ?? []).map((row) => ({ id: row.id, name: row.name, recurrenceKey: row.recurrence_key })),
    key,
  );
  if (found) return { ok: true, data: { id: found.id, criada: false, name: found.name } };

  const name = data.name ?? `Compras · ${key.split(":")[1]}`;
  const { data: created, error } = await ctx.supabase
    .from("nutrition_shopping_lists")
    .insert({
      user_id: ctx.userId,
      name,
      recurrence: data.recurrence,
      recurrence_key: key,
    })
    .select("id")
    .single();

  // Corrida entre duas abas: o índice único barrou a segunda — devolvemos a primeira.
  if (error?.code === "23505") {
    const { data: raced } = await ctx.supabase
      .from("nutrition_shopping_lists")
      .select("id,name")
      .eq("recurrence_key", key)
      .maybeSingle();
    if (raced) return { ok: true, data: { id: raced.id, criada: false, name: raced.name } };
  }
  if (error || !created) return dbError("Não foi possível criar a lista recorrente.");

  revalidateShopping();
  return { ok: true, data: { id: created.id, criada: true, name } };
}

/* ═══════════════════════════ Geração ═══════════════════════════ */

type GenerationInput = z.infer<typeof generateShoppingListSchema>;

/** Monta as parcelas e consolida — a parte que prévia e gravação compartilham. */
async function consolidateFor(data: GenerationInput) {
  const built = await buildShoppingSources({
    from: data.from,
    to: data.to,
    recipes: data.recipes.map((recipe) => ({
      recipeId: recipe.recipe_id,
      quantity: recipe.quantity,
      portionUnit: recipe.portion_unit,
    })),
  });
  return { built, consolidated: consolidateShoppingItems(built.sources) };
}

export type ShoppingGenerationPreview = {
  itens: number;
  refeicoes: number;
  /** Itens que ficaram em linhas separadas por incompatibilidade de unidade. */
  separados: { label: string; units: string[] }[];
  ignorados: { label: string; reason: string }[];
  /** Só quando a lista já existe: o que seria removido e quantos ajustes seriam preservados. */
  obsoletos: { id: string; label: string }[];
  ajustesPreservados: number;
  /** Prévia do desconto da despensa — mostrada ANTES de aplicar (regra 3). */
  despensa: PantryDiscountPreview;
};

/**
 * O que a geração FARIA — sem escrever nada.
 *
 * Existe para a regra 3 ("o desconto é mostrado antes de aplicar") e para a regra 4 ("nada
 * some sozinho"): a tela mostra os itens que ficariam separados, o que a despensa cobriria e o
 * que deixaria de ser pedido, e só então o usuário confirma.
 */
export async function previewShoppingGeneration(
  input: unknown,
): Promise<ActionResult<ShoppingGenerationPreview>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = generateShoppingListSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { built, consolidated } = await consolidateFor(data);
  const pantry = await getPantryStocks();

  let obsoletos: { id: string; label: string }[] = [];
  let ajustesPreservados = 0;
  if (data.list_id) {
    const existing = await existingRefs(ctx, data.list_id);
    const plan = planRegeneration(consolidated.items, existing);
    obsoletos = plan.obsolete;
    ajustesPreservados = plan.preservedOverrides;
  }

  return {
    ok: true,
    data: {
      itens: consolidated.items.length,
      refeicoes: built.meals,
      separados: consolidated.splits.map((split) => ({ label: split.label, units: split.units })),
      ignorados: built.skipped,
      obsoletos,
      ajustesPreservados,
      despensa: previewPantryDiscount(consolidated.items, pantry),
    },
  };
}

async function existingRefs(ctx: Ctx, listId: string): Promise<ExistingItemRef[]> {
  const { data } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .select("id,consolidation_key,quantity_overridden,is_manual,label")
    .eq("list_id", listId);

  return (data ?? []).map((row) => ({
    id: row.id,
    consolidationKey: row.consolidation_key,
    quantityOverridden: row.quantity_overridden,
    isManual: row.is_manual,
    label: row.label,
  }));
}

/** O payload de um item gerado. `is_manual` falso: a regeração pode atualizá-lo. */
function generatedPayload(item: ConsolidatedItem, position: number) {
  return {
    category_id: item.categoryId,
    food_id: item.foodId,
    recipe_id: item.foodId ? null : item.recipeId,
    label: item.label,
    brand: item.brand,
    quantity: item.quantity,
    unit: item.unit,
    consolidation_key: item.consolidationKey,
    origins: item.origins,
    separate_reason: item.separateReason,
    is_manual: false,
    position,
  };
}

export type ShoppingGenerationResultData = {
  listId: string;
  criados: number;
  atualizados: number;
  removidos: number;
  ajustesPreservados: number;
  separados: number;
  ignorados: { label: string; reason: string }[];
  despensaAplicada: number;
};

/**
 * Gera (ou regera) a lista.
 *
 * ══ O QUE ACONTECE, NA ORDEM ══
 * 1. Lê planejamento + receitas e tenta a conversão de cada parcela (`buildShoppingSources`).
 * 2. Consolida — somando SÓ o que é somável (`consolidateShoppingItems`).
 * 3. Compara com o que já está na lista (`planRegeneration`): insere, atualiza preservando
 *    ajuste manual, e SEPARA o que ficou obsoleto sem apagar.
 * 4. Só com `remove_obsolete` explícito, apaga os obsoletos.
 * 5. Só com `discount_pantry` explícito, aplica o desconto — RECALCULADO aqui, não copiado
 *    da tela.
 */
export async function generateShoppingList(
  input: unknown,
): Promise<ActionResult<ShoppingGenerationResultData>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = generateShoppingListSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  /* ── A lista de destino ── */
  let listId = data.list_id;
  if (listId) {
    if (!(await ownsList(ctx, listId))) return dbError("Lista não encontrada.");
    await ctx.supabase
      .from("nutrition_shopping_lists")
      .update({
        source_kind: data.source_kind,
        source_from: data.from,
        source_to: data.to,
      })
      .eq("id", listId);
  } else {
    const recurrenceKey = shoppingRecurrenceKey(data.recurrence, data.from ?? hojeISO());
    if (recurrenceKey) {
      // Lista recorrente: reencontra a do período em vez de criar outra (regra 6).
      const { data: existing } = await ctx.supabase
        .from("nutrition_shopping_lists")
        .select("id")
        .eq("recurrence_key", recurrenceKey)
        .maybeSingle();
      listId = existing?.id ?? null;
    }

    if (!listId) {
      const { data: created, error } = await ctx.supabase
        .from("nutrition_shopping_lists")
        .insert({
          user_id: ctx.userId,
          name: data.name ?? defaultListName(data),
          source_kind: data.source_kind,
          source_from: data.from,
          source_to: data.to,
          recurrence: data.recurrence,
          recurrence_key: recurrenceKey,
        })
        .select("id")
        .single();
      if (error || !created) return dbError("Não foi possível criar a lista.");
      listId = created.id;
    }
  }

  /* ── Consolidação ── */
  const { built, consolidated } = await consolidateFor(data);
  const existing = await existingRefs(ctx, listId);
  const plan = planRegeneration(consolidated.items, existing);

  let position = await nextPosition(ctx, listId);
  let criados = 0;
  let atualizados = 0;

  if (plan.toInsert.length > 0) {
    const rows = plan.toInsert.map((item) => ({
      ...generatedPayload(item, position++),
      user_id: ctx.userId,
      list_id: listId,
    }));
    const { data: inserted } = await ctx.supabase
      .from("nutrition_shopping_list_items")
      .insert(rows)
      .select("id");
    criados = inserted?.length ?? 0;
  }

  for (const update of plan.toUpdate) {
    const payload = generatedPayload(update.item, 0);
    // O ajuste manual do usuário vence o recálculo (regra 2).
    const { position: _ignored, ...rest } = payload;
    void _ignored;
    const patch = update.keepQuantity
      ? { ...rest, quantity: undefined, unit: undefined }
      : rest;
    const { error } = await ctx.supabase
      .from("nutrition_shopping_list_items")
      .update(patch)
      .eq("id", update.id);
    if (!error) atualizados += 1;
  }

  /* ── Obsoletos: só somem com escolha explícita (regra 4) ── */
  let removidos = 0;
  if (data.remove_obsolete && plan.obsolete.length > 0) {
    const { data: deleted } = await ctx.supabase
      .from("nutrition_shopping_list_items")
      .delete()
      .in(
        "id",
        plan.obsolete.map((item) => item.id),
      )
      .select("id");
    removidos = deleted?.length ?? 0;
  }

  /* ── Despensa: opt-in, e RECALCULADA no servidor ── */
  let despensaAplicada = 0;
  if (data.discount_pantry) {
    const applied = await applyPantryToList(ctx, listId);
    despensaAplicada = applied;
  }

  revalidateShopping();
  return {
    ok: true,
    data: {
      listId,
      criados,
      atualizados,
      removidos,
      ajustesPreservados: plan.preservedOverrides,
      separados: consolidated.splits.length,
      ignorados: built.skipped,
      despensaAplicada,
    },
  };
}

function defaultListName(data: GenerationInput): string {
  if (data.source_kind === "receitas") return "Compras das receitas";
  if (data.from && data.to && data.from !== data.to) {
    return `Compras · ${formatBR(data.from)} a ${formatBR(data.to)}`;
  }
  if (data.from) return `Compras · ${formatBR(data.from)}`;
  return "Lista de compras";
}

/** 'yyyy-MM-dd' → 'dd/MM' a partir do TEXTO. Data pura não vira `Date` só para formatar. */
function formatBR(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

/* ═══════════════════════════ Despensa aplicada à lista ═══════════════════════════ */

/**
 * Aplica o desconto da despensa numa lista, RECALCULANDO a prévia no servidor.
 *
 * Cobertura total NÃO zera a quantidade: o item vira `removido` ("não vou comprar"), continua
 * na lista e volta a pendente com um toque. Zerar afirmaria "preciso de 0 g de arroz", o que é
 * falso — eu preciso, só já tenho.
 */
async function applyPantryToList(ctx: Ctx, listId: string): Promise<number> {
  const [list, pantry] = await Promise.all([getShoppingList(listId), getPantryStocks()]);
  if (!list) return 0;

  // Só o que ainda está em aberto entra no desconto: mexer no que já foi comprado seria
  // reescrever um fato.
  const abertos = list.items.filter(
    (item) => item.status === "pendente" || item.status === "no_carrinho",
  );

  const preview = previewPantryDiscount(
    abertos.map((item) => ({
      consolidationKey: item.id,
      subjectKey: shoppingSubjectKey(item.foodId, item.label),
      foodId: item.foodId,
      recipeId: item.recipeId,
      label: item.label,
      brand: item.brand,
      categoryId: item.categoryId,
      quantity: item.quantity,
      unit: item.unit,
      origins: item.origins,
      mergedFrom: 1,
      separateReason: item.separateReason,
    })),
    pantry,
  );

  const patches = pantryPatches(preview.lines);
  let aplicados = 0;

  for (const patch of patches) {
    const item = abertos.find((row) => row.id === patch.consolidationKey);
    if (!item) continue;

    const note = [item.note, patch.note].filter(Boolean).join(" · ");
    const { error } = await ctx.supabase
      .from("nutrition_shopping_list_items")
      .update(
        patch.covered
          ? { status: "removido", note }
          : { quantity: patch.quantity, note },
      )
      .eq("id", item.id);
    if (!error) aplicados += 1;
  }

  await ctx.supabase
    .from("nutrition_shopping_lists")
    .update({ pantry_applied_at: new Date().toISOString() })
    .eq("id", listId);

  return aplicados;
}

/** Prévia do desconto numa lista já existente. Não escreve nada. */
export async function previewPantryForList(
  listId: string,
): Promise<ActionResult<PantryDiscountPreview>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const [list, pantry] = await Promise.all([getShoppingList(listId), getPantryStocks()]);
  if (!list) return dbError("Lista não encontrada.");

  const preview = previewPantryDiscount(
    list.items
      .filter((item) => item.status === "pendente" || item.status === "no_carrinho")
      .map((item) => ({
        consolidationKey: item.id,
        subjectKey: shoppingSubjectKey(item.foodId, item.label),
        foodId: item.foodId,
        recipeId: item.recipeId,
        label: item.label,
        brand: item.brand,
        categoryId: item.categoryId,
        quantity: item.quantity,
        unit: item.unit,
        origins: item.origins,
        mergedFrom: 1,
        separateReason: item.separateReason,
      })),
    pantry,
  );

  return { ok: true, data: preview };
}

export async function applyPantryDiscountToList(
  input: unknown,
): Promise<ActionResult<{ aplicados: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = applyPantrySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  if (!(await ownsList(ctx, parsed.data.list_id))) return dbError("Lista não encontrada.");

  const aplicados = await applyPantryToList(ctx, parsed.data.list_id);
  revalidateShopping();
  return { ok: true, data: { aplicados } };
}

/* ═══════════════════════════ Itens ═══════════════════════════ */

export async function saveShoppingItem(
  input: unknown,
  itemId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = shoppingItemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (!(await ownsList(ctx, data.list_id))) return dbError("Lista não encontrada.");

  // O rótulo é congelado no ato: o item continua legível se o alimento sair do catálogo.
  let label = data.label;
  if (!label && data.food_id) {
    const { data: food } = await ctx.supabase
      .from("nutrition_foods")
      .select("name")
      .eq("id", data.food_id)
      .maybeSingle();
    label = food?.name ?? null;
  }
  if (!label) return dbError("Escolha um alimento ou escreva o que precisa comprar.");

  const payload = {
    list_id: data.list_id,
    category_id: data.category_id,
    food_id: data.food_id,
    recipe_id: data.recipe_id,
    label,
    brand: data.brand,
    quantity: data.quantity,
    unit: data.unit,
    status: data.status,
    priority: data.priority,
    estimated_price_cents: data.estimated_price_cents,
    actual_price_cents: data.actual_price_cents,
    store: data.store,
    note: data.note,
  };

  if (itemId) {
    const { error } = await ctx.supabase
      .from("nutrition_shopping_list_items")
      .update(payload)
      .eq("id", itemId);
    if (error) return dbError("Não foi possível salvar o item.");
    revalidateShopping();
    return { ok: true, data: { id: itemId } };
  }

  const { data: created, error } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .insert({
      ...payload,
      user_id: ctx.userId,
      // Item digitado à mão: a regeração nunca o toca — são as palavras do usuário.
      is_manual: true,
      position: await nextPosition(ctx, data.list_id),
    })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível adicionar o item.");

  revalidateShopping();
  return { ok: true, data: { id: created.id } };
}

/**
 * Ajustar a quantidade.
 *
 * É AQUI que `quantity_overridden` é marcado — e é isso que faz o ajuste sobreviver à
 * regeração da lista (regra 2). Quem comprou 2 kg porque o pacote é de 2 kg não quer ver
 * 1,4 kg de volta no próximo recálculo.
 */
export async function updateShoppingItemQuantity(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = shoppingItemQuantitySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { error } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .update({
      quantity: data.quantity,
      ...(data.unit ? { unit: data.unit } : {}),
      quantity_overridden: true,
    })
    .eq("id", data.item_id);
  if (error) return dbError("Não foi possível ajustar a quantidade.");

  revalidateShopping();
  return { ok: true, data: { id: data.item_id } };
}

export async function setShoppingItemStatus(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = shoppingItemStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { error } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .update({
      status: data.status,
      purchased_at: data.status === "comprado" ? new Date().toISOString() : null,
      ...(data.actual_price_cents !== null ? { actual_price_cents: data.actual_price_cents } : {}),
    })
    .eq("id", data.item_id);
  if (error) return dbError("Não foi possível atualizar o item.");

  revalidateShopping();
  return { ok: true, data: { id: data.item_id } };
}

export async function moveShoppingItemCategory(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = shoppingItemMoveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .update({ category_id: parsed.data.category_id })
    .eq("id", parsed.data.item_id);
  if (error) return dbError("Não foi possível mover o item.");

  revalidateShopping();
  return { ok: true, data: { id: parsed.data.item_id } };
}

/**
 * Duplicar um item.
 *
 * A cópia nasce MANUAL e sem chave de consolidação: ela é uma decisão do usuário ("quero dois
 * pacotes separados"), e a regeração não pode desfazê-la nem fundi-la de volta.
 */
export async function duplicateShoppingItem(itemId: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: source } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .select(
      "list_id,category_id,food_id,recipe_id,label,brand,quantity,unit,priority,estimated_price_cents,store,note",
    )
    .eq("id", itemId)
    .maybeSingle();
  if (!source) return dbError("Item não encontrado.");

  const { data: created, error } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .insert({
      ...source,
      user_id: ctx.userId,
      is_manual: true,
      consolidation_key: null,
      quantity_overridden: false,
      status: "pendente" as const,
      position: await nextPosition(ctx, source.list_id),
    })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível duplicar o item.");

  revalidateShopping();
  return { ok: true, data: { id: created.id } };
}

export async function reorderShoppingItems(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = shoppingItemsReorderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  for (const [index, id] of parsed.data.ids.entries()) {
    await ctx.supabase
      .from("nutrition_shopping_list_items")
      .update({ position: index })
      .eq("id", id)
      .eq("list_id", parsed.data.list_id);
  }

  revalidateShopping();
  return { ok: true, data: undefined };
}

export async function deleteShoppingItem(itemId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .delete()
    .eq("id", itemId);
  if (error) return dbError("Não foi possível excluir o item.");

  revalidateShopping();
  return { ok: true, data: undefined };
}

/**
 * Ação em massa.
 *
 * DUAS GARANTIAS:
 * • Todo id precisa pertencer à lista informada — a query filtra por `list_id`, então uma
 *   seleção velha (de outra lista, ou de itens que saíram do filtro) simplesmente não alcança
 *   nada. É a regra 5 aplicada também no servidor, e não só na tela.
 * • "excluir" existe, mas a tela pede confirmação e a ação padrão oferecida é marcar (regra 4).
 */
export async function bulkShoppingItems(
  input: unknown,
): Promise<ActionResult<{ afetados: number; ignorados: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = bulkShoppingItemsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const ids = [...new Set(data.ids)];
  if (!(await ownsList(ctx, data.list_id))) return dbError("Lista não encontrada.");

  if (data.action === "excluir") {
    const { data: deleted, error } = await ctx.supabase
      .from("nutrition_shopping_list_items")
      .delete()
      .eq("list_id", data.list_id)
      .in("id", ids)
      .select("id");
    if (error) return dbError("Não foi possível excluir os itens.");
    const afetados = deleted?.length ?? 0;
    revalidateShopping();
    return { ok: true, data: { afetados, ignorados: ids.length - afetados } };
  }

  const now = new Date().toISOString();
  const patch =
    data.action === "marcar_comprado"
      ? { status: "comprado" as const, purchased_at: now }
      : data.action === "desmarcar"
        ? { status: "pendente" as const, purchased_at: null }
        : data.action === "no_carrinho"
          ? { status: "no_carrinho" as const, purchased_at: null }
          : data.action === "indisponivel"
            ? { status: "indisponivel" as const, purchased_at: null }
            : data.action === "remover_da_compra"
              ? { status: "removido" as const, purchased_at: null }
              : data.action === "prioridade_alta"
                ? { priority: "alta" as const }
                : data.action === "prioridade_normal"
                  ? { priority: "normal" as const }
                  : { category_id: data.category_id };

  const { data: updated, error } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .update(patch)
    .eq("list_id", data.list_id)
    .in("id", ids)
    .select("id");
  if (error) return dbError("Não foi possível aplicar a ação.");

  const afetados = updated?.length ?? 0;
  revalidateShopping();
  return { ok: true, data: { afetados, ignorados: ids.length - afetados } };
}

/* ═══════════════════════════ Despensa (itens) ═══════════════════════════ */

export async function savePantryItem(
  input: unknown,
  pantryItemId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = pantryItemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  let label = data.label;
  if (!label && data.food_id) {
    const { data: food } = await ctx.supabase
      .from("nutrition_foods")
      .select("name")
      .eq("id", data.food_id)
      .maybeSingle();
    label = food?.name ?? null;
  }
  if (!label) return dbError("Escolha um alimento ou escreva o nome do item.");

  const payload = {
    food_id: data.food_id,
    label,
    quantity: data.quantity,
    unit: data.unit,
    expires_on: data.expires_on,
    min_quantity: data.min_quantity,
    note: data.note,
    category_id: data.category_id,
  };

  if (pantryItemId) {
    const { error } = await ctx.supabase
      .from("nutrition_pantry_items")
      .update(payload)
      .eq("id", pantryItemId);
    if (error) return dbError("Não foi possível salvar o item da despensa.");
    revalidateShopping();
    return { ok: true, data: { id: pantryItemId } };
  }

  const { data: created, error } = await ctx.supabase
    .from("nutrition_pantry_items")
    .insert({ ...payload, user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível adicionar à despensa.");

  revalidateShopping();
  return { ok: true, data: { id: created.id } };
}

export async function deletePantryItem(pantryItemId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_pantry_items")
    .delete()
    .eq("id", pantryItemId);
  if (error) return dbError("Não foi possível excluir o item da despensa.");

  revalidateShopping();
  return { ok: true, data: undefined };
}

/**
 * Manda para a lista o que está abaixo do estoque mínimo.
 *
 * O item vai com a quantidade que FALTA para chegar ao mínimo — um número que a pessoa
 * declarou, não uma sugestão nossa. Item sem mínimo definido, ou sem quantidade informada,
 * não entra: sem os dois números não há conta possível, e chutar seria inventar.
 */
export async function addLowStockToList(
  listId: string,
): Promise<ActionResult<{ adicionados: number; ignorados: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  if (!(await ownsList(ctx, listId))) return dbError("Lista não encontrada.");

  const { data: pantry } = await ctx.supabase
    .from("nutrition_pantry_items")
    .select("food_id,label,quantity,unit,min_quantity,category_id");

  const candidatos = (pantry ?? []).filter(
    (row) =>
      row.min_quantity !== null &&
      row.quantity !== null &&
      Number(row.quantity) < Number(row.min_quantity),
  );
  if (candidatos.length === 0) {
    return { ok: true, data: { adicionados: 0, ignorados: (pantry ?? []).length } };
  }

  let position = await nextPosition(ctx, listId);
  const rows = candidatos.map((row) => ({
    user_id: ctx.userId,
    list_id: listId,
    food_id: row.food_id,
    category_id: row.category_id,
    label: row.label,
    quantity: Number(row.min_quantity) - Number(row.quantity),
    unit: row.unit,
    is_manual: true,
    note: "Abaixo do estoque mínimo da despensa.",
    position: position++,
  }));

  const { data: inserted, error } = await ctx.supabase
    .from("nutrition_shopping_list_items")
    .insert(rows)
    .select("id");
  if (error) return dbError("Não foi possível adicionar os itens.");

  revalidateShopping();
  return {
    ok: true,
    data: {
      adicionados: inserted?.length ?? 0,
      ignorados: (pantry ?? []).length - candidatos.length,
    },
  };
}
