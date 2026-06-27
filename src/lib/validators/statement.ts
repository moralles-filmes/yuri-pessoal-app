import { z } from "zod";

/** Entrada do pagamento de fatura: a fatura e a conta a debitar. */
export const pagamentoFaturaSchema = z.object({
  id: z.string().uuid({ message: "Fatura inválida" }),
  contaId: z.string().uuid({ message: "Selecione a conta" }),
});
