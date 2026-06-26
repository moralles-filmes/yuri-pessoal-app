/**
 * Fase 14 — Preferências do usuário (store `settings`, estendida da Fase 12).
 *
 * Módulo PURO (sem React): centraliza enums/labels de tema, moeda, formato de data e
 * preferências de notificação. Alimenta os tipos TS, os schemas Zod (validação no
 * servidor) e a UI de /configuracoes. A moeda é fixa em BRL (sistema pt-BR).
 */
import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  type NotificationType,
} from "@/lib/notifications/constants";

/* ───────────────────────────── Tema ───────────────────────────── */

export const THEME_OPTIONS = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEME_OPTIONS)[number];

export function asTheme(value: unknown): ThemePreference {
  return THEME_OPTIONS.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : "system";
}

/* ───────────────────────────── Moeda ───────────────────────────── */

/** Moeda do sistema — fixa em Real (BRL), pt-BR. */
export const CURRENCY = "BRL" as const;
export type CurrencyPreference = typeof CURRENCY;

/* ───────────────────────────── Formato de data ───────────────────────────── */

/** Formatos de data oferecidos (todos brasileiros/ISO legíveis). */
export const DATE_FORMATS = ["dd/MM/yyyy", "dd/MM/yy", "yyyy-MM-dd"] as const;
export type DateFormatPreference = (typeof DATE_FORMATS)[number];

export const DATE_FORMAT_LABELS: Record<DateFormatPreference, string> = {
  "dd/MM/yyyy": "Dia/Mês/Ano (31/12/2026)",
  "dd/MM/yy": "Dia/Mês/Ano curto (31/12/26)",
  "yyyy-MM-dd": "ISO (2026-12-31)",
};

export const DEFAULT_DATE_FORMAT: DateFormatPreference = "dd/MM/yyyy";

export function asDateFormat(value: unknown): DateFormatPreference {
  return DATE_FORMATS.includes(value as DateFormatPreference)
    ? (value as DateFormatPreference)
    : DEFAULT_DATE_FORMAT;
}

/* ───────────────────────────── Preferências de notificação ───────────────────────────── */

/** Um booleano por tipo de notificação (ausente = ligado). */
export type NotificationPrefs = Partial<Record<NotificationType, boolean>>;

/** True se o tipo está habilitado (default: tudo ligado). */
export function notificationEnabled(
  prefs: NotificationPrefs | null | undefined,
  type: NotificationType,
): boolean {
  return prefs?.[type] !== false;
}

/** Normaliza um jsonb cru em NotificationPrefs (só chaves conhecidas + booleanos). */
export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: NotificationPrefs = {};
  for (const type of NOTIFICATION_TYPES) {
    if (typeof obj[type] === "boolean") out[type] = obj[type] as boolean;
  }
  return out;
}

/** Agrupamento dos tipos para a UI de /configuracoes (por área). */
export const NOTIFICATION_PREF_GROUPS: {
  title: string;
  types: NotificationType[];
}[] = [
  {
    title: "Financeiro",
    types: [
      "invoice_due",
      "invoice_overdue",
      "bill_due",
      "bill_overdue",
      "receivable_pending",
      "card_limit",
      "high_spending",
    ],
  },
  {
    title: "Organização",
    types: ["task_overdue", "task_today", "event_upcoming"],
  },
  {
    title: "Hábitos & Estudos",
    types: ["habit_pending", "water_goal", "study_overdue"],
  },
];

export { NOTIFICATION_TYPE_LABELS };
