/**
 * Fase 17-D — Treinos · 1RM ESTIMADO (PURO, sem I/O, sem `Date.now()`).
 *
 * ═══════════════════════ ISTO É UMA ESTIMATIVA, E A TELA DIZ ISSO ═══════════════════════
 *
 * Uma repetição máxima real se mede tentando. O que este arquivo faz é converter "8 repetições
 * com 100 kg" num número comparável ao longo do tempo — útil para ver progressão, inútil como
 * instrução. Por isso:
 *
 *  • o resultado sempre viaja com a FÓRMULA usada, e a fórmula é escolhível pelo usuário;
 *  • fora da faixa de validade (acima de ~12 repetições) a resposta vem com AVISO, em vez de
 *    esconder o número ou fingir precisão que a fórmula não tem;
 *  • **o sistema nunca sugere tentar uma carga máxima.** Não há "tente 105 kg hoje" em lugar
 *    nenhum do módulo — seria prescrição, e prescrição não é o que este projeto faz.
 *
 * ═══════════════════════ POR QUE 1 REPETIÇÃO DEVOLVE O PRÓPRIO PESO ═══════════════════════
 *
 * Epley, Brzycki e Lombardi já devolvem o próprio peso com 1 repetição; Lander erra por ~1,4%
 * (100 ÷ 98,62877 = 1,0139). Uma série de 1 repetição **é** um teste de 1RM: o número medido
 * vale mais que qualquer fórmula. O curto-circuito é explícito e testado.
 */
import type { OneRmFormula } from "./constants";
import { ONE_RM_FORMULA_LABELS } from "./constants";

/** Acima disso as fórmulas divergem entre si e do real o bastante para o número enganar. */
export const ONE_RM_MAX_VALID_REPS = 12;

export const ONE_RM_FORMULA_DESCRIPTIONS: Record<OneRmFormula, string> = {
  epley: "peso × (1 + repetições ÷ 30)",
  brzycki: "peso × 36 ÷ (37 − repetições)",
  lombardi: "peso × repetições^0,10",
  lander: "peso × 100 ÷ (101,3 − 2,67123 × repetições)",
};

export type OneRmFailure = "entrada_invalida" | "fora_do_dominio";

export const ONE_RM_MESSAGES: Record<OneRmFailure, string> = {
  entrada_invalida:
    "Estimativa indisponível: é preciso ter carga e repetições registradas nesta série.",
  fora_do_dominio:
    "Estimativa indisponível: esta fórmula não tem resultado válido para esse número de repetições.",
};

export type OneRmEstimate =
  | {
      ok: true;
      /** Sempre em kg, arredondado só na apresentação (aqui vai com 3 casas). */
      value: number;
      formula: OneRmFormula;
      formulaLabel: string;
      expression: string;
      reps: number;
      weightKg: number;
      /** `false` acima da faixa de validade — a UI avisa em vez de esconder. */
      withinValidRange: boolean;
      warning: string | null;
      /** `true` quando a série já era de 1 repetição: aí não há estimativa, há medida. */
      measured: boolean;
    }
  | { ok: false; reason: OneRmFailure; message: string };

const round3 = (value: number): number => Number(value.toFixed(3));

function rawValue(formula: OneRmFormula, weightKg: number, reps: number): number | null {
  switch (formula) {
    case "epley":
      return weightKg * (1 + reps / 30);
    case "brzycki": {
      const denominator = 37 - reps;
      // 37 repetições zeram o denominador; acima disso o resultado fica negativo.
      return denominator <= 0 ? null : (weightKg * 36) / denominator;
    }
    case "lombardi":
      return weightKg * Math.pow(reps, 0.1);
    case "lander": {
      const denominator = 101.3 - 2.67123 * reps;
      return denominator <= 0 ? null : (weightKg * 100) / denominator;
    }
    default:
      return null;
  }
}

/**
 * 1RM estimado de uma série.
 *
 * Entrada inválida (sem carga, sem repetições, valores não finitos ou não positivos) **não
 * devolve número** — devolve motivo. Estimar em cima de dado faltando seria inventar o dado.
 */
export function estimateOneRm(input: {
  weightKg: number | null | undefined;
  reps: number | null | undefined;
  formula: OneRmFormula;
}): OneRmEstimate {
  const { weightKg, reps, formula } = input;

  if (
    weightKg === null ||
    weightKg === undefined ||
    reps === null ||
    reps === undefined ||
    !Number.isFinite(weightKg) ||
    !Number.isFinite(reps) ||
    weightKg <= 0 ||
    reps <= 0 ||
    !Number.isInteger(reps)
  ) {
    return { ok: false, reason: "entrada_invalida", message: ONE_RM_MESSAGES.entrada_invalida };
  }

  const base = {
    formula,
    formulaLabel: ONE_RM_FORMULA_LABELS[formula],
    expression: ONE_RM_FORMULA_DESCRIPTIONS[formula],
    reps,
    weightKg,
  };

  // Uma série de 1 repetição é o próprio 1RM medido. Nenhuma fórmula melhora isso.
  if (reps === 1) {
    return {
      ok: true,
      ...base,
      value: round3(weightKg),
      withinValidRange: true,
      warning: null,
      measured: true,
    };
  }

  const value = rawValue(formula, weightKg, reps);
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return { ok: false, reason: "fora_do_dominio", message: ONE_RM_MESSAGES.fora_do_dominio };
  }

  const withinValidRange = reps <= ONE_RM_MAX_VALID_REPS;

  return {
    ok: true,
    ...base,
    value: round3(value),
    withinValidRange,
    warning: withinValidRange
      ? null
      : `Acima de ${ONE_RM_MAX_VALID_REPS} repetições a estimativa perde precisão. O número continua servindo para comparar com você mesmo, não como carga a tentar.`,
    measured: false,
  };
}

/** As quatro estimativas lado a lado — a tela deixa o usuário ver a divergência entre elas. */
export function estimateAllFormulas(input: {
  weightKg: number | null | undefined;
  reps: number | null | undefined;
}): Record<OneRmFormula, OneRmEstimate> {
  return {
    epley: estimateOneRm({ ...input, formula: "epley" }),
    brzycki: estimateOneRm({ ...input, formula: "brzycki" }),
    lombardi: estimateOneRm({ ...input, formula: "lombardi" }),
    lander: estimateOneRm({ ...input, formula: "lander" }),
  };
}

/**
 * O melhor 1RM estimado de um conjunto de séries.
 *
 * Séries sem carga ou sem repetições **não entram** — e o resultado diz quantas ficaram de
 * fora, para a tela poder marcar o número como parcial (mesma disciplina de `metrics.ts`).
 */
export function bestOneRm<T extends { weightKg: number | null; reps: number | null }>(
  sets: T[],
  formula: OneRmFormula,
): { best: { set: T; estimate: Extract<OneRmEstimate, { ok: true }> } | null; ignored: number } {
  let best: { set: T; estimate: Extract<OneRmEstimate, { ok: true }> } | null = null;
  let ignored = 0;

  for (const set of sets) {
    const estimate = estimateOneRm({ weightKg: set.weightKg, reps: set.reps, formula });
    if (!estimate.ok) {
      ignored += 1;
      continue;
    }
    if (!best || estimate.value > best.estimate.value) best = { set, estimate };
  }

  return { best, ignored };
}

/**
 * Percentuais de uma carga a partir do 1RM.
 *
 * Serve para LER uma tabela de treino que fala em "75% de 1RM", não para receitar carga. A UI
 * apresenta como conversão, com a estimativa identificada como estimativa.
 */
export function percentOfOneRm(oneRmKg: number, percent: number): number | null {
  if (!Number.isFinite(oneRmKg) || !Number.isFinite(percent)) return null;
  if (oneRmKg <= 0 || percent <= 0 || percent > 100) return null;
  return round3((oneRmKg * percent) / 100);
}
