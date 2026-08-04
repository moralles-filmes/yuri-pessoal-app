/**
 * Fase 16-A — Dieta e Alimentação · Núcleo de cálculo nutricional (PURO, sem I/O).
 *
 * Todo total do módulo — item, refeição, dia, semana, receita — sai daqui. As subfases
 * seguintes devem REUSAR estas funções, nunca reimplementar a conta.
 *
 * ═══ AS TRÊS REGRAS QUE SUSTENTAM O MÓDULO ═══
 *
 * 1. FÓRMULA ÚNICA
 *      nutriente = amount × (quantidade em gramas/ml) ÷ base do alimento
 *    A base vem do próprio alimento (`base_quantity`/`base_unit`), nunca é assumida como 100.
 *
 * 2. AUSÊNCIA NÃO É ZERO
 *    Somar tratando "não analisado" como 0 inventa precisão que o dado não tem. Cada total
 *    carrega uma QUALIDADE:
 *      • exato       — todos os itens tinham o valor publicado
 *      • aproximado  — algum item era "traço" (conta como 0, mas o valor real é > 0)
 *      • parcial     — algum item não tinha o nutriente (não analisado / em reavaliação)
 *    A interface é obrigada a mostrar isso. "Parcial" com cara de exato é mentira numérica.
 *    ("Não aplicável" é ignorado: não contribui e não degrada o total.)
 *
 * 3. ARREDONDAR SÓ NA APRESENTAÇÃO
 *    Nada de arredondar valor intermediário. `roundForDisplay` existe para a UI e só deve ser
 *    chamado na última etapa, com as casas decimais que o próprio nutriente define.
 */
import type { NutrientMethod, NutrientTotalQuality, NutrientValueState } from "./constants";
import type { FoodNutrientValue, NutrientDefinition } from "./types";

/* ───────────────────────────── Tipos ───────────────────────────── */

/** Valor de um nutriente já ajustado à quantidade consumida. */
export type ComputedNutrient = {
  code: string;
  /** Nulo quando não há valor. NUNCA substitua por 0 fora deste módulo. */
  amount: number | null;
  state: NutrientValueState;
  method: NutrientMethod;
  /**
   * Só existe em valor JÁ AGREGADO (16-C): uma receita ou uma refeição-modelo é a soma de
   * vários itens, e essa soma tem uma qualidade própria. Sem este campo, um total parcial de
   * receita entraria no dia como se fosse exato — a mentira que a regra 1 do módulo proíbe.
   * Ausente = valor de item simples, cuja qualidade sai só do `state`.
   */
  quality?: NutrientTotalQuality;
};

export type { NutrientTotalQuality };

export type NutrientTotal = {
  code: string;
  /** Soma dos valores disponíveis. Traço entra como 0. */
  amount: number;
  quality: NutrientTotalQuality;
  /** Quantos itens contribuíram com valor publicado. */
  contributing: number;
  /** Quantos itens eram "traço" — ou eram agregados de qualidade "aproximado" (16-C). */
  trace: number;
  /**
   * Quantos itens degradaram o total para PARCIAL: os que não tinham o valor (não analisado /
   * em reavaliação) e os agregados que já vinham parciais (receita com ingrediente sem o
   * nutriente).
   */
  missing: number;
};

/** Conjunto de nutrientes de um item, indexado por código. */
export type NutrientBag = Record<string, ComputedNutrient>;

/* ───────────────────────────── Um item ───────────────────────────── */

/**
 * Aplica o fator de quantidade a um valor de nutriente.
 * `factor` vem de `convertToBase()` (units.ts) e já é `gramas ÷ base`.
 */
export function scaleNutrient(value: FoodNutrientValue, factor: number): ComputedNutrient {
  if (value.state !== "disponivel" || value.amount === null || !Number.isFinite(factor)) {
    return {
      code: value.code,
      amount: null,
      state: value.state,
      method: value.method,
      ...(value.quality ? { quality: value.quality } : {}),
    };
  }
  return {
    code: value.code,
    amount: value.amount * factor,
    state: "disponivel",
    method: value.method,
    // Escalar não melhora a qualidade: metade de um total parcial continua parcial.
    ...(value.quality ? { quality: value.quality } : {}),
  };
}

/** Aplica o fator a todos os nutrientes de um alimento e devolve o conjunto indexado. */
export function scaleNutrients(values: FoodNutrientValue[], factor: number): NutrientBag {
  const bag: NutrientBag = {};
  for (const value of values) bag[value.code] = scaleNutrient(value, factor);
  return bag;
}

/* ───────────────────────────── Somas ───────────────────────────── */

/**
 * Soma o mesmo nutriente entre vários itens, propagando a qualidade.
 *
 * `bags` é a lista de conjuntos (um por item consumido). Um item que **não tem** o nutriente
 * conta como ausente — é o caso mais comum e o mais fácil de errar: a fonte simplesmente não
 * analisou aquele nutriente naquele alimento.
 */
export function sumNutrient(bags: NutrientBag[], code: string): NutrientTotal {
  let amount = 0;
  let contributing = 0;
  let trace = 0;
  let missing = 0;

  for (const bag of bags) {
    const value = bag[code];
    if (!value) {
      missing += 1;
      continue;
    }
    switch (value.state) {
      case "disponivel":
        amount += value.amount ?? 0;
        contributing += 1;
        // Item JÁ AGREGADO (receita, refeição-modelo): ele tem número, mas o número pode ser
        // um piso. A degradação é contada aqui para a qualidade do total não mentir — sem
        // isso, uma receita com um ingrediente sem fibra analisada entraria no dia como se a
        // fibra fosse exata. `contributing` continua subindo porque o valor CONTRIBUI.
        if (value.quality === "parcial") missing += 1;
        else if (value.quality === "aproximado") trace += 1;
        break;
      case "traco":
        // Presente, porém abaixo do limite de quantificação: entra como 0 e marca o total
        // como aproximado (o valor real é maior que zero).
        trace += 1;
        break;
      case "nao_aplicavel":
        // Não faz sentido para o alimento: ignorar sem degradar o total.
        break;
      default:
        // nao_disponivel | em_revisao
        missing += 1;
        break;
    }
  }

  const quality: NutrientTotalQuality = missing > 0 ? "parcial" : trace > 0 ? "aproximado" : "exato";
  return { code, amount, quality, contributing, trace, missing };
}

/** Soma todos os nutrientes que aparecem em pelo menos um item. */
export function sumNutrients(bags: NutrientBag[]): Record<string, NutrientTotal> {
  const codes = new Set<string>();
  for (const bag of bags) for (const code of Object.keys(bag)) codes.add(code);

  const totals: Record<string, NutrientTotal> = {};
  for (const code of codes) totals[code] = sumNutrient(bags, code);
  return totals;
}

/**
 * Combina totais já calculados (dia → semana, refeição → dia). Mantém a propagação de
 * qualidade: um dia parcial torna a semana parcial.
 */
export function mergeTotals(
  groups: Record<string, NutrientTotal>[],
): Record<string, NutrientTotal> {
  const merged: Record<string, NutrientTotal> = {};
  for (const group of groups) {
    for (const total of Object.values(group)) {
      const current = merged[total.code];
      if (!current) {
        merged[total.code] = { ...total };
        continue;
      }
      current.amount += total.amount;
      current.contributing += total.contributing;
      current.trace += total.trace;
      current.missing += total.missing;
      current.quality =
        current.missing > 0 ? "parcial" : current.trace > 0 ? "aproximado" : "exato";
    }
  }
  return merged;
}

/* ───────────────────────────── Energia ───────────────────────────── */

/**
 * Fatores de conversão de Atwater. Ficam explícitos porque a estimativa PRECISA ser
 * auditável — o usuário tem direito de saber de onde saiu o número.
 */
export const ATWATER_FACTORS = {
  proteina: 4,
  carboidrato: 4,
  lipidios: 9,
  fibra: 2,
  alcool: 7,
} as const;

export type EnergyEstimateInput = {
  proteina?: number | null;
  carboidrato?: number | null;
  lipidios?: number | null;
  fibra?: number | null;
  alcool?: number | null;
};

/**
 * Energia ESTIMADA a partir dos macros.
 *
 * Existe para conferência, não para substituir o valor da fonte. Quem consome isto tem de
 * rotular como estimativa — sobrescrever a energia publicada em silêncio é falsificar o dado.
 * Devolve `null` quando não há macro nenhum (estimar do nada seria inventar).
 */
export function estimateEnergyKcal(input: EnergyEstimateInput): number | null {
  const parts: number[] = [];
  for (const [key, factor] of Object.entries(ATWATER_FACTORS) as [
    keyof typeof ATWATER_FACTORS,
    number,
  ][]) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) parts.push(value * factor);
  }
  if (parts.length === 0) return null;
  return parts.reduce((sum, part) => sum + part, 0);
}

/** Divergência relativa entre a energia declarada e a estimada. `null` se faltar um lado. */
export function energyDivergence(declared: number | null, estimated: number | null): number | null {
  if (declared === null || estimated === null) return null;
  if (!Number.isFinite(declared) || !Number.isFinite(estimated) || declared <= 0) return null;
  return Math.abs(estimated - declared) / declared;
}

/** Acima de 10% vale mostrar ao usuário que a fonte e o cálculo não batem. */
export const ENERGY_DIVERGENCE_THRESHOLD = 0.1;

/* ───────────────────────────── Apresentação ───────────────────────────── */

/**
 * Arredonda para exibição. **Só chame na última etapa.**
 * O deslocamento por potência de 10 evita o clássico `1.005 → 1.00` do ponto flutuante.
 */
export function roundForDisplay(value: number, precision = 1): number {
  if (!Number.isFinite(value)) return 0;
  const digits = Math.max(0, Math.min(6, Math.trunc(precision)));
  const scale = 10 ** digits;
  const scaled = value * scale;
  // `Number.EPSILON` relativo corrige o erro de representação antes de arredondar.
  const corrected = scaled + Math.sign(scaled) * Math.abs(scaled) * Number.EPSILON;
  return Math.round(corrected) / scale;
}

/** Formata um valor de nutriente em pt-BR, com as casas decimais que o nutriente define. */
export function formatNutrientAmount(value: number, definition: NutrientDefinition): string {
  const rounded = roundForDisplay(value, definition.precision);
  return rounded.toLocaleString("pt-BR", {
    minimumFractionDigits: definition.precision,
    maximumFractionDigits: definition.precision,
  });
}

/** Formata com a unidade: "12,5 g". */
export function formatNutrientWithUnit(value: number, definition: NutrientDefinition): string {
  return `${formatNutrientAmount(value, definition)} ${definition.unit}`;
}

export const TOTAL_QUALITY_LABELS: Record<NutrientTotalQuality, string> = {
  exato: "Valor completo",
  aproximado: "Aproximado",
  parcial: "Parcial",
};

export const TOTAL_QUALITY_HINTS: Record<NutrientTotalQuality, string> = {
  exato: "Todos os itens têm este nutriente publicado pela fonte.",
  aproximado:
    "Algum item tem apenas “traço” deste nutriente: contou como zero, mas o valor real é um pouco maior.",
  parcial:
    "Algum item não tem este nutriente analisado pela fonte. O total mostrado é o mínimo conhecido, não o valor real.",
};

/* ───────────────────────────── Atalhos de macro ───────────────────────────── */

/** Lê um total pelo código, devolvendo 0 quando não existe (para exibição em card). */
export function totalAmount(totals: Record<string, NutrientTotal>, code: string): number {
  return totals[code]?.amount ?? 0;
}

/** Qualidade de um total pelo código; ausência é "parcial", não "exato". */
export function totalQuality(
  totals: Record<string, NutrientTotal>,
  code: string,
): NutrientTotalQuality {
  return totals[code]?.quality ?? "parcial";
}

/**
 * Percentual de uma meta. Devolve `null` quando não há meta — 0% e "sem meta" são
 * informações diferentes.
 */
export function goalPercent(amount: number, goal: number | null | undefined): number | null {
  if (typeof goal !== "number" || !Number.isFinite(goal) || goal <= 0) return null;
  return (amount / goal) * 100;
}

/** Quanto falta para a meta. Negativo significa que passou. `null` quando não há meta. */
export function goalRemaining(amount: number, goal: number | null | undefined): number | null {
  if (typeof goal !== "number" || !Number.isFinite(goal)) return null;
  return goal - amount;
}
