"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfWeek,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { MonthView } from "@/components/calendar/month-view";
import { TimeGridView } from "@/components/calendar/time-grid";
import { UpcomingEvents } from "@/components/calendar/upcoming-events";
import { GoogleConnectCard } from "./google-connect-card";
import { EventFormDialog } from "./event-form";
import { EventDetailsDialog } from "./event-details";
import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  type CalendarView,
} from "@/lib/calendar/constants";
import {
  buildMonthGrid,
  buildWeekDays,
} from "@/lib/calendar/grid";
import { expandRowsToOccurrences } from "@/lib/calendar/expand";
import { fullDayLabel, longDateLabel, monthYearLabel } from "@/lib/calendar/format";
import { toDateInputValue } from "@/lib/format";
import type { CalendarEventLite } from "@/lib/calendar/events";
import type { CalendarEventRow, GoogleConnectionStatus } from "@/types/database";

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function AgendaClient({
  rows,
  view,
  dateIso,
  todayIso,
  nowIso,
  googleStatus,
  googleConfigured,
  googleNotice,
}: {
  rows: CalendarEventRow[];
  view: CalendarView;
  dateIso: string;
  todayIso: string;
  nowIso: string;
  googleStatus: GoogleConnectionStatus;
  googleConfigured: boolean;
  googleNotice?: string | null;
}) {
  const router = useRouter();
  const refDate = React.useMemo(() => parseLocalDate(dateIso), [dateIso]);
  const today = React.useMemo(() => parseLocalDate(todayIso), [todayIso]);

  const [formOpen, setFormOpen] = React.useState(false);
  const [formEvent, setFormEvent] = React.useState<CalendarEventRow | null>(null);
  const [formStart, setFormStart] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<CalendarEventLite | null>(null);

  // Janela de exibição conforme a visão (para expandir as recorrências).
  const { windowStart, windowEnd, weeks, weekDays } = React.useMemo(() => {
    if (view === "mes") {
      const grid = buildMonthGrid(refDate, { today });
      const days = grid.weeks.flat();
      return {
        windowStart: days[0].date,
        windowEnd: endOfDay(days[days.length - 1].date),
        weeks: grid.weeks,
        weekDays: [],
      };
    }
    if (view === "semana") {
      const days = buildWeekDays(refDate, { today });
      return {
        windowStart: startOfWeek(refDate, { weekStartsOn: 0 }),
        windowEnd: endOfWeek(refDate, { weekStartsOn: 0 }),
        weeks: [],
        weekDays: days,
      };
    }
    return {
      windowStart: startOfDay(refDate),
      windowEnd: endOfDay(refDate),
      weeks: [],
      weekDays: buildWeekDays(refDate, { today }).filter(
        (d) => toDateInputValue(d.date) === dateIso,
      ),
    };
  }, [view, refDate, today, dateIso]);

  const events = React.useMemo(
    () => expandRowsToOccurrences(rows, windowStart, windowEnd),
    [rows, windowStart, windowEnd],
  );

  const rowsById = React.useMemo(() => {
    const map = new Map<string, CalendarEventRow>();
    for (const r of rows) map.set(r.id, r);
    return map;
  }, [rows]);

  function navigate(updates: { view?: CalendarView; date?: string }) {
    const v = updates.view ?? view;
    const d = updates.date ?? dateIso;
    router.push(`/agenda?view=${v}&date=${d}`);
  }

  function step(direction: 1 | -1) {
    let next: Date;
    if (view === "mes") next = addMonths(refDate, direction);
    else if (view === "semana") next = addWeeks(refDate, direction);
    else next = addDays(refDate, direction);
    navigate({ date: toDateInputValue(next) });
  }

  function openCreate(start?: Date) {
    setFormEvent(null);
    setFormStart(start ? `${toDateInputValue(start)}T09:00` : `${dateIso}T09:00`);
    setFormOpen(true);
  }

  function openEventDetails(ev: CalendarEventLite) {
    setSelected(ev);
    setDetailsOpen(true);
  }

  function editSelected() {
    if (!selected) return;
    const masterId = selected.recurrenceParentId ?? selected.id;
    const master = rowsById.get(masterId) ?? null;
    setFormEvent(master);
    setFormStart(null);
    setDetailsOpen(false);
    setFormOpen(true);
  }

  const selectedMaster = selected
    ? rowsById.get(selected.recurrenceParentId ?? selected.id) ?? null
    : null;

  const periodLabel =
    view === "mes"
      ? monthYearLabel(refDate)
      : view === "semana"
        ? `${longDateLabel(windowStart)} – ${longDateLabel(windowEnd)}`
        : fullDayLabel(refDate);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agenda"
        description="Seus compromissos com cores por tipo, lembretes e sincronização com o Google Agenda."
      >
        <Button size="sm" onClick={() => openCreate()}>
          <CalendarPlus /> Novo evento
        </Button>
      </PageHeader>

      <GoogleConnectCard
        status={googleStatus}
        configured={googleConfigured}
        notice={googleNotice}
      />

      {/* Barra de controle: visões + navegação de período */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border p-0.5">
          {CALENDAR_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => navigate({ view: v })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {CALENDAR_VIEW_LABELS[v]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-1 text-sm font-medium capitalize">{periodLabel}</span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Período anterior"
            onClick={() => step(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ date: todayIso })}
          >
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Próximo período"
            onClick={() => step(1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {view === "mes" && (
            <MonthView
              weeks={weeks}
              events={events}
              onSelectDay={(date) => navigate({ view: "dia", date: toDateInputValue(date) })}
              onSelectEvent={openEventDetails}
            />
          )}
          {view === "semana" && (
            <TimeGridView
              days={weekDays}
              events={events}
              onSelectEvent={openEventDetails}
            />
          )}
          {view === "dia" && (
            <TimeGridView
              days={weekDays}
              events={events}
              showDayHeaders={false}
              onSelectEvent={openEventDetails}
            />
          )}
        </div>

        <div className="min-w-0">
          <UpcomingEvents rows={rows} nowIso={nowIso} />
        </div>
      </div>

      <EventFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        event={formEvent}
        defaultStart={formStart}
      />

      <EventDetailsDialog
        event={selected}
        masterRow={selectedMaster}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onEdit={editSelected}
      />
    </div>
  );
}
