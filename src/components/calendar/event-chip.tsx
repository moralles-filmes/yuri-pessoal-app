"use client";

import { cn } from "@/lib/utils";
import { eventChipStyle, eventColor, eventDotStyle } from "@/lib/calendar/colors";
import { formatTime } from "@/lib/calendar/format";
import type { CalendarEventLite } from "@/lib/calendar/events";

/**
 * "Chip" de evento (visão de mês / lista). Compacto: ponto/cor + horário + título.
 * Cor por tipo (ou personalizada). Clicável.
 */
export function EventChip({
  event,
  onClick,
  className,
}: {
  event: CalendarEventLite;
  onClick?: () => void;
  className?: string;
}) {
  const color = eventColor(event);
  return (
    <button
      type="button"
      onClick={onClick}
      style={event.allDay ? eventChipStyle(color) : undefined}
      className={cn(
        "flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-left text-xs",
        "transition-colors hover:bg-muted",
        event.allDay && "border",
        className,
      )}
      title={event.title}
    >
      {!event.allDay && (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={eventDotStyle(color)}
        />
      )}
      {!event.allDay && (
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {formatTime(event.start)}
        </span>
      )}
      <span className="truncate font-medium">{event.title}</span>
    </button>
  );
}
