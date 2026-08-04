/**
 * Fase 16-B — Dieta e Alimentação · Aritmética de DATA PURA (PURO, sem I/O).
 *
 * Tudo aqui opera sobre `'yyyy-MM-dd'` — o formato da coluna `date`, que **não representa
 * instante nenhum**. Nenhuma função constrói `Date` a partir do fuso local: a conta é feita
 * em `Date.UTC`, o mesmo padrão de `src/lib/todo/recurrence.ts` (Fase 15), que o doc desta
 * subfase indica como referência de estilo.
 *
 * POR QUE ISSO IMPORTA AQUI: na Vercel o processo roda em UTC. `new Date('2026-08-03')`
 * seguido de `getDay()` responde certo em UTC e errado em BRT em parte do dia — e o diário
 * inteiro é indexado por dia. Usar `Date.UTC` nos dois lados elimina a assimetria: a data
 * entra como texto, é decomposta em números e volta como texto.
 *
 * Convenção de dia da semana: 0 = domingo … 6 = sábado, igual a `habits.weekdays` (Fase 10)
 * e a `Date.getUTCDay()`.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const isDateIso = (value: unknown): value is string =>
  typeof value === "string" && ISO_RE.test(value);

const pad = (n: number): string => String(n).padStart(2, "0");

/** 'yyyy-MM-dd' → epoch em UTC. `NaN` para entrada inválida. */
function toUtc(iso: string): number {
  if (!isDateIso(iso)) return Number.NaN;
  const [y, m, d] = iso.split("-").map(Number);
  const stamp = Date.UTC(y, m - 1, d);
  // Rejeita data que "transbordou" (31/02 vira 03/03): o mês precisa voltar igual.
  return new Date(stamp).getUTCMonth() === m - 1 ? stamp : Number.NaN;
}

/** epoch UTC → 'yyyy-MM-dd'. */
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
  if (Number.isNaN(stamp)) return iso;
  return fromUtc(stamp + days * DAY_MS);
}

/** Dias inteiros de `from` até `to` (positivo quando `to` é depois). */
export function diffDaysIso(from: string, to: string): number {
  const a = toUtc(from);
  const b = toUtc(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / DAY_MS);
}

/**
 * Comparação de datas puras. Como o formato é ordenável lexicograficamente, comparar TEXTO é
 * exato e imune a fuso — nunca converta para `Date` só para comparar dias.
 */
export const isBefore = (a: string, b: string): boolean => a < b;
export const isAfter = (a: string, b: string): boolean => a > b;

/** A data está dentro de [start, end]? `end` nulo = intervalo em aberto. */
export function isWithin(date: string, start: string, end: string | null): boolean {
  if (date < start) return false;
  if (end !== null && date > end) return false;
  return true;
}

/**
 * Início da semana que contém `iso`.
 * @param weekStartDay 0 = domingo … 6 = sábado. O app usa segunda (1) por padrão.
 */
export function startOfWeekIso(iso: string, weekStartDay = 1): string {
  const weekday = weekdayOf(iso);
  if (weekday < 0) return iso;
  const back = (weekday - weekStartDay + 7) % 7;
  return addDaysIso(iso, -back);
}

/** Os 7 dias da semana que contém `iso`, do primeiro ao último. */
export function weekDays(iso: string, weekStartDay = 1): string[] {
  const start = startOfWeekIso(iso, weekStartDay);
  return Array.from({ length: 7 }, (_, i) => addDaysIso(start, i));
}

export function startOfMonthIso(iso: string): string {
  return isDateIso(iso) ? `${iso.slice(0, 7)}-01` : iso;
}

export function endOfMonthIso(iso: string): string {
  const stamp = toUtc(startOfMonthIso(iso));
  if (Number.isNaN(stamp)) return iso;
  const date = new Date(stamp);
  // Dia 0 do mês seguinte é o último dia deste — trata 28/29/30/31 sem tabela.
  return fromUtc(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

/**
 * Grade de um mês para o calendário: semanas completas cobrindo o mês inteiro, incluindo os
 * dias vizinhos que completam a primeira e a última semana.
 */
export function monthGrid(iso: string, weekStartDay = 1): string[][] {
  const first = startOfMonthIso(iso);
  const last = endOfMonthIso(iso);
  const start = startOfWeekIso(first, weekStartDay);

  const weeks: string[][] = [];
  let cursor = start;
  // Máximo de 6 semanas: nenhum mês do calendário gregoriano precisa de mais.
  for (let i = 0; i < 6; i += 1) {
    const week = Array.from({ length: 7 }, (_, d) => addDaysIso(cursor, d));
    weeks.push(week);
    cursor = addDaysIso(cursor, 7);
    if (cursor > last) break;
  }
  return weeks;
}

/**
 * Primeiro e último dia da GRADE do mês — o intervalo que `monthGrid` cobre, incluindo os
 * dias vizinhos que completam a primeira e a última semana.
 *
 * Existe (16-E) para o servidor ler exatamente o que o calendário vai desenhar: buscar só o
 * mês deixaria as células da borda em branco, e branco no calendário significa "não houve
 * registro" — uma afirmação falsa sobre um dia que simplesmente não foi consultado.
 */
export function monthGridRange(iso: string, weekStartDay = 1): [string, string] {
  const grid = monthGrid(iso, weekStartDay);
  const first = grid[0]?.[0] ?? startOfMonthIso(iso);
  const lastWeek = grid[grid.length - 1];
  const last = lastWeek?.[lastWeek.length - 1] ?? endOfMonthIso(iso);
  return [first, last];
}

/** Todos os dias de [from, to], inclusive. Vazio quando o intervalo é inválido. */
export function eachDayIso(from: string, to: string): string[] {
  const total = diffDaysIso(from, to);
  if (!isDateIso(from) || !isDateIso(to) || total < 0) return [];
  return Array.from({ length: total + 1 }, (_, i) => addDaysIso(from, i));
}

/* ───────────────────────────── Horário ─────────────────────────────
 * `time` do Postgres chega como 'HH:mm:ss'. Estas funções tratam hora como MINUTOS DO DIA:
 * um número, sem fuso e sem `Date` — comparar horários não deveria exigir um calendário.
 */

const TIME_RE = /^(\d{1,2}):(\d{2})/;

/** 'HH:mm[:ss]' → minutos desde a meia-noite. `null` quando não há hora válida. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = TIME_RE.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** minutos → 'HH:mm'. */
export function minutesToTime(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** 'HH:mm:ss' → 'HH:mm' (o que a UI mostra). String vazia quando não há hora. */
export function shortTime(time: string | null | undefined): string {
  const minutes = timeToMinutes(time);
  return minutes === null ? "" : minutesToTime(minutes);
}

/* ───────────────────────────── Rótulos ───────────────────────────── */

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** "3 de agosto de 2026". Formata a partir do TEXTO — nenhuma conversão de fuso acontece. */
export function longDateLabel(iso: string): string {
  if (!isDateIso(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** "agosto de 2026". */
export function monthLabel(iso: string): string {
  if (!isDateIso(iso)) return "";
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

/** "03/08". */
export function shortDateLabel(iso: string): string {
  if (!isDateIso(iso)) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/**
 * "Hoje" / "Ontem" / "Amanhã" quando aplicável; senão a data por extenso.
 * `hoje` é INJETADO — nenhuma função deste módulo chama `Date.now()`.
 */
export function relativeDayLabel(iso: string, hoje: string): string {
  const diff = diffDaysIso(hoje, iso);
  if (diff === 0) return "Hoje";
  if (diff === -1) return "Ontem";
  if (diff === 1) return "Amanhã";
  return longDateLabel(iso);
}
