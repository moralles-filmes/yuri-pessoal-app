/**
 * Lógica pura de PROGRESSO e TEMPO de Estudos (Fase 11). SEM efeitos colaterais
 * (datas injetadas como 'yyyy-MM-dd' — sempre locais pt-BR, nunca UTC).
 *
 * FONTE ÚNICA (evita dupla contagem):
 *  - `progress` (0–100) vem da razão de AULAS concluídas (study_lessons.is_done).
 *  - `studied_minutes` vem da SOMA das SESSÕES (study_sessions.duration_minutes),
 *    NUNCA da duração das aulas. As duas fontes não se somam.
 */

export interface LessonLike {
  is_done: boolean;
  /** Posição da aula dentro do módulo. */
  position: number;
  /** Posição do módulo dentro do curso (para ordenar a "próxima aula"). */
  module_position: number;
  title?: string;
  id?: string;
}

export interface SessionLike {
  session_date: string;
  duration_minutes: number;
}

/**
 * Progresso do curso (0–100) pela razão de aulas concluídas sobre o total.
 * Curso SEM aulas → 0 (nunca divide por zero). Resultado com 0 casas (inteiro).
 */
export function courseProgress(totalLessons: number, doneLessons: number): number {
  if (totalLessons <= 0) return 0;
  const done = Math.max(0, Math.min(doneLessons, totalLessons));
  return Math.round((done / totalLessons) * 100);
}

/** Soma (minutos) de uma lista de sessões. */
export function totalMinutes(sessions: SessionLike[]): number {
  return sessions.reduce((acc, s) => acc + Math.max(0, s.duration_minutes), 0);
}

/**
 * Soma de minutos das sessões cujo `session_date` cai em [fromIso, toIso] (inclusivo).
 * Comparação por string 'yyyy-MM-dd' (datas locais, sem fuso) — base de "horas na
 * semana/mês" do dashboard.
 */
export function minutesInRange(
  sessions: SessionLike[],
  fromIso: string,
  toIso: string,
): number {
  return sessions.reduce(
    (acc, s) =>
      s.session_date >= fromIso && s.session_date <= toIso
        ? acc + Math.max(0, s.duration_minutes)
        : acc,
    0,
  );
}

/** Conjunto de datas ('yyyy-MM-dd') que têm ao menos uma sessão (base do streak). */
export function sessionDateSet(sessions: SessionLike[]): Set<string> {
  return new Set(sessions.map((s) => s.session_date));
}

/**
 * "Próxima aula": a primeira aula NÃO concluída, na ordem (módulo, aula). Recebe a
 * lista de aulas e ordena por (module_position, position) antes de escolher.
 * Retorna null quando todas estão concluídas ou não há aulas.
 */
export function nextLesson<T extends LessonLike>(lessons: T[]): T | null {
  const ordered = [...lessons].sort(
    (a, b) =>
      a.module_position - b.module_position || a.position - b.position,
  );
  return ordered.find((l) => !l.is_done) ?? null;
}

/** Quantos dias separam `fromIso` de `toIso` (toIso - fromIso), por dia local. */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00`);
  const to = new Date(`${toIso}T00:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Curso é considerado "parado" sem sessão há mais de N dias. */
export const STALE_DAYS = 7;

export type OverdueReason = "target" | "inactive";

/**
 * Motivo pelo qual um curso EM ANDAMENTO está "atrasado", ou null se não está.
 *  - 'target'   → passou da data-alvo (target_date < hoje) e ainda não concluiu.
 *  - 'inactive' → nenhuma sessão nos últimos STALE_DAYS dias (ou nunca estudou).
 * Cursos que não estão 'em_andamento' nunca contam como atrasados.
 */
export function courseOverdueReason(
  course: { status: string; target_date: string | null },
  lastSessionIso: string | null,
  todayIso: string,
): OverdueReason | null {
  if (course.status !== "em_andamento") return null;
  if (course.target_date && course.target_date < todayIso) return "target";
  if (!lastSessionIso) return "inactive";
  if (daysBetween(lastSessionIso, todayIso) > STALE_DAYS) return "inactive";
  return null;
}
