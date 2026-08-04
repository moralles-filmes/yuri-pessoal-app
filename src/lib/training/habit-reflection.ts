/**
 * Fase 17-F — o hábito "Treinar" REFLETE as sessões (PURO).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ "O TREINO ACONTECEU" TEM UMA FONTE SÓ: `training_sessions`.                            ║
 * ║                                                                                       ║
 * ║ Esta função responde "qual deveria ser o check-in do hábito NESTE dia, dado o que foi  ║
 * ║ efetivamente treinado". Ela não SOMA ao que já existe: devolve o valor derivado das    ║
 * ║ sessões, e o I/O faz upsert na linha única de `habit_logs (user_id, habit_id,          ║
 * ║ log_date)`. Por isso concluir → reabrir → concluir converge para UM registro no dia,   ║
 * ║ nunca dois — e excluir a sessão faz o dia voltar ao que o histórico sustenta.          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A unidade do hábito decide o que é "quanto":
 *   • minutos/horas → o tempo efetivamente treinado (ATIVO, não o de relógio: o tempo parado
 *     entre séries não é treino — a mesma distinção que `timers.ts` faz na sessão);
 *   • qualquer outra → a contagem de sessões concluídas no dia.
 *
 * Sem `Date.now()` e sem I/O.
 */

/** Unidades de hábito que medem TEMPO (o resto conta ocorrências). */
const TIME_UNITS = new Set(["minutos", "horas"]);

export type ReflectableSession = {
  /** Tempo ativo em segundos (total − pausas − descansos). `null` quando não apurado. */
  activeSeconds: number | null;
  /** Tempo de relógio em segundos. Só entra quando não há tempo ativo. */
  totalSeconds: number | null;
};

export type HabitCheckIn = {
  /** Quanto foi feito no dia, na unidade do hábito. */
  value: number;
  /** A meta do dia foi atingida? */
  isDone: boolean;
};

/**
 * O check-in que o dia MERECE, a partir das sessões concluídas nele.
 *
 * Zero sessões devolve `{ value: 0, isDone: false }` — e isso é um FATO medido ("não há sessão
 * concluída neste dia"), não uma suposição: quem chama só reflete um dia depois de mexer numa
 * sessão dele.
 */
export function habitCheckInFromSessions(input: {
  unit: string;
  target: number;
  sessions: ReflectableSession[];
}): HabitCheckIn {
  const target = Number.isFinite(input.target) ? input.target : 0;

  let value: number;
  if (TIME_UNITS.has(input.unit)) {
    const seconds = input.sessions.reduce(
      (sum, session) => sum + (session.activeSeconds ?? session.totalSeconds ?? 0),
      0,
    );
    const minutes = seconds / 60;
    value = input.unit === "horas" ? round(minutes / 60, 2) : Math.round(minutes);
  } else {
    value = input.sessions.length;
  }

  // Sem meta declarada, "fez alguma coisa" é o que existe para dizer.
  const isDone = target > 0 ? value >= target : value > 0;
  return { value, isDone };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}