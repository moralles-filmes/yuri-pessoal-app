"use server";

/**
 * Fase 15 — Módulo TO-DO · Server Actions de COMENTÁRIO, ANEXO, LEMBRETE,
 * FILTRO SALVO e PREFERÊNCIA.
 *
 * Anexos reaproveitam a infraestrutura da Fase 14 (tabela genérica `attachments` +
 * bucket PRIVADO `attachments`) — nenhuma tabela nem bucket novo. O caminho no Storage
 * é sempre '{user_id}/todo_task/{task_id}/...', o que faz a policy de Storage
 * ("a 1ª pasta do objeto tem de ser o auth.uid()") valer também aqui.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import {
  todoAttachmentSchema,
  todoCommentSchema,
  todoPreferenceSchema,
  todoReminderSchema,
  todoSavedFilterSchema,
} from "@/lib/validators/todo";
import {
  TODO_ATTACHMENT_ENTITY,
  TODO_COMMENT_ATTACHMENT_ENTITY,
} from "@/lib/todo/constants";
import { logActivity } from "@/lib/todo/activity";
import { getTodoTaskDetail } from "@/lib/todo/queries";
import type { ActionResult } from "@/types/finance";

const TODO_PATH = "/todo";
const ATTACHMENT_BUCKET = "attachments";

function revalidateTodo() {
  revalidatePath(TODO_PATH);
}

/* ───────────────────────────── Leitura sob demanda ───────────────────────────── */

/**
 * Carrega comentários, anexos, lembretes e histórico de UMA tarefa. Só é buscado
 * quando o painel de detalhes abre — carregar isso para a lista inteira seria
 * desperdício (a lista já traz apenas os CONTADORES).
 */
export async function loadTodoTaskDetail(taskId: string) {
  const ctx = await authContext();
  if (!ctx) return { comments: [], attachments: [], reminders: [], activity: [] };
  return getTodoTaskDetail(taskId);
}

/* ───────────────────────────── Comentários ───────────────────────────── */

export async function createTodoComment(
  taskId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoCommentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data, error } = await ctx.supabase
    .from("todo_comments")
    .insert({
      user_id: ctx.userId,
      // Hoje sempre igual a user_id; separado para colaboração futura.
      author_id: ctx.userId,
      task_id: taskId,
      content: parsed.data.content,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível salvar o comentário.");

  await logActivity(ctx.supabase, ctx.userId, taskId, "comentario_criado");
  revalidateTodo();
  return { ok: true, data: { id: data.id } };
}

/** Edita o próprio comentário. `edited_at` liga o indicador "editado" na UI. */
export async function updateTodoComment(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoCommentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("todo_comments")
    .update({ content: parsed.data.content, edited_at: new Date().toISOString() })
    // Só o autor edita (hoje é sempre o dono, mas a regra fica explícita).
    .eq("id", id)
    .eq("author_id", ctx.userId);

  if (error) return dbError("Não foi possível editar o comentário.");
  revalidateTodo();
  return { ok: true, data: undefined };
}

/** Soft delete: preserva o histórico e some da leitura (`deleted_at is null`). */
export async function deleteTodoComment(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("todo_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("author_id", ctx.userId);

  if (error) return dbError("Não foi possível excluir o comentário.");
  revalidateTodo();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Anexos ───────────────────────────── */

/**
 * Registra o anexo já enviado ao Storage.
 *
 * Duas travas de segurança aqui (o cliente NÃO é autoridade):
 *  1. o caminho tem de começar por '{user_id}/' — impede reivindicar arquivo de outro;
 *  2. tipo MIME e tamanho são re-validados pelo Zod, além do `accept` do input.
 */
export async function recordTodoAttachment(
  taskId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoAttachmentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  if (!d.storage_path.startsWith(`${ctx.userId}/`)) {
    return dbError("Caminho de anexo inválido.");
  }

  const { data, error } = await ctx.supabase
    .from("attachments")
    .insert({
      user_id: ctx.userId,
      entity_type: d.comment_id ? TODO_COMMENT_ATTACHMENT_ENTITY : TODO_ATTACHMENT_ENTITY,
      entity_id: d.comment_id ?? taskId,
      bucket_id: ATTACHMENT_BUCKET,
      storage_path: d.storage_path,
      file_name: d.file_name,
      mime_type: d.mime_type,
      size_bytes: d.size_bytes,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível registrar o anexo.");

  await logActivity(ctx.supabase, ctx.userId, taskId, "anexo_adicionado", null, {
    file_name: d.file_name,
  });
  revalidateTodo();
  return { ok: true, data: { id: data.id } };
}

/** Remove o arquivo do Storage e os metadados. */
export async function deleteTodoAttachment(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: row } = await ctx.supabase
    .from("attachments")
    .select("bucket_id, storage_path, entity_id")
    .eq("id", id)
    .maybeSingle();

  if (row) {
    try {
      await ctx.supabase.storage.from(row.bucket_id).remove([row.storage_path]);
    } catch {
      // Segue removendo os metadados: um órfão no bucket é menos ruim que um
      // registro apontando para arquivo inexistente.
    }
  }

  const { error } = await ctx.supabase.from("attachments").delete().eq("id", id);
  if (error) return dbError("Não foi possível remover o anexo.");

  if (row?.entity_id) {
    await logActivity(ctx.supabase, ctx.userId, row.entity_id, "anexo_removido");
  }
  revalidateTodo();
  return { ok: true, data: undefined };
}

/**
 * URL assinada e temporária (10 min) para baixar/visualizar. O bucket é PRIVADO —
 * não existe URL pública, por regra da fase ("não deixar buckets públicos com
 * documentos privados").
 */
export async function getTodoAttachmentUrl(
  id: string,
): Promise<ActionResult<{ url: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: row } = await ctx.supabase
    .from("attachments")
    .select("bucket_id, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return dbError("Anexo não encontrado.");

  const { data, error } = await ctx.supabase.storage
    .from(row.bucket_id)
    .createSignedUrl(row.storage_path, 60 * 10);

  if (error || !data) return dbError("Não foi possível gerar o link.");
  return { ok: true, data: { url: data.signedUrl } };
}

/* ───────────────────────────── Lembretes ───────────────────────────── */

/**
 * Cria um lembrete. Uma tarefa pode ter vários.
 *
 * Idempotência: o mesmo instante para a mesma tarefa não é duplicado — checamos antes
 * de inserir. O disparo em si fica com o Cron de notificações, que também deduplica
 * por `dedupe_key`.
 */
export async function createTodoReminder(
  taskId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoReminderSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const remindAtIso = new Date(d.remind_at).toISOString();

  const { data: existing } = await ctx.supabase
    .from("todo_reminders")
    .select("id")
    .eq("task_id", taskId)
    .eq("remind_at", remindAtIso)
    .neq("status", "cancelado")
    .maybeSingle();
  if (existing) return { ok: true, data: { id: existing.id } };

  const { data, error } = await ctx.supabase
    .from("todo_reminders")
    .insert({
      user_id: ctx.userId,
      task_id: taskId,
      remind_at: remindAtIso,
      offset_minutes: d.offset_minutes,
      channel: d.channel,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar o lembrete.");

  await logActivity(ctx.supabase, ctx.userId, taskId, "lembrete_criado", null, {
    remind_at: remindAtIso,
  });
  revalidateTodo();
  return { ok: true, data: { id: data.id } };
}

export async function deleteTodoReminder(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: row } = await ctx.supabase
    .from("todo_reminders")
    .select("task_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await ctx.supabase.from("todo_reminders").delete().eq("id", id);
  if (error) return dbError("Não foi possível remover o lembrete.");

  if (row?.task_id) {
    await logActivity(ctx.supabase, ctx.userId, row.task_id, "lembrete_removido");
  }
  revalidateTodo();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Filtros salvos ───────────────────────────── */

export async function createTodoSavedFilter(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoSavedFilterSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { data: last } = await ctx.supabase
    .from("todo_saved_filters")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await ctx.supabase
    .from("todo_saved_filters")
    .insert({
      user_id: ctx.userId,
      name: d.name,
      description: d.description,
      icon: d.icon,
      color: d.color,
      is_favorite: d.is_favorite,
      show_in_nav: d.show_in_nav,
      filter_definition: d.filter_definition,
      position: (last?.position ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível salvar o filtro.");
  revalidateTodo();
  return { ok: true, data: { id: data.id } };
}

export async function updateTodoSavedFilter(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoSavedFilterSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("todo_saved_filters")
    .update({
      name: d.name,
      description: d.description,
      icon: d.icon,
      color: d.color,
      is_favorite: d.is_favorite,
      show_in_nav: d.show_in_nav,
      filter_definition: d.filter_definition,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível salvar o filtro.");
  revalidateTodo();
  return { ok: true, data: undefined };
}

export async function deleteTodoSavedFilter(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase.from("todo_saved_filters").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir o filtro.");

  revalidateTodo();
  return { ok: true, data: undefined };
}

/**
 * Persiste a ordem dos filtros salvos. Um `update` por item, igual a
 * `reorderTodoProjects`/`reorderTodoLabels` — a RLS garante que só as linhas do
 * próprio usuário são afetadas, mesmo que um id de terceiro seja enviado.
 */
export async function reorderTodoSavedFilters(ids: string[]): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, data: undefined };

  const results = await Promise.all(
    ids.map((id, index) =>
      ctx.supabase.from("todo_saved_filters").update({ position: index }).eq("id", id),
    ),
  );
  if (results.some((r) => r.error)) return dbError("Não foi possível salvar a ordem.");

  revalidateTodo();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Preferências ───────────────────────────── */

/**
 * Salva a preferência de visualização de um escopo ('global' ou 'project:<id>').
 * `upsert` pela unique `(user_id, scope)` — sem linha duplicada por escopo.
 */
export async function saveTodoPreference(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoPreferenceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase.from("todo_preferences").upsert(
    {
      user_id: ctx.userId,
      scope: d.scope,
      view: d.view,
      sort_by: d.sort_by,
      sort_dir: d.sort_dir,
      group_by: d.group_by,
      show_completed: d.show_completed,
    },
    { onConflict: "user_id,scope" },
  );

  if (error) return dbError("Não foi possível salvar a preferência.");
  revalidateTodo();
  return { ok: true, data: undefined };
}
