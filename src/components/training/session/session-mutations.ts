/**
 * Fase 17-C — Treinos · Cada mutação da fila da sessão vira uma chamada de action.
 *
 * Movido de `session-live-client.tsx` na REDESIGN-07-C SEM MUDANÇA (conferido por script):
 * a revisão passou a assumir a fila e enviá-la antes de finalizar (D1), e precisa da MESMA
 * tradução. Duas cópias divergiriam na primeira mutação nova.
 */
import type { ActionResult } from "@/types/finance";
import {
  addSessionExercise,
  addSet,
  adjustActiveRest,
  endRest,
  moveSessionExercise,
  pauseSession,
  recordSet,
  resumeSession,
  setSessionExerciseStatus,
  startRest,
  substituteSessionExercise,
} from "@/lib/actions/training-sessions";
import type { QueuedMutation } from "./use-session-queue";

export async function sendSessionMutation(
  sessionId: string,
  mutation: QueuedMutation,
): Promise<ActionResult<unknown>> {
  const payload = { ...mutation.payload, session_id: sessionId };
  switch (mutation.kind) {
    case "registrar_serie":
      return recordSet({ ...payload, client_mutation_id: mutation.id });
    case "adicionar_serie":
      return addSet({ ...payload, client_mutation_id: mutation.id });
    case "iniciar_descanso":
      return startRest(payload);
    case "ajustar_descanso":
      return adjustActiveRest(payload);
    case "encerrar_descanso":
      return endRest(payload);
    case "mover_exercicio":
      return moveSessionExercise(payload);
    case "status_exercicio":
      return setSessionExerciseStatus(payload);
    case "substituir_exercicio":
      return substituteSessionExercise(payload);
    case "adicionar_exercicio":
      return addSessionExercise(payload);
    case "pausar":
      return pauseSession({ id: sessionId, ...mutation.payload });
    case "retomar":
      return resumeSession({ id: sessionId });
    default:
      return { ok: false as const, error: "Ação desconhecida." };
  }
}
