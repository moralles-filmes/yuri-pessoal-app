import { z } from "zod";
import { CATEGORY_KINDS } from "@/lib/finance/constants";
import { MARCACAO_DE_TERCEIROS, tipoDeCategoriaSugere } from "@/lib/finance/marcacao-da-categoria";

export const MSG_MARCACAO_SO_EM_RECEITA =
  "Só categorias de receita sugerem que a entrada é de terceiros.";

export const categorySchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome da categoria").max(80),
    kind: z.enum(CATEGORY_KINDS),
    color: z
      .string()
      .trim()
      .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Cor inválida")
      .optional()
      .transform((v) => (v && v.length ? v : "#A98438")),
    icon: z
      .string()
      .trim()
      .max(40)
      .optional()
      .transform((v) => (v && v.length ? v : "tag")),
    sort_order: z.coerce.number().int().optional().transform((v) => v ?? 0),
    /**
     * 03-C2 · E7/D8 — ATALHO, nunca verdade. P3: obrigatório e sem padrão — todo chamador
     * decide, e nenhum update que omita a chave limpa ou preserva a marcação em silêncio.
     */
    classificacao_padrao: z
      .enum([MARCACAO_DE_TERCEIROS], { error: "Escolha se a categoria sugere algo ao lançar." })
      .nullable(),
  })
  .superRefine((data, ctx) => {
    // P2: a combinação incoerente é recusada no servidor; o formulário nunca a manda.
    if (data.classificacao_padrao !== null && !tipoDeCategoriaSugere(data.kind)) {
      ctx.addIssue({
        code: "custom",
        path: ["classificacao_padrao"],
        message: MSG_MARCACAO_SO_EM_RECEITA,
      });
    }
  });

export type CategoryInput = z.infer<typeof categorySchema>;

export const subcategorySchema = z.object({
  category_id: z.uuid("Selecione a categoria"),
  name: z.string().trim().min(1, "Informe o nome da subcategoria").max(80),
  sort_order: z.coerce.number().int().optional().transform((v) => v ?? 0),
});

export type SubcategoryInput = z.infer<typeof subcategorySchema>;
