/**
 * Fase 17-F — leitura de "dia de treino ou de descanso" (server-only).
 *
 * Consumida pelo módulo **Dieta** para resolver as metas por tipo de dia (16-B). A decisão é
 * da função pura `day-kind.ts`; aqui só há I/O, e ele é enxuto de propósito: duas colunas de
 * cada tabela, na janela pedida.
 *
 * ⛔ A Dieta não recalcula nada de treino, e este arquivo não calcula nada de nutrição. É a
 * mesma disciplina que fez a 17-E ler o corpo por `src/lib/body/` em vez de criar tabela.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { trainingDayKinds, type TrainingDayKind } from "./day-kind";

/**
 * Mapa `data → 'treino' | 'descanso'` do período. Dias sem informação **não entram no mapa**
 * (ausência de dado não é "descanso").
 */
export async function getTrainingDayKinds(
  from: string,
  to: string,
): Promise<Map<string, TrainingDayKind>> {
  try {
    const supabase = await createClient();

    const [entriesRes, sessionsRes] = await Promise.all([
      supabase
        .from("training_scheduled_workouts")
        .select("scheduled_date,entry_kind,status")
        .gte("scheduled_date", from)
        .lte("scheduled_date", to)
        .limit(2000),
      supabase
        .from("training_sessions")
        .select("session_date,status")
        .gte("session_date", from)
        .lte("session_date", to)
        .limit(2000),
    ]);

    return trainingDayKinds({
      entries: (entriesRes.data ?? []).map((row) => ({
        scheduledDate: row.scheduled_date,
        entryKind: row.entry_kind,
        status: row.status as never,
      })),
      sessions: (sessionsRes.data ?? []).map((row) => ({
        sessionDate: row.session_date,
        status: row.status,
      })),
    });
  } catch {
    // O módulo Treinos indisponível não pode derrubar a leitura da Dieta: sem informação, a
    // meta do dia continua sendo a sem recorte — que é o comportamento anterior à 17-F.
    return new Map();
  }
}