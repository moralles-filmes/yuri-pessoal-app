/**
 * Lógica pura de STREAK e CONSISTÊNCIA de hábitos (Fase 10). SEM efeitos
 * colaterais (datas injetadas como 'yyyy-MM-dd' — sempre locais pt-BR, nunca UTC).
 *
 * Espelha src/lib/tasks/routines.ts (rotinas), mas com uma diferença crítica:
 * a SEQUÊNCIA ATUAL não quebra quando o hábito agendado para HOJE ainda não foi
 * feito (o dia ainda está em andamento). Dias agendados PASSADOS sem conclusão,
 * sim, quebram a sequência.
 */
import { addDays, format, parseISO } from "date-fns";
import type { HabitFrequency } from "@/lib/habits/constants";

const ISO = "yyyy-MM-dd";

export interface HabitLike {
  frequency: HabitFrequency;
  /** 0=domingo..6=sábado. Usado em 'semanal'/'dias_especificos'. */
  weekdays: number[] | null;
  is_active?: boolean;
}

/** True se o hábito está agendado para o dia `dateIso` ('yyyy-MM-dd'). */
export function habitOccursOn(habit: HabitLike, dateIso: string): boolean {
  if (habit.is_active === false) return false;
  if (habit.frequency === "diaria") return true;
  // 'semanal' e 'dias_especificos' dependem dos dias da semana escolhidos.
  const weekday = parseISO(dateIso).getDay();
  return Boolean(habit.weekdays?.includes(weekday));
}

/** Datas ('yyyy-MM-dd') em que o hábito ocorre dentro de [fromIso, toIso] (inclusivo). */
export function scheduledDatesInRange(
  habit: HabitLike,
  fromIso: string,
  toIso: string,
): string[] {
  const out: string[] = [];
  let cursor = parseISO(fromIso);
  const end = parseISO(toIso);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard++ < 1000) {
    const iso = format(cursor, ISO);
    if (habitOccursOn(habit, iso)) out.push(iso);
    cursor = addDays(cursor, 1);
  }
  return out;
}

export interface Consistency {
  /** Dias agendados na janela. */
  scheduled: number;
  /** Dias agendados que atingiram a meta. */
  done: number;
  /** done / scheduled (0–1); 0 quando nada foi agendado. */
  rate: number;
}

/**
 * Consistência (taxa de conclusão) do hábito numa janela [fromIso, toIso]: conta os
 * dias agendados e quantos deles foram concluídos. `doneDates` é o conjunto de datas
 * com a meta atingida (`is_done = true`).
 */
export function computeConsistency(
  habit: HabitLike,
  doneDates: Set<string>,
  fromIso: string,
  toIso: string,
): Consistency {
  const scheduledDates = scheduledDatesInRange(habit, fromIso, toIso);
  const scheduled = scheduledDates.length;
  const done = scheduledDates.reduce(
    (acc, iso) => acc + (doneDates.has(iso) ? 1 : 0),
    0,
  );
  return { scheduled, done, rate: scheduled === 0 ? 0 : done / scheduled };
}

/**
 * Sequência ATUAL (streak): dias agendados consecutivos concluídos, contando para
 * trás a partir de `todayIso` (inclusive). Dias não agendados são "pulados" (não
 * quebram). REGRA ESPECIAL: se HOJE está agendado mas ainda não foi concluído, o dia
 * ainda está em andamento — não conta e NÃO quebra (continua a partir de ontem).
 * Já um dia agendado PASSADO sem conclusão quebra a sequência.
 */
export function currentStreak(
  habit: HabitLike,
  doneDates: Set<string>,
  todayIso: string,
  maxLookbackDays = 366,
): number {
  let streak = 0;
  let cursor = parseISO(todayIso);
  for (let i = 0; i < maxLookbackDays; i++) {
    const iso = format(cursor, ISO);
    if (habitOccursOn(habit, iso)) {
      if (doneDates.has(iso)) {
        streak++;
      } else if (iso === todayIso) {
        // Hoje ainda em andamento: não conta, mas não quebra.
      } else {
        break;
      }
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * MELHOR sequência (recorde) de dias agendados consecutivos concluídos dentro da
 * janela [fromIso, toIso]. Um dia agendado não concluído zera a contagem corrente.
 */
export function bestStreak(
  habit: HabitLike,
  doneDates: Set<string>,
  fromIso: string,
  toIso: string,
): number {
  const dates = scheduledDatesInRange(habit, fromIso, toIso);
  let best = 0;
  let run = 0;
  for (const iso of dates) {
    if (doneDates.has(iso)) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Decide se um registro atingiu a meta. Para hábitos mensuráveis, `value >= target`;
 * para meta 0/inexistente, qualquer valor positivo conta. Centraliza a regra usada
 * tanto nas Server Actions (gravação) quanto em derivações de leitura.
 */
export function reachedTarget(value: number, target: number): boolean {
  if (target > 0) return value >= target;
  return value > 0;
}
