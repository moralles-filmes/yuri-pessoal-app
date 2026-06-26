import { z } from "zod";
import { FREQUENCIES } from "@/lib/finance/constants";
import { moneyAmount, optionalText, optionalUuid } from "@/lib/validators/shared";

export const billSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da conta fixa").max(120),
  amount: moneyAmount,
  category_id: optionalUuid,
  account_id: optionalUuid,
  due_day: z.coerce
    .number({ message: "Informe o dia de vencimento" })
    .int("Use um dia inteiro")
    .min(1, "Dia entre 1 e 31")
    .max(31, "Dia entre 1 e 31"),
  frequency: z.enum(FREQUENCIES).optional().transform((v) => v ?? "mensal"),
  notify_days_before: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .transform((v) => v ?? 3),
  is_active: z.boolean().optional().transform((v) => v ?? true),
  notes: optionalText(1000),
});

export type BillInput = z.infer<typeof billSchema>;
