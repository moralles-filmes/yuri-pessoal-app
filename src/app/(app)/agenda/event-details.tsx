"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, Clock, MapPin, Pencil, Repeat, Bell, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { EventTypeBadge } from "@/components/calendar/event-type-badge";
import { deleteEvent } from "@/lib/actions/calendar";
import { emBrasilia, eventTimeRange, fullDayLabel } from "@/lib/calendar/format";
import {
  EVENT_FREQUENCY_LABELS,
  REMINDER_OPTIONS,
  type EventFrequency,
} from "@/lib/calendar/constants";
import type { CalendarEventLite } from "@/lib/calendar/events";
import type { CalendarEventRow } from "@/types/database";

function reminderLabel(minutes: number | null | undefined): string | null {
  if (minutes == null) return null;
  return REMINDER_OPTIONS.find((o) => o.value === minutes)?.label ?? `${minutes} min antes`;
}

export function EventDetailsDialog({
  event,
  masterRow,
  open,
  onOpenChange,
  onEdit,
  onDeleted,
}: {
  event: CalendarEventLite | null;
  masterRow: CalendarEventRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  if (!event) return null;

  const freq = masterRow?.recurrence_freq as EventFrequency | null | undefined;
  const reminder = reminderLabel(masterRow?.reminder_minutes ?? event.reminderMinutes);
  const isGoogle = Boolean(event.googleEventId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-6">{event.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <EventTypeBadge tipo={event.tipo} />
            {event.recurrenceParentId || freq ? (
              <Badge variant="outline" className="gap-1 font-normal">
                <Repeat className="size-3" />
                {freq ? EVENT_FREQUENCY_LABELS[freq] : "Recorrente"}
              </Badge>
            ) : null}
            {isGoogle && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                Google
              </Badge>
            )}
          </div>

          <p className="flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="size-4 shrink-0" />
            <span className="capitalize">{fullDayLabel(emBrasilia(event.start))}</span>
          </p>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Clock className="size-4 shrink-0" />
            {eventTimeRange(event.start, event.end, event.allDay)}
          </p>
          {event.location && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4 shrink-0" />
              {event.location}
            </p>
          )}
          {reminder && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Bell className="size-4 shrink-0" />
              {reminder}
            </p>
          )}
          {event.description && (
            <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-foreground">
              {event.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <DeleteConfirmDialog
            title="Excluir evento"
            description={
              event.recurrenceParentId
                ? "Este evento faz parte de uma série. Excluir remove a série inteira."
                : "Esta ação não pode ser desfeita. Se estiver conectado ao Google, também será removido de lá."
            }
            successMessage="Evento excluído."
            onConfirm={async () => {
              const targetId = masterRow?.id ?? event.recurrenceParentId ?? event.id;
              const res = await deleteEvent(targetId);
              if (res.ok) {
                onOpenChange(false);
                onDeleted?.();
                router.refresh();
              }
              return res;
            }}
            trigger={
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
                <Trash2 /> Excluir
              </Button>
            }
          />
          <Button size="sm" onClick={onEdit}>
            <Pencil /> Editar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
