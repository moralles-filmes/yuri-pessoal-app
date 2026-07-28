import { z } from "zod";
import { dateString } from "@/lib/validators/shared";

/**
 * Entrada do pagamento de fatura: a fatura, a conta a debitar e a data em que o
 * pagamento saiu da conta. `dataPagamento` é opcional — ausente, o servidor usa hoje.
 */
export const pagamentoFaturaSchema = z.object({
  id: z.string().uuid({ message: "Fatura inválida" }),
  contaId: z.string().uuid({ message: "Selecione a conta" }),
  dataPagamento: dateString.optional(),
});
