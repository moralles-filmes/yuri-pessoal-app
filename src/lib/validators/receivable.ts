import { z } from "zod";
import { dateString, normalizeBRMoney, optionalText } from "@/lib/validators/shared";
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

/**
 * REDESIGN-03-D — registrar um recebimento. ⛔ `.strict()` e SEM `conta_id`/`transaction_id`
 * (K2: o recebimento só registra; o vínculo com o lançamento é da 04-C). `user_id` vem sempre
 * de `auth.getUser()`. A data no futuro é recusada no SERVIÇO, com `hoje` de Brasília.
 */
export const registrarRecebimentoSchema = z
  .object({
    receivable_id: z.uuid("Recebível inválido"),
    valor: z.preprocess(
      normalizeBRMoney,
      z.coerce
        .number({ message: "Informe um valor" })
        .finite("Valor inválido")
        .positive("Informe um valor maior que zero."),
    ),
    recebido_em: dateString,
    observacoes: optionalText(500),
  })
  .strict();

export type RegistrarRecebimentoInput = z.infer<typeof registrarRecebimentoSchema>;

/** "Receber" o saldo restante. Data ausente → hoje (na action). */
export const receberSaldoSchema = z
  .object({ id: z.uuid("Recebível inválido"), recebido_em: dateString.optional() })
  .strict();
