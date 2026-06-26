/**
 * Lógica pura de agendamento e frequência de ROTINAS (Fase 09). SEM efeitos
 * colaterais (datas injetadas). Decide se uma rotina "cai" num dia e calcula a
 * aderência (ex.: "feita 5 de 7 dias na semana").
 */
import { addDays, format, parseISO } from "date-fns";
import type { RoutineFrequency } from "@/lib/tasks/constants";

const ISO = "yyyy-MM-dd";

export interface RoutineLike {
  frequency: RoutineFrequency;
  /** 0=domingo..6=sábado. Usado em 'semanal'/'dias_especificos'. */
  weekdays: number[] | null;
  is_active?: boolean;
}

/** True se a rotina está agendada para o dia `dateIso` ('yyyy-MM-dd'). */
export function routineOccursOn(routine: RoutineLike, dateIso: string): boolean {
  if (routine.is_active === false) return false;
  if (routine.frequency === "diaria") return true;
  // 'semanal' e 'dias_especificos' dependem dos dias da semana escolhidos.
  const weekday = parseISO(dateIso).getDay();
  return Boolean(routine.weekdays?.includes(weekday));
}

/** Datas ('yyyy-MM-dd') em que a rotina ocorre dentro de [fromIso, toIso] (inclusivo). */
export function scheduledDatesInRange(
  routine: RoutineLike,
  fromIso: string,
  toIso: string,
): string[] {
  const out: string[] = [];
  let cursor = parseISO(fromIso);
  const end = parseISO(toIso);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard++ < 1000) {
    const iso = format(cursor, ISO);
    if (routineOccursOn(routine, iso)) out.push(iso);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export interface Adherence {
  /** Dias agendados na janela. */
  scheduled: number;
  /** Dias agendados que foram cumpridos. */
  done: number;
  /** done / scheduled (0–1); 0 quando nada foi agendado. */
  rate: number;
}

/**
 * Aderência da rotina numa janela [fromIso, toIso]: conta os dias agendados e
 * quantos deles têm log concluído. `doneDates` é o conjunto de datas com
 * `is_done = true` (apenas datas contam — a unicidade por (rotina, dia) é do banco).
 */
export function computeAdherence(
  routine: RoutineLike,
  doneDates: Set<string>,
  fromIso: string,
  toIso: string,
): Adherence {
  const scheduledDates = scheduledDatesInRange(routine, fromIso, toIso);
  const scheduled = scheduledDates.length;
  const done = scheduledDates.reduce(
    (acc, iso) => acc + (doneDates.has(iso) ? 1 : 0),
    0,
  );
  return { scheduled, done, rate: scheduled === 0 ? 0 : done / scheduled };
}

/**
 * Sequência atual (streak) de dias agendados consecutivos cumpridos, contando
 * para trás a partir de `todayIso` (inclusive). Dias não agendados são "pulados"
 * (não quebram a sequência). Para se o dia agendado mais recente não foi cumprido.
 */
export function currentStreak(
  routine: RoutineLike,
  doneDates: Set<string>,
  todayIso: string,
  maxLookbackDays = 366,
): number {
  let streak = 0;
  let cursor = parseISO(todayIso);
  for (let i = 0; i < maxLookbackDays; i++) {
    const iso = format(cursor, ISO);
    if (routineOccursOn(routine, iso)) {
      if (doneDates.has(iso)) streak++;
      else break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}
