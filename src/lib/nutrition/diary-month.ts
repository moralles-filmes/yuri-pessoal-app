/**
 * Fase 16-E — Dieta e Alimentação · VISÃO DE MÊS do diário (PURO, sem I/O).
 *
 * Fecha a pendência que a 16-B registrou e a 16-D herdou: `?visao=mes` existia na URL e no
 * CHECK, mas caía na visão de semana. Agora é um calendário de verdade, com indicador por dia.
 *
 * ══ A REGRA QUE O CALENDÁRIO PRECISA RESPEITAR ══
 * DIA SEM REGISTRO NÃO É DIA DE ZERO CALORIA. A célula devolve `energyKcal: null`, e a tela
 * mostra a data em cinza — não um "0 kcal" que faria o mês parecer um jejum de três semanas.
 * É a mesma disciplina do `value_state` (16-A) e da série de medidas (16-E), no calendário.
 *
 * ══ REUSO, NÃO REIMPLEMENTAÇÃO ══
 * • A grade do mês vem de `monthGrid` (calendar.ts, aritmética em `Date.UTC`).
 * • Os totais e as metas vêm de `buildDailyReports` (reports.ts) — que soma o SNAPSHOT e
 *   resolve a meta VIGENTE EM CADA DIA. Sem isso, o calendário de janeiro mudaria de cor ao
 *   alterar a meta em agosto.
 * • O status derivado das refeições vem de `effectiveMealStatus` (diary.ts).
 *
 * `hoje` é INJETADO — nada aqui chama `Date.now()`.
 */
import { CORE_NUTRIENTS, type NutrientTotalQuality } from "./constants";
import { endOfMonthIso, monthGrid, startOfMonthIso } from "./calendar";
import { effectiveMealStatus, type NowContext } from "./diary";
import { buildDailyReports, summarizePeriod, type DailyReport, type PeriodSummary } from "./reports";
import type { DayKind } from "./constants";
import type { DiaryMeal, GoalPeriod, PlannedMeal } from "./types";

/** Uma célula do calendário. */
export type MonthDayCell = {
  date: string;
  /** Falso para os dias vizinhos que só completam a primeira/última semana da grade. */
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  /** Teve algum item registrado? Distingue "não comi nada" de "não anotei". */
  hasRecord: boolean;
  meals: number;
  entries: number;
  /** ⛔ `null` = SEM REGISTRO. Nunca 0 — ver o cabeçalho. */
  energyKcal: number | null;
  /** Qualidade do total de energia. `null` quando não houve registro. */
  quality: NutrientTotalQuality | null;
  /** Meta de energia VIGENTE NAQUELE DIA. `null` = não havia meta na época. */
  targetKcal: number | null;
  /** Percentual da meta do dia. `null` sem meta ou sem registro. */
  goalPercent: number | null;
  /** Aderência do dia (0–100). `null` sem meta ou sem registro. */
  adherence: number | null;
  /** Refeições planejadas para o dia (o plano é intenção; não é consumo). */
  planned: number;
  /** Planejadas ainda sem desfecho — derivado, jamais gravado. */
  pending: number;
};

export type MonthView = {
  /** Semanas completas cobrindo o mês (inclui os dias vizinhos da borda). */
  weeks: MonthDayCell[][];
  monthStart: string;
  monthEnd: string;
  /** Resumo do MÊS (só os dias do próprio mês, sem as bordas da grade). */
  summary: PeriodSummary;
  /** Os relatórios diários do mês, para a leitura textual equivalente ao calendário. */
  daily: DailyReport[];
};

/**
 * Monta o calendário do mês que contém `date`.
 *
 * Os dados são lidos para a GRADE INTEIRA (que começa antes e termina depois do mês), porque
 * a primeira e a última semana mostram dias vizinhos — e uma célula vizinha em branco daria a
 * impressão errada de que não houve registro naquele dia.
 */
export function buildMonthView(
  date: string,
  meals: DiaryMeal[],
  planned: PlannedMeal[],
  periods: GoalPeriod[],
  now: NowContext,
  options: { weekStartDay?: number; dayKinds?: Map<string, DayKind | null> } = {},
): MonthView {
  const { weekStartDay = 1, dayKinds = new Map<string, DayKind | null>() } = options;

  const monthStart = startOfMonthIso(date);
  const monthEnd = endOfMonthIso(date);
  const grid = monthGrid(date, weekStartDay);

  const gridStart = grid[0]?.[0] ?? monthStart;
  const gridEnd = grid[grid.length - 1]?.[6] ?? monthEnd;

  const daily = buildDailyReports(meals, periods, gridStart, gridEnd, dayKinds);
  const reportByDate = new Map(daily.map((day) => [day.date, day]));

  // Planejamento por data. O plano NÃO é consumo: entra só como contagem de intenção.
  const plannedByDate = new Map<string, PlannedMeal[]>();
  for (const item of planned) {
    if (!item.plannedDate) continue; // linha de modelo, sem data
    const list = plannedByDate.get(item.plannedDate);
    if (list) list.push(item);
    else plannedByDate.set(item.plannedDate, [item]);
  }

  // Status derivado das refeições do diário, por data.
  const mealsByDate = new Map<string, DiaryMeal[]>();
  for (const item of meals) {
    const list = mealsByDate.get(item.diaryDate);
    if (list) list.push(item);
    else mealsByDate.set(item.diaryDate, [item]);
  }

  const weeks = grid.map((week) =>
    week.map((cellDate): MonthDayCell => {
      const report = reportByDate.get(cellDate);
      const energy = report?.totals[CORE_NUTRIENTS.energia];
      const target = report?.targets[CORE_NUTRIENTS.energia]?.amount ?? null;

      const dayMeals = mealsByDate.get(cellDate) ?? [];
      const pending = dayMeals.filter(
        (m) => effectiveMealStatus(m, now).status === "pendente",
      ).length;

      const hasRecord = report?.hasRecord ?? false;

      return {
        date: cellDate,
        inMonth: cellDate >= monthStart && cellDate <= monthEnd,
        isToday: cellDate === now.hoje,
        isFuture: cellDate > now.hoje,
        hasRecord,
        meals: report?.meals ?? 0,
        entries: report?.entries ?? 0,
        // ⛔ Sem registro → null. Com registro e sem energia no item → 0 de verdade.
        energyKcal: hasRecord ? (energy?.amount ?? 0) : null,
        quality: hasRecord ? (energy?.quality ?? "parcial") : null,
        targetKcal: target,
        goalPercent:
          hasRecord && target !== null && target > 0
            ? ((energy?.amount ?? 0) / target) * 100
            : null,
        adherence: hasRecord ? (report?.adherence.percent ?? null) : null,
        planned: (plannedByDate.get(cellDate) ?? []).length,
        pending,
      };
    }),
  );

  // O resumo é do MÊS, não da grade: incluir os dias vizinhos inflaria o total do mês com
  // consumo que pertence ao mês anterior ou ao seguinte.
  const monthDaily = daily.filter((day) => day.date >= monthStart && day.date <= monthEnd);

  return {
    weeks,
    monthStart,
    monthEnd,
    summary: summarizePeriod(monthDaily, monthStart, monthEnd),
    daily: monthDaily,
  };
}

/**
 * Intensidade da célula no calendário (0 a 1), para o mapa de calor.
 *
 * `null` quando não há como comparar — e a tela usa a cor neutra em vez de inventar uma
 * intensidade. Um dia sem meta não é um dia ruim; é um dia sem meta.
 */
export function cellIntensity(cell: MonthDayCell): number | null {
  if (!cell.hasRecord) return null;
  if (cell.goalPercent === null) return null;
  return Math.max(0, Math.min(1, cell.goalPercent / 100));
}

/** Rótulo textual da célula, para leitor de tela e para a tabela equivalente ao calendário. */
export function cellLabel(cell: MonthDayCell): string {
  if (cell.isFuture && !cell.hasRecord) {
    return cell.planned > 0 ? `${cell.planned} refeição(ões) planejada(s)` : "Sem planejamento";
  }
  if (!cell.hasRecord) return "Sem registro";

  const parts = [`${Math.round(cell.energyKcal ?? 0)} kcal`];
  if (cell.goalPercent !== null) parts.push(`${Math.round(cell.goalPercent)}% da meta`);
  parts.push(`${cell.entries} item(ns) em ${cell.meals} refeição(ões)`);
  if (cell.quality === "parcial") parts.push("total parcial");
  return parts.join(" · ");
}
