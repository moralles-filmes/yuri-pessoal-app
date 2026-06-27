import { z } from "zod";
import { CLASSIFICACOES, SPLIT_TYPES } from "@/lib/finance/constants";
import { normalizeBRMoney } from "@/lib/validators/shared";

/**
 * Valor (reais) opcional vindo do form: string vazia/ausente → undefined. Aceita o padrão BR
 * ("44,01", "1.234,56") normalizando antes de coagir — igual ao `moneyAmount` do restante do app.
 */
const optionalMoney = z.preprocess(
  (v) =>
    v === "" || v === undefined || v === null ? undefined : normalizeBRMoney(v),
  z.coerce
    .number()
    .finite("Valor inválido")
    .nonnegative("O valor não pode ser negativo")
    .optional(),
);

/** Percentual (0..100) opcional vindo do form: string vazia/ausente → undefined. */
const optionalPercent = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce
    .number()
    .finite("Valor inválido")
    .min(0, "Mínimo 0%")
    .max(100, "Máximo 100%")
    .optional(),
);

/**
 * Parte de UMA pessoa na divisão. `valor` (reais) é exigido quando tipo='valor';
 * `percentual` (0..100) quando tipo='percentual'. A autoridade final é o servidor, que
 * reconverte para centavos e revalida com `dividirDespesa` (split.ts).
 */
export const splitPartSchema = z
  .object({
    person_id: z.uuid("Selecione a pessoa"),
    tipo: z.enum(SPLIT_TYPES),
    valor: optionalMoney,
    percentual: optionalPercent,
  })
  .refine((p) => p.tipo !== "valor" || (p.valor != null && p.valor > 0), {
    message: "Informe o valor desta pessoa",
    path: ["valor"],
  })
  .refine(
    (p) => p.tipo !== "percentual" || (p.percentual != null && p.percentual > 0),
    { message: "Informe o percentual desta pessoa", path: ["percentual"] },
  );

/**
 * Configuração de divisão de uma despesa. `pessoal` → sem partes; `terceiro`/`compartilhada`
 * → ≥1 pessoa, sem repetir. Lida em conjunto com o schema da transação (parse separado, pelas
 * mesmas chaves do payload) — evita mexer na cadeia de refines do transactionSchema.
 */
export const splitSchema = z
  .object({
    classificacao: z
      .enum(CLASSIFICACOES)
      .optional()
      .transform((v) => v ?? "pessoal"),
    parts: z
      .array(splitPartSchema)
      .optional()
      .transform((v) => v ?? []),
  })
  .refine(
    (s) =>
      s.classificacao === "pessoal"
        ? s.parts.length === 0
        : s.parts.length >= 1,
    { message: "Adicione ao menos uma pessoa para dividir", path: ["parts"] },
  )
  .refine(
    (s) => new Set(s.parts.map((p) => p.person_id)).size === s.parts.length,
    { message: "Há pessoa repetida na divisão", path: ["parts"] },
  );

export type SplitInput = z.infer<typeof splitSchema>;
export type SplitPartInput = z.infer<typeof splitPartSchema>;
