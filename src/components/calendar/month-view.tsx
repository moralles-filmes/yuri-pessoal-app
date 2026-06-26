"use client";

import { cn } from "@/lib/utils";
import { eventColor, eventDotStyle } from "@/lib/calendar/colors";
import { formatTime } from "@/lib/calendar/format";
import { eventsForDay } from "@/lib/calendar/events";
import type { CalendarEventLite } from "@/lib/calendar/events";
import type { GridDay } from "@/lib/calendar/grid";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MAX_VISIBLE = 3;

/** Visão de mês: grade 7×N com chips de evento por dia (cores por tipo). */
export function MonthView({
  weeks,
  events,
  onSelectDay,
  onSelectEvent,
}: {
  weeks: GridDay[][];
  events: CalendarEventLite[];
  onSelectDay: (date: Date) => void;
  onSelectEvent: (event: CalendarEventLite) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((day) => {
          const dayEvents = eventsForDay(events, day.date);
          const visible = dayEvents.slice(0, MAX_VISIBLE);
          const extra = dayEvents.length - visible.length;
          return (
            <div
              key={day.date.toISOString()}
              className={cn(
                "min-h-[84px] border-b border-r p-1 last:border-r-0 sm:min-h-[112px]",
                !day.inMonth && "bg-muted/30 text-muted-foreground",
              )}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day.date)}
                className={cn(
                  "mb-1 flex size-6 items-center justify-center rounded-full text-xs font-medium tabular-nums transition-colors hover:bg-muted",
                  day.isToday && "bg-primary text-primary-foreground hover:bg-primary",
                )}
                aria-label={`Novo evento em ${day.date.toLocaleDateString("pt-BR")}`}
              >
                {day.date.getDate()}
              </button>
              <div className="space-y-0.5">
                {visible.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => onSelectEvent(ev)}
                    className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-muted"
                    title={ev.title}
                  >
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 rounded-full"
                      style={eventDotStyle(eventColor(ev))}
                    />
                    {!ev.allDay && (
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatTime(ev.start)}
                      </span>
                    )}
                    <span className="truncate">{ev.title}</span>
                  </button>
                ))}
                {extra > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectDay(day.date)}
                    className="px-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    +{extra} mais
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
