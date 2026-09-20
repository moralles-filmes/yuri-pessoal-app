"use server";

/**
 * Fase 18-F · Bloco 3 — IA · As Server Actions da memória.
 *
 * Casca fina: auth + Zod + serviço + `revalidatePath`. Quem grava — e quem registra o evento
 * junto — é `memory/services.ts`, o MESMO que o command da IA chama. Invariante 41: uma
 * segunda forma de criar memória divergiria no primeiro campo novo.
 *
 * ⚠️ `user_id` SEMPRE de `authContext()`, nunca do cliente. Os schemas não têm esse campo, e
 * `.strict()` recusa campo a mais.
 */

import { revalidatePath } from "next/cache";
import { authContext, invalid, notAuthed } from "./helpers";
import type { ActionResult } from "@/types/finance";
import { saoPauloWallClockToInstant } from "@/lib/format";
import {
  alternarMemoriaSchema,
  memoriaIdSchema,
  memoriaSchema,
} from "@/lib/validators/ai";
import {
  alternarMemoria,
  criarMemoria,
  editarMemoria,
  esquecerMemoria,
  excluirMemoria,
} from "@/lib/ai/memory/services";

/** As duas rotas que mostram memória: a tela dela e o chat, que a lê no prompt. */
const ROTAS = ["/ia/memoria", "/ia"] as const;

function revalidar(): void {
  for (const rota of ROTAS) revalidatePath(rota);
}

/**
 * O prazo que o dono digita é uma DATA, e ela vale até o FIM daquele dia em Brasília.
 *
 * ⛔ `new Date("2026-12-31")` é meia-noite UTC, ou seja, 21h do dia 30 em Brasília: a memória
 * venceria um dia antes do que ele pediu. Mesma conversão do command (`memory.ts`) — e ela
 * mora nos dois lugares porque cada um tem a sua casca, não porque a regra seja duas.
 */
function fimDoDiaEmBrasilia(data: string | null): string | null {
  return data ? saoPauloWallClockToInstant(data, "23:59").toISOString() : null;
}

export async function salvarMemoria(
  dados: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = memoriaSchema.safeParse(dados);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { id, conteudo, modulo, expiraEm } = parsed.data;
  const entrada = { conteudo, modulo, expiraEm: fimDoDiaEmBrasilia(expiraEm) };

  // Um schema só para criar e editar: o que discrimina é a presença do `id`. Dois schemas
  // divergiriam na primeira regra nova de forma.
  const r = id
    ? await editarMemoria(ctx, id, entrada)
    : await criarMemoria(ctx, entrada, "dono");

  if (!r.ok) return { ok: false, error: r.erro };

  revalidar();
  return { ok: true, data: { id: r.id } };
}

/** Desativar e reativar — a decisão do dono, que VENCE o prazo. Nenhum UPDATE: só o evento. */
export async function alternarMemoriaAction(
  dados: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = alternarMemoriaSchema.safeParse(dados);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const r = await alternarMemoria(ctx, parsed.data.id, parsed.data.ligar);
  if (!r.ok) return { ok: false, error: r.erro };

  revalidar();
  return { ok: true, data: { id: r.id } };
}

/**
 * Esquecer: a preferência para de orientar o assistente e CONTINUA LEGÍVEL na tela.
 *
 * ⚠️ `"dono"` porque quem clicou foi ele. Quando a IA propõe o mesmo efeito, quem chama é o
 * command `esquecerPreferencia`, com `"ia"` — a origem conta de onde veio a ideia.
 */
export async function esquecerMemoriaAction(
  dados: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = memoriaIdSchema.safeParse(dados);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const r = await esquecerMemoria(ctx, parsed.data.id, "dono");
  if (!r.ok) return { ok: false, error: r.erro };

  revalidar();
  return { ok: true, data: { id: r.id } };
}

/**
 * Apagar de vez. A linha SAI — e o EVENTO fica, sem o texto.
 *
 * É o oposto da decisão tomada em `ai_action_executions`: aquela guarda o que a IA fez nos
 * módulos do dono e não pode sumir; esta guarda o que ele escreveu sobre si, e apagar é um
 * direito dele. O que sobrevive é o registro de que a memória existiu.
 */
export async function excluirMemoriaAction(
  dados: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = memoriaIdSchema.safeParse(dados);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const r = await excluirMemoria(ctx, parsed.data.id);
  if (!r.ok) return { ok: false, error: r.erro };

  revalidar();
  return { ok: true, data: { id: r.id } };
}
