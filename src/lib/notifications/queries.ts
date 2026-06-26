/**
 * Fase 13 — Leitura server-only das notificações. A RLS garante o escopo por usuário
 * (cada select filtra por auth.uid() via policy). Resiliente quando o Supabase não está
 * configurado (degrada para 0/[], sem quebrar o layout/header).
 */
import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/types/database";
import type { NotificationStatusFilter } from "@/lib/notifications/constants";

/** Total de não lidas (e não resolvidas) — badge do sino. */
export async function getUnreadCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("is_read", false)
      .eq("is_resolved", false);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Últimas notificações (popover do sino). */
export async function getRecentNotifications(limit = 8): Promise<NotificationRow[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("notify_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as NotificationRow[];
  } catch {
    return [];
  }
}

export type NotificationListFilters = {
  status?: NotificationStatusFilter;
  type?: string;
  priority?: string;
};

/** Lista filtrável da página /notificacoes. */
export async function getNotifications(
  filters: NotificationListFilters = {},
): Promise<NotificationRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .order("notify_at", { ascending: false })
    .limit(300);

  switch (filters.status) {
    case "nao_lidas":
      query = query.eq("is_read", false).eq("is_resolved", false);
      break;
    case "lidas":
      query = query.eq("is_read", true);
      break;
    case "resolvidas":
      query = query.eq("is_resolved", true);
      break;
    default:
      break; // "todas"
  }
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.priority) query = query.eq("priority", filters.priority);

  const { data } = await query;
  return (data ?? []) as NotificationRow[];
}
