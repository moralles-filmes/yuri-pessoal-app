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
});

export type RecurringInput = z.infer<typeof recurringSchema>;
