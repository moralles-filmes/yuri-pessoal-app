/**
 * Fase 16-E — Dieta e Alimentação · Relatórios por período (PURO, sem I/O).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ AS DUAS REGRAS QUE ESTE ARQUIVO EXISTE PARA GARANTIR                                ║
 * ║                                                                                       ║
 * ║ 1. O RELATÓRIO DE UM PERÍODO PASSADO SAI DO SNAPSHOT, NUNCA DO CATÁLOGO ATUAL.        ║
 * ║    Corrigir a proteína de um alimento hoje NÃO PODE mudar o relatório do mês passado. ║
 * ║    Por construção: tudo aqui entra por `dayTotals` (16-B), que soma `nutrients_       ║
 * ║    snapshot`. Não existe um único parâmetro neste arquivo que aceite alimento do      ║
 * ║    catálogo para somar consumo.                                                       ║
 * ║                                                                                       ║
 * ║ 2. A META DE UM DIA É A QUE VALIA NELE.                                               ║
 * ║    Cada dia resolve o seu próprio período de meta com `goalPeriodForDate` (16-B).     ║
 * ║    Um relatório retroativo NUNCA usa "a meta de agora" — mudar a meta hoje não pode   ║
 * ║    reescrever a aderência de janeiro.                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ══ E A TERCEIRA, HERDADA DO MÓDULO ══
 * A QUALIDADE VIAJA COM O NÚMERO. `mergeTotals` propaga `exato | aproximado | parcial`: um
 * dia parcial torna a semana parcial, e a tela é obrigada a mostrar isso. Um total de mês com
 * cara de exato, somado sobre dias em que faltava nutriente analisado, é mentira numérica.
 *
 * Nenhuma função chama `Date.now()` — `hoje` e os intervalos são sempre INJETADOS.
 */
import {
  mergeTotals,
  roundForDisplay,
  type NutrientTotal,
  type NutrientTotalQuality,
} from "./calc";
import { eachDayIso } from "./calendar";
import { comparePlannedVsConsumed, dayTotals, entryCounts, type PlannedFoodData } from "./diary";
import {
  adherence,
  dayTargets,
  goalPeriodForDate,
  progressForDay,
  type Adherence,
  type GoalProgress,
} from "./goals";
import { summarizeShoppingList } from "./shopping";
import type { NutrientGroup, DayKind } from "./constants";
import type {
  DiaryEntry,
  DiaryMeal,
  GoalPeriod,
  GoalTarget,
  NutrientDefinition,
  PlannedMeal,
  ShoppingList,
  SubstitutionLog,
} from "./types";
import type { ConvertibleMeasure } from "./units";

/* ═══════════════════════════ Agregação por dia ═══════════════════════════ */

export type DailyReport = {
  date: string;
  /** Totais do dia, somados do SNAPSHOT. Vazio quando não houve registro. */
  totals: Record<string, NutrientTotal>;
  /** Metas VIGENTES NAQUELE DIA. Vazio quando não havia meta na época. */
  targets: Record<string, GoalTarget>;
  progress: Record<string, GoalProgress>;
  adherence: Adherence;
  /** O dia teve algum item consumido? Dia sem registro ≠ dia com consumo zero. */
  hasRecord: boolean;
  meals: number;
  entries: number;
};

/**
 * Um relatório por dia do intervalo, inclusive os dias SEM registro.
 *
 * O dia sem registro entra na lista com `hasRecord: false` e totais vazios — e não some da
 * série. Sumir daria a impressão de que o período foi menor do que foi; virar zero afirmaria
 * que a pessoa não comeu nada. As duas coisas são falsas, e a diferença entre elas é o
 * assunto inteiro deste módulo.
 *
 * @param dayKinds tipo do dia (treino/descanso) por data, quando o planejamento classifica.
 *                 Entra na resolução da meta: um período "treino_descanso" tem alvo diferente.
 */
export function buildDailyReports(
  meals: DiaryMeal[],
  periods: GoalPeriod[],
  from: string,
  to: string,
  dayKinds: Map<string, DayKind | null> = new Map(),
): DailyReport[] {
  const mealsByDate = new Map<string, DiaryMeal[]>();
  for (const meal of meals) {
    if (meal.diaryDate < from || meal.diaryDate > to) continue;
    const list = mealsByDate.get(meal.diaryDate);
    if (list) list.push(meal);
    else mealsByDate.set(meal.diaryDate, [meal]);
  }

  return eachDayIso(from, to).map((date) => {
    const dayMeals = mealsByDate.get(date) ?? [];
    const totals = dayTotals(dayMeals);

    // ⛔ AQUI ESTÁ A REGRA 2: a meta é resolvida PARA ESTA DATA, não "a de agora".
    const period = goalPeriodForDate(periods, date);
    const ctx = { date, dayKind: dayKinds.get(date) ?? null };
    const targets = dayTargets(period, ctx);

    const progress = progressForDay(totals, targets);
    const entries = dayMeals.reduce(
      (sum, meal) => sum + meal.entries.filter(entryCounts).length,
      0,
    );

    return {
      date,
      totals,
      targets,
      progress,
      adherence: adherence(progress),
      hasRecord: entries > 0,
      meals: dayMeals.length,
      entries,
    };
  });
}

/* ═══════════════════════════ Resumo do período ═══════════════════════════ */

export type PeriodSummary = {
  from: string;
  to: string;
  /** Dias do intervalo (os pedidos). */
  totalDays: number;
  /** Dias que tiveram ao menos um item registrado. */
  daysWithRecord: number;
  /** Soma do período. A qualidade é propagada por `mergeTotals`. */
  totals: Record<string, NutrientTotal>;
  /**
   * Média dividida pelos dias PEDIDOS. Um dia sem registro puxa a média para baixo como se
   * tivesse sido zero — é a leitura "por dia de calendário", útil para quem quer saber o
   * ritmo real, e a tela precisa rotulá-la assim.
   */
  averagePerDay: Record<string, NutrientTotal>;
  /**
   * Média dividida pelos dias COM REGISTRO. É a leitura "nos dias em que anotei".
   * As duas existem porque respondem perguntas diferentes, e oferecer só uma delas sem dizer
   * qual é seria esconder a diferença entre "não comi" e "não anotei".
   */
  averagePerRecordedDay: Record<string, NutrientTotal>;
  /** Aderência média dos dias que TINHAM meta. */
  adherence: Adherence;
  /** Pior qualidade encontrada no período. */
  quality: NutrientTotalQuality;
};

const worstQuality = (a: NutrientTotalQuality, b: NutrientTotalQuality): NutrientTotalQuality => {
  if (a === "parcial" || b === "parcial") return "parcial";
  if (a === "aproximado" || b === "aproximado") return "aproximado";
  return "exato";
};

/** Divide os totais por um número de dias, preservando a qualidade de cada nutriente. */
function divideTotals(
  totals: Record<string, NutrientTotal>,
  days: number,
): Record<string, NutrientTotal> {
  if (days <= 0) return {};
  const result: Record<string, NutrientTotal> = {};
  for (const [code, total] of Object.entries(totals)) {
    // A qualidade NÃO melhora ao dividir: a média de um período parcial continua parcial.
    result[code] = { ...total, amount: total.amount / days };
  }
  return result;
}

export function summarizePeriod(daily: DailyReport[], from: string, to: string): PeriodSummary {
  const totals = mergeTotals(daily.map((day) => day.totals));
  const daysWithRecord = daily.filter((day) => day.hasRecord).length;

  // ⛔ A aderência média considera só os dias que tinham meta E TIVERAM REGISTRO.
  //
  // Os dois filtros existem por motivos diferentes, e nenhum deles é opcional:
  //  • sem meta → não há o que aderir; contar como 0% puniria um período em que o usuário
  //    ainda não tinha definido alvo nenhum;
  //  • sem registro → o dia não tem consumo ZERO, tem consumo DESCONHECIDO. Contá-lo como 0%
  //    transformaria "esqueci de anotar" em "falhei na meta" — a mesma confusão entre
  //    ausência e zero que a regra 1 do módulo proíbe, aplicada ao tempo.
  const withGoal = daily.filter((day) => day.hasRecord && day.adherence.percent !== null);
  const adherencePercent =
    withGoal.length > 0
      ? withGoal.reduce((sum, day) => sum + (day.adherence.percent ?? 0), 0) / withGoal.length
      : null;

  let quality: NutrientTotalQuality = "exato";
  for (const total of Object.values(totals)) quality = worstQuality(quality, total.quality);

  return {
    from,
    to,
    totalDays: daily.length,
    daysWithRecord,
    totals,
    averagePerDay: divideTotals(totals, daily.length),
    averagePerRecordedDay: divideTotals(totals, daysWithRecord),
    adherence: {
      percent: adherencePercent,
      counted: withGoal.length,
      quality: withGoal.reduce<NutrientTotalQuality>(
        (acc, day) => worstQuality(acc, day.adherence.quality),
        "exato",
      ),
    },
    quality,
  };
}

/**
 * Dias de maior e menor aderência.
 *
 * Só entram dias que tinham meta E registro: um dia sem meta não tem aderência, e um dia sem
 * registro teria "0% de aderência" por não ter sido anotado — o que seria transformar
 * esquecimento em fracasso nutricional.
 */
export function adherenceRanking(daily: DailyReport[], limit = 5): {
  best: DailyReport[];
  worst: DailyReport[];
} {
  const eligible = daily.filter((day) => day.hasRecord && day.adherence.percent !== null);
  const sorted = [...eligible].sort((a, b) => {
    const diff = (b.adherence.percent ?? 0) - (a.adherence.percent ?? 0);
    // Empate resolvido pela data, para a lista não variar entre duas leituras.
    return diff !== 0 ? diff : a.date < b.date ? -1 : 1;
  });
  return {
    best: sorted.slice(0, limit),
    worst: [...sorted].reverse().slice(0, limit),
  };
}

/* ═══════════════════════════ Micronutrientes ═══════════════════════════ */

export type NutrientRow = {
  code: string;
  name: string;
  unit: string;
  group: NutrientGroup;
  /** Total do período. */
  amount: number;
  /** Média por dia com registro. */
  averagePerDay: number;
  quality: NutrientTotalQuality;
  /** Meta média do período, quando havia meta. `null` = não havia. */
  target: number | null;
  /** Percentual da meta média. `null` quando não há meta — 0% e "sem meta" diferem. */
  percent: number | null;
  /** Em quantos dias do período este nutriente apareceu com valor. */
  daysWithValue: number;
  /** Em quantos dias algum item NÃO tinha este nutriente analisado. */
  daysIncomplete: number;
};

/**
 * Relatório de nutrientes por grupo — é aqui que os MICRONUTRIENTES finalmente aparecem
 * (a *meta* de micro já funcionava desde a 16-B; faltava o relatório).
 *
 * `daysIncomplete` é o campo que impede a leitura ingênua: "você consumiu 8 mg de ferro" com
 * metade dos alimentos sem ferro analisado é um PISO, não uma medição. A tela mostra os dois
 * números lado a lado.
 */
export function nutrientReport(
  daily: DailyReport[],
  summary: PeriodSummary,
  definitions: Record<string, NutrientDefinition>,
  groups?: NutrientGroup[],
): NutrientRow[] {
  const rows: NutrientRow[] = [];
  const recordedDays = Math.max(1, summary.daysWithRecord);

  for (const [code, total] of Object.entries(summary.totals)) {
    const definition = definitions[code];
    if (!definition) continue;
    if (groups && !groups.includes(definition.group)) continue;

    let daysWithValue = 0;
    let daysIncomplete = 0;
    let targetSum = 0;
    let targetDays = 0;

    for (const day of daily) {
      const dayTotal = day.totals[code];
      if (dayTotal && dayTotal.contributing > 0) daysWithValue += 1;
      if (dayTotal && dayTotal.missing > 0) daysIncomplete += 1;
      const target = day.targets[code]?.amount;
      if (typeof target === "number") {
        targetSum += target;
        targetDays += 1;
      }
    }

    const averagePerDay = total.amount / recordedDays;
    // A meta comparável é a MÉDIA das metas vigentes no período — que podem ter mudado no
    // meio dele. Comparar o consumo médio com "a meta de hoje" seria a regra 2 quebrada.
    const target = targetDays > 0 ? targetSum / targetDays : null;

    rows.push({
      code,
      name: definition.name,
      unit: definition.unit,
      group: definition.group,
      amount: total.amount,
      averagePerDay,
      quality: total.quality,
      target,
      percent: target !== null && target > 0 ? (averagePerDay / target) * 100 : null,
      daysWithValue,
      daysIncomplete,
    });
  }

  return rows.sort((a, b) => {
    const pa = definitions[a.code]?.position ?? 999;
    const pb = definitions[b.code]?.position ?? 999;
    return pa !== pb ? pa - pb : a.name.localeCompare(b.name, "pt-BR");
  });
}

/* ═══════════════════════════ Alimentos e refeições mais consumidos ═══════════════════════════ */

export type FoodRanking = {
  /** Nome CONGELADO no snapshot — é o nome que valia quando foi consumido. */
  label: string;
  /** `null` quando o alimento foi excluído do catálogo; o registro sobrevive. */
  foodId: string | null;
  kind: DiaryEntry["entryKind"];
  /** Quantas vezes apareceu no diário. */
  times: number;
  /** Soma da energia registrada. `null` quando NENHUMA ocorrência tinha energia. */
  energyKcal: number | null;
  /** Ocorrências que não tinham energia disponível — o total é um piso. */
  withoutEnergy: number;
  /** Dias distintos em que apareceu. */
  days: number;
};

/**
 * Alimentos mais consumidos no período.
 *
 * Agrupa pelo NOME CONGELADO, e não por `food_id`: o id vira nulo quando o alimento é
 * excluído do catálogo (`on delete set null`), e agrupar por ele jogaria fora todo o histórico
 * de um alimento apagado — exatamente o que o snapshot existe para impedir.
 */
export function topFoods(meals: DiaryMeal[], limit = 10): FoodRanking[] {
  const map = new Map<string, FoodRanking & { dates: Set<string> }>();

  for (const meal of meals) {
    for (const entry of meal.entries) {
      if (!entryCounts(entry)) continue;
      const label = entry.foodNameSnapshot;
      const key = `${entry.entryKind}:${label.toLocaleLowerCase("pt-BR")}`;

      let row = map.get(key);
      if (!row) {
        row = {
          label,
          foodId: entry.foodId,
          kind: entry.entryKind,
          times: 0,
          energyKcal: null,
          withoutEnergy: 0,
          days: 0,
          dates: new Set<string>(),
        };
        map.set(key, row);
      }

      row.times += 1;
      row.dates.add(meal.diaryDate);
      if (entry.energyKcal === null) {
        // Ausência não é zero: contamos separadamente para o total não parecer completo.
        row.withoutEnergy += 1;
      } else {
        row.energyKcal = (row.energyKcal ?? 0) + entry.energyKcal;
      }
    }
  }

  return [...map.values()]
    .map(({ dates, ...row }) => ({ ...row, days: dates.size }))
    .sort((a, b) => (b.times !== a.times ? b.times - a.times : a.label.localeCompare(b.label, "pt-BR")))
    .slice(0, limit);
}

export type MealRanking = {
  mealTypeId: string;
  name: string;
  times: number;
  entries: number;
  energyKcal: number | null;
  withoutEnergy: number;
};

/** Refeições mais registradas no período, por tipo. */
export function topMeals(meals: DiaryMeal[]): MealRanking[] {
  const map = new Map<string, MealRanking>();

  for (const meal of meals) {
    let row = map.get(meal.mealTypeId);
    if (!row) {
      row = {
        mealTypeId: meal.mealTypeId,
        name: meal.mealTypeName,
        times: 0,
        entries: 0,
        energyKcal: null,
        withoutEnergy: 0,
      };
      map.set(meal.mealTypeId, row);
    }

    const counted = meal.entries.filter(entryCounts);
    if (counted.length === 0) continue;

    row.times += 1;
    row.entries += counted.length;
    for (const entry of counted) {
      if (entry.energyKcal === null) row.withoutEnergy += 1;
      else row.energyKcal = (row.energyKcal ?? 0) + entry.energyKcal;
    }
  }

  return [...map.values()]
    .filter((row) => row.times > 0)
    .sort((a, b) => (b.times !== a.times ? b.times - a.times : a.name.localeCompare(b.name, "pt-BR")));
}

/* ═══════════════════════════ Substituições mais realizadas ═══════════════════════════ */

export type SubstitutionRanking = {
  originalLabel: string;
  replacementLabel: string;
  times: number;
  /** Soma das diferenças congeladas na troca. `null` quando nenhuma tinha o valor. */
  deltaEnergyKcal: number | null;
  deltaProteinG: number | null;
  /** Trocas em que a diferença de energia não estava disponível. */
  withoutDelta: number;
  lastAppliedOn: string;
};

/**
 * Ranking das trocas efetivamente confirmadas (o histórico existe desde a 16-C —
 * `nutrition_substitution_logs` — e só agora vira relatório).
 *
 * Os rótulos vêm CONGELADOS do log: renomear ou excluir a alternativa depois não reescreve o
 * que aconteceu. Nenhuma equivalência é afirmada aqui — é contagem do que o usuário fez.
 */
export function substitutionRanking(logs: SubstitutionLog[], limit = 10): SubstitutionRanking[] {
  const map = new Map<string, SubstitutionRanking>();

  for (const log of logs) {
    const key = `${log.originalLabel.toLocaleLowerCase("pt-BR")}→${log.replacementLabel.toLocaleLowerCase("pt-BR")}`;
    let row = map.get(key);
    if (!row) {
      row = {
        originalLabel: log.originalLabel,
        replacementLabel: log.replacementLabel,
        times: 0,
        deltaEnergyKcal: null,
        deltaProteinG: null,
        withoutDelta: 0,
        lastAppliedOn: log.appliedOn,
      };
      map.set(key, row);
    }

    row.times += 1;
    if (log.appliedOn > row.lastAppliedOn) row.lastAppliedOn = log.appliedOn;

    if (log.deltaEnergyKcal === null) row.withoutDelta += 1;
    else row.deltaEnergyKcal = (row.deltaEnergyKcal ?? 0) + log.deltaEnergyKcal;

    if (log.deltaProteinG !== null) {
      row.deltaProteinG = (row.deltaProteinG ?? 0) + log.deltaProteinG;
    }
  }

  return [...map.values()]
    .sort((a, b) =>
      b.times !== a.times ? b.times - a.times : b.lastAppliedOn.localeCompare(a.lastAppliedOn),
    )
    .slice(0, limit);
}

/* ═══════════════════════════ Gasto com mercado ═══════════════════════════ */

export type MarketSpendReport = {
  lists: number;
  /** Soma do que foi REALMENTE pago, em centavos. */
  realCents: number;
  /** Soma do que foi estimado, em centavos. */
  estimatedCents: number;
  /** Itens comprados sem preço informado. O total é um PISO, não o gasto real. */
  itemsWithoutPrice: number;
  items: number;
  /** Nenhum item tinha preço: a tela diz "sem preço registrado", não "gastou R$ 0,00". */
  hasAnyPrice: boolean;
  byList: {
    id: string;
    name: string;
    from: string | null;
    to: string | null;
    realCents: number;
    estimatedCents: number;
    itemsWithoutPrice: number;
  }[];
};

/**
 * Gasto com mercado no período.
 *
 * ⛔ REUSA `summarizeShoppingList` (16-D) em vez de recontar: aquela função já soma centavos e
 * já conta quantos itens estão SEM preço. Reimplementar a soma aqui abriria a porta para o
 * relatório e a tela de compras discordarem sobre quanto a pessoa gastou.
 *
 * Virar lançamento financeiro é DECISÃO EXPLÍCITA do usuário — nada aqui cria transação.
 */
export function marketSpendReport(lists: ShoppingList[]): MarketSpendReport {
  const report: MarketSpendReport = {
    lists: lists.length,
    realCents: 0,
    estimatedCents: 0,
    itemsWithoutPrice: 0,
    items: 0,
    hasAnyPrice: false,
    byList: [],
  };

  for (const list of lists) {
    const summary = summarizeShoppingList(list.items);

    report.realCents += summary.realCents;
    report.estimatedCents += summary.estimadoCents;
    report.itemsWithoutPrice += summary.semPrecoReal;
    report.items += summary.total;
    if (summary.realCents > 0 || summary.estimadoCents > 0) report.hasAnyPrice = true;

    report.byList.push({
      id: list.id,
      name: list.name,
      from: list.sourceFrom,
      to: list.sourceTo,
      realCents: summary.realCents,
      estimatedCents: summary.estimadoCents,
      itemsWithoutPrice: summary.semPrecoReal,
    });
  }

  report.byList.sort((a, b) => b.realCents - a.realCents);
  return report;
}

/* ═══════════════════════════ Planejado × consumido no período ═══════════════════════════ */

export type PlanAdherenceReport = {
  plannedItems: number;
  /** Itens planejados que viraram consumo igual ao previsto. */
  followed: number;
  substituted: number;
  removed: number;
  notRegistered: number;
  /** Itens consumidos que não estavam no plano. */
  extras: number;
  /** 0 a 100. `null` quando não havia nada planejado — nunca 0% por ausência de plano. */
  percent: number | null;
};

/**
 * Quanto do planejado virou consumo, no período inteiro.
 *
 * Reusa `comparePlannedVsConsumed` (16-B) dia a dia: o cruzamento planejado × consumido já
 * está resolvido lá, e refazê-lo aqui produziria duas versões da mesma verdade.
 */
export function planAdherenceReport(
  plannedMeals: PlannedMeal[],
  diaryMeals: DiaryMeal[],
  context: {
    foodNames: Map<string, string>;
    foodData: Map<string, PlannedFoodData>;
    measures: Map<string, ConvertibleMeasure>;
  },
): PlanAdherenceReport {
  const entriesByPlannedMeal = new Map<string, DiaryEntry[]>();
  for (const meal of diaryMeals) {
    if (!meal.plannedMealId) continue;
    const list = entriesByPlannedMeal.get(meal.plannedMealId);
    if (list) list.push(...meal.entries);
    else entriesByPlannedMeal.set(meal.plannedMealId, [...meal.entries]);
  }

  const report: PlanAdherenceReport = {
    plannedItems: 0,
    followed: 0,
    substituted: 0,
    removed: 0,
    notRegistered: 0,
    extras: 0,
    percent: null,
  };

  for (const planned of plannedMeals) {
    if (!planned.plannedDate) continue; // linha de modelo, sem data: não é plano de um dia
    const entries = entriesByPlannedMeal.get(planned.id) ?? [];
    const comparison = comparePlannedVsConsumed(planned.items, entries, context);

    for (const row of comparison.rows) {
      if (row.plannedItemId === null) {
        report.extras += 1;
        continue;
      }
      report.plannedItems += 1;
      switch (row.kind) {
        case "igual":
          report.followed += 1;
          break;
        case "substituido":
          report.substituted += 1;
          break;
        case "removido":
          report.removed += 1;
          break;
        case "nao_registrado":
          report.notRegistered += 1;
          break;
        default:
          // 'mais'/'menos' são consumo do item planejado, com quantidade diferente.
          report.followed += 1;
          break;
      }
    }
  }

  report.percent =
    report.plannedItems > 0 ? (report.followed / report.plannedItems) * 100 : null;
  return report;
}

/* ═══════════════════════════ Frequência de registro ═══════════════════════════ */

export type DiaryFrequency = {
  totalDays: number;
  daysWithRecord: number;
  /** 0 a 100. `null` para intervalo inválido — nunca `NaN` na tela. */
  percent: number | null;
  /** Maior sequência de dias consecutivos COM registro. */
  longestStreak: number;
  /** Maior sequência de dias consecutivos SEM registro. */
  longestGap: number;
};

/**
 * Com que constância o diário foi preenchido.
 *
 * Informação, não cobrança: a tela mostra sem linguagem de culpa. Um mês com poucos registros
 * significa que faltou anotar — e o relatório diz exatamente isso, em vez de tratar o silêncio
 * como jejum.
 */
export function diaryFrequency(daily: DailyReport[]): DiaryFrequency {
  if (daily.length === 0) {
    return { totalDays: 0, daysWithRecord: 0, percent: null, longestStreak: 0, longestGap: 0 };
  }

  let longestStreak = 0;
  let longestGap = 0;
  let streak = 0;
  let gap = 0;

  for (const day of daily) {
    if (day.hasRecord) {
      streak += 1;
      gap = 0;
      if (streak > longestStreak) longestStreak = streak;
    } else {
      gap += 1;
      streak = 0;
      if (gap > longestGap) longestGap = gap;
    }
  }

  const daysWithRecord = daily.filter((day) => day.hasRecord).length;
  return {
    totalDays: daily.length,
    daysWithRecord,
    percent: (daysWithRecord / daily.length) * 100,
    longestStreak,
    longestGap,
  };
}

/* ═══════════════════════════ Série para gráfico ═══════════════════════════ */

export type ReportSeriesPoint = {
  date: string;
  /** `null` = SEM REGISTRO nesse dia. Nunca 0 — a mesma regra do módulo de medidas. */
  value: number | null;
  target: number | null;
  quality: NutrientTotalQuality | null;
};

/**
 * Série diária de um nutriente, para o gráfico e para a tabela equivalente.
 *
 * Dia sem registro tem `value: null`, e o gráfico deve INTERROMPER a linha ali em vez de
 * ligá-la ao próximo ponto passando pelo zero. É o mesmo cuidado de `buildSeries` em
 * `src/lib/body/measurements.ts`.
 */
export function nutrientSeries(daily: DailyReport[], code: string): ReportSeriesPoint[] {
  return daily.map((day) => ({
    date: day.date,
    value: day.hasRecord ? (day.totals[code]?.amount ?? 0) : null,
    target: day.targets[code]?.amount ?? null,
    quality: day.hasRecord ? (day.totals[code]?.quality ?? "parcial") : null,
  }));
}

/** Série de aderência por dia. `null` nos dias sem meta ou sem registro. */
export function adherenceSeries(daily: DailyReport[]): ReportSeriesPoint[] {
  return daily.map((day) => ({
    date: day.date,
    value: day.hasRecord ? day.adherence.percent : null,
    target: null,
    quality: day.hasRecord ? day.adherence.quality : null,
  }));
}

/* ═══════════════════════════ Apresentação ═══════════════════════════ */

/** Arredonda um total para exibição, com a precisão que o próprio nutriente define. */
export function displayAmount(
  amount: number,
  definition: NutrientDefinition | undefined,
): number {
  return roundForDisplay(amount, definition?.precision ?? 1);
}

/**
 * Aviso obrigatório em toda tela que põe consumo e evolução corporal lado a lado.
 * Regra 2 da subfase: nenhuma afirmação de causalidade.
 */
export const REPORT_CORRELATION_DISCLAIMER =
  "Consumo e medidas aparecem lado a lado só para você comparar os períodos — o sistema não afirma que um causou o outro. Peso e medidas variam por muitos motivos além do que está registrado aqui.";

/** Aviso exibido quando o período tem qualidade "parcial". */
export const PARTIAL_PERIOD_HINT =
  "Alguns itens do período não tinham todos os nutrientes analisados pela fonte. Os totais são o mínimo conhecido, não o valor real.";

/** Aviso exibido no relatório de gasto quando há itens comprados sem preço. */
export const MISSING_PRICE_HINT =
  "Alguns itens comprados estão sem preço informado. O total é o que foi registrado, não necessariamente tudo o que foi gasto.";
