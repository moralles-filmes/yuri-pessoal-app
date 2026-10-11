/**
 * REDESIGN-07-C · D1 — as regras que a tela da sessão consome (puras, testadas em node).
 *
 * Moram fora dos componentes porque o projeto não tem teste de componente (invariante 25):
 * aqui elas são executadas; a ligação com a tela é provada por varredura
 * (`src/test/sessao-ao-vivo-contratos.test.ts`).
 */
import type { SessionSet } from "@/lib/training/types";
import type { draftToPayload } from "./set-editor";
import type { QueuedMutation, SyncState } from "./use-session-queue";

/** Camada otimista: o que o usuário fez e o servidor ainda não confirmou. */
export type OptimisticSet = { status: SessionSet["status"]; values: Partial<SessionSet> };

type PayloadDaSerie = ReturnType<typeof draftToPayload>;

const STATUS_REGISTRAVEIS: ReadonlySet<string> = new Set(["concluida", "falhou", "pulada", "pendente"]);

/**
 * S3 — o status nasce do tamanho da fila. "Salvo" com registro ainda no aparelho seria o
 * "salvo" otimista que esta tela existe para não mostrar.
 */
export function estadoExibido(state: SyncState, pending: number): SyncState {
  return state === "salvo" && pending > 0 ? "salvo_no_dispositivo" : state;
}

/** "· 3" não dizia o quê. */
export function pendentesTexto(n: number): string {
  return `${n} a enviar`;
}

export function registrosNoAparelhoTexto(n: number): string {
  return n === 1
    ? "1 registro ainda está só neste aparelho"
    : `${n} registros ainda estão só neste aparelho`;
}

/**
 * S1 — a revisão só finaliza ou encerra com a fila do aparelho vazia. Finalizar antes fazia o
 * servidor recusar o que chegasse depois ("Este treino já foi encerrado.") e a série sumia.
 * Descartar continua possível (o diálogo avisa que os registros do aparelho somem junto).
 */
export function podeEncerrar(q: { pending: number }): { ok: true } | { ok: false; motivo: string } {
  if (q.pending <= 0) return { ok: true };
  return {
    ok: false,
    motivo:
      q.pending === 1
        ? "1 registro deste aparelho ainda não chegou ao servidor."
        : `${q.pending} registros deste aparelho ainda não chegaram ao servidor.`,
  };
}

/** A conversão que `registerSet` sempre fez (payload → valores da série), num lugar só. */
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

const numeroOuNulo = (v: unknown): number | null => (typeof v === "number" ? v : null);

/**
 * S3 — remontar refaz a camada otimista a partir da fila do aparelho: a série confirmada e
 * ainda não enviada continua feita, com os valores digitados (e não volta para a sugestão da
 * última vez, que gravaria por cima no próximo "confirmar"). Na ordem; a última de cada
 * série vence.
 */
export function optimisticFromQueue(fila: QueuedMutation[]): Record<string, OptimisticSet> {
  const camada: Record<string, OptimisticSet> = {};
  for (const mutation of fila) {
    if (mutation.kind !== "registrar_serie") continue;
    const p = mutation.payload;
    if (typeof p.session_set_id !== "string") continue;
    if (typeof p.status !== "string" || !STATUS_REGISTRAVEIS.has(p.status)) continue;
    camada[p.session_set_id] = optimisticPatch(p.status as OptimisticSet["status"], {
      reps: numeroOuNulo(p.reps),
      weight_kg: numeroOuNulo(p.weight_kg),
      additional_weight_kg: numeroOuNulo(p.additional_weight_kg),
      assistance_weight_kg: numeroOuNulo(p.assistance_weight_kg),
      duration_seconds: numeroOuNulo(p.duration_seconds),
      distance_m: numeroOuNulo(p.distance_m),
      calories: numeroOuNulo(p.calories),
      incline_percent: numeroOuNulo(p.incline_percent),
      resistance_level: numeroOuNulo(p.resistance_level),
      reps_left: numeroOuNulo(p.reps_left),
      reps_right: numeroOuNulo(p.reps_right),
      rir: numeroOuNulo(p.rir),
      rpe: numeroOuNulo(p.rpe),
      difficulty: (p.difficulty ?? null) as PayloadDaSerie["difficulty"],
      notes: typeof p.notes === "string" ? p.notes : null,
    });
  }
  return camada;
}

/**
 * S4/(e') — o que fazer quando o descanso acaba. Descanso que JÁ TINHA ACABADO quando o
 * painel montou (recarregou, voltou à tela) não toca nem vibra de novo — o aviso já foi
 * dado, ou chegou tarde demais para ser útil. O avanço automático não muda: acontece uma vez.
 */
export function avisosDoFimDoDescanso(e: {
  isOver: boolean;
  isRunning: boolean;
  jaAvisou: boolean;
  jaAvancou: boolean;
  vencidoNaMontagem: boolean;
  deveAvancar: boolean;
}): { tocar: boolean; avancar: boolean } {
  if (!e.isOver || !e.isRunning) return { tocar: false, avancar: false };
  return {
    tocar: !e.jaAvisou && !e.vencidoNaMontagem,
    avancar: !e.jaAvancou && e.deveAvancar,
  };
}
