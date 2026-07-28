"use server";

/**
 * Fase 15 — Módulo TO-DO · Server Actions de PROJETO, SEÇÃO e ETIQUETA.
 *
 * Regra central desta camada: **nada some em silêncio**. Excluir projeto, seção ou
 * etiqueta sempre exige uma estratégia explícita para o que acontece com as tarefas,
 * e a estratégia destrutiva é sempre a última opção, nunca o default.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import {
  todoLabelSchema,
  todoProjectDeleteSchema,
  todoProjectSchema,
  todoSectionDeleteSchema,
  todoSectionSchema,
} from "@/lib/validators/todo";
import type { ActionResult } from "@/types/finance";

const TODO_PATH = "/todo";

function revalidateTodo() {
  revalidatePath(TODO_PATH);
  revalidatePath("/dashboard");
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/** Próxima posição livre numa tabela ordenável do módulo. */
async function nextPosition(
  ctx: Ctx,
  table: "todo_projects" | "todo_labels",
): Promise<number> {
  const { data } = await ctx.supabase
    .from(table)
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? -1) + 1;
}

/* ───────────────────────────── Projetos ───────────────────────────── */

export async function createTodoProject(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoProjectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const position = await nextPosition(ctx, "todo_projects");

  const { data, error } = await ctx.supabase
    .from("todo_projects")
    .insert({
      user_id: ctx.userId,
      name: d.name,
      description: d.description,
      icon: d.icon,
      color: d.color,
      is_favorite: d.is_favorite,
      default_view: d.default_view,
      parent_project_id: d.parent_project_id,
      position,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar o projeto.");
  revalidateTodo();
  return { ok: true, data: { id: data.id } };
}

export async function updateTodoProject(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoProjectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  // Um projeto não pode ser pai de si mesmo.
  const parentId = d.parent_project_id === id ? null : d.parent_project_id;

  const { error } = await ctx.supabase
    .from("todo_projects")
    .update({
      name: d.name,
      description: d.description,
      icon: d.icon,
      color: d.color,
      is_favorite: d.is_favorite,
      default_view: d.default_view,
      parent_project_id: parentId,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível salvar o projeto.");
  revalidateTodo();
  return { ok: true, data: undefined };
}

/** Arquiva/restaura. Arquivar tira da navegação sem perder nada. */
export async function archiveTodoProject(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("todo_projects")
    .update({
      status: archived ? "arquivado" : "ativo",
      archived_at: archived ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível arquivar o projeto.");
  revalidateTodo();
  return { ok: true, data: undefined };
}

export async function toggleTodoProjectFavorite(
  id: string,
  favorite: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("todo_projects")
    .update({ is_favorite: favorite })
    .eq("id", id);
  if (error) return dbError("Não foi possível favoritar o projeto.");

  revalidateTodo();
  return { ok: true, data: undefined };
}

/**
 * Exclui um projeto — SEMPRE com uma estratégia explícita para as tarefas:
 *  • 'mover_entrada' — tarefas voltam para a Caixa de entrada (sem projeto);
 *  • 'mover_projeto' — tarefas vão para outro projeto (seção é limpa, pois pertencia
 *    ao projeto antigo);
 *  • 'excluir_tudo'  — tarefas são apagadas junto (a UI exige confirmação reforçada).
 *
 * As seções caem por FK cascade em qualquer caso — mas as TAREFAS só somem na terceira
 * opção, e nunca por acidente.
 */
export async function deleteTodoProject(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoProjectDeleteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  if (d.strategy === "excluir_tudo") {
    const { error } = await ctx.supabase.from("todo_tasks").delete().eq("project_id", id);
    if (error) return dbError("Não foi possível excluir as tarefas do projeto.");
  } else {
    const target = d.strategy === "mover_projeto" ? d.target_project_id : null;
    if (target === id) return dbError("Escolha um projeto de destino diferente.");

    const { error } = await ctx.supabase
      .from("todo_tasks")
      .update({ project_id: target, section_id: null })
      .eq("project_id", id);
    if (error) return dbError("Não foi possível mover as tarefas do projeto.");
  }

  const { error } = await ctx.supabase.from("todo_projects").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir o projeto.");

  revalidateTodo();
  return { ok: true, data: undefined };
}

/** Duplica um projeto com suas seções (as tarefas NÃO vêm junto — é um molde). */
export async function duplicateTodoProject(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: original } = await ctx.supabase
    .from("todo_projects")
    .select("*, sections:todo_sections(name, description, position)")
    .eq("id", id)
    .maybeSingle();
  if (!original) return dbError("Projeto não encontrado.");

  const position = await nextPosition(ctx, "todo_projects");

  const { data: copy, error } = await ctx.supabase
    .from("todo_projects")
    .insert({
      user_id: ctx.userId,
      name: `${original.name} (cópia)`,
      description: original.description,
      icon: original.icon,
      color: original.color,
      is_favorite: false,
      default_view: original.default_view,
      parent_project_id: original.parent_project_id,
      position,
    })
    .select("id")
    .single();

  if (error || !copy) return dbError("Não foi possível duplicar o projeto.");

  const sections = (original.sections ?? []) as Array<{
    name: string;
    description: string | null;
    position: number;
  }>;
  if (sections.length) {
    await ctx.supabase.from("todo_sections").insert(
      sections.map((s) => ({
        user_id: ctx.userId,
        project_id: copy.id,
        name: s.name,
        description: s.description,
        position: s.position,
      })),
    );
  }

  revalidateTodo();
  return { ok: true, data: { id: copy.id } };
}

/** Persiste a ordem dos projetos (drag). */
export async function reorderTodoProjects(ids: string[]): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, data: undefined };

  const results = await Promise.all(
    ids.map((id, index) =>
      ctx.supabase.from("todo_projects").update({ position: index }).eq("id", id),
    ),
  );
  if (results.some((r) => r.error)) return dbError("Não foi possível salvar a ordem.");

  revalidateTodo();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Seções ───────────────────────────── */

export async function createTodoSection(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoSectionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { data: last } = await ctx.supabase
    .from("todo_sections")
    .select("position")
    .eq("project_id", d.project_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await ctx.supabase
    .from("todo_sections")
    .insert({
      user_id: ctx.userId,
      project_id: d.project_id,
      name: d.name,
      description: d.description,
      position: (last?.position ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar a seção.");
  revalidateTodo();
  return { ok: true, data: { id: data.id } };
}

export async function updateTodoSection(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoSectionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("todo_sections")
    .update({ name: d.name, description: d.description })
    .eq("id", id);

  if (error) return dbError("Não foi possível salvar a seção.");
  revalidateTodo();
  return { ok: true, data: undefined };
}

/**
 * Exclui uma seção com estratégia explícita para as tarefas:
 *  • 'mover_secao'   — vão para outra seção do mesmo projeto;
 *  • 'sem_secao'     — ficam no projeto, sem seção (default seguro);
 *  • 'excluir_tudo'  — são apagadas (confirmação explícita na UI).
 */
export async function deleteTodoSection(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoSectionDeleteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  if (d.strategy === "excluir_tudo") {
    const { error } = await ctx.supabase.from("todo_tasks").delete().eq("section_id", id);
    if (error) return dbError("Não foi possível excluir as tarefas da seção.");
  } else {
    const target = d.strategy === "mover_secao" ? d.target_section_id : null;
    if (target === id) return dbError("Escolha uma seção de destino diferente.");

    const { error } = await ctx.supabase
      .from("todo_tasks")
      .update({ section_id: target })
      .eq("section_id", id);
    if (error) return dbError("Não foi possível mover as tarefas da seção.");
  }

  const { error } = await ctx.supabase.from("todo_sections").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a seção.");

  revalidateTodo();
  return { ok: true, data: undefined };
}

/** Persiste a ordem das seções de um projeto (colunas do Kanban). */
export async function reorderTodoSections(ids: string[]): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, data: undefined };

  const results = await Promise.all(
    ids.map((id, index) =>
      ctx.supabase.from("todo_sections").update({ position: index }).eq("id", id),
    ),
  );
  if (results.some((r) => r.error)) return dbError("Não foi possível salvar a ordem.");

  revalidateTodo();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Etiquetas ───────────────────────────── */

/**
 * Cria uma etiqueta. O índice único `(user_id, lower(name))` impede duplicata —
 * quando o nome já existe, devolvemos o id da etiqueta existente em vez de erro,
 * para o fluxo "criar etiqueta durante a edição da tarefa" não travar.
 */
export async function createTodoLabel(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoLabelSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const position = await nextPosition(ctx, "todo_labels");

  const { data, error } = await ctx.supabase
    .from("todo_labels")
    .insert({
      user_id: ctx.userId,
      name: d.name,
      description: d.description,
      color: d.color,
      position,
    })
    .select("id")
    .single();

  if (error || !data) {
    // 23505 = violação de unique → a etiqueta já existe; reaproveita.
    const { data: existing } = await ctx.supabase
      .from("todo_labels")
      .select("id")
      .ilike("name", d.name)
      .maybeSingle();
    if (existing) {
      revalidateTodo();
      return { ok: true, data: { id: existing.id } };
    }
    return dbError("Não foi possível criar a etiqueta.");
  }

  revalidateTodo();
  return { ok: true, data: { id: data.id } };
}

export async function updateTodoLabel(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoLabelSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("todo_labels")
    .update({ name: d.name, description: d.description, color: d.color })
    .eq("id", id);

  if (error) return dbError("Já existe uma etiqueta com esse nome.");
  revalidateTodo();
  return { ok: true, data: undefined };
}

/**
 * Exclui a etiqueta. As tarefas NÃO são tocadas: some apenas a associação
 * (`todo_task_labels` cai por FK cascade). Regra explícita da fase.
 */
export async function deleteTodoLabel(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("todo_labels").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a etiqueta.");

  revalidateTodo();
  return { ok: true, data: undefined };
}

/**
 * Mescla duas etiquetas: todas as tarefas da origem passam a usar o destino e a
 * origem é excluída. Tarefas que já tinham as duas ficam com uma só (o upsert com
 * `ignoreDuplicates` evita violar a PK composta).
 */
export async function mergeTodoLabels(
  sourceId: string,
  targetId: string,
): Promise<ActionResult<{ moved: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (sourceId === targetId) return dbError("Escolha duas etiquetas diferentes.");

  const { data: links } = await ctx.supabase
    .from("todo_task_labels")
    .select("task_id")
    .eq("label_id", sourceId);

  const taskIds = (links ?? []).map((l) => l.task_id);
  if (taskIds.length) {
    await ctx.supabase.from("todo_task_labels").upsert(
      taskIds.map((taskId) => ({ task_id: taskId, label_id: targetId, user_id: ctx.userId })),
      { onConflict: "task_id,label_id", ignoreDuplicates: true },
    );
  }

  const { error } = await ctx.supabase.from("todo_labels").delete().eq("id", sourceId);
  if (error) return dbError("Não foi possível mesclar as etiquetas.");

  revalidateTodo();
  return { ok: true, data: { moved: taskIds.length } };
}

/** Persiste a ordem das etiquetas. */
export async function reorderTodoLabels(ids: string[]): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, data: undefined };

  const results = await Promise.all(
    ids.map((id, index) =>
      ctx.supabase.from("todo_labels").update({ position: index }).eq("id", id),
    ),
  );
  if (results.some((r) => r.error)) return dbError("Não foi possível salvar a ordem.");

  revalidateTodo();
  return { ok: true, data: undefined };
}
