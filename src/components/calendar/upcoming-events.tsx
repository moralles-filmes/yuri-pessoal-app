"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { eventColor, eventDotStyle } from "@/lib/calendar/colors";
import { emBrasilia, eventTimeRange, longDateLabel } from "@/lib/calendar/format";
import { expandRowsToOccurrences } from "@/lib/calendar/expand";
import { proximosCompromissos, relativeDayLabel } from "@/lib/calendar/upcoming";
import { toDateInputValue } from "@/lib/format";
import type { CalendarEventRow } from "@/types/database";

/**
 * Próximos compromissos — componente reutilizável (Fase 08), pronto para o
 * dashboard geral (Fase 12). Recebe as linhas de eventos e o "agora" (ISO),
 * expande recorrências e mostra os próximos `limit`. Datas como Date só no client.
 */
export function UpcomingEvents({
  rows,
  nowIso,
  limit = 5,
  horizonDays = 60,
  className,
}: {
  rows: CalendarEventRow[];
  nowIso: string;
  limit?: number;
  horizonDays?: number;
  className?: string;
}) {
  const now = new Date(nowIso);
  const occurrences = expandRowsToOccurrences(rows, now, addDays(now, horizonDays));
  const items = proximosCompromissos(occurrences, now, limit);

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="size-4 text-primary" />
          Próximos compromissos
        </CardTitle>
        <Link
          href="/agenda"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Ver agenda
        </Link>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Sem compromissos próximos"
            description="Os próximos eventos da sua agenda aparecerão aqui."
            className="py-10"
          />
        ) : (
          <ul className="space-y-1">
            {items.map((ev) => {
              const rel = relativeDayLabel(ev.start, now);
              return (
                <li key={ev.id}>
                  <Link
                    href={`/agenda?view=dia&date=${toDateInputValue(ev.start)}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={eventDotStyle(eventColor(ev))}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ev.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {rel ?? longDateLabel(emBrasilia(ev.start))} ·{" "}
                        {eventTimeRange(ev.start, ev.end, ev.allDay)}
                        {ev.location ? ` · ${ev.location}` : ""}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
