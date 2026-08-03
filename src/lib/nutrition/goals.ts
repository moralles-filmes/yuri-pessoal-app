/**
 * Fase 16-B — Dieta e Alimentação · Metas nutricionais (PURO, sem I/O).
 *
 * ══ REGRA 4 DA SUBFASE: ALTERAR A META HOJE NÃO MUDA O RELATÓRIO DE ONTEM ══
 *
 * A meta de um dia é a que estava VIGENTE naquele dia. Por isso a meta não é uma linha única
 * sobrescrita: é um período (`nutrition_goal_periods`) com `starts_on`/`ends_on`, e toda
 * leitura resolve "qual meta valia nesta data" — nunca "qual é a meta agora".
 *
 * ══ ESCOPO: DO MAIS ESPECÍFICO PARA O MAIS GERAL ══
 *
 * Um valor de meta pode ser declarado em três eixos, todos opcionais:
 *   dia da semana · tipo de dia (treino/descanso) · refeição
 * `resolveTarget` prefere sempre a linha mais específica que casa com o contexto. Quais
 * eixos são considerados depende do `goal_type` do período — configurar "por dia da semana" e
 * depois voltar para "fixa" não apaga nada: a leitura simplesmente ignora o eixo desligado.
 *
 * ══ SEM PRESCRIÇÃO (REGRA 8) ══
 * O estimador de gasto energético no fim do arquivo é OPCIONAL, devolve a fórmula junto do
 * número e nunca é aplicado sozinho: quem grava meta é o usuário, depois de confirmar.
 * Nenhuma função aqui decide meta por conta própria.
 *
 * Nenhuma função chama `Date.now()` — "hoje" é sempre injetado.
 */
import { isWithin, weekdayOf } from "./calendar";
import type { NutrientTotal, NutrientTotalQuality } from "./calc";
import { CORE_NUTRIENTS, type DayKind, type GoalType } from "./constants";
import type { GoalItemRow, GoalPeriod, GoalTarget, NutritionProfile } from "./types";

/* ───────────────────────────── Período vigente ───────────────────────────── */

/**
 * Qual período vale numa data.
 *
 * Sobreposição de períodos não é proibida no banco (ver a migration), então o desempate
 * precisa ser DETERMINÍSTICO e testado, nunca "o que o banco devolver primeiro":
 *   1. o período que contém a data e começou mais tarde (o mais recente vence);
 *   2. empate no início → o criado mais tarde;
 *   3. empate total → o de `id` menor, para a resposta nunca variar entre duas leituras.
 */
export function goalPeriodForDate<T extends { startsOn: string; endsOn: string | null; createdAt: string; id: string }>(
  periods: T[],
  date: string,
): T | null {
  const candidates = periods.filter((period) => isWithin(date, period.startsOn, period.endsOn));
  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    if (a.startsOn !== b.startsOn) return a.startsOn < b.startsOn ? 1 : -1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  })[0];
}

/** Períodos que se sobrepõem — a tela avisa em vez de escolher em silêncio. */
export function overlappingPeriods<T extends { id: string; startsOn: string; endsOn: string | null }>(
  periods: T[],
): [T, T][] {
  const pairs: [T, T][] = [];
  for (let i = 0; i < periods.length; i += 1) {
    for (let j = i + 1; j < periods.length; j += 1) {
      const a = periods[i];
      const b = periods[j];
      const aEnd = a.endsOn ?? "9999-12-31";
      const bEnd = b.endsOn ?? "9999-12-31";
      if (a.startsOn <= bEnd && b.startsOn <= aEnd) pairs.push([a, b]);
    }
  }
  return pairs;
}

/* ───────────────────────────── Resolução do valor ───────────────────────────── */

export type GoalContext = {
  /** Data pura 'yyyy-MM-dd'. Define o dia da semana considerado. */
  date: string;
  /** Tipo do dia, quando o planejamento classifica. `null` = não classificado. */
  dayKind: DayKind | null;
};

/**
 * A linha casa com o contexto?
 *
 * `null` num eixo é CURINGA ("vale para qualquer valor"), e não "vale para nenhum". Os eixos
 * desligados pelo `goalType` são exigidos como nulos: numa meta fixa, uma linha que só vale
 * na terça não deve influenciar nada.
 */
function matchesScope(item: GoalItemRow, ctx: GoalContext, goalType: GoalType): boolean {
  const usesWeekday = goalType === "por_dia_semana";
  const usesDayKind = goalType === "treino_descanso";

  if (usesWeekday) {
    if (item.weekday !== null && item.weekday !== weekdayOf(ctx.date)) return false;
  } else if (item.weekday !== null) {
    return false;
  }

  if (usesDayKind) {
    if (item.dayKind !== null && item.dayKind !== ctx.dayKind) return false;
  } else if (item.dayKind !== null) {
    return false;
  }

  return true;
}

/** Quanto mais eixos preenchidos, mais específica a linha — e mais alta a prioridade. */
function specificity(item: GoalItemRow): number {
  return (item.weekday !== null ? 2 : 0) + (item.dayKind !== null ? 1 : 0);
}

/**
 * O valor de meta de um nutriente num escopo.
 *
 * @param mealTypeId `null` = meta do dia inteiro; senão a meta daquela refeição.
 * @param dayAmount  meta do dia já resolvida — necessária para converter percentual em valor.
 */
export function resolveTarget(
  items: GoalItemRow[],
  ctx: GoalContext,
  goalType: GoalType,
  nutrientCode: string,
  mealTypeId: string | null = null,
  dayAmount: number | null = null,
): GoalTarget | null {
  const candidates = items
    .filter((item) => item.nutrientCode === nutrientCode)
    .filter((item) => (item.mealTypeId ?? null) === mealTypeId)
    .filter((item) => matchesScope(item, ctx, goalType));

  if (candidates.length === 0) return null;

  const best = [...candidates].sort((a, b) => {
    const diff = specificity(b) - specificity(a);
    if (diff !== 0) return diff;
    // Empate de especificidade: a linha criada por último vence, e o id fecha o desempate.
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
    return a.id < b.id ? -1 : 1;
  })[0];

  // Percentual precisa de uma meta do dia para virar número. Sem ela, o alvo continua
  // existindo (a UI mostra "30% do dia") mas sem valor absoluto — inventar um seria pior.
  if (best.targetPercent !== null) {
    const amount =
      dayAmount !== null && Number.isFinite(dayAmount)
        ? (dayAmount * best.targetPercent) / 100
        : null;
    return {
      code: nutrientCode,
      amount,
      min: best.minAmount,
      max: best.maxAmount,
      origin: "percentual",
      percentOfDay: best.targetPercent,
    };
  }

  return {
    code: nutrientCode,
    amount: best.targetAmount,
    min: best.minAmount,
    max: best.maxAmount,
    origin: "absoluto",
    percentOfDay: null,
  };
}

/** Todas as metas do DIA, indexadas por código de nutriente. */
export function dayTargets(period: GoalPeriod | null, ctx: GoalContext): Record<string, GoalTarget> {
  if (!period) return {};
  const targets: Record<string, GoalTarget> = {};
  const codes = new Set(
    period.items.filter((item) => item.mealTypeId === null).map((item) => item.nutrientCode),
  );
  for (const code of codes) {
    const target = resolveTarget(period.items, ctx, period.goalType, code, null);
    if (target) targets[code] = target;
  }
  return targets;
}

/**
 * As metas de UMA refeição. O percentual é resolvido contra a meta do dia já calculada, o
 * que mantém "30% do almoço" coerente com qualquer mudança na meta diária.
 */
export function mealTargets(
  period: GoalPeriod | null,
  ctx: GoalContext,
  mealTypeId: string,
  day: Record<string, GoalTarget> = dayTargets(period, ctx),
): Record<string, GoalTarget> {
  if (!period) return {};
  const targets: Record<string, GoalTarget> = {};
  const codes = new Set(
    period.items.filter((item) => item.mealTypeId === mealTypeId).map((item) => item.nutrientCode),
  );
  for (const code of codes) {
    const target = resolveTarget(
      period.items,
      ctx,
      period.goalType,
      code,
      mealTypeId,
      day[code]?.amount ?? null,
    );
    if (target) targets[code] = target;
  }
  return targets;
}

/**
 * Quanto da meta do dia já foi distribuído entre as refeições, por nutriente.
 * A tela usa para dizer "faltam 20% para distribuir" ou "você distribuiu 110%".
 */
export function distributedPercent(
  period: GoalPeriod | null,
  ctx: GoalContext,
  nutrientCode: string,
  dayAmount: number | null,
): number | null {
  if (!period) return null;
  const items = period.items.filter(
    (item) =>
      item.mealTypeId !== null &&
      item.nutrientCode === nutrientCode &&
      matchesScope(item, ctx, period.goalType),
  );
  if (items.length === 0) return null;

  let total = 0;
  for (const item of items) {
    if (item.targetPercent !== null) {
      total += item.targetPercent;
      continue;
    }
    // Valor absoluto por refeição só vira percentual se houver meta do dia para comparar.
    if (item.targetAmount !== null && dayAmount !== null && dayAmount > 0) {
      total += (item.targetAmount / dayAmount) * 100;
    }
  }
  return total;
}

/* ───────────────────────────── Progresso ───────────────────────────── */

export type GoalProgressStatus = "sem_meta" | "abaixo" | "na_faixa" | "acima";

export type GoalProgress = {
  code: string;
  consumed: number;
  target: number | null;
  min: number | null;
  max: number | null;
  /** Quanto falta. Negativo = passou. `null` quando não há meta. */
  remaining: number | null;
  /** Percentual da meta. `null` quando não há meta — 0% e "sem meta" são coisas diferentes. */
  percent: number | null;
  status: GoalProgressStatus;
  /** Qualidade do total consumido. Um progresso sobre total parcial não é exato. */
  quality: NutrientTotalQuality;
};

/**
 * Progresso de um nutriente contra a meta.
 *
 * `quality` vem do total e é propagada de propósito: "78% da meta de proteína" calculado
 * sobre um total PARCIAL (algum item sem o nutriente analisado) é um piso, não o número real,
 * e a interface é obrigada a dizer isso.
 */
export function goalProgress(
  code: string,
  total: NutrientTotal | undefined,
  target: GoalTarget | null,
): GoalProgress {
  const consumed = total?.amount ?? 0;
  const quality: NutrientTotalQuality = total?.quality ?? "parcial";

  if (!target || (target.amount === null && target.min === null && target.max === null)) {
    return {
      code,
      consumed,
      target: null,
      min: null,
      max: null,
      remaining: null,
      percent: null,
      status: "sem_meta",
      quality,
    };
  }

  const amount = target.amount;
  const min = target.min;
  const max = target.max;

  const remaining = amount !== null ? amount - consumed : null;
  const percent = amount !== null && amount > 0 ? (consumed / amount) * 100 : null;

  let status: GoalProgressStatus;
  if (min !== null || max !== null) {
    if (min !== null && consumed < min) status = "abaixo";
    else if (max !== null && consumed > max) status = "acima";
    else status = "na_faixa";
  } else if (amount === null) {
    status = "sem_meta";
  } else if (consumed > amount) {
    status = "acima";
  } else if (consumed === amount) {
    status = "na_faixa";
  } else {
    status = "abaixo";
  }

  return { code, consumed, target: amount, min, max, remaining, percent, status, quality };
}

/** Progresso de todos os nutrientes que têm meta OU consumo. */
export function progressForDay(
  totals: Record<string, NutrientTotal>,
  targets: Record<string, GoalTarget>,
): Record<string, GoalProgress> {
  const codes = new Set([...Object.keys(targets), ...Object.keys(totals)]);
  const result: Record<string, GoalProgress> = {};
  for (const code of codes) {
    result[code] = goalProgress(code, totals[code], targets[code] ?? null);
  }
  return result;
}

/* ───────────────────────────── Aderência ───────────────────────────── */

/**
 * A fórmula, escrita por extenso para a interface poder mostrar.
 *
 * Aderência não é "consumido ÷ meta": por esse critério comer o dobro da meta de gordura
 * daria 200% de "aderência", o que é absurdo. Aqui aderência mede PROXIMIDADE:
 *   • dentro da faixa (ou exatamente na meta) → 100%
 *   • fora → cai proporcionalmente ao desvio relativo, até 0% quando o desvio iguala a meta
 */
export const ADHERENCE_FORMULA =
  "Aderência = 100% quando o consumo fica na meta (ou dentro da faixa). Fora dela, desconta o desvio proporcional à meta: 100 − |consumido − meta| ÷ meta × 100, limitado a 0%.";

export type Adherence = {
  /** 0 a 100. `null` quando nenhum nutriente tinha meta. */
  percent: number | null;
  /** Quantos nutrientes entraram na conta. */
  counted: number;
  /** Qualidade do pior total considerado — a aderência não é mais exata que os dados. */
  quality: NutrientTotalQuality;
};

/** Aderência de um nutriente isolado (0 a 100). `null` quando não há meta comparável. */
export function adherenceForNutrient(progress: GoalProgress): number | null {
  const { consumed, target, min, max } = progress;

  if (min !== null || max !== null) {
    const low = min ?? Number.NEGATIVE_INFINITY;
    const high = max ?? Number.POSITIVE_INFINITY;
    if (consumed >= low && consumed <= high) return 100;
    const border = consumed < low ? low : high;
    if (!Number.isFinite(border) || border === 0) return null;
    const deviation = Math.abs(consumed - border) / Math.abs(border);
    return Math.max(0, 100 - deviation * 100);
  }

  if (target === null || target <= 0) return null;
  const deviation = Math.abs(consumed - target) / target;
  return Math.max(0, 100 - deviation * 100);
}

const worstQuality = (a: NutrientTotalQuality, b: NutrientTotalQuality): NutrientTotalQuality => {
  if (a === "parcial" || b === "parcial") return "parcial";
  if (a === "aproximado" || b === "aproximado") return "aproximado";
  return "exato";
};

/**
 * Aderência geral: média simples das aderências dos nutrientes com meta.
 *
 * Média SIMPLES, e não ponderada, porque qualquer peso seria arbitrário — e peso arbitrário
 * dentro de um número que a pessoa usa para se avaliar é pior que a simplicidade.
 */
export function adherence(
  progress: Record<string, GoalProgress>,
  codes: readonly string[] = ADHERENCE_NUTRIENTS,
): Adherence {
  const values: number[] = [];
  let quality: NutrientTotalQuality = "exato";

  for (const code of codes) {
    const item = progress[code];
    if (!item) continue;
    const value = adherenceForNutrient(item);
    if (value === null) continue;
    values.push(value);
    quality = worstQuality(quality, item.quality);
  }

  if (values.length === 0) return { percent: null, counted: 0, quality: "exato" };
  const sum = values.reduce((acc, value) => acc + value, 0);
  return { percent: sum / values.length, counted: values.length, quality };
}

/** Nutrientes considerados na aderência geral: energia e os três macros principais. */
export const ADHERENCE_NUTRIENTS = [
  CORE_NUTRIENTS.energia,
  CORE_NUTRIENTS.proteina,
  CORE_NUTRIENTS.carboidrato,
  CORE_NUTRIENTS.lipidios,
] as const;

/* ───────────────────────────── Estimador (OPCIONAL) ─────────────────────────────
 * REGRA 8 — SEM PRESCRIÇÃO. Nada aqui é aplicado automaticamente. A função devolve o número
 * JUNTO com a fórmula e os fatores usados, e quem grava meta é o usuário, confirmando.
 * Não há diagnóstico, não há recomendação clínica, não há "meta ideal".
 */

/** Fatores de atividade da equação de Mifflin-St Jeor. Explícitos para poderem ser exibidos. */
export const ACTIVITY_FACTORS: Record<string, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  muito_intenso: 1.9,
};

export type EnergyEstimate = {
  /** Taxa metabólica basal (kcal/dia). */
  bmr: number;
  /** Gasto energético total estimado (kcal/dia). */
  total: number;
  activityFactor: number;
  /** A conta, por extenso, para a tela mostrar. */
  formula: string;
  /** O que faltou informar, quando não deu para estimar. */
  missing: string[];
};

/**
 * Estimativa de gasto energético por Mifflin-St Jeor.
 *
 * Devolve `null` quando falta dado — estimar sem peso, altura ou idade seria inventar. A
 * própria estrutura do retorno carrega a fórmula, porque um número sem origem, numa tela de
 * alimentação, é exatamente o tipo de coisa que este módulo se recusa a produzir.
 *
 * @param hoje data pura de referência para a idade. Injetada: nada aqui chama `Date.now()`.
 */
export function estimateEnergyExpenditure(
  profile: Pick<NutritionProfile, "sex" | "weightKg" | "heightCm" | "birthDate" | "activityLevel">,
  hoje: string,
): EnergyEstimate | null {
  const missing: string[] = [];
  if (!profile.weightKg) missing.push("peso");
  if (!profile.heightCm) missing.push("altura");
  if (!profile.birthDate) missing.push("data de nascimento");
  if (profile.sex === "nao_informado") missing.push("sexo biológico (a equação depende dele)");
  const factor = ACTIVITY_FACTORS[profile.activityLevel];
  if (!factor) missing.push("nível de atividade");

  if (missing.length > 0 || !profile.weightKg || !profile.heightCm || !profile.birthDate || !factor) {
    return null;
  }

  const age = ageOn(profile.birthDate, hoje);
  if (age === null) return null;

  // Mifflin-St Jeor: 10×peso + 6,25×altura − 5×idade + s, com s = +5 (homens) / −161 (mulheres).
  const sexTerm = profile.sex === "masculino" ? 5 : -161;
  const bmr = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * age + sexTerm;
  const total = bmr * factor;

  return {
    bmr,
    total,
    activityFactor: factor,
    formula: `Mifflin-St Jeor: (10 × ${profile.weightKg} kg) + (6,25 × ${profile.heightCm} cm) − (5 × ${age} anos) ${sexTerm >= 0 ? "+" : "−"} ${Math.abs(sexTerm)} = ${Math.round(bmr)} kcal/dia, multiplicado pelo fator de atividade ${factor.toLocaleString("pt-BR")}.`,
    missing: [],
  };
}

/** O que falta no perfil para o estimador funcionar (para a tela pedir só o necessário). */
export function missingForEstimate(
  profile: Pick<NutritionProfile, "sex" | "weightKg" | "heightCm" | "birthDate" | "activityLevel">,
): string[] {
  const missing: string[] = [];
  if (!profile.weightKg) missing.push("peso");
  if (!profile.heightCm) missing.push("altura");
  if (!profile.birthDate) missing.push("data de nascimento");
  if (profile.sex === "nao_informado") missing.push("sexo biológico");
  if (!ACTIVITY_FACTORS[profile.activityLevel]) missing.push("nível de atividade");
  return missing;
}

/** Idade em anos completos numa data. Só aritmética de texto — sem fuso, sem `Date`. */
export function ageOn(birthDate: string, hoje: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^\d{4}-\d{2}-\d{2}$/.test(hoje)) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [hy, hm, hd] = hoje.split("-").map(Number);
  let age = hy - by;
  if (hm < bm || (hm === bm && hd < bd)) age -= 1;
  return age >= 0 ? age : null;
}

/** Aviso exibido em toda tela que mostra estimativa. Fica aqui para ser sempre o mesmo texto. */
export const ESTIMATE_DISCLAIMER =
  "Estimativa calculada a partir dos dados que você informou, para servir de ponto de partida. Não é recomendação nutricional nem médica — nenhuma meta é definida automaticamente.";
