/**
 * Fase 17-F — reflexo do treino no hábito (I/O, server-only).
 *
 * A DECISÃO fica em `habit-reflection.ts` (puro e testado). Aqui só existe o que precisa de
 * banco: descobrir o hábito vinculado, ler as sessões CONCLUÍDAS do dia e gravar o check-in.
 *
 * ⛔ Não é um segundo registro do treino. `habit_logs` é único por
 * `(user_id, habit_id, log_date)`, e a gravação é UPSERT nessa linha — o dia converge para um
 * valor só, derivado das sessões. Reabrir uma sessão, excluir, concluir de novo: o hábito
 * acompanha o histórico em vez de acumular contagem.
 *
 * ⛔ Opt-in: sem `training_preferences.habit_id`, esta função sai na primeira consulta e não
 * escreve nada.
 *
 * Best-effort: uma falha aqui NUNCA derruba a finalização do treino.
 */
import "server-only";
import type { AuthContext } from "@/lib/actions/helpers";
import { habitCheckInFromSessions } from "./habit-reflection";

/**
 * Recalcula o check-in do hábito vinculado para UM dia, a partir das sessões concluídas nele.
 * Chamada depois de finalizar, reabrir, abandonar ou excluir uma sessão. Nunca lança.
 */
export async function reflectTrainingInHabit(
  ctx: AuthContext,
  sessionDate: string,
): Promise<void> {
  try {
    const { data: prefs } = await ctx.supabase
      .from("training_preferences")
      .select("habit_id")
      .eq("user_id", ctx.userId)
      .maybeSingle();

    const habitId = prefs?.habit_id;
    if (!habitId) return;

    const [{ data: habit }, { data: sessions }] = await Promise.all([
      ctx.supabase
        .from("habits")
        .select("id,unit,target_value,is_active")
        .eq("id", habitId)
        .eq("user_id", ctx.userId)
        .maybeSingle(),
      ctx.supabase
        .from("training_sessions")
        .select("active_seconds,total_seconds")
        .eq("user_id", ctx.userId)
        .eq("session_date", sessionDate)
        .eq("status", "concluida"),
    ]);

    if (!habit) return;

    const checkIn = habitCheckInFromSessions({
      unit: habit.unit,
      target: Number(habit.target_value ?? 0),
      sessions: (sessions ?? []).map((row) => ({
        activeSeconds: row.active_seconds,
        totalSeconds: row.total_seconds,
      })),
    });

    // Sem sessão concluída no dia, o reflexo REMOVE o registro que ele mesmo criou — em vez de
    // deixar um "0" que o histórico não sustenta. Um check-in manual do usuário no mesmo dia
    // seria apagado junto: por isso o vínculo é opt-in e explicado na tela.
    if (checkIn.value === 0) {
      await ctx.supabase
        .from("habit_logs")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("habit_id", habitId)
        .eq("log_date", sessionDate);
      return;
    }

    // O unique (user_id, habit_id, log_date) é TOTAL — aqui `ON CONFLICT` é seguro (ao
    // contrário dos índices parciais da Dieta, que quebram o upsert do PostgREST em runtime).
    await ctx.supabase.from("habit_logs").upsert(
      {
        user_id: ctx.userId,
        habit_id: habitId,
        log_date: sessionDate,
        value: checkIn.value,
        is_done: checkIn.isDone,
      },
      { onConflict: "user_id,habit_id,log_date" },
    );
  } catch {
    // Best-effort — o treino já está salvo e é a fonte de verdade.
  }
}