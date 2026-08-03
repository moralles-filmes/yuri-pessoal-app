/**
 * Fase 16-A — Dieta e Alimentação · Schemas Zod.
 *
 * Validação de SERVIDOR: as actions sempre re-validam o que vem do client. `user_id` NÃO
 * aparece em nenhum schema — vem sempre de `auth.getUser()` na action. É a proteção contra
 * mass assignment exigida pelo projeto.
 *
 * `is_system_food`, `source_id` da base oficial e afins também ficam de fora de propósito:
 * o usuário não pode se declarar dono de um alimento da base nem forjar a fonte oficial.
 */
import { z } from "zod";
import {
  BASE_UNITS,
  FOOD_TYPES,
  MEASURE_UNIT_TYPES,
  NUTRIENT_METHODS,
  NUTRIENT_VALUE_STATES,
  PREPARATION_STATES,
} from "@/lib/nutrition/constants";
import { optionalColor, optionalDate, optionalText, optionalUuid } from "@/lib/validators/shared";

/** Número opcional aceitando vírgula (padrão BR) e devolvendo null quando vazio. */
const optionalNumber = (max = 1_000_000) =>
  z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return null;
      if (typeof v === "string") return Number(v.replace(",", "."));
      return v;
    },
    z.coerce.number().finite("Valor inválido").min(0, "Não pode ser negativo").max(max).nullable(),
  );

/** Número positivo obrigatório (quantidade, conversão de medida). */
const positiveNumber = (message = "Informe um valor maior que zero") =>
  z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z.coerce.number({ message }).finite("Valor inválido").positive(message),
  );

/* ───────────────────────────── Alimento ───────────────────────────── */

export const nutritionFoodSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(200, "Máximo de 200 caracteres"),
  alternative_name: optionalText(200),
  brand: optionalText(120),
  // Código de barras: só dígitos, tamanho de EAN-8 a GTIN-14.
  barcode: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/\D/g, "") : v),
    z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.string().regex(/^\d{8,14}$/, "Código de barras inválido").nullable(),
    ),
  ),
  category_id: optionalUuid,
  food_type: z.enum(FOOD_TYPES).optional().transform((v) => v ?? "alimento"),
  preparation_state: z
    .enum(PREPARATION_STATES)
    .optional()
    .transform((v) => v ?? "nao_informado"),
  base_quantity: positiveNumber("Informe a quantidade de referência"),
  base_unit: z.enum(BASE_UNITS).optional().transform((v) => v ?? "g"),
  edible_portion_percent: z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return null;
      if (typeof v === "string") return Number(v.replace(",", "."));
      return v;
    },
    z.coerce.number().positive("Deve ser maior que zero").max(100, "No máximo 100%").nullable(),
  ),
  // Só fontes NÃO oficiais podem ser escolhidas livremente; a action confere.
  source_id: optionalUuid,
  source_food_code: optionalText(60),
  source_version: optionalText(60),
  data_quality: z.enum(NUTRIENT_METHODS).optional().transform((v) => v ?? "desconhecido"),
  last_verified_at: optionalDate,
  notes: optionalText(2000),
});

export type NutritionFoodInput = z.infer<typeof nutritionFoodSchema>;

/**
 * Um valor de nutriente enviado pelo formulário.
 *
 * A regra "estado sem valor / valor sem estado" é validada aqui além do CHECK do banco,
 * para o usuário receber uma mensagem em pt-BR em vez de um erro de constraint.
 */
export const nutritionFoodNutrientSchema = z
  .object({
    nutrient_code: z.string().trim().min(1).max(60),
    amount: optionalNumber(),
    value_state: z.enum(NUTRIENT_VALUE_STATES).optional().transform((v) => v ?? "disponivel"),
    method: z.enum(NUTRIENT_METHODS).optional().transform((v) => v ?? "desconhecido"),
  })
  .superRefine((data, ctx) => {
    if (data.value_state === "disponivel" && data.amount === null) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Informe o valor ou marque como não disponível.",
      });
    }
    if (data.value_state !== "disponivel" && data.amount !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Um valor marcado como traço, não disponível ou não aplicável não pode ter número.",
      });
    }
  });

/** Alimento + seus nutrientes, como o formulário salva de uma vez. */
export const nutritionFoodWithNutrientsSchema = z.object({
  food: nutritionFoodSchema,
  nutrients: z.array(nutritionFoodNutrientSchema).max(200, "Nutrientes demais"),
});

/* ───────────────────────────── Medida caseira ───────────────────────────── */

export const nutritionFoodMeasureSchema = z
  .object({
    food_id: z.uuid("Alimento inválido"),
    label: z.string().trim().min(1, "Informe o nome da medida").max(80),
    unit_type: z.enum(MEASURE_UNIT_TYPES).optional().transform((v) => v ?? "peso"),
    grams: optionalNumber(100_000),
    milliliters: optionalNumber(100_000),
    is_default: z.coerce.boolean().optional().transform((v) => v ?? false),
  })
  .superRefine((data, ctx) => {
    // Medida sem conversão não serve para calcular nada — e estimar seria inventar dado.
    if (data.grams === null && data.milliliters === null) {
      ctx.addIssue({
        code: "custom",
        path: ["grams"],
        message: "Informe a conversão em gramas ou em mililitros.",
      });
    }
    if (data.grams !== null && data.grams <= 0) {
      ctx.addIssue({ code: "custom", path: ["grams"], message: "Deve ser maior que zero." });
    }
    if (data.milliliters !== null && data.milliliters <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["milliliters"],
        message: "Deve ser maior que zero.",
      });
    }
  });

export type NutritionFoodMeasureInput = z.infer<typeof nutritionFoodMeasureSchema>;

/* ───────────────────────────── Categoria e etiqueta ───────────────────────────── */

export const nutritionCategorySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120),
  icon: optionalText(60),
  color: optionalColor,
  parent_id: optionalUuid,
});

export const nutritionTagSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60),
  color: optionalColor,
});

/* ───────────────────────────── Preferências do alimento ───────────────────────────── */

export const nutritionFoodPrefSchema = z.object({
  food_id: z.uuid("Alimento inválido"),
  is_favorite: z.coerce.boolean().optional(),
  archived: z.coerce.boolean().optional(),
  category_override_id: optionalUuid,
  custom_note: optionalText(500),
});

/* ───────────────────────────── Ações em massa ─────────────────────────────
 * O escopo é sempre uma lista EXPLÍCITA de ids — nunca "tudo que casa com o filtro atual"
 * resolvido no servidor. Assim a ação não pode surpreender o usuário se o filtro mudar
 * entre a seleção e a confirmação.
 */
export const NUTRITION_BULK_ACTIONS = [
  "favoritar",
  "desfavoritar",
  "arquivar",
  "restaurar",
  "alterar_categoria",
  "excluir",
] as const;

export const nutritionBulkSchema = z
  .object({
    action: z.enum(NUTRITION_BULK_ACTIONS),
    ids: z.array(z.uuid()).min(1, "Selecione ao menos um alimento").max(1000),
    category_id: optionalUuid,
  })
  .superRefine((data, ctx) => {
    if (data.action === "alterar_categoria" && !data.category_id) {
      ctx.addIssue({
        code: "custom",
        path: ["category_id"],
        message: "Escolha a categoria de destino.",
      });
    }
  });

export type NutritionBulkInput = z.infer<typeof nutritionBulkSchema>;

/* ───────────────────────────── Duplicação ───────────────────────────── */

export const nutritionDuplicateSchema = z.object({
  food_id: z.uuid("Alimento inválido"),
  /** Nome da cópia. Vazio → a action gera "<nome> (cópia)". */
  name: optionalText(200),
});
