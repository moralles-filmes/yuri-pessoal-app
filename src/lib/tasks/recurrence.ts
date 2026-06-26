/**
 * Lógica pura de recorrência de TAREFAS (Fase 09). SEM efeitos colaterais:
 * `Date.now()` nunca é usado — todas as datas são injetadas. Totalmente testável.
 *
 * Formato da recorrência (coluna `tasks.recurrence`, jsonb, versionável):
 *   { freq: 'diaria'|'semanal'|'mensal'|'anual', interval: number,
 *     weekdays?: number[] /* 0=dom..6=sáb, só p/ 'semanal' *​/, until?: 'yyyy-MM-dd' }
 * `null` = sem recorrência.
 *
 * Materialização: ao concluir uma tarefa recorrente, gera-se a PRÓXIMA instância
 * (próxima data de início/vencimento). Datas em string 'yyyy-MM-dd' (data local
 * pura, sem fuso — evita o bug de "vira o dia" por UTC).
 */
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import type { TaskRecurrenceFrequency } from "@/lib/tasks/constants";

const ISO = "yyyy-MM-dd";

export interface TaskRecurrence {
  freq: TaskRecurrenceFrequency;
  /** A cada N unidades (>= 1). Ignorado em 'semanal' quando `weekdays` é usado. */
  interval: number;
  /** 0=domingo..6=sábado. Apenas para 'semanal' (recorre nesses dias toda semana). */
  weekdays?: number[] | null;
  /** 'yyyy-MM-dd' inclusivo; null/ausente = sem fim. */
  until?: string | null;
}

/** Normaliza uma recorrência crua (do banco/form) — ou null se inválida/ausente. */
export function normalizeRecurrence(raw: unknown): TaskRecurrence | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const freq = r.freq;
  if (
    freq !== "diaria" &&
    freq !== "semanal" &&
    freq !== "mensal" &&
    freq !== "anual"
  ) {
    return null;
  }
  const interval = Math.max(1, Math.floor(Number(r.interval) || 1));
  let weekdays: number[] | null = null;
  if (Array.isArray(r.weekdays)) {
    const clean = Array.from(
      new Set(
        r.weekdays
          .map((d) => Math.floor(Number(d)))
          .filter((d) => d >= 0 && d <= 6),
      ),
    ).sort((a, b) => a - b);
    weekdays = clean.length ? clean : null;
  }
  const until =
    typeof r.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.until)
      ? r.until
      : null;
  return { freq, interval, weekdays, until };
}

function step(date: Date, freq: TaskRecurrenceFrequency, units: number): Date {
  switch (freq) {
    case "diaria":
      return addDays(date, units);
    case "semanal":
      return addWeeks(date, units);
    case "mensal":
      return addMonths(date, units);
    case "anual":
      return addYears(date, units);
  }
}

/**
 * Próxima ocorrência ESTRITAMENTE após `fromIso` (exclusivo), respeitando `until`.
 * Retorna 'yyyy-MM-dd' ou null se a recorrência já encerrou.
 *
 * - 'diaria'/'mensal'/'anual': `from` + interval (date-fns ancora no dia de origem;
 *   meses curtos sofrem clamp — ex.: 31/jan +1 mês = 28/fev).
 * - 'semanal' com `weekdays`: o próximo dia-da-semana listado após `from` (o
 *   intervalo é ignorado — recorre nesses dias toda semana).
 * - 'semanal' sem `weekdays`: `from` + interval semanas.
 */
export function nextOccurrence(
  rule: TaskRecurrence,
  fromIso: string,
): string | null {
  const from = parseISO(fromIso);
  if (Number.isNaN(from.getTime())) return null;

  const interval = Math.max(1, Math.floor(rule.interval));
  let next: Date;

  if (rule.freq === "semanal" && rule.weekdays && rule.weekdays.length) {
    const days = [...rule.weekdays].sort((a, b) => a - b);
    next = addDays(from, 1);
    let guard = 0;
    while (!days.includes(next.getDay()) && guard++ < 14) {
      next = addDays(next, 1);
    }
  } else {
    next = step(from, rule.freq, interval);
  }

  const iso = format(next, ISO);
  if (rule.until && iso > rule.until) return null;
  return iso;
}

export interface TaskScheduleDates {
  /** 'yyyy-MM-dd' ou null. */
  startDate: string | null;
  dueDate: string | null;
}

/**
 * Próxima instância de uma tarefa recorrente. Ancora na `dueDate` (ou, na falta,
 * na `startDate`) e desloca AMBAS as datas pelo mesmo número de dias — preservando
 * a duração entre início e vencimento. Retorna null quando a recorrência encerrou
 * (passou de `until`) ou quando não há data-âncora.
 */
export function materializeNext(
  rule: TaskRecurrence,
  dates: TaskScheduleDates,
): TaskScheduleDates | null {
  const anchorIso = dates.dueDate ?? dates.startDate;
  if (!anchorIso) return null;

  const nextAnchorIso = nextOccurrence(rule, anchorIso);
  if (!nextAnchorIso) return null;

  const deltaDays = differenceInCalendarDays(
    parseISO(nextAnchorIso),
    parseISO(anchorIso),
  );
  const shift = (iso: string | null): string | null =>
    iso ? format(addDays(parseISO(iso), deltaDays), ISO) : null;

  return {
    startDate: shift(dates.startDate),
    dueDate: shift(dates.dueDate),
  };
}
