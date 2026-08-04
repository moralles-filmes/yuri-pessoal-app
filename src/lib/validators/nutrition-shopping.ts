/**
 * Fase 16-D — Dieta e Alimentação · Schemas Zod da lista de compras e da despensa.
 *
 * Validação de SERVIDOR. Como nas subfases anteriores, `user_id` não aparece em schema nenhum:
 * vem sempre de `auth.getUser()` na action (proteção contra mass assignment).
 *
 * QUATRO COISAS FICAM DE FORA DE PROPÓSITO:
 *
 * • A CONSOLIDAÇÃO. O cliente diz "gere a lista da semana"; quem soma (e quem se recusa a
 *   somar unidades incompatíveis) é o servidor, com `consolidateShoppingItems`. Aceitar itens
 *   já consolidados do navegador deixaria gravar qualquer número.
 *
 * • A `consolidation_key`. É derivada, não digitada.
 *
 * • O DESCONTO DA DESPENSA. O cliente pede a prévia e depois confirma; o servidor RECALCULA
 *   antes de gravar — o que a tela mostrou é conferido, não copiado (mesma disciplina da
 *   substituição na 16-C).
 *
 * • A `recurrence_key`. Sai de `shoppingRecurrenceKey` no servidor, com a data injetada. Se o
 *   cliente pudesse mandá-la, mandaria uma diferente e a lista da semana duplicaria.
 */
import { z } from "zod";
import {
  SHOPPING_ITEM_STATUSES,
  SHOPPING_LIST_STATUSES,
  SHOPPING_PRIORITIES,
  SHOPPING_RECURRENCES,
  SHOPPING_SOURCE_KINDS,
} from "@/lib/nutrition/constants";
import { PORTION_UNITS } from "@/lib/nutrition/constants";
import {
  dateString,
  normalizeBRMoney,
  optionalColor,
  optionalDate,
  optionalText,
  optionalUuid,
} from "@/lib/validators/shared";

/** Quantidade opcional aceitando vírgula. Vazio vira null — NUNCA 0 ("a gosto" ≠ "zero"). */
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

/**
 * Quantidade da DESPENSA: aceita zero.
 *
 * Aqui zero tem significado — "acabou" é um fato que a pessoa mediu. Nulo continua sendo
 * "tenho, mas não sei quanto", e é o que impede o desconto de acontecer no escuro.
 */
const optionalNonNegativeNumber = (max = 1_000_000) =>
  z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return null;
      if (typeof v === "string") return Number(v.replace(",", "."));
      return v;
    },
    z.coerce
      .number()
      .finite("Valor inválido")
      .min(0, "Não pode ser negativo")
      .max(max)
      .nullable(),
  );

/**
 * Preço em CENTAVOS (integer), como todo o financeiro do projeto.
 *
 * A conversão acontece aqui, no servidor: o cliente digita "12,90" e o banco recebe 1290.
 * Vazio continua NULO — "não anotei o preço" é diferente de "custou zero", e somar zeros faria
 * o total da compra parecer barato.
 */
const optionalPriceCents = z.preprocess(
  (v) => {
    if (v === "" || v === undefined || v === null) return null;
    const normalized = normalizeBRMoney(v);
    const parsed = typeof normalized === "number" ? normalized : Number(normalized);
    if (!Number.isFinite(parsed)) return Number.NaN;
    return Math.round(parsed * 100);
  },
  z.coerce
    .number()
    .int()
    .min(0, "O preço não pode ser negativo")
    .max(100_000_000, "Valor muito alto")
    .nullable(),
);

/** Unidade: as canônicas ou uma medida caseira escrita pelo usuário. */
const unitField = z
  .string()
  .trim()
  .min(1, "Informe a unidade")
  .max(40, "Máximo de 40 caracteres");

/* ═══════════════════════════ Corredores de mercado ═══════════════════════════ */

export const marketCategorySchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(60, "Máximo de 60 caracteres"),
  icon: optionalText(8),
  color: optionalColor,
});

/* ═══════════════════════════ Lista ═══════════════════════════ */

export const shoppingListSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da lista").max(160),
  notes: optionalText(2000),
  status: z.enum(SHOPPING_LIST_STATUSES).optional().transform((v) => v ?? "ativa"),
  store: optionalText(120),
  recurrence: z.enum(SHOPPING_RECURRENCES).optional().transform((v) => v ?? "nenhuma"),
  /**
   * Data de referência do período da recorrência. A CHAVE em si é derivada no servidor —
   * é ela que impede a lista da semana de nascer duas vezes.
   */
  reference_date: optionalDate,
});

/**
 * Gerar (ou regerar) uma lista a partir do planejamento e/ou de receitas.
 *
 * `list_id` presente = REGERAR uma lista existente: os itens gerados são atualizados, os
 * digitados à mão ficam intocados e os ajustes manuais de quantidade são preservados.
 */
export const generateShoppingListSchema = z
  .object({
    list_id: optionalUuid,
    name: optionalText(160),
    source_kind: z.enum(SHOPPING_SOURCE_KINDS).optional().transform((v) => v ?? "periodo"),
    from: optionalDate,
    to: optionalDate,
    recipes: z
      .array(
        z.object({
          recipe_id: z.uuid("Receita inválida"),
          quantity: z.coerce.number().finite().positive().max(1000).optional().transform((v) => v ?? 1),
          portion_unit: z.enum(PORTION_UNITS).optional().transform((v) => v ?? "porcao"),
        }),
      )
      .max(100, "Receitas demais")
      .optional()
      .transform((v) => v ?? []),
    recurrence: z.enum(SHOPPING_RECURRENCES).optional().transform((v) => v ?? "nenhuma"),
    /** Descontar a despensa. Opt-in: o padrão é NÃO descontar (regra 3). */
    discount_pantry: z.coerce.boolean().optional().transform((v) => v ?? false),
    /**
     * Remover os itens gerados que o planejamento não pede mais. Sem valor padrão implícito de
     * "sim": nenhuma exclusão acontece sem escolha explícita (regra 4).
     */
    remove_obsolete: z.coerce.boolean().optional().transform((v) => v ?? false),
  })
  .superRefine((data, ctx) => {
    const precisaPeriodo = ["dia", "semana", "periodo"].includes(data.source_kind);
    if (precisaPeriodo && !data.from) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "Escolha a data inicial." });
    }
    if (data.from && data.to && data.to < data.from) {
      ctx.addIssue({ code: "custom", path: ["to"], message: "A data final é anterior à inicial." });
    }
    if (data.source_kind === "receitas" && data.recipes.length === 0) {
      ctx.addIssue({ code: "custom", path: ["recipes"], message: "Escolha ao menos uma receita." });
    }
    if (!data.list_id && !data.name && data.source_kind === "manual") {
      ctx.addIssue({ code: "custom", path: ["name"], message: "Dê um nome à lista." });
    }
  });

/* ═══════════════════════════ Item ═══════════════════════════ */

export const shoppingItemSchema = z
  .object({
    list_id: z.uuid("Lista inválida"),
    category_id: optionalUuid,
    food_id: optionalUuid,
    recipe_id: optionalUuid,
    label: optionalText(200),
    brand: optionalText(120),
    quantity: optionalPositiveNumber(),
    unit: unitField.optional().transform((v) => v ?? "un"),
    status: z.enum(SHOPPING_ITEM_STATUSES).optional().transform((v) => v ?? "pendente"),
    priority: z.enum(SHOPPING_PRIORITIES).optional().transform((v) => v ?? "normal"),
    estimated_price_cents: optionalPriceCents,
    actual_price_cents: optionalPriceCents,
    store: optionalText(120),
    note: optionalText(500),
  })
  .superRefine((data, ctx) => {
    if (!data.food_id && !data.label) {
      ctx.addIssue({
        code: "custom",
        path: ["label"],
        message: "Escolha um alimento ou escreva o que precisa comprar.",
      });
    }
    if (data.food_id && data.recipe_id) {
      ctx.addIssue({
        code: "custom",
        path: ["recipe_id"],
        message: "Um item é de um alimento ou de uma receita, não dos dois.",
      });
    }
  });

/**
 * Ajustar a quantidade de um item.
 *
 * É esta action que marca `quantity_overridden` — e é o que faz o ajuste sobreviver à
 * regeração da lista (regra 2). Existe separada do formulário completo porque no mercado o
 * usuário só quer mudar o número, com uma mão.
 */
export const shoppingItemQuantitySchema = z.object({
  item_id: z.uuid("Item inválido"),
  quantity: optionalPositiveNumber(),
  unit: unitField.optional(),
});

export const shoppingItemStatusSchema = z.object({
  item_id: z.uuid("Item inválido"),
  status: z.enum(SHOPPING_ITEM_STATUSES),
  actual_price_cents: optionalPriceCents,
});

export const shoppingItemMoveSchema = z.object({
  item_id: z.uuid("Item inválido"),
  category_id: optionalUuid,
});

export const shoppingItemsReorderSchema = z.object({
  list_id: z.uuid("Lista inválida"),
  ids: z.array(z.uuid()).min(1).max(500),
});

/**
 * Ação em massa.
 *
 * `ids` já chega recortado pelo filtro atual (a UI usa `selectionInScope`), e a action confere
 * que todos pertencem à lista informada — ação em massa não alcança registro fora do filtro
 * (regra 5). "excluir" existe, mas a tela pede confirmação e a ação padrão é marcar (regra 4).
 */
export const bulkShoppingItemsSchema = z.object({
  list_id: z.uuid("Lista inválida"),
  ids: z.array(z.uuid()).min(1, "Selecione ao menos um item").max(500, "Selecione no máximo 500"),
  action: z.enum([
    "marcar_comprado",
    "desmarcar",
    "no_carrinho",
    "indisponivel",
    "remover_da_compra",
    "prioridade_alta",
    "prioridade_normal",
    "mover_categoria",
    "excluir",
  ]),
  /** Só para "mover_categoria". */
  category_id: optionalUuid,
});

/* ═══════════════════════════ Despensa ═══════════════════════════ */

export const pantryItemSchema = z
  .object({
    food_id: optionalUuid,
    label: optionalText(200),
    quantity: optionalNonNegativeNumber(),
    unit: unitField.optional().transform((v) => v ?? "un"),
    expires_on: optionalDate,
    min_quantity: optionalNonNegativeNumber(),
    note: optionalText(500),
    category_id: optionalUuid,
  })
  .superRefine((data, ctx) => {
    if (!data.food_id && !data.label) {
      ctx.addIssue({
        code: "custom",
        path: ["label"],
        message: "Escolha um alimento ou escreva o nome do item.",
      });
    }
  });

/** Aplicar o desconto da despensa numa lista já existente. O servidor recalcula a prévia. */
export const applyPantrySchema = z.object({
  list_id: z.uuid("Lista inválida"),
});

/** Duplicar uma lista. O nome sai de `copyName` no servidor quando não vier um. */
export const duplicateShoppingListSchema = z.object({
  list_id: z.uuid("Lista inválida"),
  name: optionalText(160),
});

/** Criar/reencontrar a lista recorrente de um período. */
export const recurringShoppingListSchema = z.object({
  recurrence: z.enum(SHOPPING_RECURRENCES),
  reference_date: dateString,
  name: optionalText(160),
});

export type ShoppingListInput = z.infer<typeof shoppingListSchema>;
export type ShoppingItemInput = z.infer<typeof shoppingItemSchema>;
export type PantryItemInput = z.infer<typeof pantryItemSchema>;
