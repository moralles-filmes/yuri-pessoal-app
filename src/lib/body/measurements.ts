/**
 * Fase 16-E — Módulo central de medidas corporais · Cálculo (PURO, sem I/O).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS QUATRO REGRAS QUE ESTE ARQUIVO EXISTE PARA GARANTIR                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * 1. DIA SEM MEDIÇÃO NÃO É ZERO. A série temporal devolve `null` no dia sem registro, jamais
 *    0 — um gráfico que despenca para zero na semana em que a pessoa não se pesou afirma que
 *    ela pesou zero. É a mesma disciplina do `value_state` da Dieta ("ausência não é zero"),
 *    aplicada ao tempo em vez de ao nutriente.
 *
 * 2. MÉDIA MÓVEL SÓ COM DADOS SUFICIENTES. Sem a janela cheia, o ponto é `null` e a UI omite
 *    a linha — suavizar 2 pontos e chamar de "tendência de 7 dias" é inventar suavização.
 *
 * 3. STATUS DE META É DERIVADO NA LEITURA. `atingida` e `prazo_vencido` saem de valor × alvo
 *    × prazo com `hoje` INJETADO. Só o que o usuário decide (`ativa`, `pausada`, `concluida`,
 *    `cancelada`) é gravado — mesma regra do `pendente` do diário, que nem existe no CHECK.
 *
 * 4. NADA AQUI AVALIA NINGUÉM. Sem "peso ideal", sem faixa de IMC com juízo de valor, sem
 *    direção sugerida. As funções calculam diferença e percentual; o significado é do usuário.
 *
 * `hoje` é sempre INJETADO — nenhuma função chama `Date.now()`.
 *
 * NOTA DE DEPENDÊNCIA: a aritmética de data pura vem de `src/lib/nutrition/calendar.ts`, que
 * é genérica (só `Date.UTC` sobre 'yyyy-MM-dd') e existe desde a 16-B. Duplicá-la aqui
 * criaria duas implementações livres para divergir — e é justamente o que o prefixo `body_*`
 * existe para evitar em outro nível. Se um dia o acoplamento incomodar, o caminho é PROMOVER
 * `calendar.ts` a utilitário central, nunca copiá-lo.
 */
import { addDaysIso, diffDaysIso, eachDayIso, isBefore } from "@/lib/nutrition/calendar";
import type { BodyGoalDirection, EffectiveGoalStatus, MeasurementCondition } from "./constants";
import type { MeasurementGoal } from "./types";

/* ───────────────────────────── Ordenação ───────────────────────────── */

/**
 * O mínimo que uma medição precisa ter para entrar nas contas.
 * Genérico para servir tanto a `Measurement` quanto a `MeasurementWithType`.
 */
export type MeasurementPoint = {
  measuredOn: string;
  measuredAt?: string | null;
  value: number;
  createdAt?: string;
};

/**
 * Ordena da mais ANTIGA para a mais recente, de forma determinística.
 *
 * O desempate importa: duas medições no mesmo dia (manhã e noite) são legítimas, e "qual é a
 * atual" não pode depender da ordem que o banco devolveu. Critério: data → hora → criação.
 * Sem hora, a linha vai ANTES das que têm hora no mesmo dia (não há como afirmar que uma
 * medição sem horário aconteceu depois de uma das 20h).
 */
export function sortByDate<T extends MeasurementPoint>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.measuredOn !== b.measuredOn) return a.measuredOn < b.measuredOn ? -1 : 1;
    const at = a.measuredAt ?? "";
    const bt = b.measuredAt ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
    const ac = a.createdAt ?? "";
    const bc = b.createdAt ?? "";
    if (ac !== bc) return ac < bc ? -1 : 1;
    return 0;
  });
}

/** A medição mais recente. `null` quando não há nenhuma — nunca um zero de enfeite. */
export function latestMeasurement<T extends MeasurementPoint>(list: T[]): T | null {
  const sorted = sortByDate(list);
  return sorted.length > 0 ? sorted[sorted.length - 1] : null;
}

/** A medição mais antiga (o "valor inicial" quando a meta não declara um). */
export function firstMeasurement<T extends MeasurementPoint>(list: T[]): T | null {
  const sorted = sortByDate(list);
  return sorted.length > 0 ? sorted[0] : null;
}

/**
 * A medição vigente NUMA DATA: a mais recente com `measuredOn <= date`.
 *
 * É o que permite comparar "01/06 × hoje" mesmo que a pessoa não tenha medido exatamente no
 * dia 1º. Devolve `null` quando não havia nenhuma medição até ali — e `null` não é zero.
 */
export function measurementOnDate<T extends MeasurementPoint>(list: T[], date: string): T | null {
  const eligible = sortByDate(list).filter((item) => item.measuredOn <= date);
  return eligible.length > 0 ? eligible[eligible.length - 1] : null;
}

/* ───────────────────────────── Diferença ───────────────────────────── */

export type MeasurementDelta = {
  from: number;
  to: number;
  /** to − from. Negativo = diminuiu. O sinal é FATO; não há juízo de valor sobre ele. */
  absolute: number;
  /**
   * Variação percentual sobre o valor inicial. `null` quando o inicial é 0 — dividir por
   * zero produziria `Infinity`, e um "∞% de aumento" na tela é lixo, não informação.
   */
  percent: number | null;
};

/** Diferença absoluta e percentual entre dois valores. */
export function measurementDelta(from: number, to: number): MeasurementDelta {
  const absolute = to - from;
  const percent = from === 0 || !Number.isFinite(from) ? null : (absolute / Math.abs(from)) * 100;
  return { from, to, absolute, percent };
}

export type MeasurementComparison = {
  from: { date: string; value: number; condition: MeasurementCondition | null } | null;
  to: { date: string; value: number; condition: MeasurementCondition | null } | null;
  delta: MeasurementDelta | null;
  /** Dias entre as duas medições. `null` quando falta um dos lados. */
  days: number | null;
  /**
   * As duas foram medidas em condições diferentes (jejum × pós-treino)?
   * Não invalida a comparação — só faz a tela avisar, porque parte da diferença pode ser
   * contexto, não corpo.
   */
  conditionsDiffer: boolean;
};

/**
 * Compara a medição vigente em duas datas.
 *
 * Devolve a estrutura completa mesmo faltando um dos lados: a tela precisa distinguir
 * "não mediu nesse período" de "não mudou nada".
 */
export function compareOnDates<
  T extends MeasurementPoint & { condition?: MeasurementCondition | null },
>(list: T[], fromDate: string, toDate: string): MeasurementComparison {
  const a = measurementOnDate(list, fromDate);
  const b = measurementOnDate(list, toDate);

  const from = a ? { date: a.measuredOn, value: a.value, condition: a.condition ?? null } : null;
  const to = b ? { date: b.measuredOn, value: b.value, condition: b.condition ?? null } : null;

  return {
    from,
    to,
    delta: from && to ? measurementDelta(from.value, to.value) : null,
    days: from && to ? diffDaysIso(from.date, to.date) : null,
    conditionsDiffer:
      from !== null &&
      to !== null &&
      from.condition !== null &&
      to.condition !== null &&
      from.condition !== to.condition,
  };
}

/* ───────────────────────────── Série temporal ───────────────────────────── */

export type SeriesPoint = {
  date: string;
  /** `null` = NÃO HOUVE MEDIÇÃO NESSE DIA. Regra 1: buraco não é zero. */
  value: number | null;
  /** Média móvel; `null` quando a janela não está cheia (regra 2). */
  average: number | null;
};

/**
 * Série diária de [from, to], com um ponto por dia — inclusive os dias sem medição.
 *
 * Havendo mais de uma medição no mesmo dia (manhã e noite), o ponto usa a ÚLTIMA: é o valor
 * mais recente daquele dia, coerente com `latestMeasurement`.
 *
 * @param movingWindow janela da média móvel em número de MEDIÇÕES (não de dias). 0 desliga.
 */
export function buildSeries<T extends MeasurementPoint>(
  list: T[],
  from: string,
  to: string,
  movingWindow = 0,
): SeriesPoint[] {
  const byDate = new Map<string, number>();
  for (const item of sortByDate(list)) {
    if (item.measuredOn < from || item.measuredOn > to) continue;
    byDate.set(item.measuredOn, item.value); // a ordenação garante que a última vence
  }

  const days = eachDayIso(from, to);
  const points: SeriesPoint[] = days.map((date) => ({
    date,
    value: byDate.has(date) ? (byDate.get(date) as number) : null,
    average: null,
  }));

  if (movingWindow > 1) {
    // A média móvel corre sobre os VALORES EXISTENTES, não sobre os dias: numa janela de 7
    // dias com 2 medições, a média de 7 seria calculada com 2 números e mentiria sobre a
    // própria janela. Aqui a janela conta medições, e cada ponto medido recebe a média das
    // `movingWindow` últimas — ou `null` se ainda não houver tantas.
    const measured: { index: number; value: number }[] = [];
    points.forEach((point, index) => {
      if (point.value !== null) measured.push({ index, value: point.value });
    });

    measured.forEach((point, i) => {
      if (i + 1 < movingWindow) return;
      const window = measured.slice(i + 1 - movingWindow, i + 1);
      const sum = window.reduce((acc, item) => acc + item.value, 0);
      points[point.index].average = sum / movingWindow;
    });
  }

  return points;
}

/** Há medições suficientes para a média móvel fazer sentido? A UI omite a linha se não. */
export function hasEnoughForMovingAverage(measuredCount: number, window: number): boolean {
  return window > 1 && measuredCount >= window;
}

/**
 * Só os pontos que têm valor — para tabela, exportação e leitura textual do gráfico.
 * A regra 6 da subfase exige que o gráfico nunca seja a única forma de ler o dado.
 */
export function measuredPoints(series: SeriesPoint[]): SeriesPoint[] {
  return series.filter((point) => point.value !== null);
}

/* ───────────────────────────── Resumo por tipo ───────────────────────────── */

export type TypeSummary = {
  /** Valor mais recente. `null` = nunca mediu (≠ mediu zero). */
  current: number | null;
  currentDate: string | null;
  /** Primeiro valor do conjunto considerado. */
  initial: number | null;
  initialDate: string | null;
  delta: MeasurementDelta | null;
  count: number;
  /** Diferença desde a medição imediatamente anterior à atual. */
  sincePrevious: MeasurementDelta | null;
};

/** Valor atual, inicial, diferença absoluta e percentual — o cabeçalho da tela de um tipo. */
export function summarizeType<T extends MeasurementPoint>(list: T[]): TypeSummary {
  const sorted = sortByDate(list);
  if (sorted.length === 0) {
    return {
      current: null,
      currentDate: null,
      initial: null,
      initialDate: null,
      delta: null,
      count: 0,
      sincePrevious: null,
    };
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  return {
    current: last.value,
    currentDate: last.measuredOn,
    initial: first.value,
    initialDate: first.measuredOn,
    // Uma medição só: não há variação a mostrar. Zero afirmaria "não mudou".
    delta: sorted.length > 1 ? measurementDelta(first.value, last.value) : null,
    count: sorted.length,
    sincePrevious: previous ? measurementDelta(previous.value, last.value) : null,
  };
}

/* ───────────────────────────── Metas ───────────────────────────── */

/**
 * Qual meta vale para um tipo numa data.
 *
 * Duas metas ativas para a mesma medida (uma de curto e outra de longo prazo) são legítimas,
 * então o desempate precisa ser DETERMINÍSTICO e testado — nunca "o que o banco devolver
 * primeiro". Mesmo critério de `goalPeriodForDate` (16-B):
 *   1. a que já começou e começou mais tarde;
 *   2. empate no início → a criada mais tarde;
 *   3. empate total → o `id` menor, para a resposta não variar entre duas leituras.
 *
 * Metas canceladas e concluídas ficam de fora: elas não "valem" mais.
 */
export function goalForDate<
  T extends { startsOn: string; targetDate: string | null; createdAt: string; id: string; status: string },
>(goals: T[], date: string): T | null {
  const candidates = goals.filter((goal) => {
    if (goal.status === "cancelada" || goal.status === "concluida") return false;
    if (isBefore(date, goal.startsOn)) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    if (a.startsOn !== b.startsOn) return a.startsOn < b.startsOn ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  })[0];
}

export type GoalProgress = {
  /** Valor de partida efetivo: o declarado ou a 1ª medição a partir de `startsOn`. */
  startValue: number | null;
  current: number | null;
  target: number;
  /** Quanto falta para o alvo, no sentido da direção escolhida. `null` sem medição. */
  remaining: number | null;
  /**
   * 0 a 100 — quanto do caminho entre partida e alvo já foi percorrido.
   * `null` quando não dá para calcular (sem medição, ou partida igual ao alvo).
   * Passar do alvo NÃO estoura de 100: a barra representa o trajeto, não o excedente.
   */
  percent: number | null;
  /** O alvo foi alcançado, na direção escolhida? */
  reached: boolean;
  status: EffectiveGoalStatus;
  /** Dias restantes até o prazo. Negativo = já passou. `null` = meta sem prazo. */
  daysLeft: number | null;
};

/** O alvo foi alcançado, considerando a direção que o USUÁRIO escolheu? */
export function goalReached(
  direction: BodyGoalDirection,
  current: number,
  target: number,
  startValue: number | null,
): boolean {
  if (direction === "reduzir") return current <= target;
  if (direction === "aumentar") return current >= target;
  // "Manter" precisa de uma faixa, e a faixa honesta é a distância que a pessoa aceitou
  // percorrer: metade do caminho entre a partida e o alvo. Sem partida, exige o valor exato.
  if (startValue === null) return current === target;
  const tolerance = Math.abs(target - startValue) / 2;
  return tolerance === 0 ? current === target : Math.abs(current - target) <= tolerance;
}

/**
 * Progresso de uma meta corporal.
 *
 * `hoje` é injetado: o status derivado não pode depender do relógio da máquina que renderiza.
 */
export function goalProgress(
  goal: Pick<
    MeasurementGoal,
    "direction" | "startValue" | "targetValue" | "startsOn" | "targetDate" | "status"
  >,
  measurements: MeasurementPoint[],
  hoje: string,
): GoalProgress {
  // A partida é a declarada; sem ela, a 1ª medição a partir do início da meta. Medições
  // anteriores ao começo da meta não contam como ponto de partida dela.
  const inPeriod = sortByDate(measurements).filter((item) => item.measuredOn >= goal.startsOn);
  const startValue = goal.startValue ?? (inPeriod.length > 0 ? inPeriod[0].value : null);

  const last = latestMeasurement(inPeriod);
  const current = last?.value ?? null;

  const daysLeft = goal.targetDate ? diffDaysIso(hoje, goal.targetDate) : null;

  const reached =
    current !== null && goalReached(goal.direction, current, goal.targetValue, startValue);

  let percent: number | null = null;
  if (current !== null && startValue !== null) {
    const span = goal.targetValue - startValue;
    if (span === 0) {
      // Partida já é o alvo: 100% se ainda está lá, 0% se saiu. Sem divisão por zero.
      percent = reached ? 100 : 0;
    } else {
      const walked = (current - startValue) / span;
      percent = Math.max(0, Math.min(100, walked * 100));
    }
  }

  const remaining = current !== null ? goal.targetValue - current : null;

  return {
    startValue,
    current,
    target: goal.targetValue,
    remaining,
    percent,
    reached,
    status: effectiveGoalStatus(goal, reached, hoje),
    daysLeft,
  };
}

/**
 * Status como a TELA exibe.
 *
 * Decisão do usuário vence sempre: uma meta pausada ou cancelada não vira "atingida" só
 * porque o número passou pelo alvo. Só o que ainda está correndo é derivado.
 */
export function effectiveGoalStatus(
  goal: Pick<MeasurementGoal, "status" | "targetDate">,
  reached: boolean,
  hoje: string,
): EffectiveGoalStatus {
  if (goal.status !== "ativa") return goal.status;
  if (reached) return "atingida";
  if (goal.targetDate !== null && isBefore(goal.targetDate, hoje)) return "prazo_vencido";
  return "ativa";
}

/* ───────────────────────────── Frequência de registro ───────────────────────────── */

export type RegistrationFrequency = {
  /** Dias do período que tiveram pelo menos uma medição. */
  daysWithRecord: number;
  /** Total de dias do período (os pedidos, não os registrados). */
  totalDays: number;
  /** 0 a 100. `null` quando o período é inválido — nunca `NaN`. */
  percent: number | null;
  /** Maior intervalo, em dias, entre duas medições consecutivas. */
  longestGapDays: number | null;
  /** Data da última medição do período. */
  lastDate: string | null;
};

/**
 * Com que constância o usuário registrou no período.
 *
 * É informação, não cobrança: a tela mostra o número sem linguagem de culpa (a mesma
 * disciplina do calendário de consistência da 17-E).
 */
export function registrationFrequency(
  list: MeasurementPoint[],
  from: string,
  to: string,
): RegistrationFrequency {
  const days = eachDayIso(from, to);
  if (days.length === 0) {
    return { daysWithRecord: 0, totalDays: 0, percent: null, longestGapDays: null, lastDate: null };
  }

  const dates = [
    ...new Set(
      sortByDate(list)
        .filter((item) => item.measuredOn >= from && item.measuredOn <= to)
        .map((item) => item.measuredOn),
    ),
  ];

  let longestGap: number | null = null;
  for (let i = 1; i < dates.length; i += 1) {
    const gap = diffDaysIso(dates[i - 1], dates[i]);
    if (longestGap === null || gap > longestGap) longestGap = gap;
  }

  return {
    daysWithRecord: dates.length,
    totalDays: days.length,
    percent: (dates.length / days.length) * 100,
    longestGapDays: longestGap,
    lastDate: dates.length > 0 ? dates[dates.length - 1] : null,
  };
}

/**
 * Data da próxima medição sugerida a partir de uma cadência em dias.
 * Usada só para exibir "última medição há X dias" — não gera notificação (isso é 16-F) e não
 * cobra ninguém.
 */
export function nextSuggestedDate(lastDate: string | null, everyDays: number): string | null {
  if (!lastDate || everyDays <= 0) return null;
  return addDaysIso(lastDate, everyDays);
}

/* ───────────────────────────── Apresentação ───────────────────────────── */

/**
 * Formata o valor com as casas decimais do tipo. Arredondar só aqui, na última etapa —
 * mesma regra do `roundForDisplay` da Dieta.
 */
export function formatMeasurementValue(value: number, decimals: number): string {
  const digits = Math.max(0, Math.min(3, Math.trunc(decimals)));
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** "72,4 kg". */
export function formatMeasurement(value: number, unit: string, decimals: number): string {
  return `${formatMeasurementValue(value, decimals)} ${unit}`;
}

/** "−1,6 kg" / "+0,8 kg". O sinal é explícito: some-o e a leitura fica ambígua. */
export function formatDelta(value: number, unit: string, decimals: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatMeasurementValue(Math.abs(value), decimals)} ${unit}`;
}

/** "−2,1%". `null` vira travessão: percentual indisponível não é 0%. */
export function formatPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return "—";
  const sign = percent > 0 ? "+" : percent < 0 ? "−" : "";
  return `${sign}${Math.abs(percent).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}
