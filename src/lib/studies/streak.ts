/**
 * Sequência de DIAS ESTUDANDO (Fase 11). SEM efeitos colaterais (datas injetadas
 * como 'yyyy-MM-dd' — sempre locais pt-BR, nunca UTC).
 *
 * Espelha a filosofia do streak de hábitos (src/lib/habits/streak.ts), mas aqui TODO
 * dia conta como "agendado": basta ter ≥1 sessão de estudo. REGRA "hoje ainda conta":
 * se HOJE ainda não teve sessão, o dia está em andamento — não conta e NÃO quebra
 * (a sequência continua a partir de ontem). Um dia PASSADO sem sessão quebra.
 */
import { addDays, format, parseISO } from "date-fns";

const ISO = "yyyy-MM-dd";

/**
 * Sequência ATUAL: dias consecutivos com ao menos uma sessão, contando para trás a
 * partir de `todayIso` (inclusive). Hoje sem sessão não quebra (dia em andamento).
 */
export function studyStreak(
  sessionDates: Set<string>,
  todayIso: string,
  maxLookbackDays = 366,
): number {
  let streak = 0;
  let cursor = parseISO(todayIso);
  for (let i = 0; i < maxLookbackDays; i++) {
    const iso = format(cursor, ISO);
    if (sessionDates.has(iso)) {
      streak++;
    } else if (iso === todayIso) {
      // Hoje ainda em andamento: não conta, mas não quebra.
    } else {
      break;
    }
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * MELHOR sequência (recorde) de dias consecutivos com sessão dentro de
 * [fromIso, toIso] (inclusivo). Um dia sem sessão zera a contagem corrente.
 */
export function bestStudyStreak(
  sessionDates: Set<string>,
  fromIso: string,
  toIso: string,
): number {
  let best = 0;
  let run = 0;
  let cursor = parseISO(fromIso);
  const end = parseISO(toIso);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard++ < 1000) {
    const iso = format(cursor, ISO);
    if (sessionDates.has(iso)) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
    cursor = addDays(cursor, 1);
  }
  return best;
}
