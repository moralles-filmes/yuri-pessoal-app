import { z } from "zod";
import { optionalText } from "@/lib/validators/shared";

/** E-mail opcional: "" ou ausente vira null; quando presente, valida o formato. */
const optionalEmail = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.email("E-mail inválido").nullable(),
);

export const personSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da pessoa")
    .max(120, "Máximo de 120 caracteres"),
  telefone: optionalText(40),
  email: optionalEmail,
  observacoes: optionalText(1000),
  ativo: z
    .boolean()
    .optional()
    .transform((v) => v ?? true),
});

export type PersonInput = z.infer<typeof personSchema>;
