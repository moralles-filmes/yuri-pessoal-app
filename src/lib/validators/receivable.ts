import { z } from "zod";
import { BULK_RECEIVABLE_ACTIONS } from "@/lib/finance/receivables-bulk";

/**
 * Ação em massa em "A Receber".
 *
 * `ids` já chega recortado pelo filtro atual da tela (`alcanceDaAcao`) — mas a action
 * reaplica o filtro de status de origem no servidor, porque a conta do client existe para
 * mostrar o número, não para ser a garantia.
 *
 * `user_id` NÃO está aqui de propósito: vem sempre de `auth.getUser()`.
 */
export const bulkReceivablesSchema = z
  .object({
    ids: z
      .array(z.uuid("Recebível inválido"))
      .min(1, "Selecione ao menos um recebível")
      .max(2000, "Selecione no máximo 2000 recebíveis de uma vez"),
    acao: z.enum(BULK_RECEIVABLE_ACTIONS),
    /** Só tem efeito no `receber`; ausente ou inválida cai em hoje. */
    pago_em: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
      .optional(),
  })
  .strict();

export type BulkReceivablesInput = z.infer<typeof bulkReceivablesSchema>;
