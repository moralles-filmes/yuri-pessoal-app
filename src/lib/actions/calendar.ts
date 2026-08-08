"use server";

import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { calendarEventSchema } from "@/lib/validators/calendar";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";
import type { CalendarEventRow } from "@/types/database";
import {
  eventToGoogleResource,
  googleToEventFields,
  type GoogleEventResource,
} from "@/lib/calendar/mapping";
import {
  atualizarEventoNoGoogle,
  criarEventoNaAgenda,
  excluirEventoDaAgenda,
} from "@/lib/calendar/services";
import { reconcile, type GoogleSyncEvent, type LocalSyncEvent } from "@/lib/calendar/sync";
import {
  deleteGoogleIntegration,
  getGoogleIntegration,
  getValidAccessToken,
  updateLastSynced,
} from "@/lib/google/tokens";
import { revokeToken } from "@/lib/google/oauth";
import { syncAllTasksToGoogle } from "@/lib/todo/calendar-sync";
import { addDaysIso } from "@/lib/todo/recurrence";
import { hojeISO } from "@/lib/format";
import {
  insertEvent as googleInsertEvent,
  listEvents as googleListEvents,
  patchEvent as googlePatchEvent,
} from "@/lib/google/calendar";

/**
 * ⚠️ 18-C · Bloco 4 — a criação saiu daqui e virou `calendar/services.ts`. O que sobrou nesta
 * action é a casca: auth, Zod, serviço e `revalidatePath`. O command `criarEvento` chama o
 * MESMO serviço, e é isso que faz "nenhuma regra de negócio é reescrita" ser um fato de
 * import, não uma promessa.
 */
export async function createEvent(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = calendarEventSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const r = await criarEventoNaAgenda(ctx, parsed.data);
  if (!r.ok) return dbError(r.erro);

  revalidatePath("/agenda");
  return { ok: true, data: { id: r.id } };
}

export async function updateEvent(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = calendarEventSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const d = parsed.data;
  const { data: existing } = await ctx.supabase
    .from("calendar_events")
    .select("google_event_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await ctx.supabase
    .from("calendar_events")
    .update({
      title: d.title,
      description: d.description,
      location: d.location,
      start_at: d.start_at,
      end_at: d.end_at,
      all_day: d.all_day,
      tipo: d.tipo,
      color: d.color,
      recurrence_freq: d.recurrence_freq,
      recurrence_interval: d.recurrence_interval,
      recurrence_until: d.recurrence_until,
      reminder_minutes: d.reminder_minutes,
      task_id: d.task_id,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o evento.");

  // Push (best-effort) se o evento já está vinculado ao Google.
  if (existing?.google_event_id) {
    await atualizarEventoNoGoogle(ctx, id, existing.google_event_id, d);
  }

  revalidatePath("/agenda");
  return { ok: true, data: undefined };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const r = await excluirEventoDaAgenda(ctx, id);
  if (!r.ok) return dbError(r.erro);

  revalidatePath("/agenda");
  return { ok: true, data: undefined };
}

export async function disconnectGoogle(): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const integration = await getGoogleIntegration(ctx);
  if (integration?.refresh_token) {
    await revokeToken(integration.refresh_token);
  }
  const ok = await deleteGoogleIntegration(ctx);
  if (!ok) return dbError("Não foi possível desconectar o Google.");

  revalidatePath("/agenda");
  return { ok: true, data: undefined };
}

/* ─────────────── TO-DO → Google Agenda (Fase 15, iteração) ─────────────── */

/**
 * Liga/desliga o envio de tarefas do TO-DO para o Google. É opt-in: enquanto estiver
 * desligado, nenhuma tarefa sai daqui.
 *
 * Ao DESLIGAR, os eventos já criados permanecem no Google — o usuário decide o que
 * fazer com eles. Apagar em massa seria destrutivo e irreversível.
 */
export async function setTodoGoogleSync(enabled: boolean): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const integration = await getGoogleIntegration(ctx);
  if (!integration) {
    return { ok: false, error: "Conecte a conta Google antes de ativar o envio." };
  }

  const { error } = await ctx.supabase
    .from("google_integrations")
    .update({ todo_sync_enabled: Boolean(enabled) })
    .eq("user_id", ctx.userId);
  if (error) return dbError("Não foi possível salvar a preferência.");

  revalidatePath("/agenda");
  revalidatePath("/todo");
  return { ok: true, data: undefined };
}

/**
 * Envia agora as tarefas com data numa janela [−7d, +180d]. Serve para popular o
 * calendário logo depois de ligar a opção, sem despejar todo o histórico.
 */
export async function syncTodoToGoogle(): Promise<
  ActionResult<{ synced: number; failed: number }>
> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const integration = await getGoogleIntegration(ctx);
  if (!integration) {
    return { ok: false, error: "Google não conectado. Conecte a conta primeiro." };
  }
  if (!integration.todo_sync_enabled) {
    return { ok: false, error: "Ative o envio de tarefas antes de sincronizar." };
  }

  const today = hojeISO();
  const result = await syncAllTasksToGoogle(
    ctx,
    addDaysIso(today, -7),
    addDaysIso(today, 180),
  );

  await updateLastSynced(ctx);
  revalidatePath("/agenda");
  revalidatePath("/todo");
  return { ok: true, data: result };
}

/**
 * Sincronização bidirecional básica (Fase 08). Concilia uma janela [−30d, +180d]:
 * puxa eventos do Google, empurra os locais pendentes e remove os excluídos no
 * Google. Idempotente (reconcile não duplica). Conflito: última edição vence.
 */
export async function syncGoogleCalendar(): Promise<
  ActionResult<{ pulled: number; pushed: number; deleted: number }>
> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const token = await getValidAccessToken(ctx);
  if (!token) {
    return { ok: false, error: "Google não conectado ou sessão expirada. Reconecte a conta." };
  }

  const now = new Date();
  const from = addDays(now, -30);
  const to = addDays(now, 180);

  let googleItems: GoogleEventResource[];
  try {
    googleItems = await googleListEvents(token.accessToken, token.calendarId, {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
    });
  } catch {
    return { ok: false, error: "Falha ao consultar o Google Agenda. Tente novamente." };
  }

  // Linhas locais que começam dentro da janela (base da conciliação).
  const { data: localData } = await ctx.supabase
    .from("calendar_events")
    .select("id, google_event_id, etag, updated_at, synced_at, origin, start_at")
    .gte("start_at", from.toISOString())
    .lte("start_at", to.toISOString());

  const local: LocalSyncEvent[] = (localData ?? []).map((r) => ({
    id: r.id as string,
    googleEventId: (r.google_event_id as string | null) ?? null,
    etag: (r.etag as string | null) ?? null,
    updatedAt: r.updated_at as string,
    syncedAt: (r.synced_at as string | null) ?? null,
    origin: r.origin as string,
  }));

  const googleById = new Map<string, GoogleEventResource>();
  const google: GoogleSyncEvent[] = [];
  for (const g of googleItems) {
    if (!g.id) continue;
    googleById.set(g.id, g);
    google.push({
      id: g.id,
      etag: g.etag ?? "",
      status: g.status ?? "confirmed",
      updated: g.updated ?? new Date(0).toISOString(),
    });
  }

  const plan = reconcile(local, google);
  const nowIso = new Date().toISOString();
  let pulled = 0;
  let pushed = 0;
  let deleted = 0;

  // ── Pull: inserir/atualizar localmente ──
  for (const g of plan.pullUpsert) {
    const resource = googleById.get(g.id);
    if (!resource) continue;
    const fields = googleToEventFields(resource);
    try {
      const { data: existing } = await ctx.supabase
        .from("calendar_events")
        .select("id")
        .eq("google_event_id", g.id)
        .maybeSingle();
      if (existing) {
        await ctx.supabase
          .from("calendar_events")
          .update({
            title: fields.title,
            description: fields.description,
            location: fields.location,
            all_day: fields.all_day,
            start_at: fields.start_at,
            end_at: fields.end_at,
            recurrence_freq: fields.recurrence_freq,
            recurrence_interval: fields.recurrence_interval,
            recurrence_until: fields.recurrence_until,
            reminder_minutes: fields.reminder_minutes,
            etag: fields.etag,
            google_calendar_id: token.calendarId,
            synced_at: nowIso,
          })
          .eq("id", existing.id);
      } else {
        await ctx.supabase.from("calendar_events").insert({
          user_id: ctx.userId,
          title: fields.title,
          description: fields.description,
          location: fields.location,
          all_day: fields.all_day,
          start_at: fields.start_at,
          end_at: fields.end_at,
          tipo: "pessoal",
          recurrence_freq: fields.recurrence_freq,
          recurrence_interval: fields.recurrence_interval,
          recurrence_until: fields.recurrence_until,
          reminder_minutes: fields.reminder_minutes,
          google_event_id: fields.google_event_id,
          google_calendar_id: token.calendarId,
          etag: fields.etag,
          origin: "google",
          synced_at: nowIso,
        });
      }
      pulled++;
    } catch {
      // ignora item com erro; segue a sincronização
    }
  }

  // ── Pull delete: remover locais excluídos no Google ──
  if (plan.pullDeleteLocalIds.length > 0) {
    const { error } = await ctx.supabase
      .from("calendar_events")
      .delete()
      .in("id", plan.pullDeleteLocalIds);
    if (!error) deleted = plan.pullDeleteLocalIds.length;
  }

  // ── Push: criar/atualizar no Google ──
  const toPush = [...plan.pushCreate, ...plan.pushUpdate];
  for (const l of toPush) {
    try {
      const { data: row } = await ctx.supabase
        .from("calendar_events")
        .select("*")
        .eq("id", l.id)
        .maybeSingle();
      if (!row) continue;
      const r = row as unknown as CalendarEventRow;
      const resource = eventToGoogleResource(r);
      if (r.google_event_id) {
        const updated = await googlePatchEvent(
          token.accessToken,
          token.calendarId,
          r.google_event_id,
          resource,
        );
        await ctx.supabase
          .from("calendar_events")
          .update({ etag: updated.etag ?? null, synced_at: nowIso })
          .eq("id", r.id);
      } else {
        const created = await googleInsertEvent(token.accessToken, token.calendarId, resource);
        await ctx.supabase
          .from("calendar_events")
          .update({
            google_event_id: created.id ?? null,
            google_calendar_id: token.calendarId,
            etag: created.etag ?? null,
            synced_at: nowIso,
          })
          .eq("id", r.id);
      }
      pushed++;
    } catch {
      // ignora item com erro; segue a sincronização
    }
  }

  await updateLastSynced(ctx);
  revalidatePath("/agenda");
  return { ok: true, data: { pulled, pushed, deleted } };
}
