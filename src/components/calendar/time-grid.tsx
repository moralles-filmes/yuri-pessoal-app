"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { eventChipStyle, eventColor } from "@/lib/calendar/colors";
import { formatTime, weekdayShort } from "@/lib/calendar/format";
import { eventsForDay } from "@/lib/calendar/events";
import type { CalendarEventLite } from "@/lib/calendar/events";
import { dayHours, layoutDayEvents } from "@/lib/calendar/grid";
import type { GridDay } from "@/lib/calendar/grid";

const HOUR_PX = 48;
const TOTAL_PX = HOUR_PX * 24;
const HOURS = dayHours();

/**
 * Grade de tempo (dia/semana). Eixo de horas + colunas por dia, com eventos
 * posicionados por % e empacotados em colunas (sem se cobrir). Eventos "dia
 * inteiro" ficam numa faixa superior. Rola verticalmente; responsivo.
 */
export function TimeGridView({
  days,
  events,
  showDayHeaders = true,
  onSelectEvent,
}: {
  days: GridDay[];
  events: CalendarEventLite[];
  showDayHeaders?: boolean;
  onSelectEvent: (event: CalendarEventLite) => void;
}) {
  const gridTemplate = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;

  const allDayByDay = days.map((d) =>
    eventsForDay(events, d.date).filter((e) => e.allDay),
  );
  const hasAllDay = allDayByDay.some((list) => list.length > 0);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {showDayHeaders && (
        <div className="grid border-b" style={{ gridTemplateColumns: gridTemplate }}>
          <div className="border-r" />
          {days.map((d) => (
            <div
              key={d.date.toISOString()}
              className="flex flex-col items-center gap-0.5 border-r py-2 text-center last:border-r-0"
            >
              <span className="text-xs text-muted-foreground">
                {weekdayShort(d.date)}
              </span>
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full text-sm font-medium tabular-nums",
                  d.isToday && "bg-primary text-primary-foreground",
                )}
              >
                {d.date.getDate()}
              </span>
            </div>
          ))}
        </div>
      )}

      {hasAllDay && (
        <div
          className="grid border-b bg-muted/20"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="flex items-center justify-end border-r px-1 py-1 text-[10px] text-muted-foreground">
            Dia todo
          </div>
          {allDayByDay.map((list, i) => (
            <div key={days[i].date.toISOString()} className="space-y-0.5 border-r p-1 last:border-r-0">
              {list.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onSelectEvent(ev)}
                  style={eventChipStyle(eventColor(ev))}
                  className="block w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] font-medium"
                  title={ev.title}
                >
                  {ev.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="max-h-[60vh] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
          {/* Coluna de horas */}
          <div className="relative border-r" style={{ height: TOTAL_PX }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: (h / 24) * TOTAL_PX }}
              >
                {h > 0 ? `${String(h).padStart(2, "0")}:00` : ""}
              </div>
            ))}
          </div>

          {/* Colunas dos dias */}
          {days.map((d) => {
            const timed = eventsForDay(events, d.date).filter((e) => !e.allDay);
            const positioned = layoutDayEvents(timed, d.date);
            return (
              <div
                key={d.date.toISOString()}
                className="relative border-r last:border-r-0"
                style={{ height: TOTAL_PX }}
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-border/60"
                    style={{ top: (h / 24) * TOTAL_PX }}
                  />
                ))}
                {positioned.map((p) => {
                  const ev = p.event;
                  const color = eventColor(ev);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => onSelectEvent(ev)}
                      style={{
                        position: "absolute",
                        top: `${p.topPct}%`,
                        height: `${p.heightPct}%`,
                        left: `calc(${(p.col / p.colCount) * 100}% + 2px)`,
                        width: `calc(${100 / p.colCount}% - 4px)`,
                        ...eventChipStyle(color),
                      }}
                      className="overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight"
                      title={`${formatTime(ev.start)} ${ev.title}`}
                    >
                      <span className="block truncate font-medium">{ev.title}</span>
                      <span className="block truncate text-[10px] opacity-80">
                        {formatTime(ev.start)}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
