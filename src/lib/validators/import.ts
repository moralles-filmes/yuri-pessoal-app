import { z } from "zod";
import {
  IMPORT_AS_OPTIONS,
  IMPORT_ORIGENS,
  IMPORT_ROW_TIPOS,
} from "@/lib/import/constants";
import { dateString, optionalUuid } from "@/lib/validators/shared";

/** UUID nullable e OPCIONAL: ausente (undefined) = "não alterar"; "" = limpar; uuid = definir. */
const patchUuid = z.preprocess(
  (v) => (v === "" ? null : v),
  z.uuid("Seleção inválida").nullable().optional(),
);

/**
 * Booleano vindo de FormData (string "true"/"false") OU de payload JS (boolean). Ausente/vazio
 * vira `true` (padrão). Necessário porque `z.coerce.boolean()` trata "false" como true.
 */
const boolDefaultTrue = z.preprocess(
  (v) =>
    v === undefined || v === null || v === ""
      ? true
      : v === true || v === "true" || v === "1" || v === "on",
  z.boolean(),
);

/**
 * Campos escalares do upload (o arquivo vem à parte no FormData). Exige o alvo coerente com a
 * origem: cartão (credit_card_id) para fatura, conta (account_id) para extrato. O `user_id`
 * nunca vem do client — é derivado de auth.uid() no servidor.
 */
export const importUploadSchema = z
  .object({
    origem: z.enum(IMPORT_ORIGENS),
    credit_card_id: optionalUuid,
    account_id: optionalUuid,
    sinal_negativo_despesa: boolDefaultTrue,
  })
  .refine((d) => d.origem !== "cartao" || !!d.credit_card_id, {
    message: "Selecione o cartão",
    path: ["credit_card_id"],
  })
  .refine((d) => d.origem !== "conta" || !!d.account_id, {
    message: "Selecione a conta",
    path: ["account_id"],
  });

export type ImportUploadInput = z.infer<typeof importUploadSchema>;

/** Índice de coluna opcional (>= 0). Campo ausente = não mapeado. */
const colIndex = z.coerce.number().int().nonnegative().optional();

/** Mapeamento campo → índice de coluna. */
export const columnMappingSchema = z.object({
  data: colIndex,
  descricao: colIndex,
  valor: colIndex,
  categoria: colIndex,
  conta_cartao: colIndex,
  parcela: colIndex,
  parcelas_total: colIndex,
  identificador: colIndex,
});

/** Re-mapeamento de um lote: novo mapeamento + convenção de sinal. */
export const remapSchema = z.object({
  fields: columnMappingSchema,
  sinal_negativo_despesa: boolDefaultTrue,
});

export type RemapInput = z.infer<typeof remapSchema>;

/**
 * Patch de uma linha na revisão. Tudo opcional: o usuário pode trocar a categoria, a data,
 * o valor (corrigir linha com erro), incluir/ignorar/forçar a importação, e escolher importar
 * como compra parcelada. O servidor revalida e re-deriva o que for necessário.
 */
export const updateImportRowSchema = z.object({
  status: z.enum(["para_importar", "ignorada", "duplicada"]).optional(),
  categoria_sugerida_id: patchUuid,
  import_as: z.enum(IMPORT_AS_OPTIONS).optional(),
  descricao: z.string().trim().max(200, "Máximo de 200 caracteres").optional(),
  data_norm: dateString.optional(),
  valor: z.coerce
    .number()
    .finite("Valor inválido")
    .positive("O valor deve ser maior que zero")
    .optional(),
  tipo: z.enum(IMPORT_ROW_TIPOS).optional(),
  /**
   * Conta de destino da transferência. Segue a semântica de `patchUuid`: ausente = não alterar,
   * "" = limpar, uuid = definir. Quem confere se a conta é do próprio dono é a FK composta
   * `(transfer_account_id, user_id)` no banco — a RLS só alcança o `user_id` da própria linha.
   */
  transfer_account_id: patchUuid,
});

export type UpdateImportRowInput = z.infer<typeof updateImportRowSchema>;
