/**
 * Fase 17-F — Treinos · "este dia é de treino ou de descanso?" (PURO).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ QUEM RESPONDE ESSA PERGUNTA É O MÓDULO TREINOS.                                       ║
 * ║                                                                                       ║
 * ║ A Dieta tem metas por TIPO DE DIA desde a 16-B (`nutrition_goal_items.day_kind`), e   ║
 * ║ até aqui só sabia classificar o dia pelo PLANO DELA (`nutrition_plan_days.day_kind`). ║
 * ║ Quem sabe se quinta é dia de treino é o planejamento de treino — e, melhor ainda, a   ║
 * ║ sessão que realmente aconteceu. Esta função devolve esse mapa; a Dieta CONSOME e não  ║
 * ║ recalcula caloria nenhuma por conta própria.                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ AUSÊNCIA DE DADO NÃO É "DESCANSO". Um dia sem planejamento e sem sessão devolve `null`
 * — "não sei" —, nunca `descanso`. Chutar descanso mudaria silenciosamente a meta do dia de
 * quem só registra treino às vezes: exatamente o tipo de número inventado que as duas frentes
 * proíbem.
 *
 * Sem `Date.now()`: a função recebe o que já foi lido e devolve um mapa.
 */
import type { DerivableEntry } from "./schedule";

/** O mesmo vocabulário da Dieta (16-B): `nutrition_goal_items.day_kind`. */
export type TrainingDayKind = "treino" | "descanso";

/** Entrada mínima do planejamento — o que basta para classificar o dia. */
export type DayKindEntry = DerivableEntry & {
  /** 'treino' | 'descanso' (17-B). */
  entryKind: string;
};

/** Entrada mínima da execução: um dia com sessão registrada é dia de treino, ponto. */
export type DayKindSession = {
  sessionDate: string;
  status: string;
};

/** Status de planejamento que deixam de valer como "vai treinar". */
const DISCARDED_STATUSES = new Set(["cancelado", "reagendado"]);

/** Status de sessão que contam como treino realizado. */
const DONE_SESSION_STATUSES = new Set(["concluida"]);

/**
 * Classifica cada dia do período.
 *
 * A ordem de prioridade é a da REALIDADE sobre a INTENÇÃO:
 *
 *  1. **treinou** — existe sessão concluída no dia. Vence qualquer planejamento, inclusive um
 *     "descanso" planejado: se a pessoa treinou num dia marcado como descanso, o dia foi de
 *     treino, e a meta do dia tem de saber disso.
 *  2. **treino planejado** — há um dia planejado com treino, não cancelado nem reagendado.
 *  3. **descanso planejado** — há o marcador de descanso do dia.
 *  4. `null` — nada foi planejado e nada aconteceu. A Dieta então usa a meta sem recorte.
 */
export function trainingDayKinds(input: {
  entries: DayKindEntry[];
  sessions: DayKindSession[];
}): Map<string, TrainingDayKind> {
  const out = new Map<string, TrainingDayKind>();

  // (3) e (2) primeiro, porque (1) sobrescreve.
  for (const entry of input.entries) {
    if (entry.entryKind !== "descanso") continue;
    if (DISCARDED_STATUSES.has(entry.status)) continue;
    out.set(entry.scheduledDate, "descanso");
  }
  for (const entry of input.entries) {
    if (entry.entryKind === "descanso") continue;
    if (DISCARDED_STATUSES.has(entry.status)) continue;
    out.set(entry.scheduledDate, "treino");
  }
  for (const session of input.sessions) {
    if (!DONE_SESSION_STATUSES.has(session.status)) continue;
    out.set(session.sessionDate, "treino");
  }

  return out;
}

/** O tipo de UM dia. `null` quando o módulo não tem como afirmar. */
export function trainingDayKindOn(
  map: Map<string, TrainingDayKind>,
  date: string,
): TrainingDayKind | null {
  return map.get(date) ?? null;
}

/**
 * Mescla o que o módulo Treinos sabe com o que o plano da Dieta já dizia.
 *
 * Treinos VENCE onde tem resposta (é a fonte de verdade declarada na 17-F); onde não tem, o
 * plano da Dieta continua valendo — nada do que já funcionava é perdido.
 */
export function mergeDayKinds(
  fromNutritionPlan: Map<string, TrainingDayKind | null>,
  fromTraining: Map<string, TrainingDayKind>,
): Map<string, TrainingDayKind | null> {
  const out = new Map(fromNutritionPlan);
  for (const [date, kind] of fromTraining) out.set(date, kind);
  return out;
}