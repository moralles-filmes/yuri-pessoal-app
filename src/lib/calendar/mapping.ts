/**
 * Mapeamento entre `calendar_events` (banco), o evento normalizado da UI
 * (CalendarEventLite) e o recurso de evento do Google Agenda (Fase 08).
 * Puro e testável; sem IO. As datas de eventos "dia inteiro" são ancoradas ao
 * meio-dia UTC para manter a data estável em fusos de -11h a +11h.
 */
import { addDays } from "date-fns";
import type { CalendarEventRow } from "@/types/database";
import type { CalendarEventLite } from "@/lib/calendar/events";
import type { EventFrequency, EventType } from "@/lib/calendar/constants";
import { EVENT_TYPES } from "@/lib/calendar/constants";
import { fromRRule, toRRule } from "@/lib/calendar/recurrence";

export interface GoogleEventDate {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface GoogleEventResource {
  id?: string;
  status?: string;
  etag?: string;
  summary?: string;
  description?: string | null;
  location?: string | null;
  start?: GoogleEventDate;
  end?: GoogleEventDate;
  recurrence?: string[];
  reminders?: {
    useDefault?: boolean;
    overrides?: { method: string; minutes: number }[];
  };
  updated?: string;
}

function narrowTipo(value: string): EventType {
  return (EVENT_TYPES as readonly string[]).includes(value)
    ? (value as EventType)
    : "pessoal";
}

/** Linha do banco → evento normalizado para a UI (datas como Date). */
export function rowToLite(row: CalendarEventRow): CalendarEventLite {
  return {
    id: row.id,
    title: row.title,
    start: new Date(row.start_at),
    end: new Date(row.end_at),
    allDay: row.all_day,
    tipo: narrowTipo(row.tipo),
    color: row.color,
    location: row.location,
    description: row.description,
    reminderMinutes: row.reminder_minutes,
    taskId: row.task_id,
    googleEventId: row.google_event_id,
    origin: row.origin,
  };
}

/** 'YYYY-MM-DD' (UTC) de uma data ISO — usado para eventos dia inteiro. */
function utcDateOnly(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO no meio-dia UTC para uma data 'YYYY-MM-DD' (ancora estável de dia inteiro). */
function allDayIso(dateOnly: string): string {
  return `${dateOnly}T12:00:00.000Z`;
}

/**
 * Campos para gravar a partir de um evento do Google (pull). Não inclui user_id
 * nem sincronização — o chamador completa (`google_calendar_id`, `synced_at`).
 */
export function googleToEventFields(g: GoogleEventResource): {
  title: string;
  description: string | null;
  location: string | null;
  all_day: boolean;
  start_at: string;
  end_at: string;
  recurrence_freq: EventFrequency | null;
  recurrence_interval: number;
  recurrence_until: string | null;
  reminder_minutes: number | null;
  etag: string | null;
  google_event_id: string | null;
} {
  const allDay = Boolean(g.start?.date && !g.start?.dateTime);
  let startAt: string;
  let endAt: string;

  if (allDay) {
    const startDate = g.start?.date ?? utcDateOnly(new Date().toISOString());
    // Google: end.date é EXCLUSIVO → último dia = end.date - 1.
    const endExclusive = g.end?.date ?? startDate;
    const endInclusive = utcDateOnly(
      addDays(new Date(`${endExclusive}T12:00:00.000Z`), -1).toISOString(),
    );
    startAt = allDayIso(startDate);
    endAt = allDayIso(endInclusive >= startDate ? endInclusive : startDate);
  } else {
    startAt = g.start?.dateTime ?? new Date().toISOString();
    endAt = g.end?.dateTime ?? startAt;
  }

  const rec = fromRRule(g.recurrence);
  const reminderMinutes =
    g.reminders?.overrides && g.reminders.overrides.length > 0
      ? g.reminders.overrides[0].minutes
      : null;

  return {
    title: g.summary?.trim() || "(Sem título)",
    description: g.description ?? null,
    location: g.location ?? null,
    all_day: allDay,
    start_at: startAt,
    end_at: endAt,
    recurrence_freq: rec?.freq ?? null,
    recurrence_interval: rec?.interval ?? 1,
    recurrence_until: rec?.until ?? null,
    reminder_minutes: reminderMinutes,
    etag: g.etag ?? null,
    google_event_id: g.id ?? null,
  };
}

/** Evento local → recurso do Google (push de criação/atualização). */
export function eventToGoogleResource(
  row: Pick<
    CalendarEventRow,
    | "title"
    | "description"
    | "location"
    | "start_at"
    | "end_at"
    | "all_day"
    | "recurrence_freq"
    | "recurrence_interval"
    | "recurrence_until"
    | "reminder_minutes"
  >,
  opts: { timeZone?: string } = {},
): GoogleEventResource {
  const resource: GoogleEventResource = {
    summary: row.title,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
  };

  if (row.all_day) {
    const startDate = utcDateOnly(row.start_at);
    // end.date é exclusivo: dia seguinte ao último dia.
    const endInclusive = utcDateOnly(row.end_at);
    const endExclusive = utcDateOnly(
      addDays(new Date(`${endInclusive}T12:00:00.000Z`), 1).toISOString(),
    );
    resource.start = { date: startDate };
    resource.end = { date: endExclusive };
  } else {
    resource.start = { dateTime: row.start_at, timeZone: opts.timeZone };
    resource.end = { dateTime: row.end_at, timeZone: opts.timeZone };
  }

  const recurrence = toRRule({
    freq: row.recurrence_freq,
    interval: row.recurrence_interval,
    until: row.recurrence_until ? new Date(`${row.recurrence_until}T00:00:00Z`) : null,
  });
  if (recurrence.length > 0) resource.recurrence = recurrence;

  resource.reminders =
    row.reminder_minutes != null
      ? {
          useDefault: false,
          overrides: [{ method: "popup", minutes: row.reminder_minutes }],
        }
      : { useDefault: false, overrides: [] };

  return resource;
}
