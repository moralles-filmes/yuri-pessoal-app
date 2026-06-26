"use server";

import { revalidatePath } from "next/cache";
import { authContext, dbError, notAuthed } from "@/lib/actions/helpers";
import type { NotificationRow } from "@/types/database";
import type { ActionResult } from "@/types/finance";

/** Revalida as superfícies que mostram notificações (página + sino no layout + card). */
function revalidateSurfaces() {
  revalidatePath("/notificacoes");
  revalidatePath("/dashboard");
  // O sino vive no layout (app); revalida o layout para o badge atualizar em qualquer rota.
  revalidatePath("/", "layout");
}

/** Marca uma notificação como lida. */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", ctx.userId);
  if (error) return dbError("Não foi possível marcar como lida.");
  revalidateSurfaces();
  return { ok: true, data: undefined };
}

/** Marca todas as notificações do usuário como lidas. */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", ctx.userId)
    .eq("is_read", false);
  if (error) return dbError("Não foi possível marcar todas como lidas.");
  revalidateSurfaces();
  return { ok: true, data: undefined };
}

/** Resolve uma notificação (marca como resolvida + lida, registra a data). */
export async function resolveNotification(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ is_resolved: true, is_read: true, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", ctx.userId);
  if (error) return dbError("Não foi possível resolver a notificação.");
  revalidateSurfaces();
  return { ok: true, data: undefined };
}

/** Reabre uma notificação resolvida. */
export async function reopenNotification(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("notifications")
    .update({ is_resolved: false, resolved_at: null })
    .eq("id", id)
    .eq("user_id", ctx.userId);
  if (error) return dbError("Não foi possível reabrir a notificação.");
  revalidateSurfaces();
  return { ok: true, data: undefined };
}

/** Exclui uma notificação. */
export async function deleteNotification(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);
  if (error) return dbError("Não foi possível excluir a notificação.");
  revalidateSurfaces();
  return { ok: true, data: undefined };
}

/** Leitura sob demanda para o popover do sino (Server Action usada como RPC de leitura). */
export async function fetchRecentNotifications(
  limit = 8,
): Promise<NotificationRow[]> {
  const ctx = await authContext();
  if (!ctx) return [];
  const { data } = await ctx.supabase
    .from("notifications")
    .select("*")
    .order("notify_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as NotificationRow[];
}
