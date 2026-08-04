/**
 * Fase 17-D — Treinos · Histórico: filtros, agrupamentos e comparações (PURO).
 *
 * ═══════════════════════ SÓ O SNAPSHOT ALIMENTA O HISTÓRICO ═══════════════════════
 *
 * Todo campo que este arquivo lê já veio congelado da sessão: nome do treino, nome do
 * exercício, grupo muscular, `tracking_type`, séries. **Nenhuma leitura volta ao treino-modelo
 * ou ao catálogo.** Renomear um exercício hoje não pode mudar um gráfico de março — se mudar, a
 * 17-C foi violada.
 *
 * ═══════════════════════ FILTRO EM MEMÓRIA, ESTADO NA URL ═══════════════════════
 *
 * O padrão do módulo (17-A): uma leitura ampla por período + filtros combinando em memória, com
 * o estado na URL para voltar, recarregar e compartilhar o link preservarem a visão. As duas
 * funções de URL são inversas e testadas como tal.
 *
 * Datas são texto `'yyyy-MM-dd'` — comparação lexicográfica, imune a fuso. Sem `Date.now()`.
 */
import { aggregateSessions, sessionMetrics, type MetricOptions, type MetricSession } from "./metrics";
import { isDateIso, startOfWeekIso } from "./schedule";
import { normalizeText } from "./filters";

/* ═══════════════════════════ Estado do filtro ═══════════════════════════ */

export type HistoryView = "lista" | "semana" | "mes" | "calendario" | "linha";

export const HISTORY_VIEWS: readonly HistoryView[] = [
  "lista",
  "semana",
  "mes",
  "calendario",
  "linha",
];

export const HISTORY_VIEW_LABELS: Record<HistoryView, string> = {
  lista: "Lista",
  semana: "Por semana",
  mes: "Por mês",
  calendario: "Calendário",
  linha: "Linha do tempo",
};

export type HistoryGrouping = "nenhum" | "treino" | "programa" | "semana" | "mes";

export const HISTORY_GROUPING_LABELS: Record<HistoryGrouping, string> = {
  nenhum: "Sem agrupamento",
  treino: "Por treino",
  programa: "Por programa",
  semana: "Por semana",
  mes: "Por mês",
};

export type HistorySort = "recentes" | "antigos" | "volume" | "duracao";

export const HISTORY_SORT_LABELS: Record<HistorySort, string> = {
  recentes: "Mais recentes",
  antigos: "Mais antigos",
  volume: "Maior volume",
  duracao: "Maior duração",
};

export type HistoryFilterState = {
  search: string;
  /** Datas puras, inclusivas. */
  from: string | null;
  to: string | null;
  programId: string | null;
  workoutId: string | null;
  exerciseId: string | null;
  muscleGroup: string | null;
  status: string | null;
  minMinutes: number | null;
  maxMinutes: number | null;
  minVolumeKg: number | null;
  onlyWithRecord: boolean;
  onlyWithNotes: boolean;
  onlyWithPain: boolean;
  view: HistoryView;
  grouping: HistoryGrouping;
  sort: HistorySort;
};

export const EMPTY_HISTORY_FILTERS: HistoryFilterState = {
  search: "",
  from: null,
  to: null,
  programId: null,
  workoutId: null,
  exerciseId: null,
  muscleGroup: null,
  status: null,
  minMinutes: null,
  maxMinutes: null,
  minVolumeKg: null,
  onlyWithRecord: false,
  onlyWithNotes: false,
  onlyWithPain: false,
  view: "lista",
  grouping: "nenhum",
  sort: "recentes",
};

/* ═══════════════════════════ O item do histórico ═══════════════════════════
 * Um superset de `MetricSession` com o que o filtro precisa. Tudo congelado.
 */

export type HistoryItem = MetricSession & {
  hasNotes: boolean;
  feltPain: boolean;
  hasRecord: boolean;
  startedAt: string | null;
  endedAt: string | null;
  locationName: string | null;
  rating: number | null;
};

/* ═══════════════════════════ Filtro ═══════════════════════════ */

function searchableText(item: HistoryItem): string {
  return normalizeText(
    [
      item.workoutName,
      item.programName ?? "",
      item.locationName ?? "",
      ...item.exercises.map((exercise) => exercise.exerciseName),
      ...item.exercises.map((exercise) => exercise.muscleGroup ?? ""),
    ].join(" "),
  );
}

export function matchesHistoryFilters(
  item: HistoryItem,
  filters: HistoryFilterState,
  options: MetricOptions = {},
): boolean {
  if (filters.from && item.sessionDate < filters.from) return false;
  if (filters.to && item.sessionDate > filters.to) return false;

  if (filters.programId && item.programId !== filters.programId) return false;
  if (filters.workoutId && item.workoutId !== filters.workoutId) return false;
  if (filters.status && item.status !== filters.status) return false;

  if (filters.exerciseId) {
    const found = item.exercises.some((exercise) => exercise.exerciseId === filters.exerciseId);
    if (!found) return false;
  }

  if (filters.muscleGroup) {
    const found = item.exercises.some((exercise) => exercise.muscleGroup === filters.muscleGroup);
    if (!found) return false;
  }

  if (filters.onlyWithNotes && !item.hasNotes) return false;
  if (filters.onlyWithPain && !item.feltPain) return false;
  if (filters.onlyWithRecord && !item.hasRecord) return false;

  if (filters.minMinutes !== null || filters.maxMinutes !== null) {
    // Sem duração registrada, a sessão não passa por um filtro de duração — em vez de entrar
    // como "0 minutos", que a faria aparecer em toda faixa que começa no zero.
    const minutes = item.totalSeconds === null ? null : Math.round(item.totalSeconds / 60);
    if (minutes === null) return false;
    if (filters.minMinutes !== null && minutes < filters.minMinutes) return false;
    if (filters.maxMinutes !== null && minutes > filters.maxMinutes) return false;
  }

  if (filters.minVolumeKg !== null) {
    const volume = sessionMetrics(item, options).totals.volumeKg;
    if (volume < filters.minVolumeKg) return false;
  }

  const terms = normalizeText(filters.search).split(/\s+/).filter(Boolean);
  if (terms.length > 0) {
    const haystack = searchableText(item);
    if (!terms.every((term) => haystack.includes(term))) return false;
  }

  return true;
}

export function sortHistory(
  items: HistoryItem[],
  sort: HistorySort,
  options: MetricOptions = {},
): HistoryItem[] {
  const list = [...items];
  const byDateDesc = (a: HistoryItem, b: HistoryItem) =>
    b.sessionDate.localeCompare(a.sessionDate) || (b.startedAt ?? "").localeCompare(a.startedAt ?? "");

  switch (sort) {
    case "antigos":
      return list.sort((a, b) => -byDateDesc(a, b));
    case "volume":
      return list.sort(
        (a, b) =>
          sessionMetrics(b, options).totals.volumeKg - sessionMetrics(a, options).totals.volumeKg ||
          byDateDesc(a, b),
      );
    case "duracao":
      return list.sort((a, b) => (b.totalSeconds ?? 0) - (a.totalSeconds ?? 0) || byDateDesc(a, b));
    default:
      return list.sort(byDateDesc);
  }
}

export function applyHistoryFilters(
  items: HistoryItem[],
  filters: HistoryFilterState,
  options: MetricOptions = {},
): HistoryItem[] {
  return sortHistory(
    items.filter((item) => matchesHistoryFilters(item, filters, options)),
    filters.sort,
    options,
  );
}

export function countActiveHistoryFilters(filters: HistoryFilterState): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.from) count += 1;
  if (filters.to) count += 1;
  if (filters.programId) count += 1;
  if (filters.workoutId) count += 1;
  if (filters.exerciseId) count += 1;
  if (filters.muscleGroup) count += 1;
  if (filters.status) count += 1;
  if (filters.minMinutes !== null) count += 1;
  if (filters.maxMinutes !== null) count += 1;
  if (filters.minVolumeKg !== null) count += 1;
  if (filters.onlyWithRecord) count += 1;
  if (filters.onlyWithNotes) count += 1;
  if (filters.onlyWithPain) count += 1;
  return count;
}

/* ═══════════════════════════ URL ↔ filtros ═══════════════════════════ */

const positiveNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const dateOrNull = (value: string | undefined): string | null =>
  value && isDateIso(value) ? value : null;

export function historyFiltersFromParams(
  params: Record<string, string | undefined>,
): HistoryFilterState {
  const view = params.visao as HistoryView;
  const grouping = params.agrupar as HistoryGrouping;
  const sort = params.ordem as HistorySort;

  return {
    ...EMPTY_HISTORY_FILTERS,
    search: params.q ?? "",
    from: dateOrNull(params.de),
    to: dateOrNull(params.ate),
    programId: params.programa || null,
    workoutId: params.treino || null,
    exerciseId: params.exercicio || null,
    muscleGroup: params.grupo || null,
    status: params.status || null,
    minMinutes: positiveNumber(params.min_min),
    maxMinutes: positiveNumber(params.max_min),
    minVolumeKg: positiveNumber(params.min_volume),
    onlyWithRecord: params.recorde === "1",
    onlyWithNotes: params.observacao === "1",
    onlyWithPain: params.dor === "1",
    view: HISTORY_VIEWS.includes(view) ? view : "lista",
    grouping: (["nenhum", "treino", "programa", "semana", "mes"] as const).includes(grouping)
      ? grouping
      : "nenhum",
    sort: (["recentes", "antigos", "volume", "duracao"] as const).includes(sort)
      ? sort
      : "recentes",
  };
}

/** Só emite o que difere do padrão — a URL fica curta e legível. */
export function paramsFromHistoryFilters(filters: HistoryFilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.search.trim()) params.q = filters.search.trim();
  if (filters.from) params.de = filters.from;
  if (filters.to) params.ate = filters.to;
  if (filters.programId) params.programa = filters.programId;
  if (filters.workoutId) params.treino = filters.workoutId;
  if (filters.exerciseId) params.exercicio = filters.exerciseId;
  if (filters.muscleGroup) params.grupo = filters.muscleGroup;
  if (filters.status) params.status = filters.status;
  if (filters.minMinutes !== null) params.min_min = String(filters.minMinutes);
  if (filters.maxMinutes !== null) params.max_min = String(filters.maxMinutes);
  if (filters.minVolumeKg !== null) params.min_volume = String(filters.minVolumeKg);
  if (filters.onlyWithRecord) params.recorde = "1";
  if (filters.onlyWithNotes) params.observacao = "1";
  if (filters.onlyWithPain) params.dor = "1";
  if (filters.view !== "lista") params.visao = filters.view;
  if (filters.grouping !== "nenhum") params.agrupar = filters.grouping;
  if (filters.sort !== "recentes") params.ordem = filters.sort;
  return params;
}

/* ═══════════════════════════ Agrupamento ═══════════════════════════ */

export type HistoryGroup = {
  key: string;
  label: string;
  items: HistoryItem[];
  /** Agregado do grupo — sai de `metrics.ts`, nunca recontado aqui. */
  metrics: ReturnType<typeof aggregateSessions>;
};

const monthNames = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const monthLabel = (key: string): string => {
  const [year, month] = key.split("-");
  return `${monthNames[Number(month) - 1] ?? month} de ${year}`;
};

const brDate = (iso: string): string => {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
};

export function groupHistory(
  items: HistoryItem[],
  grouping: HistoryGrouping,
  options: MetricOptions & { weekStartsOn?: number } = {},
): HistoryGroup[] {
  if (grouping === "nenhum") {
    return [
      {
        key: "todos",
        label: "Todos os treinos",
        items,
        metrics: aggregateSessions(items, options),
      },
    ];
  }

  const keyOf = (item: HistoryItem): { key: string; label: string } => {
    switch (grouping) {
      case "treino":
        return { key: item.workoutId ?? `avulso:${item.workoutName}`, label: item.workoutName };
      case "programa":
        return {
          key: item.programId ?? "sem-programa",
          label: item.programName ?? "Sem programa",
        };
      case "semana": {
        const start = startOfWeekIso(item.sessionDate, options.weekStartsOn ?? 1);
        return { key: start, label: `Semana de ${brDate(start)}` };
      }
      default: {
        const month = item.sessionDate.slice(0, 7);
        return { key: month, label: monthLabel(month) };
      }
    }
  };

  const groups = new Map<string, { label: string; items: HistoryItem[] }>();
  for (const item of items) {
    const { key, label } = keyOf(item);
    const group = groups.get(key) ?? { label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }

  const list = [...groups.entries()].map(([key, group]) => ({
    key,
    label: group.label,
    items: group.items,
    metrics: aggregateSessions(group.items, options),
  }));

  // Datas descem (mais recente primeiro); nomes sobem em ordem alfabética.
  return grouping === "semana" || grouping === "mes"
    ? list.sort((a, b) => b.key.localeCompare(a.key))
    : list.sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

/* ═══════════════════════════ Comparação entre sessões ═══════════════════════════ */

export type SessionComparison = {
  /** `null` quando não há com o que comparar — nunca zero. */
  volumeDeltaKg: number | null;
  volumePercent: number | null;
  setsDelta: number | null;
  repsDelta: number | null;
  durationDeltaSeconds: number | null;
  direction: "acima" | "igual" | "abaixo" | "indisponivel";
  /** Algum dos dois lados tinha agregado parcial: a comparação herda a ressalva. */
  isPartial: boolean;
  referenceLabel: string;
};

const round3 = (value: number): number => Number(value.toFixed(3));

function compareValues(current: number, before: number): "acima" | "igual" | "abaixo" {
  if (current > before) return "acima";
  if (current < before) return "abaixo";
  return "igual";
}

/**
 * Compara uma sessão com outra.
 *
 * A direção descreve o FATO ("acima do da última vez"). Nada aqui parabeniza, cobra ou sugere
 * carga — mesma disciplina de `previous.ts` (17-C).
 */
export function compareSessions(
  current: MetricSession,
  reference: MetricSession | null,
  referenceLabel: string,
  options: MetricOptions = {},
): SessionComparison {
  if (!reference) {
    return {
      volumeDeltaKg: null,
      volumePercent: null,
      setsDelta: null,
      repsDelta: null,
      durationDeltaSeconds: null,
      direction: "indisponivel",
      isPartial: false,
      referenceLabel,
    };
  }

  const a = sessionMetrics(current, options);
  const b = sessionMetrics(reference, options);

  const volumeDeltaKg = round3(a.totals.volumeKg - b.totals.volumeKg);
  const volumePercent =
    b.totals.volumeKg > 0 ? round3((volumeDeltaKg / b.totals.volumeKg) * 100) : null;

  const durationDeltaSeconds =
    a.totalSeconds === null || b.totalSeconds === null ? null : a.totalSeconds - b.totalSeconds;

  return {
    volumeDeltaKg,
    volumePercent,
    setsDelta: a.totals.sets - b.totals.sets,
    repsDelta: a.totals.reps - b.totals.reps,
    durationDeltaSeconds,
    direction: compareValues(a.totals.volumeKg, b.totals.volumeKg),
    isPartial: a.totals.quality === "parcial" || b.totals.quality === "parcial",
    referenceLabel,
  };
}

/** A sessão anterior do MESMO treino-modelo (ou do mesmo nome, para o treino avulso). */
export function previousSessionOfSameWorkout(
  current: MetricSession,
  history: MetricSession[],
): MetricSession | null {
  const candidates = history
    .filter((session) => session.id !== current.id)
    .filter((session) =>
      current.workoutId
        ? session.workoutId === current.workoutId
        : session.workoutName === current.workoutName,
    )
    .filter((session) => session.sessionDate <= current.sessionDate)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.id.localeCompare(a.id));

  return candidates[0] ?? null;
}

/** A melhor sessão do mesmo treino por volume. `null` quando não há outra. */
export function bestSessionOfSameWorkout(
  current: MetricSession,
  history: MetricSession[],
  options: MetricOptions = {},
): MetricSession | null {
  const candidates = history
    .filter((session) => session.id !== current.id)
    .filter((session) =>
      current.workoutId
        ? session.workoutId === current.workoutId
        : session.workoutName === current.workoutName,
    );

  let best: { session: MetricSession; volume: number } | null = null;
  for (const session of candidates) {
    const volume = sessionMetrics(session, options).totals.volumeKg;
    if (!best || volume > best.volume) best = { session, volume };
  }
  return best?.session ?? null;
}

/**
 * A média das últimas N sessões do mesmo treino, como uma "sessão sintética".
 *
 * Serve só para comparar: por isso ela não tem id de verdade nem entra em nenhum agregado. Se
 * não houver sessão suficiente, devolve `null` em vez de uma média de um item só.
 */
export function averageOfRecentSessions(
  current: MetricSession,
  history: MetricSession[],
  count = 4,
  options: MetricOptions = {},
): { volumeKg: number; sets: number; reps: number; sessions: number } | null {
  const candidates = history
    .filter((session) => session.id !== current.id)
    .filter((session) =>
      current.workoutId
        ? session.workoutId === current.workoutId
        : session.workoutName === current.workoutName,
    )
    .filter((session) => session.sessionDate <= current.sessionDate)
    .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
    .slice(0, count);

  if (candidates.length === 0) return null;

  const metrics = candidates.map((session) => sessionMetrics(session, options));
  const total = metrics.reduce(
    (accumulator, item) => ({
      volumeKg: accumulator.volumeKg + item.totals.volumeKg,
      sets: accumulator.sets + item.totals.sets,
      reps: accumulator.reps + item.totals.reps,
    }),
    { volumeKg: 0, sets: 0, reps: 0 },
  );

  return {
    volumeKg: round3(total.volumeKg / candidates.length),
    sets: round3(total.sets / candidates.length),
    reps: round3(total.reps / candidates.length),
    sessions: candidates.length,
  };
}

/* ═══════════════════════════ Rótulos ═══════════════════════════ */

/** "12 de agosto de 2026" a partir da data pura, sem passar por `Date` (e sem drift de fuso). */
export function longDateLabelIso(iso: string): string {
  if (!isDateIso(iso)) return iso;
  const [year, month, day] = iso.split("-");
  return `${Number(day)} de ${monthNames[Number(month) - 1]} de ${year}`;
}

export const shortDateLabelIso = (iso: string): string => (isDateIso(iso) ? brDate(iso) : iso);

/** "1 h 12 min" a partir de segundos; vazio quando não há duração registrada. */
export function durationLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
