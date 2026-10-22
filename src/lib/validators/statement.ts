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

/**
 * Entrada do desfazer (03-F K1): a fatura e o lançamento que o dono LEU na confirmação —
 * `null` quando a fatura estava paga sem lançamento. Sem valor padrão: o chamador diz o que leu.
 */
export const desfazerPagamentoFaturaSchema = z.object({
  id: z.string().uuid({ message: "Fatura inválida" }),
  lancamentoId: z.string().uuid({ message: "Lançamento inválido" }).nullable(),
});
