/**
 * Expande linhas de `calendar_events` (incluindo recorrentes) em instâncias
 * concretas (CalendarEventLite) dentro de [from, to] (Fase 08). Puro e testável.
 * Instâncias geradas (index > 0) recebem id sintético `<id>__<index>` e apontam
 * para o evento mestre via `recurrenceParentId` (a edição age sobre o mestre).
 */
import type { CalendarEventRow } from "@/types/database";
import type { CalendarEventLite } from "@/lib/calendar/events";
import { rowToLite } from "@/lib/calendar/mapping";
import { expandOccurrences } from "@/lib/calendar/recurrence";

export function expandRowsToOccurrences(
  rows: CalendarEventRow[],
  from: Date,
  to: Date,
): CalendarEventLite[] {
  const out: CalendarEventLite[] = [];
  for (const row of rows) {
    const base = rowToLite(row);
    const occurrences = expandOccurrences(
      {
        start: base.start,
        end: base.end,
        freq: row.recurrence_freq,
        interval: row.recurrence_interval,
        until: row.recurrence_until
          ? new Date(`${row.recurrence_until}T00:00:00`)
          : null,
      },
      from,
      to,
    );
    for (const occ of occurrences) {
      out.push({
        ...base,
        id: occ.index === 0 ? base.id : `${base.id}__${occ.index}`,
        start: occ.start,
        end: occ.end,
        recurrenceParentId: occ.index === 0 ? null : base.id,
      });
    }
  }
  return out;
}
