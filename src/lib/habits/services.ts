import "server-only";

/**
 * Fase 18-C · Bloco 4 — Hábitos · O SERVIÇO de check-in, extraído da Server Action.
 *
 * Mesmo motivo e mesmo molde de `todo/services.ts`: a action vira `auth + Zod + serviço +
 * revalidatePath`, o command vira `prever + serviço`, e o check-in tem UMA implementação.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O `upsert` POR `(user_id, habit_id, log_date)` É A IDEMPOTÊNCIA DO MÓDULO, E ELA É     ║
 * ║ ANTERIOR À IA — a invariante 20 da 17-F já dependia dela (o hábito "Treinar" REFLETE a ║
 * ║ sessão, nunca cria um segundo registro do dia).                                        ║
 * ║                                                                                       ║
 * ║ Consequência que importa para a 18-C: registrar o mesmo hábito duas vezes no mesmo dia ║
 * ║ não produz dois registros — ele SOBRESCREVE. Por isso a previsão do command mostra o   ║
 * ║ valor que JÁ existe no dia: "de 4 para 8 copos" é outro efeito que "0 para 8", e o dono ║
 * ║ precisa saber qual dos dois está confirmando.                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { reachedTarget } from "@/lib/habits/streak";
import type { AuthContext } from "@/lib/actions/helpers";

export type HabitServiceContext = AuthContext;

/** A meta do hábito, para derivar `is_done`. `null` = o hábito não existe (ou não é seu). */
export async function metaDoHabito(
  ctx: HabitServiceContext,
  habitId: string,
): Promise<number | null> {
  const { data } = await ctx.supabase
    .from("habits")
    .select("target_value")
    .eq("id", habitId)
    .maybeSingle();
  return data ? Number(data.target_value) : null;
}

/** O log do dia — base de um check-in idempotente e da previsão do command. */
export async function logDoDia(
  ctx: HabitServiceContext,
  habitId: string,
  logDate: string,
) {
  const { data } = await ctx.supabase
    .from("habit_logs")
    .select("id, value, is_done, notes")
    .eq("habit_id", habitId)
    .eq("log_date", logDate)
    .maybeSingle();
  return data;
}

export type CheckInResultado =
  | { readonly ok: true; readonly value: number; readonly isDone: boolean }
  | { readonly ok: false; readonly erro: string };

/**
 * Núcleo do check-in. `isDone` ausente deriva da meta (`reachedTarget`) — é a regra do
 * módulo, e reimplementá-la faria a IA marcar concluído um dia que a tela mostra em aberto.
 */
export async function registrarCheckIn(
  ctx: HabitServiceContext,
  habitId: string,
  fields: { logDate: string; value: number; notes?: string | null; isDone?: boolean },
): Promise<CheckInResultado> {
  const target = await metaDoHabito(ctx, habitId);
  if (target === null) return { ok: false, erro: "Hábito não encontrado." };

  const value = Math.max(0, fields.value);
  const isDone = fields.isDone ?? reachedTarget(value, target);

  const { error } = await ctx.supabase.from("habit_logs").upsert(
    {
      user_id: ctx.userId,
      habit_id: habitId,
      log_date: fields.logDate,
      value,
      is_done: isDone,
      notes: fields.notes ?? null,
    },
    { onConflict: "user_id,habit_id,log_date" },
  );

  if (error) return { ok: false, erro: "Não foi possível registrar o check-in." };
  return { ok: true, value, isDone };
}

/**
 * Desfaz o check-in do dia. É o `undo` declarado de `registrarHabito`.
 *
 * ⚠️ Ele APAGA a linha do dia, e não "zera o valor" — e a diferença é a invariante 20 da
 * Dieta aplicada aqui: dia sem registro não é dia com zero. Zerar diria que o usuário mediu e
 * o resultado foi nenhum; apagar diz que não há medição, que é a verdade depois de desfazer.
 */
export async function desfazerCheckIn(
  ctx: HabitServiceContext,
  habitId: string,
  logDate: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { error } = await ctx.supabase
    .from("habit_logs")
    .delete()
    .eq("habit_id", habitId)
    .eq("log_date", logDate);
  if (error) return { ok: false, erro: "Não foi possível desfazer o check-in." };
  return { ok: true };
}
