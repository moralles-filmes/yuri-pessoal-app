import { z } from "zod";
import {
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "@/lib/finance/constants";
import {
  dateString,
  moneyAmount,
  optionalText,
  optionalUuid,
  tagsArray,
} from "@/lib/validators/shared";

export const transactionSchema = z
  .object({
    type: z.enum(TRANSACTION_TYPES),
    payment_method: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.enum(PAYMENT_METHODS).nullable(),
    ),
    account_id: optionalUuid,
    transfer_account_id: optionalUuid,
    // Cartão da compra (Fase 03). statement_id NÃO vem do client — é resolvido no servidor.
    card_id: optionalUuid,
    category_id: optionalUuid,
    subcategory_id: optionalUuid,
    amount: moneyAmount,
    purchase_date: dateString,
    competence_date: dateString,
    description: optionalText(200),
    notes: optionalText(1000),
    tags: tagsArray,
    status: z.enum(TRANSACTION_STATUSES).optional().transform((v) => v ?? "pago"),
  })
  .refine(
    (v) =>
      v.type !== "transferencia" ||
      (!!v.account_id &&
        !!v.transfer_account_id &&
        v.account_id !== v.transfer_account_id),
    {
      message: "Transferência exige conta de origem e destino diferentes",
      path: ["transfer_account_id"],
    },
  )
  // Conta é obrigatória, EXCETO em transferência (já validada acima) e em compra no
  // cartão de crédito (desacoplada de conta — entra na fatura, não no saldo).
  .refine(
    (v) =>
      v.type === "transferencia" ||
      v.payment_method === "cartao_credito" ||
      !!v.account_id,
    { message: "Selecione a conta", path: ["account_id"] },
  )
  // Compra no cartão de crédito só faz sentido como despesa.
  .refine(
    (v) => v.payment_method !== "cartao_credito" || v.type === "despesa",
    {
      message: "Cartão de crédito só pode ser usado em despesas",
      path: ["payment_method"],
    },
  )
  // Compra no cartão exige escolher qual cartão.
  .refine((v) => v.payment_method !== "cartao_credito" || !!v.card_id, {
    message: "Selecione o cartão",
    path: ["card_id"],
  });

export type TransactionInput = z.infer<typeof transactionSchema>;
