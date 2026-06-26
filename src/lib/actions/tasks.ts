"use server";

import { revalidatePath } from "next/cache";
import { checklistItemSchema, taskSchema } from "@/lib/validators/task";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { materializeNext, normalizeRecurrence } from "@/lib/tasks/recurrence";
import { TASK_STORED_STATUSES, type TaskStoredStatus } from "@/lib/tasks/constants";
import type { ActionResult } from "@/types/finance";
import type { TaskInput } from "@/lib/validators/task";

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/** Campos comuns de insert/update de uma tarefa a partir do payload validado. */
function taskFields(d: TaskInput) {
  return {
    title: d.title,
    notes: d.notes,
    project_id: d.project_id,
    priority: d.priority,
    start_date: d.start_date,
    due_date: d.due_date,
    tags: d.tags,
    recurrence: d.recurrence,
    reminder_at: d.reminder_at,
    calendar_event_id: d.calendar_event_id,
  };
}

/** Próxima `position` no fim de um status (kanban/lista). */
async function nextPosition(ctx: Ctx, status: TaskStoredStatus): Promise<number> {
  const { data } = await ctx.supabase
    .from("tasks")
    .select("position")
    .eq("status", status)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? -1) + 1;
}

export async function createTask(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const status = d.status;
  const position = await nextPosition(ctx, status);
  const completedAt = status === "concluida" ? new Date().toISOString() : null;

  const { data, error } = await ctx.supabase
    .from("tasks")
    .insert({
      user_id: ctx.userId,
      ...taskFields(d),
      status,
      completed_at: completedAt,
      position,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar a tarefa.");
  revalidatePath("/tarefas");
  return { ok: true, data: { id: data.id } };
}

export async function updateTask(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  // Mantém completed_at coerente com o status escolhido no form.
  const { data: existing } = await ctx.supabase
    .from("tasks")
    .select("status, completed_at")
    .eq("id", id)
    .maybeSingle();

  let completedAt = existing?.completed_at ?? null;
  if (d.status === "concluida" && !completedAt) {
    completedAt = new Date().toISOString();
  } else if (d.status !== "concluida") {
    completedAt = null;
  }

  const { error } = await ctx.supabase
    .from("tasks")
    .update({ ...taskFields(d), status: d.status, completed_at: completedAt })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar a tarefa.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

/**
 * Conclui a tarefa. Se for recorrente, materializa a PRÓXIMA instância (próximas
 * datas de início/vencimento), clonando os campos e o checklist — espelha "derivar
 * na leitura"/recorrência das fases anteriores. Idempotente o suficiente para o uso.
 */
export async function completeTask(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: task } = await ctx.supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!task) return dbError("Tarefa não encontrada.");

  const { error } = await ctx.supabase
    .from("tasks")
    .update({ status: "concluida", completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return dbError("Não foi possível concluir a tarefa.");

  const rule = normalizeRecurrence(task.recurrence);
  if (rule) {
    const next = materializeNext(rule, {
      startDate: (task.start_date as string | null) ?? null,
      dueDate: (task.due_date as string | null) ?? null,
    });
    if (next) {
      const position = await nextPosition(ctx, "pendente");
      const { data: clone } = await ctx.supabase
        .from("tasks")
        .insert({
          user_id: ctx.userId,
          project_id: task.project_id,
          title: task.title,
          notes: task.notes,
          priority: task.priority,
          status: "pendente",
          start_date: next.startDate,
          due_date: next.dueDate,
          tags: task.tags,
          recurrence: task.recurrence,
          reminder_at: null,
          position,
        })
        .select("id")
        .single();

      // Clona o checklist (reseta marcações) para a próxima ocorrência.
      if (clone) {
        const { data: items } = await ctx.supabase
          .from("task_checklist_items")
          .select("label, position")
          .eq("task_id", id)
          .order("position", { ascending: true });
        if (items && items.length) {
          await ctx.supabase.from("task_checklist_items").insert(
            items.map((it) => ({
              user_id: ctx.userId,
              task_id: clone.id,
              label: it.label as string,
              position: it.position as number,
            })),
          );
        }
      }
    }
  }

  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

export async function reopenTask(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("tasks")
    .update({ status: "pendente", completed_at: null })
    .eq("id", id);
  if (error) return dbError("Não foi possível reabrir a tarefa.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

/** Define o status (e ajusta completed_at). Usado por ações rápidas (cancelar etc.). */
export async function setTaskStatus(
  id: string,
  status: TaskStoredStatus,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!(TASK_STORED_STATUSES as readonly string[]).includes(status)) {
    return dbError("Status inválido.");
  }
  const completedAt = status === "concluida" ? new Date().toISOString() : null;
  const { error } = await ctx.supabase
    .from("tasks")
    .update({ status, completed_at: completedAt })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar a tarefa.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

/** Move a tarefa no kanban: grava `status` + `position` numa única mutação. */
export async function moveTask(
  id: string,
  status: TaskStoredStatus,
  position: number,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!(TASK_STORED_STATUSES as readonly string[]).includes(status)) {
    return dbError("Status inválido.");
  }

  const { error } = await ctx.supabase
    .from("tasks")
    .update({
      status,
      position: Math.max(0, Math.floor(position) || 0),
      completed_at: status === "concluida" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return dbError("Não foi possível mover a tarefa.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // Remove anexos do Storage (best-effort) antes de apagar a linha (cascade nas tabelas).
  const { data: attachments } = await ctx.supabase
    .from("task_attachments")
    .select("bucket_id, path")
    .eq("task_id", id);
  if (attachments && attachments.length) {
    const byBucket = new Map<string, string[]>();
    for (const a of attachments) {
      const list = byBucket.get(a.bucket_id as string) ?? [];
      list.push(a.path as string);
      byBucket.set(a.bucket_id as string, list);
    }
    for (const [bucket, paths] of byBucket) {
      try {
        await ctx.supabase.storage.from(bucket).remove(paths);
      } catch {
        // ignora falha de storage; a linha de metadados é removida pelo cascade
      }
    }
  }

  const { error } = await ctx.supabase.from("tasks").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a tarefa.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Checklist ───────────────────────────── */

export async function addChecklistItem(
  taskId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = checklistItemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data: last } = await ctx.supabase
    .from("task_checklist_items")
    .select("position")
    .eq("task_id", taskId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from("task_checklist_items")
    .insert({
      user_id: ctx.userId,
      task_id: taskId,
      label: parsed.data.label,
      position,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível adicionar o item.");
  revalidatePath("/tarefas");
  return { ok: true, data: { id: data.id } };
}

export async function toggleChecklistItem(
  id: string,
  isDone: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("task_checklist_items")
    .update({ is_done: isDone })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar o item.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

export async function deleteChecklistItem(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("task_checklist_items")
    .delete()
    .eq("id", id);
  if (error) return dbError("Não foi possível remover o item.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Anexos (Supabase Storage) ───────────────────────────── */

/**
 * Registra os metadados de um anexo já enviado ao Storage pelo client (RLS de
 * storage.objects garante a pasta do usuário). O `path` precisa começar por
 * `{user_id}/` — revalidado aqui no servidor.
 */
export async function recordAttachment(
  taskId: string,
  meta: {
    path: string;
    file_name: string;
    mime_type?: string | null;
    size_bytes?: number | null;
    bucket_id?: string;
  },
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const path = String(meta.path ?? "");
  if (!path.startsWith(`${ctx.userId}/`)) {
    return dbError("Caminho de anexo inválido.");
  }

  const { data, error } = await ctx.supabase
    .from("task_attachments")
    .insert({
      user_id: ctx.userId,
      task_id: taskId,
      bucket_id: meta.bucket_id ?? "task-attachments",
      path,
      file_name: String(meta.file_name ?? "arquivo"),
      mime_type: meta.mime_type ?? null,
      size_bytes: meta.size_bytes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível registrar o anexo.");
  revalidatePath("/tarefas");
  return { ok: true, data: { id: data.id } };
}

export async function deleteAttachment(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: row } = await ctx.supabase
    .from("task_attachments")
    .select("bucket_id, path")
    .eq("id", id)
    .maybeSingle();
  if (row) {
    try {
      await ctx.supabase.storage
        .from(row.bucket_id as string)
        .remove([row.path as string]);
    } catch {
      // segue removendo os metadados
    }
  }

  const { error } = await ctx.supabase
    .from("task_attachments")
    .delete()
    .eq("id", id);
  if (error) return dbError("Não foi possível remover o anexo.");
  revalidatePath("/tarefas");
  return { ok: true, data: undefined };
}

/** URL assinada (temporária) para baixar/visualizar um anexo privado. */
export async function getAttachmentUrl(
  id: string,
): Promise<ActionResult<{ url: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: row } = await ctx.supabase
    .from("task_attachments")
    .select("bucket_id, path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return dbError("Anexo não encontrado.");

  const { data, error } = await ctx.supabase.storage
    .from(row.bucket_id as string)
    .createSignedUrl(row.path as string, 60 * 10);
  if (error || !data) return dbError("Não foi possível gerar o link.");
  return { ok: true, data: { url: data.signedUrl } };
}
