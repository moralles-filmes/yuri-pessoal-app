/**
 * Fase 15 (iteração) — TO-DO → Google Agenda · mapeamento PURO.
 *
 * Converte uma tarefa em um recurso de evento do Google. Sem I/O, sem `Date.now()`:
 * o I/O e a decisão de criar/atualizar/excluir ficam em `calendar-sync.ts`.
 *
 * DECISÕES QUE VALEM COMO CONTRATO:
 *  • **Só tarefa com data programada** vira evento. Sem data, não há o que colocar
 *    no calendário (`null` = "não deve existir evento").
 *  • **Cancelada e arquivada não vão para o calendário** — e, se já houver evento,
 *    ele é removido pelo chamador. Concluída PERMANECE: aconteceu de fato.
 *  • **Recorrência NÃO vira RRULE.** No nosso modelo a série vive numa única linha
 *    que avança no tempo (ver doc da fase). Publicar um RRULE criaria no Google uma
 *    série que sairia do lugar assim que o usuário concluísse adiantado ou atrasado.
 *    Enviamos apenas a OCORRÊNCIA ATUAL e movemos o mesmo evento quando ela avança —
 *    é o que mantém os dois lados coerentes e sem duplicata.
 *  • **Sem horário → evento de dia inteiro.** Com horário e sem duração, usa
 *    `DEFAULT_DURATION_MINUTES`.
 *  • O horário é enviado como hora local + `timeZone` (nunca convertido para UTC
 *    à mão), então o horário mostrado no Google é o mesmo digitado aqui.
 */
import { addDaysIso } from "@/lib/todo/recurrence";
import type { GoogleEventResource } from "@/lib/calendar/mapping";

/** Duração assumida quando a tarefa tem hora mas não tem duração. */
export const DEFAULT_DURATION_MINUTES = 30;

export interface TodoGoogleEventInput {
  title: string;
  description: string | null;
  /** 'yyyy-MM-dd'. */
  scheduledDate: string | null;
  /** 'HH:mm' ou 'HH:mm:ss'. */
  scheduledTime: string | null;
  durationMinutes: number | null;
  status: string;
  /** IANA, ex.: 'America/Sao_Paulo'. */
  timezone: string;
}

/** Status que não devem ocupar espaço no calendário. */
const HIDDEN_STATUSES = new Set(["cancelada", "arquivada"]);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 'HH:mm' | 'HH:mm:ss' → minutos desde a meia-noite. null se inválido. */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Soma minutos a (data, hora), virando o dia quando necessário. */
export function addMinutesToDateTime(
  dateIso: string,
  time: string,
  minutes: number,
): { date: string; time: string } | null {
  const base = timeToMinutes(time);
  if (base === null) return null;
  const total = base + minutes;
  const dayShift = Math.floor(total / 1440);
  const rest = ((total % 1440) + 1440) % 1440;
  return {
    date: addDaysIso(dateIso, dayShift),
    time: `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}`,
  };
}

/**
 * Tarefa → recurso do Google. `null` significa "esta tarefa não deve ter evento"
 * (sem data, cancelada ou arquivada) — o chamador então exclui o evento existente.
 */
export function taskToGoogleEvent(task: TodoGoogleEventInput): GoogleEventResource | null {
  if (!task.scheduledDate) return null;
  if (HIDDEN_STATUSES.has(task.status)) return null;

  const resource: GoogleEventResource = {
    summary: task.title,
    description: task.description ?? undefined,
  };

  if (!task.scheduledTime) {
    // Dia inteiro: `end.date` é EXCLUSIVO no Google (dia seguinte ao último).
    resource.start = { date: task.scheduledDate };
    resource.end = { date: addDaysIso(task.scheduledDate, 1) };
    return resource;
  }

  const minutes = timeToMinutes(task.scheduledTime);
  if (minutes === null) {
    // Hora inválida no banco: cai para dia inteiro em vez de mandar lixo ao Google.
    resource.start = { date: task.scheduledDate };
    resource.end = { date: addDaysIso(task.scheduledDate, 1) };
    return resource;
  }

  const startTime = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  const duration =
    task.durationMinutes && task.durationMinutes > 0
      ? task.durationMinutes
      : DEFAULT_DURATION_MINUTES;
  const end = addMinutesToDateTime(task.scheduledDate, startTime, duration);
  if (!end) return null;

  // Hora local + timeZone: o Google resolve o fuso, sem conversão manual para UTC.
  resource.start = {
    dateTime: `${task.scheduledDate}T${startTime}:00`,
    timeZone: task.timezone,
  };
  resource.end = {
    dateTime: `${end.date}T${end.time}:00`,
    timeZone: task.timezone,
  };
  return resource;
}
