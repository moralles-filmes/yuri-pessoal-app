import type { Metadata } from "next";
import { addDays, endOfMonth, startOfMonth } from "date-fns";
import {
  getCalendarEventRows,
  getGoogleConnectionStatus,
} from "@/lib/calendar/queries";
import { CALENDAR_VIEWS, type CalendarView } from "@/lib/calendar/constants";
import { toDateInputValue } from "@/lib/format";
import { AgendaClient } from "./agenda-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agenda" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;

  const viewRaw = first(sp.view);
  const view: CalendarView = (CALENDAR_VIEWS as readonly string[]).includes(
    viewRaw ?? "",
  )
    ? (viewRaw as CalendarView)
    : "mes";

  const now = new Date();
  const todayIso = toDateInputValue(now);
  const dateRaw = first(sp.date);
  const dateIso =
    dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : todayIso;

  const refDate = parseLocalDate(dateIso);
  const fetchFrom = addDays(startOfMonth(refDate), -7);
  const fetchTo = addDays(endOfMonth(refDate), 7);

  const [rows, google] = await Promise.all([
    getCalendarEventRows(fetchFrom, fetchTo),
    getGoogleConnectionStatus(),
  ]);

  return (
    <AgendaClient
      rows={rows}
      view={view}
      dateIso={dateIso}
      todayIso={todayIso}
      nowIso={now.toISOString()}
      googleStatus={google.status}
      googleConfigured={google.configured}
      googleNotice={first(sp.google) ?? null}
    />
  );
}
