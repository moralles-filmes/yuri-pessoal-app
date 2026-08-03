/**
 * Fase 17-A — Treinos · O contrato de medição de um exercício (PURO).
 *
 * ESTE ARQUIVO É A ÚNICA FONTE DE "QUAIS CAMPOS ESSE EXERCÍCIO USA".
 *
 * Por que isso importa tanto: um módulo de treino guarda coisas que **não se somam**. 100 kg
 * × 8 repetições no supino, 60 segundos de prancha e 3 km de esteira são três grandezas
 * diferentes. Se cada tela decidir por conta própria o que é "volume", o histórico (17-D), o
 * dashboard (17-E) e a sessão (17-C) vão discordar entre si — e o gráfico bonito vai estar
 * errado sem ninguém perceber.
 *
 * Duas regras que parecem detalhe e não são:
 *
 *  1. **Assistência SUBTRAI carga.** Na barra fixa assistida, 30 kg de assistência tornam o
 *     exercício MAIS FÁCIL. Tratar esse número como peso adicional inverteria o sinal e faria
 *     "progresso" aparecer justamente quando o usuário está regredindo.
 *  2. **Sem peso corporal registrado, a carga efetiva é INDISPONÍVEL — nunca zero.** Uma
 *     flexão de braço não é "0 kg × 12". É a mesma disciplina do `value_state` do módulo
 *     Dieta: ausência de dado não é zero.
 *
 * Sem I/O, sem `Date.now()`.
 */
import type { Laterality, TrackingType } from "./constants";

/** Campo mensurável de uma série. */
export type MetricField =
  | "weight"
  | "reps"
  | "duration"
  | "distance"
  | "additionalWeight"
  | "assistanceWeight"
  | "sides"
  | "calories"
  | "incline"
  | "resistance"
  | "custom";

export const METRIC_FIELD_LABELS: Record<MetricField, string> = {
  weight: "Peso",
  reps: "Repetições",
  duration: "Duração",
  distance: "Distância",
  additionalWeight: "Carga adicional",
  assistanceWeight: "Assistência",
  sides: "Lado direito e esquerdo",
  calories: "Calorias",
  incline: "Inclinação",
  resistance: "Resistência",
  custom: "Campo personalizado",
};

/** Em que unidade esse tipo de exercício acumula "volume" na Subfase 17-D. */
export type VolumeUnit = "kg" | "reps" | "segundos" | "distancia" | "calorias" | "nenhum";

export type TrackingSpec = {
  /** Campos sem os quais a série não faz sentido. */
  required: MetricField[];
  /** Campos aceitos, mas opcionais. */
  optional: MetricField[];
  /** O exercício aceita uma carga em kg digitada pelo usuário? */
  usesLoad: boolean;
  /** Como a carga digitada entra na carga efetiva: soma, subtrai ou não se aplica. */
  loadSign: 1 | -1 | 0;
  /** A carga efetiva depende do peso corporal do dia? */
  needsBodyWeight: boolean;
  /** Unidade em que o volume é acumulado. Tipos com unidades diferentes NUNCA se somam. */
  volumeUnit: VolumeUnit;
};

const SPECS: Record<TrackingType, TrackingSpec> = {
  peso_reps: {
    required: ["weight", "reps"],
    optional: [],
    usesLoad: true,
    loadSign: 1,
    needsBodyWeight: false,
    volumeUnit: "kg",
  },
  peso_corporal_reps: {
    required: ["reps"],
    optional: [],
    usesLoad: false,
    loadSign: 0,
    needsBodyWeight: true,
    volumeUnit: "kg",
  },
  peso_corporal_adicional: {
    required: ["reps"],
    optional: ["additionalWeight"],
    usesLoad: true,
    loadSign: 1,
    needsBodyWeight: true,
    volumeUnit: "kg",
  },
  peso_corporal_assistido: {
    // A assistência é obrigatória: sem ela não dá para saber o quanto o exercício foi aliviado.
    required: ["reps", "assistanceWeight"],
    optional: [],
    usesLoad: true,
    loadSign: -1,
    needsBodyWeight: true,
    volumeUnit: "kg",
  },
  duracao: {
    required: ["duration"],
    optional: [],
    usesLoad: false,
    loadSign: 0,
    needsBodyWeight: false,
    volumeUnit: "segundos",
  },
  distancia_duracao: {
    required: ["distance", "duration"],
    optional: ["incline", "resistance"],
    usesLoad: false,
    loadSign: 0,
    needsBodyWeight: false,
    volumeUnit: "distancia",
  },
  calorias: {
    required: ["calories"],
    optional: ["duration"],
    usesLoad: false,
    loadSign: 0,
    needsBodyWeight: false,
    volumeUnit: "calorias",
  },
  reps_sem_carga: {
    required: ["reps"],
    optional: [],
    usesLoad: false,
    loadSign: 0,
    needsBodyWeight: false,
    volumeUnit: "reps",
  },
  isometria: {
    required: ["duration"],
    optional: ["weight"],
    usesLoad: true,
    loadSign: 1,
    needsBodyWeight: false,
    volumeUnit: "segundos",
  },
  lado_a_lado: {
    required: ["sides"],
    optional: ["weight", "reps"],
    usesLoad: true,
    loadSign: 1,
    needsBodyWeight: false,
    volumeUnit: "kg",
  },
  personalizado: {
    required: [],
    optional: ["weight", "reps", "duration", "distance", "custom"],
    usesLoad: true,
    loadSign: 1,
    needsBodyWeight: false,
    volumeUnit: "nenhum",
  },
};

/** A especificação de um tipo de acompanhamento. */
export function trackingSpec(type: TrackingType): TrackingSpec {
  return SPECS[type];
}

/**
 * Campos de uma série, já considerando a lateralidade.
 *
 * Exercício unilateral aceita registrar os lados separadamente **como opção** — quem faz
 * questão disso usa o tipo `lado_a_lado`, onde os lados são obrigatórios.
 */
export function fieldsForTracking(
  type: TrackingType,
  laterality: Laterality = "bilateral",
): { required: MetricField[]; optional: MetricField[] } {
  const spec = SPECS[type];
  const required = [...spec.required];
  const optional = [...spec.optional];

  const isUnilateral = laterality !== "bilateral";
  if (isUnilateral && !required.includes("sides") && !optional.includes("sides")) {
    optional.push("sides");
  }
  return { required, optional };
}

/** O campo é usado (obrigatório ou opcional) por este tipo/lateralidade? */
export function usesField(
  type: TrackingType,
  field: MetricField,
  laterality: Laterality = "bilateral",
): boolean {
  const { required, optional } = fieldsForTracking(type, laterality);
  return required.includes(field) || optional.includes(field);
}

/** Valores de uma série, no formato genérico consumido por este módulo. */
export type SetValues = Partial<Record<MetricField, number | null>>;

/** Quais campos obrigatórios estão faltando. Vazio = a série pode ser gravada. */
export function missingRequiredFields(
  type: TrackingType,
  values: SetValues,
  laterality: Laterality = "bilateral",
): MetricField[] {
  const { required } = fieldsForTracking(type, laterality);
  return required.filter((field) => {
    const value = values[field];
    return value === null || value === undefined || Number.isNaN(value);
  });
}

/* ───────────────────────────── Carga efetiva ─────────────────────────────
 * "Quantos quilos essa série de fato moveu?" A resposta é diferente para cada tipo, e em
 * alguns casos a resposta honesta é "não dá para saber".
 */

export type EffectiveLoadReason =
  | "nao_usa_carga"
  | "sem_peso_corporal"
  | "carga_nao_informada";

export type EffectiveLoad =
  | { ok: true; kg: number }
  | { ok: false; reason: EffectiveLoadReason };

export const EFFECTIVE_LOAD_MESSAGES: Record<EffectiveLoadReason, string> = {
  nao_usa_carga: "Este exercício não é medido em carga.",
  sem_peso_corporal:
    "Depende do seu peso corporal, que não está registrado para essa data. Registre o peso para o cálculo ficar completo.",
  carga_nao_informada: "A carga desta série não foi informada.",
};

/**
 * Carga efetiva de uma série, em kg.
 *
 * - `peso_reps` / `isometria` → a carga digitada.
 * - `peso_corporal_reps` → o peso corporal.
 * - `peso_corporal_adicional` → peso corporal **+** carga adicional.
 * - `peso_corporal_assistido` → peso corporal **−** assistência (nunca abaixo de zero).
 * - Duração, distância, calorias e repetições sem carga → não têm carga, e dizer "0 kg"
 *   seria inventar um número.
 */
export function effectiveLoadKg(input: {
  trackingType: TrackingType;
  weightKg?: number | null;
  additionalWeightKg?: number | null;
  assistanceWeightKg?: number | null;
  bodyWeightKg?: number | null;
}): EffectiveLoad {
  const spec = SPECS[input.trackingType];
  if (spec.volumeUnit !== "kg") return { ok: false, reason: "nao_usa_carga" };

  const body = input.bodyWeightKg ?? null;
  if (spec.needsBodyWeight && (body === null || !Number.isFinite(body))) {
    return { ok: false, reason: "sem_peso_corporal" };
  }

  switch (input.trackingType) {
    case "peso_corporal_reps":
      return { ok: true, kg: body as number };

    case "peso_corporal_adicional": {
      const extra = input.additionalWeightKg ?? 0;
      return { ok: true, kg: (body as number) + extra };
    }

    case "peso_corporal_assistido": {
      const assist = input.assistanceWeightKg;
      if (assist === null || assist === undefined || !Number.isFinite(assist)) {
        return { ok: false, reason: "carga_nao_informada" };
      }
      // Assistência maior que o peso corporal não gera carga negativa: gera zero.
      return { ok: true, kg: Math.max(0, (body as number) - assist) };
    }

    default: {
      const weight = input.weightKg;
      if (weight === null || weight === undefined || !Number.isFinite(weight)) {
        return { ok: false, reason: "carga_nao_informada" };
      }
      return { ok: true, kg: weight };
    }
  }
}

/* ───────────────────────────── Incremento de carga ─────────────────────────────
 * O menor salto REALIZÁVEL naquele exercício. Sugerir "+1 kg" numa máquina de placas de 5 em
 * 5 é sugerir o impossível — por isso a resolução respeita uma ordem de especificidade.
 */
export function resolveIncrementKg(input: {
  prefIncrementKg?: number | null;
  exerciseIncrementKg?: number | null;
  equipmentIncrementKg?: number | null;
  defaultIncrementKg: number;
}): number {
  return (
    input.prefIncrementKg ??
    input.exerciseIncrementKg ??
    input.equipmentIncrementKg ??
    input.defaultIncrementKg
  );
}

/** Mesma ordem de especificidade para o descanso. */
export function resolveRestSeconds(input: {
  prefRestSeconds?: number | null;
  exerciseRestSeconds?: number | null;
  defaultRestSeconds: number;
}): number {
  return input.prefRestSeconds ?? input.exerciseRestSeconds ?? input.defaultRestSeconds;
}

/** Arredonda uma carga para o múltiplo do incremento mais próximo (usado pela 17-D). */
export function snapToIncrement(weightKg: number, incrementKg: number): number {
  if (!Number.isFinite(incrementKg) || incrementKg <= 0) return weightKg;
  const snapped = Math.round(weightKg / incrementKg) * incrementKg;
  // Evita 62.50000000000001 vindo de aritmética de ponto flutuante.
  return Number(snapped.toFixed(3));
}
