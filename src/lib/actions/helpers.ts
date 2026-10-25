/**
 * Helpers de Server Actions (Fase 02). NÃO é um módulo "use server":
 * exporta utilitários síncronos/assíncronos usados pelas actions.
 * O `user_id` é SEMPRE derivado de `auth.getUser()` — nunca do client.
 */
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/finance";

export type AuthContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

export async function authContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, userId: user.id };
}

export const notAuthed: ActionResult<never> = {
  ok: false,
  error: "Sessão expirada. Faça login novamente.",
};

export function invalid(
  fieldErrors: Record<string, string[] | undefined>,
): ActionResult<never> {
  const clean: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    if (value && value.length) clean[key] = value;
  }
  return { ok: false, error: "Verifique os campos destacados.", fieldErrors: clean };
}

export function dbError(
  message = "Não foi possível concluir a operação.",
): ActionResult<never> {
  return { ok: false, error: message };
}

/**
 * 03-G (D-G20) — leitura que falhou ANTES de qualquer escrita da action: a frase pode afirmar
 * que nada mudou.
 */
export function falhaDeLeituraAntes(oQue: string): ActionResult<never> {
  return { ok: false, error: `Não foi possível ler ${oQue}. Nada foi alterado.` };
}

/**
 * 03-G (D-G20) — leitura que falhou DEPOIS de uma escrita da mesma action: erra para "pode ter
 * acontecido em parte" (invariante 37), nunca afirma o que não sabe.
 */
export function falhaDeLeituraDepois(oQue: string): ActionResult<never> {
  return {
    ok: false,
    error: `Não foi possível ler ${oQue}. A alteração pode ter sido gravada em parte: recarregue a página para conferir.`,
  };
}
