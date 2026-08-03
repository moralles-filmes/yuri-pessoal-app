/**
 * Fase 16-B — Dieta e Alimentação · Schemas Zod de metas, diário e planejamento.
 *
 * Validação de SERVIDOR. Como na 16-A, `user_id` NÃO aparece em nenhum schema: vem sempre de
 * `auth.getUser()` na action. É a proteção contra mass assignment exigida pelo projeto.
 *
 * DOIS CAMPOS FICAM DE FORA DE PROPÓSITO, e não por esquecimento:
 *
 * • O SNAPSHOT do item consumido. O cliente manda `food_id` + `quantity` + `measure_id`; quem
 *   monta `nutrients_snapshot`, `grams_equivalent` e as colunas quentes é o servidor, lendo o
 *   catálogo. Aceitar snapshot pronto do navegador permitiria gravar história nutricional
 *   arbitrária — e história, por definição, não se corrige depois.
 *
 * • O STATUS 'pendente'. Não está em `MEAL_STATUSES` porque é derivado da hora atual; aceitá-lo
 *   aqui seria persistir estado derivado, contra a regra 3 da subfase (e o CHECK do banco o
 *   rejeitaria de qualquer forma).
 */
import { z } from "zod";
import {
  ACTIVITY_LEVELS,
  CHANGE_KINDS,
  DAY_KINDS,
  GOAL_DIRECTIONS,
  GOAL_TYPES,
  MEAL_STATUSES,
  PLAN_EDIT_SCOPES,
  PROFILE_SEXES,
} from "@/lib/nutrition/constants";
import {
  dateString,
  optionalColor,
  optionalDate,
  optionalText,
  optionalTime,
  optionalUuid,
} from "@/lib/validators/shared";

/** Número opcional aceitando vírgula (padrão BR). Vazio vira null, nunca 0. */
const optionalNumber = (max = 1_000_000) =>
  z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return null;
      if (typeof v === "string") return Number(v.replace(",", "."));
      return v;
    },
    z.coerce.number().finite("Valor inválido").min(0, "Não pode ser negativo").max(max).nullable(),
  );

const positiveNumber = (message = "Informe um valor maior que zero") =>
  z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z.coerce.number({ message }).finite("Valor inválido").positive(message),
  );

const optionalPositiveNumber = (max = 1_000_000) =>
  z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return null;
      if (typeof v === "string") return Number(v.replace(",", "."));
      return v;
    },
    z.coerce.number().finite("Valor inválido").positive("Deve ser maior que zero").max(max).nullable(),
  );

const weekday = z.coerce.number().int().min(0, "Dia inválido").max(6, "Dia inválido");

/* ═══════════════════════════ Perfil ═══════════════════════════ */

export const nutritionProfileSchema = z.object({
  birth_date: optionalDate,
  sex: z.enum(PROFILE_SEXES).optional().transform((v) => v ?? "nao_informado"),
  height_cm: optionalPositiveNumber(300),
  weight_kg: optionalPositiveNumber(500),
  activity_level: z.enum(ACTIVITY_LEVELS).optional().transform((v) => v ?? "nao_informado"),
  goal_direction: z.enum(GOAL_DIRECTIONS).optional().transform((v) => v ?? "nao_informado"),
  restrictions: z
    .array(z.string().trim().min(1).max(80))
    .max(30, "Restrições demais")
    .optional()
    .transform((v) => v ?? []),
  notes: optionalText(2000),
});

/* ═══════════════════════════ Tipos de refeição ═══════════════════════════ */

export const mealTypeSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60, "Máximo de 60 caracteres"),
  icon: optionalText(8),
  color: optionalColor,
  default_time: optionalTime,
  is_active: z.coerce.boolean().optional().transform((v) => v ?? true),
});

export const mealTypeReorderSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
});

/* ═══════════════════════════ Metas ═══════════════════════════ */

export const goalPeriodSchema = z
  .object({
    name: optionalText(120),
    reason: optionalText(500),
    starts_on: dateString,
    ends_on: optionalDate,
    goal_type: z.enum(GOAL_TYPES).optional().transform((v) => v ?? "fixa"),
    notes: optionalText(2000),
  })
  .superRefine((data, ctx) => {
    if (data.ends_on && data.ends_on < data.starts_on) {
      ctx.addIssue({
        code: "custom",
        path: ["ends_on"],
        message: "O fim não pode ser anterior ao início.",
      });
    }
  });

/**
 * Um valor de meta.
 *
 * As duas regras do CHECK do banco são repetidas aqui para o usuário receber uma mensagem em
 * pt-BR em vez de um erro de constraint: percentual exige refeição, e uma linha sem nenhum
 * número não configura nada.
 */
export const goalItemSchema = z
  .object({
    period_id: z.uuid("Período inválido"),
    nutrient_code: z.string().trim().min(1).max(60),
    weekday: z.preprocess((v) => (v === "" || v === undefined || v === null ? null : v), weekday.nullable()),
    day_kind: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.enum(DAY_KINDS).nullable(),
    ),
    meal_type_id: optionalUuid,
    target_amount: optionalNumber(),
    target_percent: optionalNumber(100),
    min_amount: optionalNumber(),
    max_amount: optionalNumber(),
    notes: optionalText(500),
  })
  .superRefine((data, ctx) => {
    if (data.target_percent !== null && !data.meal_type_id) {
      ctx.addIssue({
        code: "custom",
        path: ["target_percent"],
        message: "Percentual só faz sentido dentro de uma refeição: ele é uma parte da meta do dia.",
      });
    }
    if (
      data.target_amount === null &&
      data.target_percent === null &&
      data.min_amount === null &&
      data.max_amount === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["target_amount"],
        message: "Informe um valor, um percentual ou uma faixa.",
      });
    }
    if (data.min_amount !== null && data.max_amount !== null && data.max_amount < data.min_amount) {
      ctx.addIssue({
        code: "custom",
        path: ["max_amount"],
        message: "O máximo não pode ser menor que o mínimo.",
      });
    }
  });

/** Salvar vários valores de uma vez (a tela de metas edita a tabela inteira). */
export const goalItemsBatchSchema = z.object({
  period_id: z.uuid("Período inválido"),
  /** Escopo que está sendo salvo — o servidor apaga só as linhas deste escopo antes de gravar. */
  weekday: z.preprocess((v) => (v === "" || v === undefined || v === null ? null : v), weekday.nullable()),
  day_kind: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.enum(DAY_KINDS).nullable(),
  ),
  meal_type_id: optionalUuid,
  items: z
    .array(
      z.object({
        nutrient_code: z.string().trim().min(1).max(60),
        target_amount: optionalNumber(),
        target_percent: optionalNumber(100),
        min_amount: optionalNumber(),
        max_amount: optionalNumber(),
      }),
    )
    .max(80, "Nutrientes demais"),
});

/* ═══════════════════════════ Diário ═══════════════════════════ */

export const diaryMealSchema = z.object({
  diary_date: dateString,
  meal_type_id: z.uuid("Escolha o tipo de refeição"),
  planned_meal_id: optionalUuid,
  planned_time: optionalTime,
  consumed_time: optionalTime,
  status: z.enum(MEAL_STATUSES).optional().transform((v) => v ?? "planejada"),
  title: optionalText(120),
  notes: optionalText(2000),
});

export const diaryMealStatusSchema = z.object({
  meal_id: z.uuid("Refeição inválida"),
  status: z.enum(MEAL_STATUSES),
  consumed_time: optionalTime,
  notes: optionalText(2000),
});

/**
 * Registrar consumo de um alimento.
 *
 * O cliente NÃO manda nutriente nenhum: manda o que escolheu (alimento, quantidade, medida) e
 * o servidor monta o snapshot lendo o catálogo. É o que impede gravar história inventada.
 */
export const diaryEntrySchema = z.object({
  diary_meal_id: z.uuid("Refeição inválida"),
  food_id: z.uuid("Escolha o alimento"),
  quantity: positiveNumber("Informe a quantidade"),
  measure_id: optionalUuid,
  planned_item_id: optionalUuid,
  change_kind: z.enum(CHANGE_KINDS).optional().transform((v) => v ?? "extra"),
  notes: optionalText(500),
});

/** Item livre: registrado sem alimento e, por isso, SEM valor nutricional (total parcial). */
export const diaryFreeEntrySchema = z.object({
  diary_meal_id: z.uuid("Refeição inválida"),
  label: z.string().trim().min(1, "Descreva o que foi consumido").max(200),
  planned_item_id: optionalUuid,
  change_kind: z.enum(CHANGE_KINDS).optional().transform((v) => v ?? "extra"),
  notes: optionalText(500),
});

export const diaryEntryQuantitySchema = z.object({
  entry_id: z.uuid("Item inválido"),
  quantity: positiveNumber("Informe a quantidade"),
  measure_id: optionalUuid,
});

/** Confirmar uma refeição planejada inteira, criando o diário a partir dela. */
export const confirmPlannedMealSchema = z.object({
  planned_meal_id: z.uuid("Refeição inválida"),
  diary_date: dateString,
  consumed_time: optionalTime,
  /** Itens que NÃO foram consumidos, marcados como removidos em vez de somados. */
  skipped_item_ids: z.array(z.uuid()).max(100).optional().transform((v) => v ?? []),
});

/* ═══════════════════════════ Planejamento ═══════════════════════════ */

export const nutritionPlanSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120),
  description: optionalText(1000),
  cycle_weeks: z.coerce.number().int().min(1, "Mínimo de 1 semana").max(8, "Máximo de 8 semanas"),
  week_start_day: weekday.optional().transform((v) => v ?? 1),
  anchor_date: optionalDate,
  is_active: z.coerce.boolean().optional().transform((v) => v ?? true),
  is_default: z.coerce.boolean().optional().transform((v) => v ?? false),
});

export const planDaySchema = z.object({
  plan_id: z.uuid("Modelo inválido"),
  week_index: z.coerce.number().int().min(0).max(7),
  weekday,
  label: optionalText(80),
  day_kind: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.enum(DAY_KINDS).nullable(),
  ),
  notes: optionalText(500),
});

/**
 * Refeição planejada. Precisa de uma âncora: data concreta OU dia de modelo — a mesma regra do
 * CHECK `nutrition_planned_meals_has_anchor`.
 */
export const plannedMealSchema = z
  .object({
    plan_id: optionalUuid,
    plan_day_id: optionalUuid,
    planned_date: optionalDate,
    meal_type_id: z.uuid("Escolha o tipo de refeição"),
    planned_time: optionalTime,
    title: optionalText(120),
    notes: optionalText(1000),
  })
  .superRefine((data, ctx) => {
    if (!data.planned_date && !data.plan_day_id) {
      ctx.addIssue({
        code: "custom",
        path: ["planned_date"],
        message: "Informe a data ou o dia do modelo.",
      });
    }
  });

export const plannedMealItemSchema = z
  .object({
    planned_meal_id: z.uuid("Refeição inválida"),
    food_id: optionalUuid,
    custom_label: optionalText(200),
    quantity: optionalPositiveNumber(),
    measure_id: optionalUuid,
    is_optional: z.coerce.boolean().optional().transform((v) => v ?? false),
    notes: optionalText(500),
  })
  .superRefine((data, ctx) => {
    if (!data.food_id && !data.custom_label) {
      ctx.addIssue({
        code: "custom",
        path: ["custom_label"],
        message: "Escolha um alimento ou descreva o item.",
      });
    }
    if (data.food_id && data.quantity === null) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Informe a quantidade do alimento.",
      });
    }
  });

/** Editar/excluir refeição planejada: o escopo é SEMPRE escolhido pelo usuário. */
export const plannedMealScopeSchema = z.object({
  planned_meal_id: z.uuid("Refeição inválida"),
  scope: z.enum(PLAN_EDIT_SCOPES),
});

export const applyPlanSchema = z
  .object({
    plan_id: z.uuid("Modelo inválido"),
    from: dateString,
    to: dateString,
    /** Substituir o que já estava planejado nessas datas em vez de acumular. */
    replace: z.coerce.boolean().optional().transform((v) => v ?? false),
  })
  .superRefine((data, ctx) => {
    if (data.to < data.from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "O fim não pode ser antes do início." });
    }
    // Um ano é bastante: aplicar 5 anos de uma vez criaria milhares de linhas sem que o
    // usuário perceba o tamanho da operação.
    const days = (Date.parse(`${data.to}T00:00:00Z`) - Date.parse(`${data.from}T00:00:00Z`)) / 86_400_000;
    if (days > 366) {
      ctx.addIssue({
        code: "custom",
        path: ["to"],
        message: "Aplique no máximo um ano por vez.",
      });
    }
  });

export const copyDaySchema = z.object({
  from_date: dateString,
  to_date: dateString,
  replace: z.coerce.boolean().optional().transform((v) => v ?? false),
});

export const duplicateWeekSchema = z.object({
  from_week_start: dateString,
  to_week_start: dateString,
  replace: z.coerce.boolean().optional().transform((v) => v ?? false),
});

export type NutritionProfileInput = z.infer<typeof nutritionProfileSchema>;
export type GoalPeriodInput = z.infer<typeof goalPeriodSchema>;
export type DiaryMealInput = z.infer<typeof diaryMealSchema>;
export type PlannedMealInput = z.infer<typeof plannedMealSchema>;
