/**
 * Fase 15 — Módulo TO-DO · Status derivado (lógica PURA, testada em status.test.ts).
 *
 * REGRA DO PROJETO: 'atrasada' NUNCA é gravado no banco — é calculado na leitura a
 * partir das datas, como já acontece com fatura (Fase 03), `tasks.status` (Fase 09) e
 * cursos atrasados (Fase 11). O `todayIso` é sempre INJETADO (no servidor vem de
 * `hojeISO()`, que respeita America/Sao_Paulo) — nada aqui chama `Date.now()`.
 *
 * Uma tarefa está atrasada quando a data programada OU o prazo final já passaram e ela
 * ainda não foi fechada. As duas datas contam porque servem a coisas diferentes:
 * a programada é "quando eu pretendia fazer", o prazo é "o limite real".
 */
import {
  isClosedStatus,
  type TodoEffectiveStatus,
  type TodoStatus,
} from "@/lib/todo/constants";

/** Campos mínimos para decidir o status efetivo. */
export interface TodoStatusInput {
  status: TodoStatus;
  scheduledDate: string | null;
  deadlineAt: string | null;
}

/** A tarefa está fechada (concluída, cancelada ou arquivada)? */
export function isClosed(task: Pick<TodoStatusInput, "status">): boolean {
  return isClosedStatus(task.status);
}

/** Atrasada: data programada ou prazo anteriores a hoje, e ainda aberta. */
export function isOverdue(task: TodoStatusInput, todayIso: string): boolean {
  if (isClosed(task)) return false;
  const { scheduledDate, deadlineAt } = task;
  if (scheduledDate && scheduledDate < todayIso) return true;
  if (deadlineAt && deadlineAt < todayIso) return true;
  return false;
}

/** Programada para hoje (ou com prazo hoje), e ainda aberta. */
export function isDueToday(task: TodoStatusInput, todayIso: string): boolean {
  if (isClosed(task)) return false;
  return task.scheduledDate === todayIso || task.deadlineAt === todayIso;
}

/**
 * Programada (ou com prazo) para depois de hoje. A data MAIS PRÓXIMA é que manda: se a
 * tarefa é programada para amanhã mas o prazo vence hoje, ela é "de hoje", não "próxima".
 */
export function isUpcoming(task: TodoStatusInput, todayIso: string): boolean {
  if (isClosed(task)) return false;
  const dates = [task.scheduledDate, task.deadlineAt].filter(Boolean) as string[];
  if (dates.length === 0) return false;
  const nearest = dates.reduce((a, b) => (a < b ? a : b));
  return nearest > todayIso;
}

/** Sem nenhuma data (candidata a organizar na Caixa de entrada). */
export function hasNoDate(task: TodoStatusInput): boolean {
  return !task.scheduledDate && !task.deadlineAt;
}

/**
 * Status EFETIVO para exibição: o gravado, exceto quando as datas indicam atraso.
 * É o único lugar que a UI deve consultar para pintar o badge de status.
 */
export function effectiveStatus(
  task: TodoStatusInput,
  todayIso: string,
): TodoEffectiveStatus {
  if (isOverdue(task, todayIso)) return "atrasada";
  return task.status;
}

/**
 * O prazo está "apertado"? Serve para o aviso visual de prazo próximo (sem virar um
 * status). Default: 3 dias. Não considera tarefa já atrasada (essa tem aviso próprio).
 */
export function isDeadlineNear(
  task: TodoStatusInput,
  todayIso: string,
  withinDays = 3,
): boolean {
  if (isClosed(task) || !task.deadlineAt) return false;
  if (task.deadlineAt < todayIso) return false;
  const diff = daysBetween(todayIso, task.deadlineAt);
  return diff >= 0 && diff <= withinDays;
}

/** Diferença em dias inteiros entre duas datas 'yyyy-MM-dd' (b − a), em UTC. */
export function daysBetween(aIso: string, bIso: string): number {
  const parse = (iso: string) => {
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    return Date.UTC(y, m - 1, d);
  };
  if (!aIso || !bIso) return 0;
  return Math.round((parse(bIso) - parse(aIso)) / 86_400_000);
}

/**
 * Progresso das subtarefas (0..100). Tarefa sem subtarefa devolve null — a UI não
 * mostra barra de progresso nesse caso (0% seria enganoso).
 */
export function subtaskProgress(done: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  const d = Math.max(0, Math.min(Math.floor(done), Math.floor(total)));
  return Math.round((d / Math.floor(total)) * 100);
}

/**
 * Horário final calculado a partir do início + duração ('HH:mm' → 'HH:mm').
 * Passa da meia-noite? Devolve o horário do dia seguinte (a UI sinaliza com "+1").
 * Sem horário ou sem duração → null.
 */
export function endTime(
  startTime: string | null,
  durationMinutes: number | null,
): string | null {
  if (!startTime || !durationMinutes || durationMinutes <= 0) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(startTime);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + Math.floor(durationMinutes);
  const minutesInDay = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(minutesInDay / 60);
  const m = minutesInDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** O horário final cai no dia seguinte? (para o rótulo "+1 dia"). */
export function endsNextDay(
  startTime: string | null,
  durationMinutes: number | null,
): boolean {
  if (!startTime || !durationMinutes || durationMinutes <= 0) return false;
  const match = /^(\d{1,2}):(\d{2})/.exec(startTime);
  if (!match) return false;
  return Number(match[1]) * 60 + Number(match[2]) + Math.floor(durationMinutes) >= 1440;
}

/** Normaliza 'HH:mm:ss' (vindo do Postgres `time`) para 'HH:mm'. */
export function trimTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
}
