import { z } from "zod";
import { optionalColor, optionalText } from "@/lib/validators/shared";

/** Validação de um projeto/lista de tarefas (Fase 09). */
export const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe um nome")
    .max(120, "Máximo de 120 caracteres"),
  description: optionalText(1000),
  color: optionalColor,
  icon: optionalText(40),
  is_archived: z
    .boolean()
    .optional()
    .transform((v) => v ?? false),
});

export type ProjectInput = z.infer<typeof projectSchema>;
