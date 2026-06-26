import { z } from "zod";
import { CARD_BRANDS } from "@/lib/finance/constants";
import { moneyAmount, optionalText } from "@/lib/validators/shared";

/**
 * Cartão de crédito (Fase 03). `dia_fechamento`/`dia_vencimento` são 1..31 e
 * podem ser maiores que o número de dias do mês — o clamp é aplicado na regra de
 * fatura (src/lib/finance/invoice.ts), não aqui.
 */
export const creditCardSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do cartão").max(120),
  banco: z.string().trim().min(1, "Informe o banco/instituição").max(120),
  bandeira: z.enum(CARD_BRANDS),
  limite_total: moneyAmount,
  dia_fechamento: z.coerce
    .number({ message: "Informe o dia de fechamento" })
    .int("Use um dia inteiro")
    .min(1, "Dia entre 1 e 31")
    .max(31, "Dia entre 1 e 31"),
  dia_vencimento: z.coerce
    .number({ message: "Informe o dia de vencimento" })
    .int("Use um dia inteiro")
    .min(1, "Dia entre 1 e 31")
    .max(31, "Dia entre 1 e 31"),
  cor: optionalText(24),
  ativo: z.boolean().optional().transform((v) => v ?? true),
  observacoes: optionalText(1000),
});

export type CreditCardInput = z.infer<typeof creditCardSchema>;
