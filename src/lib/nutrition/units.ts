/**
 * Fase 16-A — Dieta e Alimentação · Conversão de medidas (PURO, sem I/O).
 *
 * Responsabilidade única: transformar "2 colheres de sopa" na quantidade da BASE do alimento
 * (gramas ou mililitros), para o cálculo nutricional poder trabalhar.
 *
 * REGRA QUE NÃO SE NEGOCIA: conversão impossível é ERRO EXPLÍCITO, nunca estimativa.
 * Se o alimento é medido em ml e a medida caseira só declara gramas, falta a densidade —
 * e densidade chutada é dado inventado. A função devolve um resultado tipado com o motivo,
 * e a interface explica o que fazer (cadastrar a conversão certa).
 *
 * Nenhuma conversão genérica entre alimentos: 1 colher de sopa de arroz e 1 de azeite não
 * pesam o mesmo, então a conversão mora em `nutrition_food_measures`, por alimento.
 */
import type { BaseUnit } from "./constants";

/** O mínimo que o cálculo precisa saber sobre o alimento. */
export type ConvertibleFood = {
  baseQuantity: number;
  baseUnit: BaseUnit;
};

/** O mínimo que o cálculo precisa saber sobre a medida escolhida. */
export type ConvertibleMeasure = {
  label: string;
  grams: number | null;
  milliliters: number | null;
};

export type ConversionFailureReason =
  | "quantidade_invalida"
  | "medida_sem_conversao"
  | "unidade_incompativel"
  | "base_invalida";

export type ConversionResult =
  | {
      ok: true;
      /** Quantidade na unidade-base do alimento (g ou ml). */
      amount: number;
      unit: BaseUnit;
      /** Multiplicador a aplicar em cada nutriente: amount / baseQuantity. */
      factor: number;
    }
  | { ok: false; reason: ConversionFailureReason };

export const CONVERSION_FAILURE_MESSAGES: Record<ConversionFailureReason, string> = {
  quantidade_invalida: "Informe uma quantidade maior que zero.",
  medida_sem_conversao:
    "Esta medida caseira ainda não tem conversão em gramas ou mililitros. Cadastre a conversão para poder calcular.",
  unidade_incompativel:
    "A medida está em uma unidade diferente da base do alimento e não há conversão confiável. Cadastre a medida na unidade do alimento.",
  base_invalida: "O alimento está sem quantidade-base válida.",
};

const isPositive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Converte `quantity` (na medida informada) para a unidade-base do alimento.
 *
 * @param quantity quantidade digitada pelo usuário
 * @param measure  medida caseira escolhida; `null` = a quantidade já está na unidade-base
 */
export function convertToBase(
  quantity: number,
  measure: ConvertibleMeasure | null,
  food: ConvertibleFood,
): ConversionResult {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, reason: "quantidade_invalida" };
  }
  if (!isPositive(food.baseQuantity)) {
    return { ok: false, reason: "base_invalida" };
  }

  // Sem medida caseira: o usuário digitou direto em g/ml.
  if (!measure) {
    return {
      ok: true,
      amount: quantity,
      unit: food.baseUnit,
      factor: quantity / food.baseQuantity,
    };
  }

  const hasGrams = isPositive(measure.grams);
  const hasMl = isPositive(measure.milliliters);
  if (!hasGrams && !hasMl) {
    return { ok: false, reason: "medida_sem_conversao" };
  }

  // Usa a conversão que casa com a base do alimento. Não há fallback cruzado de propósito:
  // g→ml exige densidade, e densidade presumida é dado inventado.
  const perUnit = food.baseUnit === "g" ? measure.grams : measure.milliliters;
  if (!isPositive(perUnit)) {
    return { ok: false, reason: "unidade_incompativel" };
  }

  const amount = quantity * perUnit;
  return { ok: true, amount, unit: food.baseUnit, factor: amount / food.baseQuantity };
}

/**
 * Descreve a medida de forma legível ("Colher de sopa (25 g)").
 * Quando não há conversão, diz isso em vez de inventar um número.
 */
export function describeMeasure(measure: ConvertibleMeasure, baseUnit: BaseUnit): string {
  const value = baseUnit === "g" ? measure.grams : measure.milliliters;
  if (!isPositive(value)) return `${measure.label} (sem conversão)`;
  return `${measure.label} (${formatAmount(value)} ${baseUnit})`;
}

/** Formata quantidade sem casas inúteis: 25 vira "25", 25.5 vira "25,5". */
export function formatAmount(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Number(value.toFixed(maxDecimals));
  return rounded.toLocaleString("pt-BR", { maximumFractionDigits: maxDecimals });
}

/**
 * A medida que deve vir selecionada por padrão: a marcada como padrão, senão a de menor
 * `position`, senão nenhuma (o usuário digita em g/ml).
 */
export function defaultMeasure<T extends { isDefault: boolean; position: number }>(
  measures: T[],
): T | null {
  if (measures.length === 0) return null;
  const marked = measures.find((m) => m.isDefault);
  if (marked) return marked;
  return [...measures].sort((a, b) => a.position - b.position)[0] ?? null;
}

/* ───────────────────────── Conversões entre unidades do MESMO tipo ─────────────────────────
 * Usadas na consolidação da lista de compras (Subfase D) e ao digitar em kg/L no formulário.
 * Só existem fatores EXATOS por definição — nada de aproximação entre massa e volume.
 */
export const MASS_UNITS = { mg: 0.001, g: 1, kg: 1000 } as const;
export const VOLUME_UNITS = { ml: 1, l: 1000 } as const;

export type MassUnit = keyof typeof MASS_UNITS;
export type VolumeUnit = keyof typeof VOLUME_UNITS;

/** Converte entre unidades de massa (para g) ou de volume (para ml). `null` se incompatível. */
export function toBaseUnitValue(value: number, unit: string): { amount: number; base: BaseUnit } | null {
  if (!Number.isFinite(value)) return null;
  const key = unit.toLowerCase();
  if (key in MASS_UNITS) {
    return { amount: value * MASS_UNITS[key as MassUnit], base: "g" };
  }
  if (key in VOLUME_UNITS) {
    return { amount: value * VOLUME_UNITS[key as VolumeUnit], base: "ml" };
  }
  return null;
}
