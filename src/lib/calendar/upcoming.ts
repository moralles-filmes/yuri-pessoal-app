/**
 * Próximos compromissos (Fase 08) — lógica pura para o componente do dashboard.
 * `now` é injetado; opera sobre eventos já expandidos (CalendarEventLite).
 */
import { isSameDay, startOfDay } from "date-fns";
import type { CalendarEventLite } from "@/lib/calendar/events";
import { sortByStart } from "@/lib/calendar/events";

/**
 * Os próximos `limit` compromissos a partir de `now`: eventos que ainda não
 * terminaram (`end >= now`), ordenados por início. Inclui os que já começaram
 * mas ainda estão em andamento.
 */
export function proximosCompromissos(
  events: CalendarEventLite[],
  now: Date,
  limit = 5,
): CalendarEventLite[] {
  const future = events.filter((e) => e.end.getTime() >= now.getTime());
  return sortByStart(future).slice(0, Math.max(0, limit));
}

/** Rótulo relativo do dia: "Hoje", "Amanhã" ou null (usar data formatada). */
export function relativeDayLabel(date: Date, now: Date): "Hoje" | "Amanhã" | null {
  if (isSameDay(date, now)) return "Hoje";
  const tomorrow = startOfDay(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, tomorrow)) return "Amanhã";
  return null;
}
