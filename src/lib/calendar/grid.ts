/**
 * Construção pura das grades do calendário (Fase 08): mês, semana e dia, mais o
 * posicionamento de eventos com horário (top/altura em %) e empacotamento de
 * sobreposições em colunas. SEM efeitos colaterais — `today`/datas são injetados.
 *
 * As funções operam em `Date` locais e usam date-fns; a semana começa no domingo
 * (padrão BR de calendário) salvo `weekStartsOn` explícito.
 */
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

export type WeekStart = 0 | 1; // 0 = domingo, 1 = segunda

export interface GridDay {
  date: Date;
  /** Pertence ao mês de referência (false = dia "vazante" de mês vizinho). */
  inMonth: boolean;
  isToday: boolean;
}

const MIN_PER_DAY = 24 * 60;

/** Grade do mês: matriz de semanas (cada uma com 7 dias), incluindo dias vazantes. */
export function buildMonthGrid(
  refDate: Date,
  opts: { today: Date; weekStartsOn?: WeekStart },
): { weeks: GridDay[][]; monthStart: Date } {
  const weekStartsOn = opts.weekStartsOn ?? 0;
  const monthStart = startOfMonth(refDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn });
  const gridEnd = endOfWeek(endOfMonth(refDate), { weekStartsOn });

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map(
    (date): GridDay => ({
      date,
      inMonth: date.getMonth() === monthStart.getMonth(),
      isToday: isSameDay(date, opts.today),
    }),
  );

  const weeks: GridDay[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return { weeks, monthStart };
}

/** Os 7 dias da semana que contém `refDate`. */
export function buildWeekDays(
  refDate: Date,
  opts: { today: Date; weekStartsOn?: WeekStart },
): GridDay[] {
  const weekStartsOn = opts.weekStartsOn ?? 0;
  const start = startOfWeek(refDate, { weekStartsOn });
  const end = endOfWeek(refDate, { weekStartsOn });
  return eachDayOfInterval({ start, end }).map((date) => ({
    date,
    inMonth: true,
    isToday: isSameDay(date, opts.today),
  }));
}

/** Lista de horas [startHour, endHour) para o eixo do tempo (ex.: 0..23). */
export function dayHours(startHour = 0, endHour = 24): number[] {
  const out: number[] = [];
  for (let h = startHour; h < endHour; h++) out.push(h);
  return out;
}

export interface PositionedEvent<T> {
  event: T;
  /** % a partir do topo (00:00) e altura em % do dia. */
  topPct: number;
  heightPct: number;
  /** Coluna ocupada e total de colunas no cluster de sobreposição. */
  col: number;
  colCount: number;
}

interface Span {
  startMin: number;
  endMin: number;
}

/** Minutos do evento dentro do dia de `day` (clampado a [0, 1440]). */
export function daySpan(
  event: { start: Date; end: Date },
  day: Date,
): Span | null {
  const dayStart = startOfDay(day).getTime();
  const dayEndExclusive = dayStart + MIN_PER_DAY * 60_000;
  const s = Math.max(event.start.getTime(), dayStart);
  const e = Math.min(event.end.getTime(), dayEndExclusive);
  if (e <= s) {
    // Evento de duração zero exatamente no início do dia ainda deve aparecer.
    if (event.start.getTime() === event.end.getTime() && s >= dayStart && s < dayEndExclusive) {
      const m = (s - dayStart) / 60_000;
      return { startMin: m, endMin: m };
    }
    return null;
  }
  return {
    startMin: (s - dayStart) / 60_000,
    endMin: (e - dayStart) / 60_000,
  };
}

/**
 * Empacota eventos com horário num dia em colunas, evitando que sobreposições se
 * cubram. Algoritmo guloso clássico por "clusters" de sobreposição mútua.
 * `minHeightMin` garante altura mínima clicável para eventos muito curtos.
 */
export function layoutDayEvents<T extends { start: Date; end: Date }>(
  events: T[],
  day: Date,
  opts: { minHeightMin?: number } = {},
): PositionedEvent<T>[] {
  const minHeight = opts.minHeightMin ?? 24;

  type Item = { event: T; span: Span; col: number };
  const items: Item[] = [];
  for (const event of events) {
    const span = daySpan(event, day);
    if (span) items.push({ event, span, col: -1 });
  }
  items.sort(
    (a, b) => a.span.startMin - b.span.startMin || a.span.endMin - b.span.endMin,
  );

  const result: PositionedEvent<T>[] = [];
  let cluster: Item[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // Atribui colunas gulosas dentro do cluster.
    const colEnds: number[] = []; // fim (min) do último evento em cada coluna
    for (const it of cluster) {
      let placed = false;
      for (let c = 0; c < colEnds.length; c++) {
        if (it.span.startMin >= colEnds[c]) {
          it.col = c;
          colEnds[c] = it.span.endMin;
          placed = true;
          break;
        }
      }
      if (!placed) {
        it.col = colEnds.length;
        colEnds.push(it.span.endMin);
      }
    }
    const colCount = colEnds.length;
    for (const it of cluster) {
      const rawHeight = it.span.endMin - it.span.startMin;
      const height = Math.max(rawHeight, minHeight);
      result.push({
        event: it.event,
        topPct: (it.span.startMin / MIN_PER_DAY) * 100,
        heightPct: (height / MIN_PER_DAY) * 100,
        col: it.col,
        colCount,
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length > 0 && it.span.startMin >= clusterEnd) {
      flush();
    }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.span.endMin);
  }
  flush();

  return result;
}
