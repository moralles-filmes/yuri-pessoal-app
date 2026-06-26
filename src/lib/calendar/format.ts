/**
 * Formatação pt-BR específica da Agenda (Fase 08). Puro; reutiliza date-fns/Intl.
 */
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const timeFmt = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "09:00" (24h). */
export function formatTime(date: Date): string {
  return timeFmt.format(date);
}

/** "junho de 2026". */
export function monthYearLabel(date: Date): string {
  return format(date, "MMMM 'de' yyyy", { locale: ptBR });
}

/** "15 de jun. de 2026". */
export function longDateLabel(date: Date): string {
  return format(date, "d 'de' MMM. 'de' yyyy", { locale: ptBR });
}

/** "Seg" — dia da semana curto, capitalizado. */
export function weekdayShort(date: Date): string {
  const s = format(date, "EEE", { locale: ptBR }).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Segunda-feira, 15 de junho". */
export function fullDayLabel(date: Date): string {
  const s = format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Faixa de horário de um evento: "09:00 – 10:00" ou "Dia inteiro". */
export function eventTimeRange(start: Date, end: Date, allDay: boolean): string {
  if (allDay) return "Dia inteiro";
  return `${formatTime(start)} – ${formatTime(end)}`;
}
