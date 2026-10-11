/**
 * REDESIGN-07-C · D1 — as regras que a tela da sessão consome (puras, testadas em node).
 *
 * ⚠️ D1 (1/2): estas implementações REPRODUZEM O COMPORTAMENTO ATUAL da tela, para a
 * caracterização (`session-queue-view.test.ts`) ficar vermelha pelo motivo certo. Nenhuma
 * tela as importa ainda. O conserto é o (2/2).
 */
import type { SessionSet } from "@/lib/training/types";
import type { draftToPayload } from "./set-editor";
import type { QueuedMutation, SyncState } from "./use-session-queue";

/** Camada otimista: o que o usuário fez e o servidor ainda não confirmou. */
export type OptimisticSet = { status: SessionSet["status"]; values: Partial<SessionSet> };

type PayloadDaSerie = ReturnType<typeof draftToPayload>;

/** Hoje: o estado aparece como veio — nasce "salvo" mesmo com a fila cheia. */
export function estadoExibido(state: SyncState, pending: number): SyncState {
  void pending;
  return state;
}

/** Hoje: "· 3", sem dizer o quê. */
export function pendentesTexto(n: number): string {
  return String(n);
}

/** Hoje a tela não diz quantos registros estão só no aparelho. */
export function registrosNoAparelhoTexto(n: number): string {
  void n;
  return "";
}

/** Hoje a revisão finaliza sem olhar a fila do aparelho. */
export function podeEncerrar(q: { pending: number }): { ok: true } | { ok: false; motivo: string } {
  void q;
  return { ok: true };
}

/** A conversão que `registerSet` faz hoje (payload → valores da série), extraída sem mudança. */
export function optimisticPatch(status: OptimisticSet["status"], payload: PayloadDaSerie): OptimisticSet {
  return {
    status,
    values: {
      reps: payload.reps,
      weightKg: payload.weight_kg,
      additionalWeightKg: payload.additional_weight_kg,
      assistanceWeightKg: payload.assistance_weight_kg,
      durationSeconds: payload.duration_seconds,
      distanceM: payload.distance_m,
      rir: payload.rir,
      rpe: payload.rpe,
      difficulty: payload.difficulty,
    },
  };
}

/** Hoje: remontar perde a camada otimista — nada é refeito da fila. */
export function optimisticFromQueue(fila: QueuedMutation[]): Record<string, OptimisticSet> {
  void fila;
  return {};
}

/** Hoje: um aviso só, com um ref — descanso já vencido ao montar toca de novo. */
export function avisosDoFimDoDescanso(e: {
  isOver: boolean;
  isRunning: boolean;
  jaAvisou: boolean;
  jaAvancou: boolean;
  vencidoNaMontagem: boolean;
  deveAvancar: boolean;
}): { tocar: boolean; avancar: boolean } {
  const avisar = e.isOver && e.isRunning && !e.jaAvisou;
  return { tocar: avisar, avancar: avisar && e.deveAvancar };
}
