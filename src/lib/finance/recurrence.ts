/**
 * Lógica pura de recorrência (Fase 02). SEM efeitos colaterais: não usa Date.now(),
 * não toca Supabase nem Next — `today` é sempre injetado. Totalmente testável.
 *
 * Estratégia: as ocorrências são calculadas SEMPRE relativas à `anchorDate`
 * (ocorrência n = anchor + n*intervalo). Isso evita o "drift" de fim de mês:
 * date-fns `addMonths` usa o dia do ANCHOR a cada cálculo, então uma recorrência
 * mensal no dia 31 produz 31/jan → 28/fev → 31/mar → 30/abr (e não 28 em diante).
 */
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
  format,
  parseISO,
} from "date-fns";
import type { Frequency } from "@/lib/finance/constants";

const ISO = "yyyy-MM-dd";
const MAX_ITER = 5000;

export interface RecurrenceInput {
  frequency: Frequency;
  /** A cada N unidades (>= 1). */
  intervalCount: number;
  /** 'yyyy-MM-dd' — define o dia-âncora (ex.: 31 para mensal no fim do mês). */
  anchorDate: string;
  /** 'yyyy-MM-dd' — próxima data a (talvez) gerar. */
  nextDueDate: string;
  /** 'yyyy-MM-dd' inclusivo; null = sem fim. */
  endDate?: string | null;
}

export interface RecurrencePlan {
  /** Datas vencidas até `today` (e <= endDate), em ordem. */
  dueDates: string[];
  /** Próxima data a persistir após gerar `dueDates`, ou null se encerrou. */
  newNextDueDate: string | null;
  /** True quando não há mais ocorrências futuras. */
  finished: boolean;
}

/** Ocorrência de índice `n` (>=0) relativa ao anchor. Exportada para testes. */
export function occurrenceOn(
  anchorIso: string,
  frequency: Frequency,
  intervalCount: number,
  n: number,
): string {
  const anchor = parseISO(anchorIso);
  const step = n * Math.max(1, Math.floor(intervalCount));
  let date: Date;
  switch (frequency) {
    case "diaria":
      date = addDays(anchor, step);
      break;
    case "semanal":
      date = addWeeks(anchor, step);
      break;
    case "mensal":
      date = addMonths(anchor, step);
      break;
    case "anual":
      date = addYears(anchor, step);
      break;
  }
  return format(date, ISO);
}

function occDate(
  anchor: Date,
  frequency: Frequency,
  interval: number,
  n: number,
): Date {
  const step = n * interval;
  switch (frequency) {
    case "diaria":
      return addDays(anchor, step);
    case "semanal":
      return addWeeks(anchor, step);
    case "mensal":
      return addMonths(anchor, step);
    case "anual":
      return addYears(anchor, step);
  }
}

function approxStartIndex(
  anchor: Date,
  next: Date,
  frequency: Frequency,
  interval: number,
): number {
  let diff: number;
  switch (frequency) {
    case "diaria":
      diff = differenceInCalendarDays(next, anchor) / interval;
      break;
    case "semanal":
      diff = differenceInCalendarDays(next, anchor) / (interval * 7);
      break;
    case "mensal":
      diff = differenceInCalendarMonths(next, anchor) / interval;
      break;
    case "anual":
      diff = differenceInCalendarYears(next, anchor) / interval;
      break;
  }
  return Math.max(0, Math.floor(diff) - 1);
}

/**
 * Calcula as ocorrências vencidas até `today` e a próxima data a persistir.
 * @param today 'yyyy-MM-dd' (injetado pela camada de aplicação).
 */
export function computeDueOccurrences(
  input: RecurrenceInput,
  today: string,
): RecurrencePlan {
  const interval = Math.max(1, Math.floor(input.intervalCount));
  const anchor = parseISO(input.anchorDate);
  const next = parseISO(input.nextDueDate).getTime();
  const todayTs = parseISO(today).getTime();
  const endTs = input.endDate ? parseISO(input.endDate).getTime() : null;

  // Posiciona n na menor ocorrência >= nextDueDate.
  let n = approxStartIndex(anchor, parseISO(input.nextDueDate), input.frequency, interval);
  let guard = 0;
  while (
    n > 0 &&
    occDate(anchor, input.frequency, interval, n - 1).getTime() >= next &&
    guard++ < MAX_ITER
  ) {
    n -= 1;
  }
  guard = 0;
  while (
    occDate(anchor, input.frequency, interval, n).getTime() < next &&
    guard++ < MAX_ITER
  ) {
    n += 1;
  }

  // Coleta as ocorrências vencidas (<= today e <= endDate).
  const dueDates: string[] = [];
  let count = 0;
  while (count < MAX_ITER) {
    const occ = occDate(anchor, input.frequency, interval, n);
    const ts = occ.getTime();
    if (ts > todayTs) break;
    if (endTs !== null && ts > endTs) break;
    dueDates.push(format(occ, ISO));
    n += 1;
    count += 1;
  }

  // Próxima ocorrência após as geradas.
  const nextOcc = occDate(anchor, input.frequency, interval, n);
  if (endTs !== null && nextOcc.getTime() > endTs) {
    return { dueDates, newNextDueDate: null, finished: true };
  }
  return { dueDates, newNextDueDate: format(nextOcc, ISO), finished: false };
}
