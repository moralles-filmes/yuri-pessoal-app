"use server";

/**
 * Fase 16-C — Dieta e Alimentação · Server Actions de receitas.
 *
 * Contrato do projeto (molde: `src/lib/actions/accounts.ts`):
 *   1. `authContext()` → `{ supabase, userId }`; `user_id` SEMPRE de `auth.getUser()`.
 *   2. Zod no servidor; erro → `invalid(...)`.
 *   3. Query com `user_id: ctx.userId` nos inserts; erro de DB → `dbError(...)`.
 *   4. `revalidatePath` + `ActionResult`.
 *
 * ══ AS REGRAS QUE ESTE ARQUIVO GARANTE ══
 *
 * • O PESO FINAL NUNCA É DEDUZIDO. Campo vazio continua nulo; nada aqui preenche
 *   `total_weight_g` com a soma dos ingredientes.
 *
 * • DUPLICAR NÃO COPIA HISTÓRICO. A cópia leva ingredientes e texto; contagem de uso, último
 *   uso, favorito e — principalmente — o consumo já registrado ficam com o original.
 *
 * • EXCLUIR NÃO REESCREVE O PASSADO. `nutrition_diary_entries.recipe_id` é `on delete set
 *   null`: o que foi comido continua lá, com o snapshot intacto.
 *
 * • AÇÃO EM MASSA RELATA O QUE FEZ e prefere arquivar a excluir.
 */
import { revalidatePath } from "next/cache";
import { conferirFotoPelosBytes } from "@/lib/files/photo-guard";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import {
  NUTRITION_BASE_PATH,
  RECIPE_PHOTO_BUCKET,
  RECIPE_PHOTO_ENTITY_TYPE,
  RECIPE_PHOTO_EXTENSION_BY_MIME,
} from "@/lib/nutrition/constants";
import { copyName, DUPLICATION_RESET } from "@/lib/nutrition/meal-template";
import { convertToBase } from "@/lib/nutrition/units";
import {
  recipeCategorySchema,
  recipeIngredientReorderSchema,
  recipeIngredientSchema,
  recipePhotoFileSchema,
  recipePhotoSchema,
  recipeSchema,
} from "@/lib/validators/nutrition-recipes";
import type { ActionResult } from "@/types/finance";

const RECIPES_PATH = `${NUTRITION_BASE_PATH}/receitas`;

function revalidateRecipes() {
  revalidatePath(NUTRITION_BASE_PATH);
  revalidatePath(RECIPES_PATH);
  revalidatePath(`${NUTRITION_BASE_PATH}/refeicoes`);
  revalidatePath(`${NUTRITION_BASE_PATH}/diario`);
  revalidatePath(`${NUTRITION_BASE_PATH}/planejamento`);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/** A receita é do usuário? A RLS já barra; a mensagem em pt-BR vem daqui. */
async function ownsRecipe(ctx: Ctx, recipeId: string): Promise<boolean> {
  const { data } = await ctx.supabase
    .from("nutrition_recipes")
    .select("id")
    .eq("id", recipeId)
    .maybeSingle();
  return Boolean(data);
}

/* ═══════════════════════════ Categorias ═══════════════════════════ */

export async function saveRecipeCategory(
  input: unknown,
  categoryId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = recipeCategorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  if (categoryId) {
    const { error } = await ctx.supabase
      .from("nutrition_recipe_categories")
      .update(parsed.data)
      .eq("id", categoryId);
    if (error) return dbError("Já existe uma categoria com esse nome.");
    revalidateRecipes();
    return { ok: true, data: { id: categoryId } };
  }

  const { count } = await ctx.supabase
    .from("nutrition_recipe_categories")
    .select("id", { count: "exact", head: true });

  const { data: created, error } = await ctx.supabase
    .from("nutrition_recipe_categories")
    .insert({ ...parsed.data, user_id: ctx.userId, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !created) return dbError("Já existe uma categoria com esse nome.");

  revalidateRecipes();
  return { ok: true, data: { id: created.id } };
}

/** Excluir categoria não apaga receita nenhuma: a FK é `on delete set null`. */
export async function deleteRecipeCategory(categoryId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_recipe_categories")
    .delete()
    .eq("id", categoryId);
  if (error) return dbError("Não foi possível excluir a categoria.");

  revalidateRecipes();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Receita ═══════════════════════════ */

export async function saveRecipe(
  input: unknown,
  recipeId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const payload = {
    name: data.name,
    description: data.description,
    category_id: data.category_id,
    instructions: data.instructions,
    prep_minutes: data.prep_minutes,
    cook_minutes: data.cook_minutes,
    servings: data.servings,
    serving_label: data.serving_label,
    yield_note: data.yield_note,
    // Vazio permanece NULO. Preencher com a soma dos ingredientes seria estimar o preparo.
    total_weight_g: data.total_weight_g,
    source: data.source,
    tags: data.tags,
    notes: data.notes,
  };

  if (recipeId) {
    if (!(await ownsRecipe(ctx, recipeId))) return dbError("Receita não encontrada.");
    const { error } = await ctx.supabase
      .from("nutrition_recipes")
      .update(payload)
      .eq("id", recipeId);
    if (error) return dbError("Não foi possível salvar a receita.");
    revalidateRecipes();
    return { ok: true, data: { id: recipeId } };
  }

  const { data: created, error } = await ctx.supabase
    .from("nutrition_recipes")
    .insert({ ...payload, user_id: ctx.userId })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível criar a receita.");

  revalidateRecipes();
  return { ok: true, data: { id: created.id } };
}

export async function setRecipeFavorite(
  recipeId: string,
  isFavorite: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_recipes")
    .update({ is_favorite: isFavorite })
    .eq("id", recipeId);
  if (error) return dbError("Não foi possível atualizar o favorito.");

  revalidateRecipes();
  return { ok: true, data: undefined };
}

export async function setRecipeArchived(
  recipeId: string,
  archived: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_recipes")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", recipeId);
  if (error) return dbError("Não foi possível arquivar a receita.");

  revalidateRecipes();
  return { ok: true, data: undefined };
}

/**
 * Exclui a receita.
 *
 * O CONSUMO REGISTRADO NÃO É TOCADO: `nutrition_diary_entries.recipe_id` é `on delete set
 * null` e o snapshot de cada item já está congelado. Some o link "ver a receita", nunca o
 * histórico. Os ingredientes vão junto (cascade), porque só existem dentro dela.
 */
export async function deleteRecipe(recipeId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("nutrition_recipes").delete().eq("id", recipeId);
  if (error) return dbError("Não foi possível excluir a receita.");

  revalidateRecipes();
  return { ok: true, data: undefined };
}

/**
 * Duplica uma receita.
 *
 * Leva o que descreve a preparação (texto, rendimento, peso final, ingredientes) e NÃO leva o
 * passado: contagem de uso, último uso, favorito, arquivamento, consumo registrado no diário e
 * logs de substituição ficam todos com o original — a cópia nunca foi comida por ninguém.
 */
export async function duplicateRecipe(
  recipeId: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: source } = await ctx.supabase
    .from("nutrition_recipes")
    .select(
      "id,name,description,category_id,instructions,prep_minutes,cook_minutes,servings,serving_label,yield_note,total_weight_g,source,tags,notes",
    )
    .eq("id", recipeId)
    .maybeSingle();
  if (!source) return dbError("Receita não encontrada.");

  const name = copyName(source.name);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_recipes")
    .insert({
      user_id: ctx.userId,
      name,
      description: source.description,
      category_id: source.category_id,
      instructions: source.instructions,
      prep_minutes: source.prep_minutes,
      cook_minutes: source.cook_minutes,
      servings: source.servings,
      serving_label: source.serving_label,
      yield_note: source.yield_note,
      total_weight_g: source.total_weight_g,
      source: source.source,
      tags: source.tags,
      notes: source.notes,
      // Procedência + os campos que a cópia NÃO herda (ver DUPLICATION_RESET).
      origin_recipe_id: source.id,
      is_copy: DUPLICATION_RESET.isCopy,
      use_count: DUPLICATION_RESET.useCount,
      last_used_at: DUPLICATION_RESET.lastUsedAt,
      is_favorite: DUPLICATION_RESET.isFavorite,
      archived_at: DUPLICATION_RESET.archivedAt,
    })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível duplicar a receita.");

  // Os ingredientes vêm junto — eles são a receita.
  const { data: ingredients } = await ctx.supabase
    .from("nutrition_recipe_ingredients")
    .select("food_id,custom_label,quantity,measure_id,measure_label,grams_equivalent,is_optional,note,position")
    .eq("recipe_id", recipeId)
    .order("position");

  if (ingredients?.length) {
    await ctx.supabase
      .from("nutrition_recipe_ingredients")
      .insert(
        ingredients.map((ingredient) => ({
          ...ingredient,
          user_id: ctx.userId,
          recipe_id: created.id,
        })),
      );
  }

  revalidateRecipes();
  return { ok: true, data: { id: created.id, name } };
}

/* ═══════════════════════════ Ingredientes ═══════════════════════════ */

export async function saveRecipeIngredient(
  input: unknown,
  ingredientId?: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = recipeIngredientSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  if (!(await ownsRecipe(ctx, data.recipe_id))) return dbError("Receita não encontrada.");

  // A medida precisa ser DESTE alimento (uma colher de azeite não converte arroz) e a conversão
  // é resolvida agora, pelo mesmo `convertToBase` de todo o módulo.
  let measureLabel: string | null = null;
  let gramsEquivalent: number | null = null;

  if (data.food_id) {
    const [{ data: food }, { data: measure }] = await Promise.all([
      ctx.supabase
        .from("nutrition_foods")
        .select("base_quantity,base_unit")
        .eq("id", data.food_id)
        .maybeSingle(),
      data.measure_id
        ? ctx.supabase
            .from("nutrition_food_measures")
            .select("label,food_id,grams,milliliters")
            .eq("id", data.measure_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (!food) return dbError("Alimento não encontrado.");
    if (measure && measure.food_id !== data.food_id) {
      return dbError("Esta medida caseira é de outro alimento.");
    }
    measureLabel = measure?.label ?? null;

    const conversion = convertToBase(
      data.quantity ?? 0,
      measure
        ? {
            label: measure.label,
            grams: measure.grams === null ? null : Number(measure.grams),
            milliliters: measure.milliliters === null ? null : Number(measure.milliliters),
          }
        : null,
      {
        baseQuantity: Number(food.base_quantity) || 100,
        baseUnit: food.base_unit === "ml" ? "ml" : "g",
      },
    );
    // Conversão impossível deixa a coluna NULA — o ingrediente entra na receita e o total
    // fica parcial, com o motivo aparecendo na tela. Nada é estimado.
    gramsEquivalent = conversion.ok ? conversion.amount : null;
  }

  const payload = {
    recipe_id: data.recipe_id,
    food_id: data.food_id,
    custom_label: data.custom_label,
    quantity: data.quantity,
    measure_id: data.measure_id,
    measure_label: measureLabel,
    grams_equivalent: gramsEquivalent,
    is_optional: data.is_optional,
    note: data.note,
  };

  if (ingredientId) {
    const { error } = await ctx.supabase
      .from("nutrition_recipe_ingredients")
      .update(payload)
      .eq("id", ingredientId);
    if (error) return dbError("Não foi possível salvar o ingrediente.");
    revalidateRecipes();
    return { ok: true, data: { id: ingredientId } };
  }

  const { count } = await ctx.supabase
    .from("nutrition_recipe_ingredients")
    .select("id", { count: "exact", head: true })
    .eq("recipe_id", data.recipe_id);

  const { data: created, error } = await ctx.supabase
    .from("nutrition_recipe_ingredients")
    .insert({ ...payload, user_id: ctx.userId, position: count ?? 0 })
    .select("id")
    .single();
  if (error || !created) return dbError("Não foi possível adicionar o ingrediente.");

  revalidateRecipes();
  return { ok: true, data: { id: created.id } };
}

export async function deleteRecipeIngredient(ingredientId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("nutrition_recipe_ingredients")
    .delete()
    .eq("id", ingredientId);
  if (error) return dbError("Não foi possível excluir o ingrediente.");

  revalidateRecipes();
  return { ok: true, data: undefined };
}

export async function reorderRecipeIngredients(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = recipeIngredientReorderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  await Promise.all(
    parsed.data.ids.map((id, index) =>
      ctx.supabase.from("nutrition_recipe_ingredients").update({ position: index }).eq("id", id),
    ),
  );

  revalidateRecipes();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Ações em massa ═══════════════════════════ */

export type BulkResult = { afetadas: number; ignoradas: number; motivos: string[] };

/**
 * Ações em massa sobre receitas.
 *
 * Sempre RELATA o que aconteceu (quantas mudaram, quantas ficaram de fora e por quê), e a
 * interface exige confirmação antes de excluir — arquivar é a opção oferecida primeiro.
 */
export async function bulkRecipeAction(
  recipeIds: string[],
  action: "favoritar" | "desfavoritar" | "arquivar" | "desarquivar" | "excluir",
): Promise<ActionResult<BulkResult>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const ids = [...new Set(recipeIds)].filter(Boolean);
  if (ids.length === 0) return dbError("Nenhuma receita selecionada.");
  if (ids.length > 500) return dbError("Selecione no máximo 500 receitas por vez.");

  const motivos: string[] = [];

  if (action === "excluir") {
    const { data: deleted, error } = await ctx.supabase
      .from("nutrition_recipes")
      .delete()
      .in("id", ids)
      .select("id");
    if (error) return dbError("Não foi possível excluir as receitas.");

    const afetadas = deleted?.length ?? 0;
    if (afetadas < ids.length) {
      motivos.push("Algumas receitas não foram encontradas.");
    }
    revalidateRecipes();
    return { ok: true, data: { afetadas, ignoradas: ids.length - afetadas, motivos } };
  }

  const patch =
    action === "favoritar"
      ? { is_favorite: true }
      : action === "desfavoritar"
        ? { is_favorite: false }
        : action === "arquivar"
          ? { archived_at: new Date().toISOString() }
          : { archived_at: null };

  const { data: updated, error } = await ctx.supabase
    .from("nutrition_recipes")
    .update(patch)
    .in("id", ids)
    .select("id");
  if (error) return dbError("Não foi possível aplicar a ação.");

  const afetadas = updated?.length ?? 0;
  if (afetadas < ids.length) motivos.push("Algumas receitas não foram encontradas.");

  revalidateRecipes();
  return { ok: true, data: { afetadas, ignoradas: ids.length - afetadas, motivos } };
}

/* ═══════════════════════════ Foto da receita (Fase 16-F) ═══════════════════════════ */

/**
 * Envia a foto de uma receita.
 *
 * ⛔ CÓPIA EXATA DO CAMINHO DE `uploadProgressPhoto` (16-E) — nenhum segundo mecanismo de
 * upload foi inventado. As cinco travas, na mesma ordem:
 *
 *   1. o BINÁRIO passa pelo servidor (`FormData`), para MIME e tamanho serem validados sobre
 *      o `File` REAL — a extensão do nome não prova nada;
 *   2. nome ALEATÓRIO (`crypto.randomUUID`); o nome do cliente é descartado do caminho;
 *   3. pasta SEMPRE `{auth.getUser().id}/…`, nunca um id vindo do navegador;
 *   4. falha ao gravar o metadado REMOVE o arquivo — nada de órfão anônimo no bucket;
 *   5. a receita é conferida como do usuário ANTES de qualquer escrita.
 *
 * `storage_path` não volta para a UI: a leitura devolve URL assinada de 5 min (16-F).
 */
export async function uploadRecipePhoto(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = recipePhotoSchema.safeParse({ recipe_id: formData.get("recipe_id") });
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const recipeId = parsed.data.recipe_id;

  // ⛔ TRAVA 5 — dono conferido antes de subir byte nenhum.
  if (!(await ownsRecipe(ctx, recipeId))) return dbError("Receita não encontrada.");

  // ⛔ TRAVA 1 — o arquivo real, no servidor.
  const fileResult = recipePhotoFileSchema.safeParse(formData.get("file"));
  if (!fileResult.success) {
    return invalid({ file: fileResult.error.issues.map((issue) => issue.message) });
  }
  const file = fileResult.data;

  /**
   * ⛔ TRAVA 1-B — O QUE O ARQUIVO É, PELOS BYTES. (Retroporte da 18-D, 2026-08-09.)
   *
   * `recipePhotoFileSchema` confere `file.type`, que o navegador deriva da EXTENSÃO do nome.
   * A mesma correção das fotos de evolução, pela mesma razão e com a mesma função — duas
   * implementações divergiriam no primeiro formato novo.
   */
  const veredito = await conferirFotoPelosBytes(file);
  if (!veredito.ok) return invalid({ file: [veredito.mensagem] });
  const mimeReal = veredito.mime;

  // ⛔ TRAVAS 2 e 3.
  const extension = RECIPE_PHOTO_EXTENSION_BY_MIME[mimeReal] ?? "bin";
  const storagePath = `${ctx.userId}/${RECIPE_PHOTO_ENTITY_TYPE}/${recipeId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await ctx.supabase.storage
    .from(RECIPE_PHOTO_BUCKET)
    .upload(storagePath, file, {
      // O MIME que vai para o Storage é o DETECTADO, nunca o declarado.
      contentType: mimeReal,
      upsert: false,
      cacheControl: "private, max-age=0, no-store",
    });
  if (uploadError) return dbError("Não foi possível enviar a foto.");

  const { data: attachment, error } = await ctx.supabase
    .from("attachments")
    .insert({
      user_id: ctx.userId,
      entity_type: RECIPE_PHOTO_ENTITY_TYPE,
      entity_id: recipeId,
      bucket_id: RECIPE_PHOTO_BUCKET,
      storage_path: storagePath,
      file_name: file.name.slice(0, 200),
      mime_type: mimeReal,
      size_bytes: file.size,
    })
    .select("id")
    .single();

  if (error || !attachment) {
    // ⛔ TRAVA 4.
    await ctx.supabase.storage.from(RECIPE_PHOTO_BUCKET).remove([storagePath]);
    return dbError("Não foi possível registrar a foto.");
  }

  revalidateRecipes();
  return { ok: true, data: { id: attachment.id } };
}

/**
 * Remove a foto de uma receita (arquivo + metadado).
 *
 * O `storage_path` é lido AQUI, no servidor, a partir do id do anexo — o cliente manda só o
 * id, e a RLS de `attachments` garante que ele é do próprio usuário. Aceitar um caminho vindo
 * do navegador permitiria apontar para o arquivo de outra pessoa.
 */
export async function deleteRecipePhoto(attachmentId: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: attachment } = await ctx.supabase
    .from("attachments")
    .select("id,bucket_id,storage_path,entity_type")
    .eq("id", attachmentId)
    .eq("entity_type", RECIPE_PHOTO_ENTITY_TYPE)
    .maybeSingle();
  if (!attachment) return dbError("Foto não encontrada.");

  await ctx.supabase.storage
    .from(attachment.bucket_id ?? RECIPE_PHOTO_BUCKET)
    .remove([attachment.storage_path]);

  const { error } = await ctx.supabase.from("attachments").delete().eq("id", attachment.id);
  if (error) return dbError("Não foi possível remover a foto.");

  revalidateRecipes();
  return { ok: true, data: undefined };
}
