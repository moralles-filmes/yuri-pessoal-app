/**
 * Camada de leitura da Agenda (Fase 08). Server-only. A RLS garante que cada
 * query retorna apenas os eventos do usuário. Não toca em tokens do Google.
 */
import { addDays } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { authContext } from "@/lib/actions/helpers";
import { getGoogleStatus } from "@/lib/google/tokens";
import { isGoogleConfigured } from "@/lib/google/config";
import { expandRowsToOccurrences } from "@/lib/calendar/expand";
import { proximosCompromissos } from "@/lib/calendar/upcoming";
import type { CalendarEventLite } from "@/lib/calendar/events";
import type {
  CalendarEventRow,
  GoogleConnectionStatus,
} from "@/types/database";

/**
 * Linhas de `calendar_events` relevantes para a janela [from, to]: eventos
 * não-recorrentes que a intersectam + TODOS os recorrentes que começam até `to`
 * (a expansão local decide as ocorrências). Ordenadas por início.
 */
export async function getCalendarEventRows(
  from: Date,
  to: Date,
): Promise<CalendarEventRow[]> {
  const supabase = await createClient();
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const { data } = await supabase
    .from("calendar_events")
    .select("*")
    .or(
      `and(recurrence_freq.is.null,start_at.lte.${toIso},end_at.gte.${fromIso}),and(recurrence_freq.not.is.null,start_at.lte.${toIso})`,
    )
    .order("start_at", { ascending: true })
    .limit(2000);
  return (data ?? []) as unknown as CalendarEventRow[];
}

/** Instâncias concretas (recorrências expandidas) dentro de [from, to]. */
export async function getCalendarEvents(
  from: Date,
  to: Date,
): Promise<CalendarEventLite[]> {
  const rows = await getCalendarEventRows(from, to);
  return expandRowsToOccurrences(rows, from, to);
}

/** Próximos compromissos a partir de `now` (para o dashboard). */
export async function getUpcomingCalendarEvents(
  now: Date,
  limit = 5,
  horizonDays = 60,
): Promise<CalendarEventLite[]> {
  const rows = await getCalendarEventRows(now, addDays(now, horizonDays));
  const occurrences = expandRowsToOccurrences(rows, now, addDays(now, horizonDays));
  return proximosCompromissos(occurrences, now, limit);
}

/** Estado da integração Google para a UI (sem tokens). */
export async function getGoogleConnectionStatus(): Promise<{
  status: GoogleConnectionStatus;
  configured: boolean;
}> {
  const ctx = await authContext();
  if (!ctx) {
    return {
      status: {
        connected: false,
        email: null,
        lastSyncedAt: null,
        todoSyncEnabled: false,
        trainingSyncEnabled: false,
      },
      configured: isGoogleConfigured,
    };
  }
  const status = await getGoogleStatus(ctx);
  return { status, configured: isGoogleConfigured };
}
