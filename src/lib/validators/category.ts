import { z } from "zod";
import { CATEGORY_KINDS } from "@/lib/finance/constants";

export const categorySchema = z.object({
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
});

export type CategoryInput = z.infer<typeof categorySchema>;

export const subcategorySchema = z.object({
  category_id: z.uuid("Selecione a categoria"),
  name: z.string().trim().min(1, "Informe o nome da subcategoria").max(80),
  sort_order: z.coerce.number().int().optional().transform((v) => v ?? 0),
});

export type SubcategoryInput = z.infer<typeof subcategorySchema>;
