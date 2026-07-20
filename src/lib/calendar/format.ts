/**
 * Formatação pt-BR específica da Agenda (Fase 08). Puro; reutiliza date-fns/Intl.
 *
 * Todo rótulo daqui descreve um **instante** (`start_at`/`end_at`, timestamptz) e é sempre
 * lido como **hora de Brasília** — nunca no fuso do processo (UTC na Vercel) nem no do
 * dispositivo. `date-fns` só sabe operar no fuso ambiente, então o instante é primeiro
 * convertido para a hora de parede de São Paulo e só depois formatado.
 */
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { dateInSaoPaulo, timeInSaoPaulo } from "@/lib/format";

/**
 * `Date` cujos componentes LOCAIS (getHours/getDate/…) são a hora de parede de Brasília.
 * Adaptador para o `date-fns`, que só opera no fuso ambiente: **não** é o mesmo instante,
 * então serve apenas para formatar — nunca para gravar nem comparar.
 *
 * Use nos rótulos que recebem um INSTANTE (`event.start`). Os que recebem uma *data de
 * grade* (meia-noite construída localmente, como o cursor do mês) NÃO devem passar por
 * aqui: elas já são consistentes com o fuso ambiente por construção, e converter
 * deslocaria o rótulo em um dia.
 */
export function emBrasilia(instante: Date): Date {
  return new Date(`${dateInSaoPaulo(instante)}T${timeInSaoPaulo(instante)}:00`);
}

/** "09:00" (24h), em Brasília. */
export function formatTime(date: Date): string {
  return timeInSaoPaulo(date);
}

/** "junho de 2026". Recebe DATA DE GRADE (cursor do mês/semana). */
export function monthYearLabel(date: Date): string {
  return format(date, "MMMM 'de' yyyy", { locale: ptBR });
}

/** "15 de jun. de 2026". Para instante, passe `emBrasilia(ev.start)`. */
export function longDateLabel(date: Date): string {
  return format(date, "d 'de' MMM. 'de' yyyy", { locale: ptBR });
}

/** "Seg" — dia da semana curto, capitalizado. Recebe DATA DE GRADE. */
export function weekdayShort(date: Date): string {
  const s = format(date, "EEE", { locale: ptBR }).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Segunda-feira, 15 de junho". Para instante, passe `emBrasilia(ev.start)`. */
export function fullDayLabel(date: Date): string {
  const s = format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Faixa de horário de um evento: "09:00 – 10:00" ou "Dia inteiro". */
export function eventTimeRange(start: Date, end: Date, allDay: boolean): string {
  if (allDay) return "Dia inteiro";
  return `${formatTime(start)} – ${formatTime(end)}`;
}
