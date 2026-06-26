"use server";

import { revalidatePath } from "next/cache";
import {
  categorySchema,
  subcategorySchema,
} from "@/lib/validators/category";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";

function revalidateCategories() {
  revalidatePath("/financeiro/categorias");
}

/** Semeia as 16 categorias padrão para o usuário atual (idempotente). */
export async function ensureDefaultCategories(): Promise<
  ActionResult<{ inserted: number }>
> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data, error } = await ctx.supabase.rpc("seed_default_categories");
  if (error) return dbError("Não foi possível criar as categorias padrão.");
  if ((data ?? 0) > 0) revalidateCategories();
  return { ok: true, data: { inserted: data ?? 0 } };
}

export async function createCategory(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data, error } = await ctx.supabase
    .from("categories")
    .insert({ ...parsed.data, user_id: ctx.userId })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível salvar a categoria.");
  revalidateCategories();
  return { ok: true, data: { id: data.id } };
}

export async function updateCategory(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("categories")
    .update(parsed.data)
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar a categoria.");
  revalidateCategories();
  return { ok: true, data: undefined };
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("categories").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a categoria.");
  revalidateCategories();
  return { ok: true, data: undefined };
}

export async function createSubcategory(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = subcategorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data, error } = await ctx.supabase
    .from("subcategories")
    .insert({ ...parsed.data, user_id: ctx.userId })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível salvar a subcategoria.");
  revalidateCategories();
  return { ok: true, data: { id: data.id } };
}

export async function updateSubcategory(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = subcategorySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("subcategories")
    .update(parsed.data)
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar a subcategoria.");
  revalidateCategories();
  return { ok: true, data: undefined };
}

export async function deleteSubcategory(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("subcategories")
    .delete()
    .eq("id", id);

  if (error) return dbError("Não foi possível excluir a subcategoria.");
  revalidateCategories();
  return { ok: true, data: undefined };
}
