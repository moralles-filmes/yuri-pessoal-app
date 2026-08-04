"use server";

/**
 * Fase 18-A — IA · Conversas.
 *
 * Repare no que NÃO está aqui: criar conversa. Ela nasce dentro de `ai_begin_chat_run`,
 * junto com a primeira mensagem e o run, numa transação só. Uma action "criar conversa"
 * abriria caminho para conversa vazia sem run e para a corrida que a admissão atômica
 * existe para fechar.
 */

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import {
  conversationRefSchema,
  renameConversationSchema,
  setConversationFavoriteSchema,
  setConversationStatusSchema,
} from "@/lib/validators/ai";
import type { ActionResult } from "@/types/finance";

function revalidar(conversationId?: string) {
  revalidatePath("/ia");
  revalidatePath("/ia/conversas");
  if (conversationId) revalidatePath(`/ia/conversas/${conversationId}`);
}

export async function renameConversation(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = renameConversationSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("ai_conversations")
    .update({ title: parsed.data.title })
    .eq("id", parsed.data.conversationId)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível renomear a conversa.");

  revalidar(parsed.data.conversationId);
  return { ok: true, data: { id: parsed.data.conversationId } };
}

export async function setConversationStatus(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = setConversationStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const arquivando = parsed.data.status === "arquivada";

  const { error } = await ctx.supabase
    .from("ai_conversations")
    .update({
      status: parsed.data.status,
      archived_at: arquivando ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.conversationId)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível alterar a conversa.");

  revalidar(parsed.data.conversationId);
  return {
    ok: true,
    data: { id: parsed.data.conversationId, status: parsed.data.status },
  };
}

export async function setConversationFavorite(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = setConversationFavoriteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("ai_conversations")
    .update({ is_favorite: parsed.data.isFavorite })
    .eq("id", parsed.data.conversationId)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível favoritar a conversa.");

  revalidar(parsed.data.conversationId);
  return { ok: true, data: { id: parsed.data.conversationId } };
}

/**
 * Excluir a conversa leva junto mensagens, runs e eventos de uso — as FKs compostas são
 * `on delete cascade`.
 *
 * ⚠️ CONSEQUÊNCIA DECLARADA: o histórico de custo daquelas execuções vai embora com ela.
 * A tela avisa isso ANTES de excluir. A alternativa (guardar eventos órfãos) criaria linhas
 * de gasto que a interface não conseguiria explicar de onde vieram.
 */
export async function deleteConversation(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = conversationRefSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  // Conversa com run em andamento não é excluída: apagar a linha no meio do streaming
  // deixaria o runner escrevendo em algo que não existe mais, e a reserva desapareceria do
  // orçamento sem ter sido reconciliada.
  const { data: abertos } = await ctx.supabase
    .from("ai_runs")
    .select("id")
    .eq("conversation_id", parsed.data.conversationId)
    .eq("user_id", ctx.userId)
    .in("status", ["reserved", "streaming"])
    .limit(1);

  if (abertos && abertos.length > 0) {
    return {
      ok: false,
      error: "Esta conversa tem uma resposta em andamento. Aguarde ou cancele antes de excluir.",
    };
  }

  const { error } = await ctx.supabase
    .from("ai_conversations")
    .delete()
    .eq("id", parsed.data.conversationId)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível excluir a conversa.");

  revalidar();
  return { ok: true, data: { id: parsed.data.conversationId } };
}
