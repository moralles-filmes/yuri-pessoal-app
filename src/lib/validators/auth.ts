import { z } from "zod";

/**
 * Schemas de conta/segurança (trocar senha e e-mail).
 * Mensagens em pt-BR, no mesmo estilo de `src/components/auth/auth-form.tsx`.
 * As mutações em si rodam via SDK do Supabase no client (auth) — aqui só validamos a entrada.
 */
export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Informe a senha atual."),
    new_password: z.string().min(6, "A nova senha deve ter ao menos 6 caracteres."),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: "As senhas não coincidem.",
    path: ["confirm_password"],
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const changeEmailSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
});

export type ChangeEmailValues = z.infer<typeof changeEmailSchema>;
