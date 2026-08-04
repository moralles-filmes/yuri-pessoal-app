/**
 * Fase 17-B — Treinos · Planejamento semanal (PURO, sem I/O, sem `Date.now()`).
 *
 * ═════════════════════════════ DATA PURA, e por quê ═════════════════════════════
 *
 * Tudo aqui opera sobre `'yyyy-MM-dd'` — o formato da coluna `date`, que **não representa
 * instante nenhum**. A aritmética roda em `Date.UTC`, o mesmo padrão de
 * `src/lib/todo/recurrence.ts` (Fase 15) e de `src/lib/nutrition/calendar.ts` (16-B).
 *
 * Na Vercel o processo roda em UTC. `new Date('2026-08-03').getDay()` responde certo em UTC e
 * errado em Brasília durante parte do dia — e o planejamento inteiro é indexado por dia.
 * Decompor o texto em números e voltar para texto elimina a assimetria de raiz.
 *
 * Convenção de dia da semana: **0 = domingo … 6 = sábado**, igual a `habits.weekdays`,
 * `Date.getUTCDay()` e ao restante do sistema.
 *
 * ═════════════════════════ STATUS DERIVADO, NUNCA GRAVADO ═════════════════════════
 *
 * O banco guarda só FATO: `planejado`, `concluido`, `nao_realizado`, `reagendado`,
 * `cancelado`. **"Atrasado" e "hoje" nascem aqui**, de `scheduled_date` + o `hoje` INJETADO —
 * exatamente como `atrasada` no TO-DO e como o status da fatura de cartão. Persistir qualquer
 * um dos dois criaria uma segunda verdade que envelhece sozinha à meia-noite.
 */
import type { DerivedScheduleStatus, ScheduleStatus } from "./constants";

/* ───────────────────────────── Aritmética de data pura ───────────────────────────── */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
/** Trava de segurança: nenhuma geração de recorrência passa disto. */
const MAX_GENERATED_DAYS = 750;

export const isDateIso = (value: unknown): value is string =>
  typeof value === "string" && ISO_RE.test(value);

const pad = (n: number): string => String(n).padStart(2, "0");

/** 'yyyy-MM-dd' → epoch UTC. `NaN` para entrada inválida ou data que não existe. */
function toUtc(iso: string): number {
  if (!isDateIso(iso)) return Number.NaN;
  const [y, m, d] = iso.split("-").map(Number);
  const stamp = Date.UTC(y, m - 1, d);
  // 31/02 vira 03/03 em `Date.UTC`: se o mês não voltar igual, a data não existe.
  return new Date(stamp).getUTCMonth() === m - 1 ? stamp : Number.NaN;
}

function fromUtc(stamp: number): string {
  const date = new Date(stamp);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Dia da semana (0 = domingo). `-1` quando a data é inválida. */
export function weekdayOf(iso: string): number {
  const stamp = toUtc(iso);
  return Number.isNaN(stamp) ? -1 : new Date(stamp).getUTCDay();
}

export function addDaysIso(iso: string, days: number): string {
  const stamp = toUtc(iso);
  return Number.isNaN(stamp) ? iso : fromUtc(stamp + days * DAY_MS);
}

/** Dias inteiros de `from` até `to` (positivo quando `to` vem depois). */
export function diffDaysIso(from: string, to: string): number {
  const a = toUtc(from);
  const b = toUtc(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

/**
 * Início da semana que contém `iso`.
 * @param weekStartsOn 0 = domingo … 6 = sábado. O módulo usa segunda (1) por padrão.
 */
export function startOfWeekIso(iso: string, weekStartsOn = 1): string {
  const weekday = weekdayOf(iso);
  if (weekday < 0) return iso;
  return addDaysIso(iso, -((weekday - weekStartsOn + 7) % 7));
}

/** Os 7 dias da semana que contém `iso`, do primeiro ao último. */
export function weekDaysIso(iso: string, weekStartsOn = 1): string[] {
  const start = startOfWeekIso(iso, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDaysIso(start, i));
}

export const startOfMonthIso = (iso: string): string =>
  isDateIso(iso) ? `${iso.slice(0, 7)}-01` : iso;

export function endOfMonthIso(iso: string): string {
  const stamp = toUtc(startOfMonthIso(iso));
  if (Number.isNaN(stamp)) return iso;
  const date = new Date(stamp);
  // Dia 0 do mês seguinte é o último deste — resolve 28/29/30/31 sem tabela nem exceção.
  return fromUtc(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/** Grade do mês: semanas completas, incluindo os dias vizinhos que fecham a primeira/última. */
export function monthGridIso(iso: string, weekStartsOn = 1): string[][] {
  const last = endOfMonthIso(iso);
  let cursor = startOfWeekIso(startOfMonthIso(iso), weekStartsOn);

  const weeks: string[][] = [];
  // Nenhum mês do calendário gregoriano precisa de mais de 6 semanas.
  for (let i = 0; i < 6; i += 1) {
    weeks.push(Array.from({ length: 7 }, (_, d) => addDaysIso(cursor, d)));
    cursor = addDaysIso(cursor, 7);
    if (cursor > last) break;
  }
  return weeks;
}

/** Todos os dias de [from, to], inclusive. Vazio quando o intervalo é inválido. */
export function eachDayIso(from: string, to: string): string[] {
  const total = diffDaysIso(from, to);
  if (!isDateIso(from) || !isDateIso(to) || total < 0) return [];
  return Array.from({ length: Math.min(total + 1, MAX_GENERATED_DAYS) }, (_, i) =>
    addDaysIso(from, i),
  );
}

/* ───────────────────────────── Status derivado ───────────────────────────── */

/** O mínimo que uma linha planejada precisa ter para o status ser derivado. */
export type DerivableEntry = {
  scheduledDate: string;
  status: ScheduleStatus;
};

/**
 * O status APRESENTADO de um dia planejado.
 *
 * Um desfecho gravado (concluído, não realizado, reagendado, cancelado) sempre vence: um
 * treino que o usuário marcou como não realizado ontem **não** é "atrasado" — já tem resposta.
 * Só quem continua `planejado` pode virar `atrasado` (data passou) ou `hoje`.
 *
 * @param hoje 'yyyy-MM-dd' INJETADO. Esta função nunca chama `Date.now()`.
 */
export function derivePlannedStatus(entry: DerivableEntry, hoje: string): DerivedScheduleStatus {
  if (entry.status !== "planejado") return entry.status;
  if (!isDateIso(entry.scheduledDate) || !isDateIso(hoje)) return "planejado";

  // Comparação de TEXTO: 'yyyy-MM-dd' é ordenável lexicograficamente e imune a fuso.
  if (entry.scheduledDate < hoje) return "atrasado";
  if (entry.scheduledDate === hoje) return "hoje";
  return "planejado";
}

/** O dia planejado ainda espera uma decisão do usuário? */
export const isOpenEntry = (entry: DerivableEntry, hoje: string): boolean => {
  const derived = derivePlannedStatus(entry, hoje);
  return derived === "planejado" || derived === "hoje" || derived === "atrasado";
};

/* ───────────────────────────── Semana de planejamento ───────────────────────────── */

export type ScheduleDay<T extends DerivableEntry> = {
  date: string;
  weekday: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  entries: T[];
  /** Nenhum treino nem marcação de descanso neste dia. */
  isEmpty: boolean;
  hasRest: boolean;
};

export type ScheduleWeek<T extends DerivableEntry> = {
  startDate: string;
  endDate: string;
  days: ScheduleDay<T>[];
  counts: ScheduleCounts;
};

export type ScheduleCounts = {
  planejado: number;
  hoje: number;
  atrasado: number;
  concluido: number;
  nao_realizado: number;
  reagendado: number;
  cancelado: number;
  descanso: number;
  total: number;
};

const emptyCounts = (): ScheduleCounts => ({
  planejado: 0,
  hoje: 0,
  atrasado: 0,
  concluido: 0,
  nao_realizado: 0,
  reagendado: 0,
  cancelado: 0,
  descanso: 0,
  total: 0,
});

export function countByDerivedStatus<T extends DerivableEntry & { entryKind?: string }>(
  entries: T[],
  hoje: string,
): ScheduleCounts {
  const counts = emptyCounts();
  for (const entry of entries) {
    counts.total += 1;
    if (entry.entryKind === "descanso") {
      counts.descanso += 1;
      continue;
    }
    counts[derivePlannedStatus(entry, hoje)] += 1;
  }
  return counts;
}

/** Agrupa as linhas por dia, na ordem do calendário. Dias sem nada continuam existindo. */
export function buildScheduleWeek<T extends DerivableEntry & { entryKind?: string; position?: number }>(
  entries: T[],
  reference: string,
  hoje: string,
  weekStartsOn = 1,
): ScheduleWeek<T> {
  const days = weekDaysIso(reference, weekStartsOn);
  const byDate = groupByDate(entries);

  const built = days.map<ScheduleDay<T>>((date) => {
    const dayEntries = byDate.get(date) ?? [];
    return {
      date,
      weekday: weekdayOf(date),
      isToday: date === hoje,
      isPast: date < hoje,
      isFuture: date > hoje,
      entries: dayEntries,
      isEmpty: dayEntries.length === 0,
      hasRest: dayEntries.some((entry) => entry.entryKind === "descanso"),
    };
  });

  return {
    startDate: days[0],
    endDate: days[days.length - 1],
    days: built,
    counts: countByDerivedStatus(built.flatMap((day) => day.entries), hoje),
  };
}

/** Índice por data, com as linhas de cada dia já ordenadas por posição e horário. */
export function groupByDate<T extends { scheduledDate: string; position?: number; plannedTime?: string | null }>(
  entries: T[],
): Map<string, T[]> {
  const byDate = new Map<string, T[]>();
  for (const entry of entries) {
    const list = byDate.get(entry.scheduledDate) ?? [];
    list.push(entry);
    byDate.set(entry.scheduledDate, list);
  }
  for (const list of byDate.values()) {
    list.sort(
      (a, b) =>
        (a.position ?? 0) - (b.position ?? 0) ||
        (a.plannedTime ?? "99:99").localeCompare(b.plannedTime ?? "99:99"),
    );
  }
  return byDate;
}

/* ───────────────────────────── Recorrência / geração ─────────────────────────────
 * A recorrência do planejamento de treino é simples de propósito: dias da semana, ciclo de N
 * semanas e rodízio de treinos (A/B/C). Padrões de calendário complexos (n-ésima terça do mês,
 * último dia útil) existem no TO-DO porque compromisso precisa disso; treino não.
 */

export type ScheduleGenerationInput = {
  /** Intervalo fechado, em data pura. */
  from: string;
  to: string;
  /** Dias de treino da semana (0 = domingo … 6 = sábado). Vazio = nada é gerado. */
  weekdays: number[];
  /**
   * Treinos na ordem do RODÍZIO. Um id só = sempre o mesmo treino. Três ids = A/B/C, que
   * avança A CADA DIA DE TREINO (e não a cada dia do calendário) — é o que faz o rodízio
   * continuar certo depois de uma semana com um dia a menos.
   */
  workoutIds: string[];
  /** 1 = toda semana; 2 = a cada duas semanas; e assim por diante. */
  weekInterval?: number;
  /** Âncora do ciclo de semanas. Sem ela, ancora em `from`. */
  anchorDate?: string;
  weekStartsOn?: number;
  /** Marcar como descanso os dias que não são de treino. */
  includeRestDays?: boolean;
  plannedTime?: string | null;
  /** Posição no rodízio em que a geração começa (retomar um ciclo já em andamento). */
  rotationOffset?: number;
};

export type GeneratedScheduleEntry = {
  scheduledDate: string;
  workoutId: string | null;
  entryKind: "treino" | "descanso";
  plannedTime: string | null;
  position: number;
};

/**
 * Gera os dias planejados de um intervalo. Função pura: devolve o que DEVE existir, e quem
 * decide o que fazer com o que já existe é a action (que nunca sobrescreve em silêncio).
 */
export function generateScheduleEntries(
  input: ScheduleGenerationInput,
): GeneratedScheduleEntry[] {
  const weekInterval = Math.max(1, Math.trunc(input.weekInterval ?? 1));
  const weekStartsOn = input.weekStartsOn ?? 1;
  const weekdays = [...new Set(input.weekdays)].filter((day) => day >= 0 && day <= 6).sort();
  const workoutIds = input.workoutIds.filter(Boolean);

  if (weekdays.length === 0) return [];

  const days = eachDayIso(input.from, input.to);
  if (days.length === 0) return [];

  const anchorWeek = startOfWeekIso(
    isDateIso(input.anchorDate ?? "") ? (input.anchorDate as string) : input.from,
    weekStartsOn,
  );

  const entries: GeneratedScheduleEntry[] = [];
  let rotation = Math.max(0, Math.trunc(input.rotationOffset ?? 0));

  for (const date of days) {
    const weekOffset = Math.floor(diffDaysIso(anchorWeek, startOfWeekIso(date, weekStartsOn)) / 7);
    // Semana fora do ciclo: nem treino, nem descanso — o ciclo simplesmente não alcança o dia.
    const inCycle = ((weekOffset % weekInterval) + weekInterval) % weekInterval === 0;
    const isTrainingDay = inCycle && weekdays.includes(weekdayOf(date));

    if (isTrainingDay) {
      entries.push({
        scheduledDate: date,
        workoutId: workoutIds.length > 0 ? workoutIds[rotation % workoutIds.length] : null,
        entryKind: "treino",
        plannedTime: input.plannedTime ?? null,
        position: 0,
      });
      rotation += 1;
      continue;
    }

    if (input.includeRestDays && inCycle) {
      entries.push({
        scheduledDate: date,
        workoutId: null,
        entryKind: "descanso",
        plannedTime: null,
        position: 0,
      });
    }
  }

  return entries;
}

/* ───────────────────────────── Duplicar semana ───────────────────────────── */

export type DuplicableEntry = {
  scheduledDate: string;
  workoutId: string | null;
  entryKind: "treino" | "descanso";
  plannedTime?: string | null;
  plannedDurationMinutes?: number | null;
  programId?: string | null;
  title?: string | null;
  notes?: string | null;
  position?: number;
};

export type DuplicatedEntry = GeneratedScheduleEntry & {
  plannedDurationMinutes: number | null;
  programId: string | null;
  title: string | null;
  notes: string | null;
};

/**
 * Duplica uma semana inteira para outra.
 *
 * O que **não** é copiado, de propósito: status, justificativa, `original_date` e motivo de
 * reagendamento. Copiar isso faria a cópia nascer dizendo que já foi concluída (ou que foi
 * remarcada) — a nova semana é intenção nova, e nasce toda como `planejado`.
 */
export function duplicateWeek(
  entries: DuplicableEntry[],
  fromWeekStart: string,
  toWeekStart: string,
  weekStartsOn = 1,
): DuplicatedEntry[] {
  const source = startOfWeekIso(fromWeekStart, weekStartsOn);
  const target = startOfWeekIso(toWeekStart, weekStartsOn);
  const shift = diffDaysIso(source, target);
  if (shift === 0) return [];

  const week = new Set(weekDaysIso(source, weekStartsOn));

  return entries
    .filter((entry) => week.has(entry.scheduledDate))
    .map((entry) => ({
      scheduledDate: addDaysIso(entry.scheduledDate, shift),
      workoutId: entry.workoutId,
      entryKind: entry.entryKind,
      plannedTime: entry.plannedTime ?? null,
      plannedDurationMinutes: entry.plannedDurationMinutes ?? null,
      programId: entry.programId ?? null,
      title: entry.title ?? null,
      notes: entry.notes ?? null,
      position: entry.position ?? 0,
    }));
}

/* ───────────────────────────── Reagendar ───────────────────────────── */

export type ReschedulePatch = {
  scheduledDate: string;
  originalDate: string;
  rescheduleReason: string | null;
  status: ScheduleStatus;
};

/**
 * Move um dia planejado preservando o planejamento ORIGINAL.
 *
 * `originalDate` guarda a PRIMEIRA data — não a anterior. Mover o treino de segunda para
 * terça e depois para quarta continua dizendo "isto era de segunda", que é a informação que o
 * usuário quer ao olhar para trás. Sobrescrever a cada movimento apagaria justamente isso.
 *
 * O status volta a `planejado`: um treino remarcado continua pendente, e não fica preso num
 * desfecho antigo.
 */
export function rescheduleEntry(
  entry: { scheduledDate: string; originalDate: string | null },
  newDate: string,
  reason: string | null = null,
): ReschedulePatch | null {
  if (!isDateIso(newDate) || newDate === entry.scheduledDate) return null;
  return {
    scheduledDate: newDate,
    originalDate: entry.originalDate ?? entry.scheduledDate,
    rescheduleReason: reason?.trim() || null,
    status: "planejado",
  };
}

/* ───────────────────────────── Próximo treino / treino de hoje ───────────────────────────── */

export type UpcomingEntry<T extends DerivableEntry> = {
  entry: T;
  daysAhead: number;
};

/** As linhas de hoje que ainda esperam decisão, na ordem do dia. */
export function entriesForDay<T extends DerivableEntry & { position?: number; plannedTime?: string | null }>(
  entries: T[],
  date: string,
): T[] {
  return (groupByDate(entries).get(date) ?? []) as T[];
}

/**
 * O próximo dia planejado a partir de `hoje` (exclusive), ignorando cancelados e o que já teve
 * desfecho. Devolve `null` quando não há nada à frente — e a UI diz isso em vez de inventar.
 */
export function nextScheduledEntry<T extends DerivableEntry & { entryKind?: string; plannedTime?: string | null; position?: number }>(
  entries: T[],
  hoje: string,
): UpcomingEntry<T> | null {
  const upcoming = entries
    .filter((entry) => entry.entryKind !== "descanso")
    .filter((entry) => entry.status === "planejado" && entry.scheduledDate > hoje)
    .sort(
      (a, b) =>
        a.scheduledDate.localeCompare(b.scheduledDate) ||
        (a.plannedTime ?? "99:99").localeCompare(b.plannedTime ?? "99:99") ||
        (a.position ?? 0) - (b.position ?? 0),
    );

  const first = upcoming[0];
  return first ? { entry: first, daysAhead: diffDaysIso(hoje, first.scheduledDate) } : null;
}

/** Dias planejados que já passaram e continuam sem desfecho. */
export function overdueEntries<T extends DerivableEntry & { entryKind?: string }>(
  entries: T[],
  hoje: string,
): T[] {
  return entries
    .filter((entry) => entry.entryKind !== "descanso")
    .filter((entry) => derivePlannedStatus(entry, hoje) === "atrasado")
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
}

/* ───────────────────────────── Aderência ─────────────────────────────
 * Só o PASSADO entra na conta: contar os dias que ainda nem chegaram como "não feitos" faria
 * toda semana começar com aderência baixa e terminar subindo — um número sem significado.
 */

export type AdherenceSummary = {
  /** Dias de treino planejados até `hoje`, inclusive. */
  due: number;
  done: number;
  missed: number;
  /** Ainda esperando decisão (hoje, ou atrasados). */
  open: number;
  /** `null` quando não havia nada planejado no período — e não 0%. */
  rate: number | null;
};

export function summarizeAdherence<T extends DerivableEntry & { entryKind?: string }>(
  entries: T[],
  hoje: string,
): AdherenceSummary {
  let due = 0;
  let done = 0;
  let missed = 0;
  let open = 0;

  for (const entry of entries) {
    if (entry.entryKind === "descanso") continue;
    if (entry.status === "cancelado" || entry.status === "reagendado") continue;
    if (entry.scheduledDate > hoje) continue;

    due += 1;
    if (entry.status === "concluido") done += 1;
    else if (entry.status === "nao_realizado") missed += 1;
    else open += 1;
  }

  return { due, done, missed, open, rate: due === 0 ? null : done / due };
}
