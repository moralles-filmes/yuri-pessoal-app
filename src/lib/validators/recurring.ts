import { z } from "zod";
import {
  FREQUENCIES,
  GENERATED_STATUSES,
  PAYMENT_METHODS,
} from "@/lib/finance/constants";
import {
  dateString,
  moneyAmount,
  optionalText,
  optionalUuid,
  tagsArray,
} from "@/lib/validators/shared";

/**
 * Recorrências da Fase 02 não cobrem transferências (a tabela não guarda a conta
 * de destino) — por isso o tipo é restrito a despesa/receita/ajuste.
 */
export const recurringSchema = z.object({
  type: z.enum(["despesa", "receita", "ajuste"]),
  payment_method: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.enum(PAYMENT_METHODS).nullable(),
  ),
  account_id: optionalUuid,
  card_id: optionalUuid,
  category_id: optionalUuid,
  subcategory_id: optionalUuid,
  amount: moneyAmount,
  description: optionalText(200),
  tags: tagsArray,
  frequency: z.enum(FREQUENCIES),
  interval_count: z.coerce
    .number({ message: "Informe o intervalo" })
    .int()
    .min(1, "Intervalo mínimo é 1")
    .optional()
    .transform((v) => v ?? 1),
  anchor_date: dateString,
  next_due_date: dateString.optional(),
  end_date: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    dateString.nullable(),
  ),
  generated_status: z
    .enum(GENERATED_STATUSES)
    .optional()
    .transform((v) => v ?? "pago"),
  is_active: z.boolean().optional().transform((v) => v ?? true),
}).superRefine((d, ctx) => {
  // Recorrência de cartão: card_id obrigatório e só faz sentido como despesa
  // (apenas despesa resolve fatura). Outras formas não carregam cartão.
  if (d.payment_method === "cartao_credito") {
    if (!d.card_id) {
      ctx.addIssue({
        code: "custom",
        path: ["card_id"],
        message: "Selecione o cartão.",
      });
    }
    if (d.type !== "despesa") {
      ctx.addIssue({
        code: "custom",
        path: ["type"],
        message: "Recorrência em cartão só pode ser despesa.",
      });
    }
  } else if (d.card_id) {
    ctx.addIssue({
      code: "custom",
      path: ["card_id"],
      message: "Cartão só se aplica a pagamento por cartão de crédito.",
    });
  }
});

export type RecurringInput = z.infer<typeof recurringSchema>;
