/**
 * Fase 16-C — Dieta e Alimentação · Schemas Zod de receitas, refeições-modelo e substituições.
 *
 * Validação de SERVIDOR. Como na 16-A e na 16-B, `user_id` NÃO aparece em nenhum schema: vem
 * sempre de `auth.getUser()` na action (proteção contra mass assignment).
 *
 * TRÊS COISAS FICAM DE FORA DE PROPÓSITO:
 *
 * • O TOTAL NUTRICIONAL da receita. O cliente manda ingredientes; quem soma é o servidor, com
 *   `recipeTotals`. Aceitar um total pronto do navegador deixaria gravar qualquer número.
 *
 * • O SNAPSHOT do consumo de receita/modelo. Mesma regra da 16-B: o servidor lê o catálogo e
 *   congela. História nutricional não se aceita do cliente.
 *
 * • A DIFERENÇA NUTRICIONAL da substituição. Ela é recalculada no servidor antes de gravar o
 *   histórico — o que a tela mostrou é conferido, não copiado.
 *
 * `total_weight_g` é opcional e permanece NULO quando não informado: campo vazio significa
 * "não pesei", nunca zero (é o que mantém "por 100 g" honestamente indisponível).
 */
import { z } from "zod";
import {
  PORTION_UNITS,
  SUBSTITUTION_LEVELS,
  SUBSTITUTION_OPTION_KINDS,
  TEMPLATE_ITEM_KINDS,
  TEMPLATE_REGISTER_MODES,
} from "@/lib/nutrition/constants";
import {
  dateString,
  optionalColor,
  optionalText,
  optionalTime,
  optionalUuid,
} from "@/lib/validators/shared";

/** Número opcional aceitando vírgula (padrão BR). Vazio vira null, NUNCA 0. */
const optionalPositiveNumber = (max = 1_000_000) =>
  z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return null;
      if (typeof v === "string") return Number(v.replace(",", "."));
      return v;
    },
    z.coerce
      .number()
      .finite("Valor inválido")
      .positive("Deve ser maior que zero")
      .max(max)
      .nullable(),
  );

const positiveNumber = (message = "Informe um valor maior que zero") =>
  z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z.coerce.number({ message }).finite("Valor inválido").positive(message),
  );

const optionalInt = (max = 100_000) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.coerce.number().int("Use minutos inteiros").min(0, "Não pode ser negativo").max(max).nullable(),
  );

/** Percentual de tolerância. Nulo = "não defini", que é diferente de zero. */
const optionalPercent = z.preprocess(
  (v) => {
    if (v === "" || v === undefined || v === null) return null;
    if (typeof v === "string") return Number(v.replace(",", "."));
    return v;
  },
  z.coerce.number().finite("Valor inválido").min(0, "Não pode ser negativo").max(1000).nullable(),
);

const tagsArray = z
  .array(z.string().trim().min(1).max(40))
  .max(20, "Etiquetas demais")
  .optional()
  .transform((v) => v ?? []);

/* ═══════════════════════════ Categorias ═══════════════════════════ */

export const recipeCategorySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60, "Máximo de 60 caracteres"),
  icon: optionalText(8),
  color: optionalColor,
});

/* ═══════════════════════════ Receitas ═══════════════════════════ */

export const recipeSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da receita").max(160),
  description: optionalText(1000),
  category_id: optionalUuid,
  instructions: optionalText(20_000),
  prep_minutes: optionalInt(),
  cook_minutes: optionalInt(),
  servings: positiveNumber("Informe em quantas porções a receita rende"),
  serving_label: optionalText(40),
  yield_note: optionalText(200),
  /**
   * Peso final preparado. VAZIO CONTINUA VAZIO: sem ele, "por 100 g" fica indisponível e a UI
   * explica. Preencher com a soma dos ingredientes seria estimar — proibido pela regra 1.
   */
  total_weight_g: optionalPositiveNumber(100_000),
  source: optionalText(300),
  tags: tagsArray,
  notes: optionalText(2000),
});

export const recipeIngredientSchema = z
  .object({
    recipe_id: z.uuid("Receita inválida"),
    food_id: optionalUuid,
    custom_label: optionalText(200),
    quantity: optionalPositiveNumber(),
    measure_id: optionalUuid,
    is_optional: z.coerce.boolean().optional().transform((v) => v ?? false),
    note: optionalText(300),
  })
  .superRefine((data, ctx) => {
    if (!data.food_id && !data.custom_label) {
      ctx.addIssue({
        code: "custom",
        path: ["custom_label"],
        message: "Escolha um alimento ou descreva o ingrediente.",
      });
    }
    if (data.food_id && data.quantity === null) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Informe a quantidade do ingrediente.",
      });
    }
  });

export const recipeIngredientReorderSchema = z.object({
  recipe_id: z.uuid("Receita inválida"),
  ids: z.array(z.uuid()).min(1).max(200),
});

/* ═══════════════════════════ Refeições-modelo ═══════════════════════════ */

export const mealTemplateSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(160),
  description: optionalText(1000),
  meal_type_id: optionalUuid,
  category_id: optionalUuid,
  suggested_time: optionalTime,
  tags: tagsArray,
  notes: optionalText(2000),
});

export const mealTemplateItemSchema = z
  .object({
    template_id: z.uuid("Refeição-modelo inválida"),
    item_kind: z.enum(TEMPLATE_ITEM_KINDS).optional().transform((v) => v ?? "alimento"),
    food_id: optionalUuid,
    recipe_id: optionalUuid,
    custom_label: optionalText(200),
    quantity: optionalPositiveNumber(),
    measure_id: optionalUuid,
    portion_unit: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.enum(PORTION_UNITS).nullable(),
    ),
    is_optional: z.coerce.boolean().optional().transform((v) => v ?? false),
    notes: optionalText(300),
  })
  .superRefine((data, ctx) => {
    if (data.item_kind === "alimento" && !data.food_id) {
      ctx.addIssue({ code: "custom", path: ["food_id"], message: "Escolha o alimento." });
    }
    if (data.item_kind === "receita" && !data.recipe_id) {
      ctx.addIssue({ code: "custom", path: ["recipe_id"], message: "Escolha a receita." });
    }
    if (data.item_kind === "livre" && !data.custom_label) {
      ctx.addIssue({ code: "custom", path: ["custom_label"], message: "Descreva o item." });
    }
    if (data.item_kind !== "livre" && data.quantity === null) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Informe a quantidade." });
    }
    if (data.food_id && data.recipe_id) {
      ctx.addIssue({
        code: "custom",
        path: ["recipe_id"],
        message: "Um item é um alimento ou uma receita, não os dois.",
      });
    }
  });

/* ═══════════════════════════ Receita e modelo no diário ═══════════════════════════ */

/** Registrar uma receita como item consumido. O snapshot é montado no servidor. */
export const diaryRecipeEntrySchema = z.object({
  diary_meal_id: z.uuid("Refeição inválida"),
  recipe_id: z.uuid("Escolha a receita"),
  quantity: positiveNumber("Informe a quantidade"),
  portion_unit: z.enum(PORTION_UNITS).optional().transform((v) => v ?? "porcao"),
  planned_item_id: optionalUuid,
  notes: optionalText(500),
});

/**
 * Adicionar uma refeição-modelo ao diário.
 *
 * `force` só existe para o usuário poder repetir o mesmo modelo de propósito na mesma
 * refeição. O padrão é NÃO duplicar.
 */
export const diaryTemplateSchema = z.object({
  diary_meal_id: z.uuid("Refeição inválida"),
  template_id: z.uuid("Escolha a refeição-modelo"),
  mode: z.enum(TEMPLATE_REGISTER_MODES).optional().transform((v) => v ?? "detalhado"),
  force: z.coerce.boolean().optional().transform((v) => v ?? false),
});

/** Adicionar uma refeição-modelo ao PLANEJAMENTO de uma data. */
export const planTemplateSchema = z.object({
  template_id: z.uuid("Escolha a refeição-modelo"),
  planned_date: dateString,
  meal_type_id: optionalUuid,
  planned_time: optionalTime,
});

/** Item planejado que aponta para uma receita. */
export const plannedRecipeItemSchema = z.object({
  planned_meal_id: z.uuid("Refeição inválida"),
  recipe_id: z.uuid("Escolha a receita"),
  quantity: positiveNumber("Informe a quantidade"),
  portion_unit: z.enum(PORTION_UNITS).optional().transform((v) => v ?? "porcao"),
  is_optional: z.coerce.boolean().optional().transform((v) => v ?? false),
  notes: optionalText(300),
});

/* ═══════════════════════════ Substituições ═══════════════════════════ */

export const substitutionGroupSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome do grupo").max(160),
    group_kind: z.enum(SUBSTITUTION_LEVELS).optional().transform((v) => v ?? "alimento"),
    description: optionalText(1000),
    food_id: optionalUuid,
    recipe_id: optionalUuid,
    meal_template_id: optionalUuid,
    custom_label: optionalText(200),
    base_quantity: optionalPositiveNumber(),
    base_measure_id: optionalUuid,
    base_portion_unit: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.enum(PORTION_UNITS).nullable(),
    ),
    tolerance_energy_percent: optionalPercent,
    tolerance_protein_percent: optionalPercent,
    tolerance_carb_percent: optionalPercent,
    tolerance_fat_percent: optionalPercent,
    tolerance_fiber_percent: optionalPercent,
    restrictions: z
      .array(z.string().trim().min(1).max(60))
      .max(20, "Restrições demais")
      .optional()
      .transform((v) => v ?? []),
    notes: optionalText(2000),
    is_active: z.coerce.boolean().optional().transform((v) => v ?? true),
  })
  .superRefine((data, ctx) => {
    if (!data.food_id && !data.recipe_id && !data.meal_template_id && !data.custom_label) {
      ctx.addIssue({
        code: "custom",
        path: ["custom_label"],
        message: "Diga o que está sendo substituído: um alimento, uma receita ou um rótulo.",
      });
    }
    // As mesmas amarrações do CHECK do banco, em pt-BR.
    if (data.group_kind === "alimento" && data.meal_template_id) {
      ctx.addIssue({
        code: "custom",
        path: ["meal_template_id"],
        message: "Um grupo de alimento não pode ter uma refeição-modelo como original.",
      });
    }
    if (data.group_kind === "refeicao" && data.food_id) {
      ctx.addIssue({
        code: "custom",
        path: ["food_id"],
        message: "Um grupo de refeição não pode ter um alimento como original.",
      });
    }
  });

export const substitutionOptionSchema = z
  .object({
    group_id: z.uuid("Grupo inválido"),
    option_kind: z.enum(SUBSTITUTION_OPTION_KINDS).optional().transform((v) => v ?? "alimento"),
    food_id: optionalUuid,
    recipe_id: optionalUuid,
    meal_template_id: optionalUuid,
    custom_label: optionalText(200),
    quantity: optionalPositiveNumber(),
    measure_id: optionalUuid,
    portion_unit: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.enum(PORTION_UNITS).nullable(),
    ),
    priority: z.coerce.number().int().min(0).max(99).optional().transform((v) => v ?? 0),
    notes: optionalText(500),
    is_active: z.coerce.boolean().optional().transform((v) => v ?? true),
  })
  .superRefine((data, ctx) => {
    const subjects = [data.food_id, data.recipe_id, data.meal_template_id].filter(Boolean);
    if (subjects.length === 0 && !data.custom_label) {
      ctx.addIssue({
        code: "custom",
        path: ["custom_label"],
        message: "Escolha um alimento, uma receita, uma refeição-modelo ou descreva a alternativa.",
      });
    }
    if (subjects.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["food_id"],
        message: "Uma alternativa é uma coisa só.",
      });
    }
    if (data.option_kind !== "livre" && data.quantity === null) {
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "Informe a quantidade." });
    }
  });

/**
 * Confirmar uma substituição.
 *
 * A CONFIRMAÇÃO É O CONTRATO: esta action só é chamada depois de a tela mostrar original ×
 * alternativa, a diferença dos macros, o impacto no dia e o que resta da meta. Nada troca
 * sozinho (regra 4).
 */
export const applySubstitutionSchema = z
  .object({
    /** O item do diário que está sendo trocado. Nulo quando a troca é de refeição inteira. */
    diary_entry_id: optionalUuid,
    diary_meal_id: z.uuid("Refeição inválida"),
    applied_on: dateString,
    level: z.enum(SUBSTITUTION_LEVELS).optional().transform((v) => v ?? "alimento"),
    group_id: optionalUuid,
    option_id: optionalUuid,
    /* A alternativa escolhida (pode vir de um grupo ou ser avulsa). */
    replacement_kind: z.enum(SUBSTITUTION_OPTION_KINDS).optional().transform((v) => v ?? "alimento"),
    replacement_food_id: optionalUuid,
    replacement_recipe_id: optionalUuid,
    replacement_meal_template_id: optionalUuid,
    replacement_label: optionalText(200),
    replacement_quantity: positiveNumber("Informe a quantidade da alternativa"),
    replacement_measure_id: optionalUuid,
    replacement_portion_unit: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.enum(PORTION_UNITS).nullable(),
    ),
    reason: optionalText(500),
  })
  .superRefine((data, ctx) => {
    const subjects = [
      data.replacement_food_id,
      data.replacement_recipe_id,
      data.replacement_meal_template_id,
    ].filter(Boolean);
    if (subjects.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["replacement_food_id"],
        message: "Escolha a alternativa que entra no lugar.",
      });
    }
    if (data.level === "alimento" && !data.diary_entry_id) {
      ctx.addIssue({
        code: "custom",
        path: ["diary_entry_id"],
        message: "Diga qual item do diário está sendo substituído.",
      });
    }
  });

export type RecipeInput = z.infer<typeof recipeSchema>;
export type MealTemplateInput = z.infer<typeof mealTemplateSchema>;
export type SubstitutionGroupInput = z.infer<typeof substitutionGroupSchema>;
