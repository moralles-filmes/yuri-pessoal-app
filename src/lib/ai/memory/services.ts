import "server-only";

/**
 * Fase 18-F · Bloco 3 — IA · As cinco escritas da memória. Cada uma com o SEU evento.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS DUAS PORTAS CHAMAM DAQUI — a tela (`actions/ai-memory.ts`) e o command da IA       ║
 * ║ (`approval/commands/memory.ts`). Uma segunda forma de criar memória divergiria no     ║
 * ║ primeiro campo novo, e o evento deixaria de nascer junto num dos dois caminhos.       ║
 * ║ É a invariante 41, com o `services.ts` no lugar de sempre.                            ║
 * ║                                                                                       ║
 * ║ ⛔ O EVENTO NUNCA CARREGA `content`. Nenhuma das funções abaixo passa o texto para     ║
 * ║ `ai_memory_events`, e isso é o desenho, não um descuido a corrigir depois.            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { EventoDeMemoria, ModuloDeMemoria, OrigemDeMemoria } from "./contracts";
import { formaDaMemoria, MOTIVO_DA_RECUSA } from "./forma";

/**
 * ⚠️ Estruturalmente idêntico a `CommandContext` (`approval/contracts.ts`) e ao que
 * `authContext()` devolve — de propósito: as duas portas passam o que já têm na mão, sem
 * adaptador no meio.
 */
export type ContextoDaMemoria = {
  readonly supabase: SupabaseClient<Database>;
  readonly userId: string;
};

export type ResultadoDaMemoria =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly erro: string };

export type EntradaDeMemoria = {
  readonly conteudo: string;
  readonly modulo: ModuloDeMemoria | null;
  /** ISO ou `null`. Quem converte "2026-12-31" em instante é a casca, nunca isto. */
  readonly expiraEm: string | null;
};

async function registrarEvento(
  ctx: ContextoDaMemoria,
  memoryId: string,
  evento: EventoDeMemoria,
  origem: OrigemDeMemoria,
): Promise<void> {
  await ctx.supabase.from("ai_memory_events").insert({
    user_id: ctx.userId,
    memory_id: memoryId,
    evento,
    origem,
    // ⛔ E MAIS NADA. Ver o cabeçalho.
  });
}

export async function criarMemoria(
  ctx: ContextoDaMemoria,
  entrada: EntradaDeMemoria,
  origem: OrigemDeMemoria,
): Promise<ResultadoDaMemoria> {
  const forma = formaDaMemoria(entrada.conteudo);
  if (!forma.ok) return { ok: false, erro: MOTIVO_DA_RECUSA[forma.motivo] };

  const { data, error } = await ctx.supabase
    .from("ai_memories")
    .insert({
      user_id: ctx.userId,
      content: forma.valor,
      modulo: entrada.modulo,
      expires_at: entrada.expiraEm,
      origem,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, erro: "Não foi possível salvar a memória." };

  await registrarEvento(ctx, data.id, "criada", origem);
  return { ok: true, id: data.id };
}

export async function editarMemoria(
  ctx: ContextoDaMemoria,
  id: string,
  entrada: EntradaDeMemoria,
): Promise<ResultadoDaMemoria> {
  const forma = formaDaMemoria(entrada.conteudo);
  if (!forma.ok) return { ok: false, erro: MOTIVO_DA_RECUSA[forma.motivo] };

  const { error } = await ctx.supabase
    .from("ai_memories")
    .update({
      content: forma.valor,
      modulo: entrada.modulo,
      expires_at: entrada.expiraEm,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return { ok: false, erro: "Não foi possível alterar a memória." };

  // ⚠️ Editar é sempre do DONO: a IA não tem ferramenta de editar memória, e a ausência é a
  // trava — ela não pode reescrever uma preferência que ele escreveu.
  await registrarEvento(ctx, id, "editada", "dono");
  return { ok: true, id };
}

/** Desativar e reativar — a decisão de exibição, que VENCE o prazo. */
export async function alternarMemoria(
  ctx: ContextoDaMemoria,
  id: string,
  ligar: boolean,
): Promise<ResultadoDaMemoria> {
  // ⚠️ Nenhum UPDATE: o estado é derivado. O que existe é o evento.
  await registrarEvento(ctx, id, ligar ? "reativada" : "desativada", "dono");
  return { ok: true, id };
}

/**
 * Esquecer: a memória para de entrar no prompt e CONTINUA LEGÍVEL na tela.
 *
 * É o inverso de `lembrarPreferencia`. Não é o mesmo que excluir — e a diferença é o que
 * torna o desfazer da IA proporcional: desfazer um "lembrar" não pode apagar uma linha que o
 * dono talvez queira reler.
 */
export async function esquecerMemoria(
  ctx: ContextoDaMemoria,
  id: string,
  origem: OrigemDeMemoria,
): Promise<ResultadoDaMemoria> {
  await registrarEvento(ctx, id, "esquecida", origem);
  return { ok: true, id };
}

/**
 * Excluir: a linha SAI. Só o dono, só pela tela.
 *
 * ⚠️ O EVENTO VEM ANTES DO DELETE, e a ordem é decisão. Se o delete falhar, fica um evento de
 * exclusão sobre uma memória que existe — visível e corrigível. Na ordem inversa, um insert
 * que falhasse deixaria a linha sumir sem registro nenhum, que é exatamente o que
 * `ai_memory_events` existe para impedir. Erramos para "há registro a mais", nunca para "não
 * há registro".
 */
export async function excluirMemoria(
  ctx: ContextoDaMemoria,
  id: string,
): Promise<ResultadoDaMemoria> {
  await registrarEvento(ctx, id, "excluida", "dono");

  const { error } = await ctx.supabase
    .from("ai_memories")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);
  if (error) return { ok: false, erro: "Não foi possível excluir a memória." };
  return { ok: true, id };
}
