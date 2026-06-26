/**
 * Expansão pura de eventos recorrentes em ocorrências concretas dentro de uma
 * janela [windowStart, windowEnd] (Fase 08). Sem efeitos colaterais.
 *
 * Estratégia (mesma filosofia de src/lib/finance/recurrence.ts): cada ocorrência
 * n é `start + n*passo` (anchor = start original), evitando "drift" de fim de mês.
 * Também mapeia a recorrência simples ↔ RRULE do Google (básico).
 */
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarYears,
  endOfDay,
} from "date-fns";
import type { EventFrequency } from "@/lib/calendar/constants";

const MAX_ITER = 1000;

export interface RecurringEventInput {
  start: Date;
  end: Date;
  freq: EventFrequency | null;
  /** A cada N unidades (>= 1). */
  interval: number;
  /** Última data (inclusive) em que a recorrência ainda gera; null = sem fim. */
  until: Date | null;
}

export interface Occurrence {
  start: Date;
  end: Date;
  /** Índice da ocorrência (0 = evento original). */
  index: number;
}

function addStep(date: Date, freq: EventFrequency, steps: number): Date {
  switch (freq) {
    case "diaria":
      return addDays(date, steps);
    case "semanal":
      return addWeeks(date, steps);
    case "mensal":
      return addMonths(date, steps);
    case "anual":
      return addYears(date, steps);
  }
}

function approxIndex(anchor: Date, target: Date, freq: EventFrequency, interval: number): number {
  let diff: number;
  switch (freq) {
    case "diaria":
      diff = differenceInCalendarDays(target, anchor) / interval;
      break;
    case "semanal":
      diff = differenceInCalendarDays(target, anchor) / (interval * 7);
      break;
    case "mensal":
      diff = differenceInCalendarMonths(target, anchor) / interval;
      break;
    case "anual":
      diff = differenceInCalendarYears(target, anchor) / interval;
      break;
  }
  return Math.max(0, Math.floor(diff) - 1);
}

/**
 * Ocorrências do evento (recorrente ou não) que intersectam [windowStart, windowEnd].
 * Para evento não-recorrente (`freq = null`) devolve no máximo a própria ocorrência.
 */
export function expandOccurrences(
  event: RecurringEventInput,
  windowStart: Date,
  windowEnd: Date,
): Occurrence[] {
  const durationMs = Math.max(0, event.end.getTime() - event.start.getTime());

  if (!event.freq) {
    const intersects =
      event.start.getTime() <= windowEnd.getTime() &&
      event.end.getTime() >= windowStart.getTime();
    return intersects ? [{ start: event.start, end: event.end, index: 0 }] : [];
  }

  const interval = Math.max(1, Math.floor(event.interval));
  // `until` é uma data de calendário (inclusiva): vale até o fim daquele dia.
  const untilTs = event.until ? endOfDay(event.until).getTime() : null;

  // Posiciona n na primeira ocorrência que pode intersectar a janela.
  let n = approxIndex(event.start, windowStart, event.freq, interval);
  let guard = 0;
  // Recua se exageramos.
  while (n > 0 && guard++ < MAX_ITER) {
    const occStart = addStep(event.start, event.freq, n - 1).getTime();
    if (occStart + durationMs >= windowStart.getTime()) n -= 1;
    else break;
  }

  const out: Occurrence[] = [];
  guard = 0;
  while (guard++ < MAX_ITER) {
    const occStart = addStep(event.start, event.freq, n);
    const occStartTs = occStart.getTime();
    if (occStartTs > windowEnd.getTime()) break;
    if (untilTs !== null && occStartTs > untilTs) break;
    const occEndTs = occStartTs + durationMs;
    // Intersecta a janela?
    if (occEndTs >= windowStart.getTime() && occStartTs <= windowEnd.getTime()) {
      out.push({ start: occStart, end: new Date(occEndTs), index: n });
    }
    n += 1;
  }
  return out;
}

const FREQ_TO_RRULE: Record<EventFrequency, string> = {
  diaria: "DAILY",
  semanal: "WEEKLY",
  mensal: "MONTHLY",
  anual: "YEARLY",
};

const RRULE_TO_FREQ: Record<string, EventFrequency> = {
  DAILY: "diaria",
  WEEKLY: "semanal",
  MONTHLY: "mensal",
  YEARLY: "anual",
};

/** Monta o array RRULE do Google a partir da recorrência simples (ou [] se sem freq). */
export function toRRule(input: {
  freq: EventFrequency | null;
  interval: number;
  until: Date | null;
}): string[] {
  if (!input.freq) return [];
  const parts = [`FREQ=${FREQ_TO_RRULE[input.freq]}`];
  if (input.interval > 1) parts.push(`INTERVAL=${Math.floor(input.interval)}`);
  if (input.until) {
    // UNTIL em UTC compacto (YYYYMMDDT000000Z) — fim do dia para incluir a data.
    const y = input.until.getUTCFullYear();
    const m = String(input.until.getUTCMonth() + 1).padStart(2, "0");
    const d = String(input.until.getUTCDate()).padStart(2, "0");
    parts.push(`UNTIL=${y}${m}${d}T235959Z`);
  }
  return [`RRULE:${parts.join(";")}`];
}

/** Interpreta o primeiro RRULE do Google numa recorrência simples (ou null). */
export function fromRRule(rrule: string[] | null | undefined): {
  freq: EventFrequency;
  interval: number;
  until: string | null;
} | null {
  if (!rrule || rrule.length === 0) return null;
  const line = rrule.find((r) => r.startsWith("RRULE:"));
  if (!line) return null;
  const body = line.slice("RRULE:".length);
  const map = new Map<string, string>();
  for (const kv of body.split(";")) {
    const [k, v] = kv.split("=");
    if (k && v) map.set(k.toUpperCase(), v);
  }
  const freqRaw = map.get("FREQ");
  if (!freqRaw || !RRULE_TO_FREQ[freqRaw]) return null;
  const freq = RRULE_TO_FREQ[freqRaw];
  const interval = Math.max(1, Number.parseInt(map.get("INTERVAL") ?? "1", 10) || 1);
  let until: string | null = null;
  const untilRaw = map.get("UNTIL");
  if (untilRaw && /^\d{8}/.test(untilRaw)) {
    until = `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}`;
  }
  return { freq, interval, until };
}
