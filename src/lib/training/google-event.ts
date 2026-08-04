/**
 * Fase 17-F — Treino planejado → evento do Google Agenda · mapeamento PURO.
 *
 * Sem I/O e sem `Date.now()`. O I/O e a decisão de criar/atualizar/excluir ficam em
 * `calendar-sync.ts`, exatamente como no TO-DO (Fase 15).
 *
 * DECISÕES QUE VALEM COMO CONTRATO:
 *  • **O espelho é do PLANEJAMENTO, não da execução.** A agenda mostra o que você pretende
 *    fazer; o que aconteceu vive em `training_sessions` e não é publicado em lugar nenhum.
 *  • **Dia de descanso NÃO vira evento.** Espelhar "descanso" encheria a agenda com blocos
 *    que não pedem nada de ninguém — e a fase existe justamente para não duplicar ruído.
 *  • **Cancelado não ocupa a agenda** (`null` = "não deve existir evento"; o chamador remove
 *    o que já existir). "Não realizado" PERMANECE: o compromisso existiu naquele dia, e apagar
 *    o passado reescreveria o calendário.
 *  • **Sem horário → evento de dia inteiro.** Com horário e sem duração, usa
 *    `DEFAULT_WORKOUT_MINUTES`.
 *  • O horário vai como hora local + `timeZone` (nunca convertido para UTC à mão): o horário
 *    mostrado no Google é o mesmo digitado aqui, que é hora de **Brasília**.
 *  • **Nada de dado sensível na descrição** — nome do treino, do programa e a observação que o
 *    próprio usuário escreveu. Sem carga, sem medida corporal, sem link com token.
 *
 * A conversão de hora de parede reusa `timeToMinutes` / `addMinutesToDateTime` do TO-DO: é a
 * MESMA conta, já testada, e duas implementações dela acabariam divergindo num fim de dia.
 */
import { addMinutesToDateTime, timeToMinutes } from "@/lib/todo/google-event";
import { addDaysIso } from "@/lib/training/schedule";
import type { GoogleEventResource } from "@/lib/calendar/mapping";

/** Duração assumida quando o dia planejado tem hora mas não tem duração. */
export const DEFAULT_WORKOUT_MINUTES = 60;

/** Fuso do sistema inteiro (o app roda em Brasília, ver `src/instrumentation.ts`). */
export const TRAINING_TIMEZONE = "America/Sao_Paulo";

export interface TrainingGoogleEventInput {
  /** 'treino' | 'descanso' (17-B). */
  entryKind: string;
  /** 'yyyy-MM-dd' — data PURA. */
  scheduledDate: string;
  /** 'HH:mm' ou 'HH:mm:ss'; null = dia inteiro. */
  plannedTime: string | null;
  plannedDurationMinutes: number | null;
  /** Status GRAVADO do planejamento (nunca o derivado). */
  status: string;
  /** Nome do treino-modelo, quando ainda existe. */
  workoutName: string | null;
  /** Rótulo livre da linha (treino removido, descanso ativo…). */
  title: string | null;
  programName: string | null;
  notes: string | null;
  timezone?: string;
}

/** Status que não devem ocupar espaço no calendário. */
const HIDDEN_STATUSES = new Set(["cancelado"]);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** O que aparece como título do evento. Nunca vazio. */
export function trainingEventTitle(input: TrainingGoogleEventInput): string {
  const name = input.workoutName?.trim() || input.title?.trim();
  return name ? `Treino — ${name}` : "Treino";
}

/** Descrição opcional: programa e observação do usuário, nada mais. */
export function trainingEventDescription(input: TrainingGoogleEventInput): string | undefined {
  const parts = [
    input.programName?.trim() ? `Programa: ${input.programName.trim()}` : null,
    input.notes?.trim() || null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/**
 * Dia planejado → recurso do Google. `null` significa "este dia não deve ter evento"
 * (descanso ou cancelado) — o chamador então remove o evento que existir.
 */
export function scheduledWorkoutToGoogleEvent(
  input: TrainingGoogleEventInput,
): GoogleEventResource | null {
  if (input.entryKind !== "treino") return null;
  if (HIDDEN_STATUSES.has(input.status)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) return null;

  const timezone = input.timezone || TRAINING_TIMEZONE;
  const resource: GoogleEventResource = {
    summary: trainingEventTitle(input),
    description: trainingEventDescription(input),
  };

  const minutes = input.plannedTime ? timeToMinutes(input.plannedTime) : null;

  if (minutes === null) {
    // Dia inteiro: `end.date` é EXCLUSIVO no Google (dia seguinte ao último).
    resource.start = { date: input.scheduledDate };
    resource.end = { date: addDaysIso(input.scheduledDate, 1) };
    return resource;
  }

  const startTime = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  const duration =
    input.plannedDurationMinutes && input.plannedDurationMinutes > 0
      ? input.plannedDurationMinutes
      : DEFAULT_WORKOUT_MINUTES;
  const end = addMinutesToDateTime(input.scheduledDate, startTime, duration);
  if (!end) return null;

  resource.start = { dateTime: `${input.scheduledDate}T${startTime}:00`, timeZone: timezone };
  resource.end = { dateTime: `${end.date}T${end.time}:00`, timeZone: timezone };
  return resource;
}
