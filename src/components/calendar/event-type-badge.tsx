import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/calendar/constants";
import { EVENT_TYPE_COLORS } from "@/lib/calendar/colors";

/** Badge do tipo de evento (pessoal/trabalho/estudos/exercícios/rotina) com cor. */
export function EventTypeBadge({
  tipo,
  className,
}: {
  tipo: EventType;
  className?: string;
}) {
  const color = EVENT_TYPE_COLORS[tipo];
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-normal", className)}
      style={{ borderColor: `color-mix(in oklab, ${color} 40%, transparent)` }}
    >
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {EVENT_TYPE_LABELS[tipo]}
    </Badge>
  );
}
