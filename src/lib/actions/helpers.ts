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

/* ───────────────── 03-G2 (D-G2-16) — as três formas de falha de ESCRITA ───────────────── */

/** O banco respondeu que recusou e a transação voltou: a frase pode afirmar que nada mudou. */
export function nadaGravado(oQue: string): ActionResult<never> {
  return { ok: false, error: `Não foi possível ${oQue}. Nada foi alterado.` };
}

/** Parte do efeito foi gravada: quem chama escreve a frase (o que foi, o que não foi). */
export function gravadoEmParte(frase: string): ActionResult<never> {
  return { ok: false, error: frase };
}

/** A resposta se perdeu (rede, timeout): erra para "pode ter acontecido", nunca para "nada". */
export function desfechoDesconhecido(oQue: string, onde: string): ActionResult<never> {
  return {
    ok: false,
    error: `Não foi possível confirmar o resultado: pode ter ${oQue}. Confira em ${onde} antes de tentar de novo.`,
  };
}

/**
 * O banco respondeu (D-G2-16)? `code` SQLSTATE tem 5 caracteres (inclui `P0001` e `23xxx`): a
 * transação foi recusada e nada ficou. Sem ele (fetch falho, timeout), a escrita PODE ter
 * acontecido — quem chama erra para "pode ter acontecido", nunca para "nada".
 */
export function temSqlstate<E extends { code?: string }>(
  error: E | null | undefined,
): error is E & { code: string } {
  return typeof error?.code === "string" && error.code.length === 5;
}

/**
 * Traduz o erro de uma RPC de escrita. Erro com `code` SQLSTATE (5 caracteres — inclui `P0001` e
 * as violações de CHECK/FK, todas com a transação revertida) ⇒ nada gravado. Sem `code` (fetch
 * falho, timeout) ⇒ desfecho desconhecido. ⛔ A mensagem crua do banco NUNCA vai para a tela:
 * só a frase escrita aqui para o código conhecido.
 */
export function traduzirErroDaRpc(
  error: { code?: string; message?: string } | null,
  oQue: string,
  onde = "Lançamentos",
): ActionResult<never> {
  if (!temSqlstate(error)) {
    return desfechoDesconhecido("sido salvo", onde);
  }
  const mensagem = error.message ?? "";
  if (mensagem.includes("DIVISAO_PROTEGIDA")) {
    return {
      ok: false,
      error:
        "Há recebível com recebimento registrado, cobrado ou que você decidiu não cobrar nesta divisão. Acerte-o em A Receber antes de alterar a divisão. Nada foi alterado.",
    };
  }
  if (mensagem.includes("PARCELADO_NAO_MUDA_DE_TIPO")) {
    return { ok: false, error: "Compra parcelada muda em Parcelamentos. Nada foi alterado." };
  }
  if (mensagem.includes("LANCAMENTO_NAO_ENCONTRADO")) {
    return { ok: false, error: "Lançamento não encontrado. Nada foi alterado." };
  }
  return nadaGravado(oQue);
}
