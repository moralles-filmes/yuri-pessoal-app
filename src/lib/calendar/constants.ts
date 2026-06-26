/**
 * Fonte única de verdade dos enums da Agenda (Fase 08).
 * Os arrays `as const` alimentam os tipos TS, os schemas Zod e os rótulos pt-BR da UI.
 * Os valores precisam casar com os CHECK constraints das migrations.
 */

/** Tipo de compromisso → deriva a cor (personalizável). */
export const EVENT_TYPES = [
  "pessoal",
  "trabalho",
  "estudos",
  "exercicios",
  "rotina",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  pessoal: "Pessoal",
  trabalho: "Trabalho",
  estudos: "Estudos",
  exercicios: "Exercícios",
  rotina: "Rotina",
};

/** Origem do evento na conciliação com o Google. */
export const EVENT_ORIGINS = ["local", "google"] as const;
export type EventOrigin = (typeof EVENT_ORIGINS)[number];

/** Frequências de recorrência (compartilha os valores do financeiro). */
export const EVENT_FREQUENCIES = [
  "diaria",
  "semanal",
  "mensal",
  "anual",
] as const;
export type EventFrequency = (typeof EVENT_FREQUENCIES)[number];

export const EVENT_FREQUENCY_LABELS: Record<EventFrequency, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
  anual: "Anual",
};

/** Visões do calendário. */
export const CALENDAR_VIEWS = ["dia", "semana", "mes"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const CALENDAR_VIEW_LABELS: Record<CalendarView, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
};

/** Opções de lembrete (minutos antes do início). `null` = sem lembrete. */
export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Sem lembrete" },
  { value: 0, label: "No horário" },
  { value: 5, label: "5 minutos antes" },
  { value: 10, label: "10 minutos antes" },
  { value: 15, label: "15 minutos antes" },
  { value: 30, label: "30 minutos antes" },
  { value: 60, label: "1 hora antes" },
  { value: 120, label: "2 horas antes" },
  { value: 1440, label: "1 dia antes" },
];

/** Escopo OAuth necessário para ler/escrever no Google Agenda + identificar a conta. */
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];
