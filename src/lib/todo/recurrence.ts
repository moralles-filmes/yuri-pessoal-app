/**
 * Fase 15 — Módulo TO-DO · Recorrência (lógica PURA, testada em recurrence.test.ts).
 *
 * SEM efeitos colaterais: `Date.now()` NUNCA é usado — toda data entra como parâmetro.
 * Toda aritmética roda em **UTC** internamente (`Date.UTC`) e entra/sai como string
 * `'yyyy-MM-dd'`. Isso elimina de raiz o bug de "virar o dia" que aparece quando o
 * processo roda em UTC (Vercel) e o usuário está em BRT — o mesmo cuidado que o resto
 * do sistema toma com `hojeISO()`.
 *
 * DOIS MODOS (o usuário escolhe por tarefa):
 *  • 'fixo'           — a próxima data é ancorada no CALENDÁRIO. "Toda segunda" continua
 *                       caindo na segunda, mesmo que a conclusão tenha sido na terça.
 *  • 'apos_conclusao' — a próxima data é contada A PARTIR DA CONCLUSÃO. "A cada 7 dias
 *                       após concluir": concluiu dia 10 → próxima vence dia 17.
 *
 * No modo 'apos_conclusao' os padrões de calendário (dia do mês, n-ésima semana,
 * primeiro/último dia útil) NÃO se aplicam — usa-se o passo simples
 * `frequência × intervalo` a partir da data de conclusão. Manter os dois ao mesmo tempo
 * seria contraditório ("toda segunda contada a partir da conclusão" não tem resposta
 * única). A regra `apenas_dias_uteis`, essa sim, continua valendo nos dois modos.
 *
 * FERIADOS não são considerados: o sistema não tem calendário de feriados. "Dia útil"
 * aqui significa segunda a sexta.
 */
import type {
  TodoBusinessDayRule,
  TodoFrequency,
  TodoRecurrenceMode,
} from "@/lib/todo/constants";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
/** Trava de segurança: nenhuma busca de próxima data itera mais que isso. */
const MAX_STEPS = 400;

/* ───────────────────────────── Tipo da regra ───────────────────────────── */

export interface TodoRecurrenceRule {
  frequency: TodoFrequency;
  /** A cada N unidades da frequência (>= 1). */
  intervalCount: number;
  /** 0=domingo … 6=sábado. Usado em 'semanal' e, com `weekOfMonth`, em 'mensal'. */
  daysOfWeek?: number[] | null;
  /** 1..31 no mês; **-1 = último dia do mês**. */
  dayOfMonth?: number | null;
  /** 1..12 (apenas 'anual'). */
  monthOfYear?: number | null;
  /** 1..4 = 1ª..4ª ocorrência do dia da semana no mês; **-1 = última**. */
  weekOfMonth?: number | null;
  businessDayRule?: TodoBusinessDayRule | null;
  mode: TodoRecurrenceMode;
  /** 'yyyy-MM-dd' — âncora do ciclo de intervalo. Sem ela, ancora na data de origem. */
  startsOn?: string | null;
  /** 'yyyy-MM-dd' inclusivo. Depois disso a série encerra. */
  endsOn?: string | null;
  /** Limite de ocorrências geradas. */
  maxOccurrences?: number | null;
  /** Quantas já foram geradas (contador persistido). */
  occurrencesCreated?: number;
  isPaused?: boolean;
}

/* ───────────────────────────── Helpers de data (puros, UTC) ───────────────────────────── */

type Ymd = { y: number; m: number; d: number };

function parseIso(iso: string): Ymd | null {
  if (typeof iso !== "string" || !ISO_RE.test(iso)) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Rejeita datas impossíveis (ex.: 2026-02-30).
  if (d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function toIso({ y, m, d }: Ymd): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** Ano bissexto: divisível por 4, exceto séculos não divisíveis por 400. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Nº de dias do mês (1..12). Trata fevereiro em ano bissexto. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function toEpochDay(ymd: Ymd): number {
  return Date.UTC(ymd.y, ymd.m - 1, ymd.d) / DAY_MS;
}

function fromEpochDay(epochDay: number): Ymd {
  const dt = new Date(epochDay * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** 0=domingo … 6=sábado, calculado em UTC (imune ao fuso do processo). */
export function weekdayOf(iso: string): number {
  const ymd = parseIso(iso);
  if (!ymd) return -1;
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay();
}

/** Soma dias a uma data 'yyyy-MM-dd'. */
export function addDaysIso(iso: string, days: number): string {
  const ymd = parseIso(iso);
  if (!ymd) return iso;
  return toIso(fromEpochDay(toEpochDay(ymd) + days));
}

/** Diferença em dias inteiros (b − a). */
export function diffDaysIso(aIso: string, bIso: string): number {
  const a = parseIso(aIso);
  const b = parseIso(bIso);
  if (!a || !b) return 0;
  return toEpochDay(b) - toEpochDay(a);
}

/** Segunda a sexta. Feriados não são considerados. */
export function isBusinessDay(iso: string): boolean {
  const dow = weekdayOf(iso);
  return dow >= 1 && dow <= 5;
}

/** Primeiro dia útil do mês. */
export function firstBusinessDayOfMonth(year: number, month: number): string {
  for (let d = 1; d <= 7; d++) {
    const iso = toIso({ y: year, m: month, d });
    if (isBusinessDay(iso)) return iso;
  }
  return toIso({ y: year, m: month, d: 1 });
}

/** Último dia útil do mês. */
export function lastBusinessDayOfMonth(year: number, month: number): string {
  const last = daysInMonth(year, month);
  for (let d = last; d >= last - 6; d--) {
    const iso = toIso({ y: year, m: month, d });
    if (isBusinessDay(iso)) return iso;
  }
  return toIso({ y: year, m: month, d: last });
}

/**
 * N-ésima ocorrência de um dia da semana no mês. `nth` 1..4, ou **-1 para a última**.
 * Se o mês não tiver a 5ª ocorrência pedida, devolve null (o chamador pula o mês).
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number,
): string | null {
  const total = daysInMonth(year, month);
  const hits: string[] = [];
  for (let d = 1; d <= total; d++) {
    const iso = toIso({ y: year, m: month, d });
    if (weekdayOf(iso) === weekday) hits.push(iso);
  }
  if (hits.length === 0) return null;
  if (nth === -1) return hits[hits.length - 1];
  return hits[nth - 1] ?? null;
}

/** Soma meses preservando o dia quando possível (clamp em meses curtos). */
function addMonthsClamped(ymd: Ymd, months: number, targetDay?: number): Ymd {
  const totalMonths = ymd.y * 12 + (ymd.m - 1) + months;
  const y = Math.floor(totalMonths / 12);
  const m = (totalMonths % 12) + 1;
  const wanted = targetDay ?? ymd.d;
  const d = Math.min(wanted, daysInMonth(y, m));
  return { y, m, d };
}

/** Diferença em meses inteiros (b − a). */
function diffMonths(a: Ymd, b: Ymd): number {
  return (b.y - a.y) * 12 + (b.m - a.m);
}

/* ───────────────────────────── Normalização ───────────────────────────── */

/** Normaliza uma regra crua (banco/form) — ou null se inválida. Nunca lança. */
export function normalizeRule(raw: unknown): TodoRecurrenceRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const frequency = r.frequency;
  if (
    frequency !== "diaria" &&
    frequency !== "semanal" &&
    frequency !== "mensal" &&
    frequency !== "anual"
  ) {
    return null;
  }

  const intervalCount = Math.max(1, Math.floor(Number(r.intervalCount) || 1));

  let daysOfWeek: number[] | null = null;
  if (Array.isArray(r.daysOfWeek)) {
    const clean = Array.from(
      new Set(
        r.daysOfWeek
          .map((d) => Math.floor(Number(d)))
          .filter((d) => Number.isFinite(d) && d >= 0 && d <= 6),
      ),
    ).sort((a, b) => a - b);
    daysOfWeek = clean.length ? clean : null;
  }

  const rawDom = Math.floor(Number(r.dayOfMonth));
  const dayOfMonth =
    Number.isFinite(rawDom) && (rawDom === -1 || (rawDom >= 1 && rawDom <= 31))
      ? rawDom
      : null;

  const rawMoy = Math.floor(Number(r.monthOfYear));
  const monthOfYear =
    Number.isFinite(rawMoy) && rawMoy >= 1 && rawMoy <= 12 ? rawMoy : null;

  const rawWom = Math.floor(Number(r.weekOfMonth));
  const weekOfMonth =
    Number.isFinite(rawWom) && (rawWom === -1 || (rawWom >= 1 && rawWom <= 4))
      ? rawWom
      : null;

  const bdr = r.businessDayRule;
  const businessDayRule =
    bdr === "primeiro_dia_util" || bdr === "ultimo_dia_util" || bdr === "apenas_dias_uteis"
      ? bdr
      : null;

  const mode: TodoRecurrenceMode = r.mode === "apos_conclusao" ? "apos_conclusao" : "fixo";

  const isoOrNull = (v: unknown) =>
    typeof v === "string" && ISO_RE.test(v) && parseIso(v) ? v : null;

  const rawMax = Math.floor(Number(r.maxOccurrences));
  const maxOccurrences = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : null;

  const rawCreated = Math.floor(Number(r.occurrencesCreated));

  return {
    frequency,
    intervalCount,
    daysOfWeek,
    dayOfMonth,
    monthOfYear,
    weekOfMonth,
    businessDayRule,
    mode,
    startsOn: isoOrNull(r.startsOn),
    endsOn: isoOrNull(r.endsOn),
    maxOccurrences,
    occurrencesCreated: Number.isFinite(rawCreated) && rawCreated > 0 ? rawCreated : 0,
    isPaused: r.isPaused === true,
  };
}

/* ───────────────────────────── Cálculo da próxima data ───────────────────────────── */

/** Empurra sáb/dom para a segunda-feira seguinte. Dias úteis passam intactos. */
function pushToBusinessDay(iso: string): string {
  let out = iso;
  let guard = 0;
  while (!isBusinessDay(out) && guard++ < 7) out = addDaysIso(out, 1);
  return out;
}

/** Passo simples da frequência (usado no modo 'apos_conclusao' e como fallback). */
function simpleStep(iso: string, frequency: TodoFrequency, units: number): string {
  const ymd = parseIso(iso);
  if (!ymd) return iso;
  switch (frequency) {
    case "diaria":
      return addDaysIso(iso, units);
    case "semanal":
      return addDaysIso(iso, units * 7);
    case "mensal":
      return toIso(addMonthsClamped(ymd, units));
    case "anual":
      return toIso(addMonthsClamped(ymd, units * 12));
  }
}

/** Semanal com dias específicos: varre dia a dia respeitando o ciclo de N semanas. */
function nextWeeklyOnDays(
  rule: TodoRecurrenceRule,
  fromIso: string,
  days: number[],
): string | null {
  const interval = rule.intervalCount;
  // Âncora do ciclo: o início da semana (domingo) de `startsOn`, ou da própria origem.
  const anchorIso = rule.startsOn ?? fromIso;
  const anchorWeekStart = addDaysIso(anchorIso, -weekdayOf(anchorIso));

  let candidate = addDaysIso(fromIso, 1);
  for (let i = 0; i < MAX_STEPS; i++) {
    if (days.includes(weekdayOf(candidate))) {
      if (interval === 1) return candidate;
      const candidateWeekStart = addDaysIso(candidate, -weekdayOf(candidate));
      const weeks = Math.round(diffDaysIso(anchorWeekStart, candidateWeekStart) / 7);
      // Só aceita semanas dentro do ciclo (e nunca antes da âncora).
      if (weeks >= 0 && weeks % interval === 0) return candidate;
    }
    candidate = addDaysIso(candidate, 1);
  }
  return null;
}

/**
 * Data candidata dentro de um mês específico, conforme o padrão mensal da regra.
 * Devolve null quando o padrão não existe naquele mês (ex.: 5ª segunda) — o chamador
 * então pula para o próximo mês do ciclo.
 */
function monthlyCandidate(
  rule: TodoRecurrenceRule,
  year: number,
  month: number,
  fallbackDay: number,
): string | null {
  // "Primeira segunda-feira do mês", "última sexta-feira do mês"…
  if (rule.weekOfMonth != null && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
    return nthWeekdayOfMonth(year, month, rule.daysOfWeek[0], rule.weekOfMonth);
  }
  if (rule.businessDayRule === "primeiro_dia_util") {
    return firstBusinessDayOfMonth(year, month);
  }
  if (rule.businessDayRule === "ultimo_dia_util") {
    return lastBusinessDayOfMonth(year, month);
  }
  // Último dia do mês (28/29/30/31 conforme o mês).
  if (rule.dayOfMonth === -1) {
    return toIso({ y: year, m: month, d: daysInMonth(year, month) });
  }
  // Dia fixo, com clamp em meses curtos (dia 31 → 28/29 em fevereiro).
  const wanted = rule.dayOfMonth ?? fallbackDay;
  return toIso({ y: year, m: month, d: Math.min(wanted, daysInMonth(year, month)) });
}

/** Mensal: itera pelos meses do ciclo até achar a primeira data > origem. */
function nextMonthly(rule: TodoRecurrenceRule, fromIso: string): string | null {
  const from = parseIso(fromIso);
  if (!from) return null;
  const interval = rule.intervalCount;
  const anchor = parseIso(rule.startsOn ?? fromIso) ?? from;

  // Alinha o ponto de partida ao ciclo da âncora (ex.: a cada 3 meses a partir de março).
  const monthsFromAnchor = diffMonths(anchor, from);
  const alignedSteps = Math.floor(monthsFromAnchor / interval) * interval;
  let cursor = addMonthsClamped(anchor, alignedSteps, 1);

  for (let i = 0; i < MAX_STEPS; i++) {
    const candidate = monthlyCandidate(rule, cursor.y, cursor.m, from.d);
    if (candidate && candidate > fromIso) return candidate;
    cursor = addMonthsClamped(cursor, interval, 1);
  }
  return null;
}

/** Anual: mês/dia fixos, avançando de `interval` em `interval` anos. */
function nextYearly(rule: TodoRecurrenceRule, fromIso: string): string | null {
  const from = parseIso(fromIso);
  if (!from) return null;
  const interval = rule.intervalCount;
  const anchor = parseIso(rule.startsOn ?? fromIso) ?? from;

  const month = rule.monthOfYear ?? anchor.m;
  const wantedDay = rule.dayOfMonth === -1 ? null : (rule.dayOfMonth ?? anchor.d);

  const yearsFromAnchor = from.y - anchor.y;
  const alignedSteps = Math.floor(yearsFromAnchor / interval) * interval;
  let year = anchor.y + alignedSteps;

  for (let i = 0; i < MAX_STEPS; i++) {
    // dayOfMonth === -1 → último dia do mês escolhido; senão clamp (29/02 → 28/02).
    const day =
      wantedDay === null
        ? daysInMonth(year, month)
        : Math.min(wantedDay, daysInMonth(year, month));
    const candidate = toIso({ y: year, m: month, d: day });
    if (candidate > fromIso) return candidate;
    year += interval;
  }
  return null;
}

/**
 * Próxima ocorrência ESTRITAMENTE após `fromIso` (exclusivo).
 *
 * `fromIso` é a data programada da ocorrência atual (modo 'fixo') ou a data de conclusão
 * (modo 'apos_conclusao'). Devolve 'yyyy-MM-dd', ou **null** quando a série encerrou
 * (passou de `endsOn`, bateu `maxOccurrences`, está pausada ou a regra é inválida).
 */
export function nextOccurrence(
  rule: TodoRecurrenceRule,
  fromIso: string,
): string | null {
  if (!parseIso(fromIso)) return null;
  if (rule.isPaused) return null;

  // Limite de ocorrências já atingido.
  if (
    rule.maxOccurrences != null &&
    (rule.occurrencesCreated ?? 0) >= rule.maxOccurrences
  ) {
    return null;
  }

  const interval = Math.max(1, Math.floor(rule.intervalCount || 1));
  let candidate: string | null;

  if (rule.mode === "apos_conclusao") {
    // Passo simples a partir da conclusão — padrões de calendário não se aplicam.
    candidate = simpleStep(fromIso, rule.frequency, interval);
  } else {
    switch (rule.frequency) {
      case "diaria":
        candidate = addDaysIso(fromIso, interval);
        break;
      case "semanal":
        candidate =
          rule.daysOfWeek && rule.daysOfWeek.length > 0
            ? nextWeeklyOnDays({ ...rule, intervalCount: interval }, fromIso, rule.daysOfWeek)
            : addDaysIso(fromIso, interval * 7);
        break;
      case "mensal":
        candidate = nextMonthly({ ...rule, intervalCount: interval }, fromIso);
        break;
      case "anual":
        candidate = nextYearly({ ...rule, intervalCount: interval }, fromIso);
        break;
    }
  }

  if (!candidate) return null;

  // "Somente em dias úteis": empurra sábado/domingo para a segunda seguinte.
  if (rule.businessDayRule === "apenas_dias_uteis") {
    candidate = pushToBusinessDay(candidate);
  }

  // Nunca antes do início da série.
  if (rule.startsOn && candidate < rule.startsOn) candidate = rule.startsOn;

  // Fim da série por data (inclusivo).
  if (rule.endsOn && candidate > rule.endsOn) return null;

  return candidate;
}

/**
 * Gera até `count` ocorrências a partir de `fromIso` (exclusivo). Usada para pré-visualizar
 * a recorrência no formulário ("as próximas datas serão…") e nas visões futuras.
 * Para quando a série encerra — nunca entra em laço infinito.
 */
export function previewOccurrences(
  rule: TodoRecurrenceRule,
  fromIso: string,
  count: number,
): string[] {
  const out: string[] = [];
  const limit = Math.max(0, Math.min(Math.floor(count) || 0, 50));
  let cursor = fromIso;
  let created = rule.occurrencesCreated ?? 0;

  for (let i = 0; i < limit; i++) {
    const next = nextOccurrence({ ...rule, occurrencesCreated: created }, cursor);
    if (!next || next === cursor) break;
    out.push(next);
    cursor = next;
    created += 1;
  }
  return out;
}

/* ───────────────────────────── Materialização ───────────────────────────── */

export interface TodoScheduleDates {
  /** 'yyyy-MM-dd' ou null. */
  scheduledDate: string | null;
  /** 'yyyy-MM-dd' ou null. */
  deadlineAt: string | null;
}

/**
 * Datas da próxima ocorrência de uma tarefa recorrente.
 *
 * Âncora na `scheduledDate` (ou, na falta, no `deadlineAt`) e desloca AMBAS as datas
 * pelo mesmo número de dias — preservando a folga entre "quando pretendo fazer" e
 * "prazo final". No modo 'apos_conclusao' a âncora é `completedOnIso`.
 *
 * Retorna null quando a série encerrou ou não há data-âncora (tarefa sem data não
 * recorre — não haveria de onde contar).
 */
export function materializeNext(
  rule: TodoRecurrenceRule,
  dates: TodoScheduleDates,
  completedOnIso?: string | null,
): TodoScheduleDates | null {
  const anchorIso = dates.scheduledDate ?? dates.deadlineAt;
  if (!anchorIso) return null;

  const fromIso =
    rule.mode === "apos_conclusao" ? (completedOnIso ?? anchorIso) : anchorIso;

  const nextIso = nextOccurrence(rule, fromIso);
  if (!nextIso) return null;

  // Deslocamento aplicado às duas datas (mantém a distância entre elas).
  const deltaDays = diffDaysIso(anchorIso, nextIso);
  const shift = (iso: string | null): string | null =>
    iso ? addDaysIso(iso, deltaDays) : null;

  return {
    scheduledDate: dates.scheduledDate ? nextIso : null,
    deadlineAt: shift(dates.deadlineAt),
  };
}

/**
 * A série acabou depois de gerar esta ocorrência? Usado para desligar a recorrência
 * (e não deixar a tarefa "presa" tentando gerar para sempre).
 */
export function isSeriesFinished(
  rule: TodoRecurrenceRule,
  lastGeneratedIso: string,
): boolean {
  const created = (rule.occurrencesCreated ?? 0) + 1;
  if (rule.maxOccurrences != null && created >= rule.maxOccurrences) return true;
  return nextOccurrence({ ...rule, occurrencesCreated: created }, lastGeneratedIso) === null;
}

/* ───────────────────────────── Descrição legível ───────────────────────────── */

const ORDINALS: Record<number, string> = {
  1: "primeira",
  2: "segunda",
  3: "terceira",
  4: "quarta",
  [-1]: "última",
};

const WEEKDAY_NAMES: Record<number, string> = {
  0: "domingo",
  1: "segunda-feira",
  2: "terça-feira",
  3: "quarta-feira",
  4: "quinta-feira",
  5: "sexta-feira",
  6: "sábado",
};

const MONTH_NAMES: Record<number, string> = {
  1: "janeiro",
  2: "fevereiro",
  3: "março",
  4: "abril",
  5: "maio",
  6: "junho",
  7: "julho",
  8: "agosto",
  9: "setembro",
  10: "outubro",
  11: "novembro",
  12: "dezembro",
};

/** Data 'yyyy-MM-dd' → 'dd/MM/yyyy' (sem depender de Intl/fuso). */
function brDate(iso: string): string {
  const ymd = parseIso(iso);
  return ymd ? `${pad(ymd.d)}/${pad(ymd.m)}/${pad(ymd.y, 4)}` : iso;
}

/**
 * Descrição em pt-BR da regra ("Toda segunda e quarta-feira", "Todo último dia do mês").
 * Usada no formulário e no chip de recorrência do card — o usuário SEMPRE vê em texto
 * o que foi configurado, nunca só um ícone.
 */
export function describeRule(rule: TodoRecurrenceRule): string {
  const n = Math.max(1, Math.floor(rule.intervalCount || 1));
  const parts: string[] = [];

  if (rule.businessDayRule === "primeiro_dia_util") {
    parts.push(n === 1 ? "Todo primeiro dia útil do mês" : `A cada ${n} meses, no primeiro dia útil`);
  } else if (rule.businessDayRule === "ultimo_dia_util") {
    parts.push(n === 1 ? "Todo último dia útil do mês" : `A cada ${n} meses, no último dia útil`);
  } else {
    switch (rule.frequency) {
      case "diaria":
        parts.push(n === 1 ? "Todos os dias" : `A cada ${n} dias`);
        break;
      case "semanal": {
        if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
          const nomes = rule.daysOfWeek.map((d) => WEEKDAY_NAMES[d] ?? "?");
          const lista =
            nomes.length === 1
              ? nomes[0]
              : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
          parts.push(n === 1 ? `Toda ${lista}` : `A cada ${n} semanas, ${lista}`);
        } else {
          parts.push(n === 1 ? "Toda semana" : `A cada ${n} semanas`);
        }
        break;
      }
      case "mensal": {
        if (rule.weekOfMonth != null && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
          const ord = ORDINALS[rule.weekOfMonth] ?? "primeira";
          const dia = WEEKDAY_NAMES[rule.daysOfWeek[0]] ?? "?";
          parts.push(
            n === 1
              ? `Toda ${ord} ${dia} do mês`
              : `A cada ${n} meses, na ${ord} ${dia}`,
          );
        } else if (rule.dayOfMonth === -1) {
          parts.push(n === 1 ? "Todo último dia do mês" : `A cada ${n} meses, no último dia`);
        } else if (rule.dayOfMonth != null) {
          parts.push(
            n === 1
              ? `Todo dia ${rule.dayOfMonth} do mês`
              : `A cada ${n} meses, no dia ${rule.dayOfMonth}`,
          );
        } else {
          parts.push(n === 1 ? "Todo mês" : `A cada ${n} meses`);
        }
        break;
      }
      case "anual": {
        const mes = rule.monthOfYear ? MONTH_NAMES[rule.monthOfYear] : null;
        const dia = rule.dayOfMonth && rule.dayOfMonth > 0 ? rule.dayOfMonth : null;
        if (mes && dia) {
          parts.push(n === 1 ? `Todo ano em ${dia} de ${mes}` : `A cada ${n} anos em ${dia} de ${mes}`);
        } else {
          parts.push(n === 1 ? "Todo ano" : `A cada ${n} anos`);
        }
        break;
      }
    }
  }

  if (rule.businessDayRule === "apenas_dias_uteis") parts.push("somente em dias úteis");
  if (rule.mode === "apos_conclusao") parts.push("contando a partir da conclusão");
  if (rule.maxOccurrences != null) parts.push(`por ${rule.maxOccurrences} vezes`);
  if (rule.endsOn) parts.push(`até ${brDate(rule.endsOn)}`);
  if (rule.isPaused) parts.push("(pausada)");

  return parts.join(" · ");
}
