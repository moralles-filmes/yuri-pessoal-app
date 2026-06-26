import { z } from "zod";
import {
  dateString,
  moneyAmount,
  optionalText,
  optionalUuid,
} from "@/lib/validators/shared";
import { overrideUltimaValido } from "@/lib/finance/installments";
import { reaisParaCentavos } from "@/lib/format";

/**
 * Criação de uma COMPRA PARCELADA (Fase 04). O `user_id`/`statement_id` nunca vêm do
 * cliente — são derivados no servidor. O `override_ultima_centavos` é opcional e só passa
 * se mantiver a soma das parcelas exatamente igual ao total (validado aqui e no servidor).
 */
export const installmentPurchaseSchema = z
  .object({
    card_id: z.uuid("Selecione o cartão"),
    qtd_parcelas: z.coerce
      .number({ message: "Informe o nº de parcelas" })
      .int("Use um número inteiro de parcelas")
      .min(1, "Mínimo de 1 parcela")
      .max(60, "Máximo de 60 parcelas"),
    valor_total: moneyAmount.refine(
      (v) => v > 0,
      "O valor total deve ser maior que zero",
    ),
    purchase_date: dateString,
    competence_date: dateString,
    category_id: optionalUuid,
    subcategory_id: optionalUuid,
    description: optionalText(200),
    notes: optionalText(1000),
    override_ultima_centavos: z.coerce
      .number()
      .int()
      .nonnegative()
      .optional()
      .nullable(),
  })
  .refine(
    (d) =>
      d.override_ultima_centavos == null ||
      overrideUltimaValido(
        reaisParaCentavos(d.valor_total),
        d.qtd_parcelas,
        d.override_ultima_centavos,
      ),
    {
      message: "A soma das parcelas não bate com o total.",
      path: ["override_ultima_centavos"],
    },
  );

export type InstallmentPurchaseInput = z.infer<typeof installmentPurchaseSchema>;

/** Edição de METADADOS de uma compra parcelada (não redistribui valores). */
export const installmentPurchaseEditSchema = z.object({
  category_id: optionalUuid,
  subcategory_id: optionalUuid,
  description: optionalText(200),
  notes: optionalText(1000),
});

export type InstallmentPurchaseEditInput = z.infer<
  typeof installmentPurchaseEditSchema
>;
