/**
 * Fase 16-B — Dieta e Alimentação · Recorrência do planejamento (PURO, sem I/O).
 *
 * A recorrência aqui é deliberadamente mais simples que a do TO-DO (Fase 15): um modelo de
 * semana que se repete a cada `cycleWeeks` semanas. Não há "toda terça do mês" nem "último dia
 * útil" — planejamento alimentar é semanal por natureza, e uma gramática de recorrência
 * completa aqui seria complexidade sem uso.
 *
 * ══ APLICAR MODELO = MATERIALIZAR, NÃO VINCULAR ══
 * Aplicar um modelo a um período cria refeições com DATA CONCRETA
 * (`nutrition_planned_meals.planned_date`). Não fica um vínculo vivo: se o modelo mudasse
 * retroativamente o que já foi planejado — e possivelmente consumido —, o histórico deixaria
 * de ser confiável, que é justamente o que esta subfase existe para impedir.
 *
 * ══ EDITAR SEMPRE PERGUNTA O ESCOPO ══
 * `plannedMealsInScope` traduz a escolha do usuário (somente este dia / este e os próximos /
 * todo o modelo) na lista exata de refeições atingidas. O sistema nunca decide sozinho, e o
 * PASSADO nunca é reescrito em nenhum dos escopos.
 *
 * Aritmética em `Date.UTC` via calendar.ts, com "hoje" sempre injetado.
 */
import { addDaysIso, diffDaysIso, eachDayIso, startOfWeekIso, weekdayOf } from "./calendar";
import type { PlanEditScope } from "./constants";
import type { NutritionPlan, PlanDay, PlannedMeal } from "./types";

/* ───────────────────────────── Ciclo ───────────────────────────── */

/** O mínimo que o cálculo do ciclo precisa saber sobre o plano. */
export type CyclePlan = {
  cycleWeeks: number;
  weekStartDay: number;
  anchorDate: string | null;
};

/**
 * Em qual semana do ciclo uma data cai (0 = primeira).
 *
 * Devolve `null` quando o ciclo tem mais de uma semana e o modelo não foi ancorado: sem
 * âncora não há como saber se hoje é a "semana A" ou a "semana B", e chutar 0 faria o
 * planejamento inteiro sair trocado sem nenhum aviso. Com ciclo de 1 semana não há
 * ambiguidade possível, então a âncora é dispensável.
 */
export function weekIndexForDate(plan: CyclePlan, date: string): number | null {
  const cycle = Math.max(1, Math.trunc(plan.cycleWeeks));
  if (cycle === 1) return 0;
  if (!plan.anchorDate) return null;

  const anchorWeek = startOfWeekIso(plan.anchorDate, plan.weekStartDay);
  const dateWeek = startOfWeekIso(date, plan.weekStartDay);
  const weeks = Math.round(diffDaysIso(anchorWeek, dateWeek) / 7);
  // Resto sempre positivo: datas anteriores à âncora precisam cair no ciclo correto também.
  return ((weeks % cycle) + cycle) % cycle;
}

/** O dia do modelo que corresponde a uma data. `null` quando o modelo não cobre esse dia. */
export function planDayForDate(
  plan: CyclePlan & { days: PlanDay[] },
  date: string,
): PlanDay | null {
  const weekIndex = weekIndexForDate(plan, date);
  if (weekIndex === null) return null;
  const weekday = weekdayOf(date);
  if (weekday < 0) return null;
  return (
    plan.days.find((day) => day.weekIndex === weekIndex && day.weekday === weekday) ?? null
  );
}

/* ───────────────────────────── Materialização ───────────────────────────── */

export type MaterializationTarget = {
  date: string;
  day: PlanDay;
};

/**
 * Que dias do modelo caem em cada data do intervalo.
 *
 * Dias do intervalo que o modelo não cobre simplesmente não aparecem — aplicar um modelo que
 * só define segunda a sexta não deve inventar refeição no fim de semana.
 */
export function materializationTargets(
  plan: CyclePlan & { days: PlanDay[] },
  from: string,
  to: string,
): MaterializationTarget[] {
  const targets: MaterializationTarget[] = [];
  for (const date of eachDayIso(from, to)) {
    const day = planDayForDate(plan, date);
    if (day) targets.push({ date, day });
  }
  return targets;
}

/** Quantas refeições uma aplicação criaria — a UI mostra antes de confirmar. */
export function countMaterialization(
  plan: NutritionPlan,
  from: string,
  to: string,
): { dias: number; refeicoes: number; itens: number } {
  const targets = materializationTargets(plan, from, to);
  let refeicoes = 0;
  let itens = 0;
  for (const target of targets) {
    refeicoes += target.day.meals.length;
    for (const meal of target.day.meals) itens += meal.items.length;
  }
  return { dias: targets.length, refeicoes, itens };
}

/* ───────────────────────────── Escopo de edição ─────────────────────────────
 * As três escolhas exigidas pela regra 5. Em nenhuma delas o passado é tocado.
 */

/**
 * Quais refeições uma edição atinge.
 *
 * @param target refeição em que o usuário clicou
 * @param all    universo de refeições do usuário (materializadas + linhas de modelo)
 * @param hoje   data pura de hoje — o corte que protege o passado. Injetada.
 */
export function plannedMealsInScope(
  scope: PlanEditScope,
  target: PlannedMeal,
  all: PlannedMeal[],
  hoje: string,
): PlannedMeal[] {
  // Refeição avulsa (sem origem em modelo) só pode ser editada nela mesma: não há série.
  if (!target.planDayId) return [target];

  if (scope === "somente_este_dia") return [target];

  const sameSeries = all.filter(
    (meal) =>
      meal.planDayId === target.planDayId &&
      meal.mealTypeId === target.mealTypeId &&
      meal.id !== target.id,
  );

  if (scope === "este_e_proximos") {
    const cut = target.plannedDate;
    if (!cut) return [target];
    return [
      target,
      ...sameSeries.filter((meal) => meal.plannedDate !== null && meal.plannedDate > cut),
    ];
  }

  // todo_o_modelo: a linha do modelo (sem data) + as materializadas de HOJE em diante.
  // Datas passadas ficam como foram planejadas — o registro do que se pretendia comer
  // naquele dia é histórico, não rascunho.
  return [
    target,
    ...sameSeries.filter(
      (meal) => meal.plannedDate === null || (meal.plannedDate !== null && meal.plannedDate >= hoje),
    ),
  ];
}

/** Quantas refeições cada escopo atingiria — a UI mostra o número antes de confirmar. */
export function scopeImpact(
  target: PlannedMeal,
  all: PlannedMeal[],
  hoje: string,
): Record<PlanEditScope, number> {
  return {
    somente_este_dia: plannedMealsInScope("somente_este_dia", target, all, hoje).length,
    este_e_proximos: plannedMealsInScope("este_e_proximos", target, all, hoje).length,
    todo_o_modelo: plannedMealsInScope("todo_o_modelo", target, all, hoje).length,
  };
}

/* ───────────────────────────── Copiar dia e semana ───────────────────────────── */

/** Uma refeição a criar numa cópia. Só descreve — quem grava é a action. */
export type MealCopy = {
  sourceMealId: string;
  targetDate: string;
  mealTypeId: string;
  plannedTime: string | null;
  title: string | null;
  notes: string | null;
  position: number;
};

/** Copiar as refeições de um dia para outro. A origem permanece intacta. */
export function copyDayPlan(source: PlannedMeal[], targetDate: string): MealCopy[] {
  return source.map((meal) => ({
    sourceMealId: meal.id,
    targetDate,
    mealTypeId: meal.mealTypeId,
    plannedTime: meal.plannedTime,
    title: meal.title,
    notes: meal.notes,
    position: meal.position,
  }));
}

/**
 * Duplicar uma semana inteira preservando o dia da semana de cada refeição.
 *
 * O deslocamento é calculado entre os INÍCIOS das semanas, não entre as datas soltas: assim
 * o almoço de terça continua na terça mesmo quando as semanas têm origens diferentes.
 */
export function duplicateWeekPlan(
  source: PlannedMeal[],
  sourceWeekStart: string,
  targetWeekStart: string,
): MealCopy[] {
  const shift = diffDaysIso(sourceWeekStart, targetWeekStart);
  const copies: MealCopy[] = [];
  for (const meal of source) {
    if (!meal.plannedDate) continue;
    copies.push({
      sourceMealId: meal.id,
      targetDate: addDaysIso(meal.plannedDate, shift),
      mealTypeId: meal.mealTypeId,
      plannedTime: meal.plannedTime,
      title: meal.title,
      notes: meal.notes,
      position: meal.position,
    });
  }
  return copies;
}

/* ───────────────────────────── Descrição ───────────────────────────── */

/** Frase em pt-BR que descreve o ciclo do modelo, para a UI não montar texto na mão. */
export function describeCycle(plan: CyclePlan): string {
  const cycle = Math.max(1, Math.trunc(plan.cycleWeeks));
  if (cycle === 1) return "Repete toda semana.";
  if (!plan.anchorDate) {
    return `Ciclo de ${cycle} semanas — defina a semana inicial para o modelo saber onde começa.`;
  }
  return `Ciclo de ${cycle} semanas, contado a partir de ${plan.anchorDate.split("-").reverse().join("/")}.`;
}
