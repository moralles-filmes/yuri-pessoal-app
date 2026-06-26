import { z } from "zod";
import { ACCOUNT_TYPES } from "@/lib/finance/constants";
import { moneyAmountSigned, optionalText } from "@/lib/validators/shared";

/**
 * Conta pode ter saldo inicial negativo (ex.: conta no vermelho), por isso
 * usamos `moneyAmountSigned` em vez do valor estritamente >= 0.
 */
export const accountSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da conta").max(120),
  bank: optionalText(120),
  type: z.enum(ACCOUNT_TYPES),
  initial_balance: moneyAmountSigned,
  is_active: z.boolean().optional().transform((v) => v ?? true),
  color: optionalText(24),
  notes: optionalText(1000),
});

export type AccountInput = z.infer<typeof accountSchema>;
