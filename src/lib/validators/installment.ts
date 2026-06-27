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
    // Importação de parcela do meio: numera as parcelas geradas a partir de `numero_inicial`
    // (a parcela atual `k`) exibindo o total original em `parcelas_total_label` (`N`). Ambos
    // opcionais — o fluxo manual não envia (default: numera de 1, total = qtd_parcelas).
    numero_inicial: z.coerce.number().int().min(1).optional(),
    parcelas_total_label: z.coerce.number().int().min(1).max(60).optional(),
    // Importação: ancora a 1ª parcela gerada na competência da fatura sendo importada
    // ('yyyy-MM-01'), em vez da fatura da data da compra original. Opcional (fluxo manual omite).
    fatura_inicial_competencia: dateString.optional(),
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
  )
  .refine(
    // A última parcela gerada (numero_inicial − 1 + qtd) não pode ultrapassar o total exibido.
    (d) =>
      d.parcelas_total_label == null ||
      (d.numero_inicial ?? 1) - 1 + d.qtd_parcelas <= d.parcelas_total_label,
    {
      message: "A numeração das parcelas geradas ultrapassa o total informado.",
      path: ["parcelas_total_label"],
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
