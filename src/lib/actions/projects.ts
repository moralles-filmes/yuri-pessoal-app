"use server";

import { revalidatePath } from "next/cache";
import { projectSchema } from "@/lib/validators/project";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";

export async function createProject(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  // Nova lista vai para o fim da ordenação.
  const { data: last } = await ctx.supabase
    .from("projects")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from("projects")
    .insert({
      user_id: ctx.userId,
      name: d.name,
      description: d.description,
      color: d.color,
      icon: d.icon,
      is_archived: d.is_archived,
      position,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar o projeto.");
  revalidatePath("/tarefas");
  return { ok: true, data: { id: data.id } };
}

export async function updateProject(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("projects")
    .update({
      name: d.name,
      description: d.description,
      color: d.color,
      icon: d.icon,
      is_archived: d.is_archived,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o projeto.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

export async function archiveProject(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("projects")
    .update({ is_archived: archived })
    .eq("id", id);

  if (error) return dbError("Não foi possível arquivar o projeto.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

/**
 * Exclui um projeto. As tarefas vinculadas NÃO são apagadas: a FK
 * `tasks.project_id ON DELETE SET NULL` move-as para "Sem projeto" (a UI confirma).
 */
export async function deleteProject(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("projects").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir o projeto.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

/** Persiste a nova ordem das listas (drag). `ids` na ordem desejada. */
export async function reorderProjects(ids: string[]): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: true, data: undefined };
  }

  for (let i = 0; i < ids.length; i++) {
    await ctx.supabase
      .from("projects")
      .update({ position: i })
      .eq("id", ids[i]);
  }
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}
