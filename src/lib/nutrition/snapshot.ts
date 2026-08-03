/**
 * Fase 16-B — Dieta e Alimentação · Snapshot histórico do consumo (PURO, sem I/O).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A REGRA: editar ou excluir um alimento no catálogo NÃO PODE mudar o passado.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O erro clássico de app de nutrição é guardar `food_id` + `quantity` e recalcular o
 * histórico a partir do catálogo ATUAL. Aí corrigir a proteína de um alimento hoje reescreve,
 * em silêncio, o que a pessoa comeu no ano passado — e o relatório de janeiro muda sozinho.
 *
 * Aqui o registro CONGELA tudo que o cálculo precisa: identidade do alimento, quantidade,
 * conversão, procedência e os nutrientes já ajustados à porção. Depois disso, o total do dia
 * é lido do snapshot e nunca mais toca no catálogo.
 *
 * REUSO OBRIGATÓRIO: a conversão vem de `convertToBase` (units.ts) e o ajuste dos nutrientes
 * de `scaleNutrients` (calc.ts). Reimplementar a conta aqui faria diário, receita e relatório
 * discordarem entre si — que é exatamente o que a regra 3 do módulo proíbe.
 */
import { scaleNutrients, type NutrientBag } from "./calc";
import { CORE_NUTRIENTS, type BaseUnit, type PreparationState } from "./constants";
import { convertToBase, type ConversionFailureReason, type ConvertibleMeasure } from "./units";
import type {
  DiaryEntrySnapshot,
  FoodNutrientValue,
  NutrientSnapshotBag,
  SnapshotNutrient,
} from "./types";

/* ───────────────────────────── Entrada ───────────────────────────── */

/** O mínimo que o snapshot precisa saber sobre o alimento no momento do registro. */
export type SnapshotFoodInput = {
  name: string;
  preparationState: PreparationState | null;
  brand: string | null;
  baseQuantity: number;
  baseUnit: BaseUnit;
  sourceId: string | null;
  sourceName: string | null;
  sourceVersion: string | null;
  sourceFoodCode: string | null;
  nutrients: FoodNutrientValue[];
};

export type SnapshotInput = {
  food: SnapshotFoodInput;
  /** Quantidade digitada, na medida escolhida (ou na unidade-base, se `measure` é nulo). */
  quantity: number;
  measure: ConvertibleMeasure | null;
};

export type SnapshotResult =
  | { ok: true; snapshot: DiaryEntrySnapshot }
  | { ok: false; reason: ConversionFailureReason };

/* ───────────────────────────── Construção ───────────────────────────── */

/**
 * Monta o snapshot de um item consumido.
 *
 * Devolve erro tipado quando a conversão é impossível (ex.: medida em gramas para um
 * alimento medido em ml, que exigiria densidade). Registrar consumo com uma conversão
 * chutada gravaria dado inventado no histórico — e histórico não se corrige depois.
 */
export function buildDiaryEntrySnapshot(input: SnapshotInput): SnapshotResult {
  const { food, quantity, measure } = input;

  const conversion = convertToBase(quantity, measure, {
    baseQuantity: food.baseQuantity,
    baseUnit: food.baseUnit,
  });
  if (!conversion.ok) return { ok: false, reason: conversion.reason };

  const scaled = scaleNutrients(food.nutrients, conversion.factor);

  const nutrientsSnapshot: NutrientSnapshotBag = {};
  for (const [code, value] of Object.entries(scaled)) {
    nutrientsSnapshot[code] = {
      amount: value.amount,
      state: value.state,
      method: value.method,
    };
  }

  return {
    ok: true,
    snapshot: {
      foodNameSnapshot: food.name,
      preparationStateSnapshot: food.preparationState,
      brandSnapshot: food.brand,
      quantity,
      measureLabel: measure?.label ?? null,
      gramsEquivalent: conversion.amount,
      baseQuantity: food.baseQuantity,
      baseUnit: food.baseUnit,
      sourceIdSnapshot: food.sourceId,
      sourceNameSnapshot: food.sourceName,
      sourceVersionSnapshot: food.sourceVersion,
      sourceFoodCodeSnapshot: food.sourceFoodCode,
      nutrientsSnapshot,
      // Colunas quentes: derivadas AQUI, uma única vez. `null` quando o nutriente não está
      // disponível — jamais 0, senão a listagem rápida mentiria onde o total é honesto.
      energyKcal: hotValue(nutrientsSnapshot, CORE_NUTRIENTS.energia),
      proteinG: hotValue(nutrientsSnapshot, CORE_NUTRIENTS.proteina),
      carbG: hotValue(nutrientsSnapshot, CORE_NUTRIENTS.carboidrato),
      fatG: hotValue(nutrientsSnapshot, CORE_NUTRIENTS.lipidios),
      fiberG: hotValue(nutrientsSnapshot, CORE_NUTRIENTS.fibra),
    },
  };
}

/**
 * Valor para as colunas quentes. Só `disponivel` vira número: "traço" e "não disponível"
 * ficam nulos porque a coluna quente não tem onde guardar o estado, e um 0 ali seria lido
 * como medição. O estado completo continua no jsonb, que é de onde sai o total.
 */
function hotValue(bag: NutrientSnapshotBag, code: string): number | null {
  const value = bag[code];
  if (!value || value.state !== "disponivel") return null;
  return value.amount;
}

/* ───────────────────────────── Leitura ───────────────────────────── */

/**
 * Snapshot → `NutrientBag` do calc.ts.
 *
 * É a ponte que garante a imutabilidade: o total do dia soma ISTO, lido da linha do diário,
 * e nunca consulta `nutrition_food_nutrients`. É por isso que editar o alimento não mexe no
 * passado — não existe caminho de leitura do total que passe pelo catálogo.
 */
export function snapshotToBag(snapshot: NutrientSnapshotBag): NutrientBag {
  const bag: NutrientBag = {};
  for (const [code, value] of Object.entries(snapshot ?? {})) {
    bag[code] = {
      code,
      amount: value.state === "disponivel" ? value.amount : null,
      state: value.state,
      method: value.method,
    };
  }
  return bag;
}

/**
 * Normaliza o jsonb que vem do banco (tipado como `Json`, ou seja, `unknown` na prática).
 * Uma chave malformada é descartada em vez de virar zero — dado corrompido não pode ser
 * promovido a medição.
 */
export function parseNutrientSnapshot(raw: unknown): NutrientSnapshotBag {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const bag: NutrientSnapshotBag = {};

  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;

    const state = typeof entry.state === "string" ? entry.state : null;
    if (!state) continue;

    const rawAmount = entry.amount;
    const amount =
      typeof rawAmount === "number" && Number.isFinite(rawAmount)
        ? rawAmount
        : typeof rawAmount === "string" && rawAmount.trim() !== "" && Number.isFinite(Number(rawAmount))
          ? Number(rawAmount)
          : null;

    bag[code] = {
      // Valor sem número não pode ficar como "disponível": a incoerência viraria um total
      // que parece exato. Sem número, o estado honesto é "não disponível".
      amount: state === "disponivel" ? amount : null,
      state: (state === "disponivel" && amount === null
        ? "nao_disponivel"
        : state) as SnapshotNutrient["state"],
      method: (typeof entry.method === "string"
        ? entry.method
        : "desconhecido") as SnapshotNutrient["method"],
    };
  }
  return bag;
}

/** Rótulo legível da porção registrada: "2 colheres de sopa (50 g)" ou "150 g". */
export function describeSnapshotPortion(snapshot: {
  quantity: number | null;
  measureLabel: string | null;
  gramsEquivalent: number | null;
  baseUnit: BaseUnit | null;
}): string {
  const { quantity, measureLabel, gramsEquivalent, baseUnit } = snapshot;
  if (quantity === null) return measureLabel ?? "";

  const qty = formatQuantity(quantity);
  if (!measureLabel) return `${qty} ${baseUnit ?? "g"}`;
  if (gramsEquivalent === null) return `${qty} × ${measureLabel}`;
  return `${qty} × ${measureLabel} (${formatQuantity(gramsEquivalent)} ${baseUnit ?? "g"})`;
}

function formatQuantity(value: number): string {
  return Number(value.toFixed(2)).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
