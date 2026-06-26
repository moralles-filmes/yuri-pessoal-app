/**
 * Forma normalizada de um evento para a UI/lógica do calendário (Fase 08) e
 * helpers puros de filtro/ordenção por dia. SEM efeitos colaterais (datas injetadas).
 *
 * `start`/`end` são `Date` (instantes locais já parseados do `timestamptz`). A
 * lógica de grid/recorrência opera sobre estes objetos — totalmente testável.
 */
import {
  endOfDay,
  isWithinInterval,
  startOfDay,
} from "date-fns";
import type { EventType } from "@/lib/calendar/constants";

/** Evento normalizado (instância concreta; recorrências já expandidas). */
export interface CalendarEventLite {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  tipo: EventType;
  color?: string | null;
  location?: string | null;
  description?: string | null;
  reminderMinutes?: number | null;
  taskId?: string | null;
  googleEventId?: string | null;
  origin?: string;
  /** Para instâncias geradas por recorrência: o id do evento "mestre". */
  recurrenceParentId?: string | null;
}

/** Ordena por início e, em empate, por fim (mais curto primeiro). */
export function sortByStart<T extends { start: Date; end: Date }>(
  events: T[],
): T[] {
  return [...events].sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() ||
      a.end.getTime() - b.end.getTime(),
  );
}

/** True se o evento intersecta o dia de `day` (qualquer sobreposição). */
export function eventOnDay(
  event: { start: Date; end: Date },
  day: Date,
): boolean {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  // Sobreposição de intervalos: start <= dayEnd && end >= dayStart.
  return event.start <= dayEnd && event.end >= dayStart;
}

/** Eventos que ocorrem (intersectam) o dia, ordenados por início. */
export function eventsForDay<T extends { start: Date; end: Date }>(
  events: T[],
  day: Date,
): T[] {
  return sortByStart(events.filter((e) => eventOnDay(e, day)));
}

/** True se o evento está dentro de [from, to] (inclusivo nas bordas). */
export function eventInRange(
  event: { start: Date; end: Date },
  from: Date,
  to: Date,
): boolean {
  return event.start <= to && event.end >= from;
}

/** True se o instante `now` cai dentro do evento. */
export function isHappeningNow(
  event: { start: Date; end: Date },
  now: Date,
): boolean {
  return isWithinInterval(now, { start: event.start, end: event.end });
}
