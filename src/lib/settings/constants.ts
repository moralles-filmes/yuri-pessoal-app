/**
 * Fase 14 — Preferências do usuário (store `settings`, estendida da Fase 12).
 *
 * Módulo PURO (sem React): centraliza enums/labels de tema, moeda, formato de data e
 * preferências de notificação. Alimenta os tipos TS, os schemas Zod (validação no
 * servidor) e a UI de /configuracoes. A moeda é fixa em BRL (sistema pt-BR).
 */
import {
  isOptInNotification,
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

/** Um booleano por tipo de notificação (ausente = ligado, salvo os opt-in). */
export type NotificationPrefs = Partial<Record<NotificationType, boolean>>;

/**
 * True se o tipo está habilitado.
 *
 * Duas semânticas, de propósito:
 *  • padrão — ausente significa LIGADO: um alerta de fatura atrasada precisa existir sem que
 *    o usuário configure nada antes;
 *  • opt-in (`NOTIFICATION_OPT_IN_TYPES`, Fase 16-F) — ausente significa DESLIGADO. No módulo
 *    de Dieta, avisar sem ser pedido sobre o quanto falta para a meta do dia soaria como
 *    cobrança, e o custo de errar o tom em algo que trata de comida e corpo é alto.
 */
export function notificationEnabled(
  prefs: NotificationPrefs | null | undefined,
  type: NotificationType,
): boolean {
  const value = prefs?.[type];
  if (typeof value === "boolean") return value;
  return !isOptInNotification(type);
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
  {
    title: "TO-DO",
    types: ["todo_overdue", "todo_today", "todo_deadline", "todo_reminder"],
  },
  {
    title: "Dieta e Alimentação",
    types: [
      "nutrition_meal_upcoming",
      "nutrition_meal_missing",
      "nutrition_plan_week",
      "nutrition_shopping_pending",
      "nutrition_pantry_expiring",
      "nutrition_measurement_due",
      "nutrition_goal_close",
      "nutrition_food_review",
    ],
  },
];

/** Explicação curta de cada tipo, exibida ao lado do interruptor em /configuracoes. */
export const NOTIFICATION_TYPE_HINTS: Partial<Record<NotificationType, string>> = {
  nutrition_meal_upcoming: "Aviso pouco antes do horário previsto de uma refeição planejada.",
  nutrition_meal_missing:
    "O horário passou e a refeição continua sem registro. Informa e oferece o atalho — nada é marcado por você.",
  nutrition_plan_week: "Lembra que a próxima semana ainda não tem refeições planejadas.",
  nutrition_shopping_pending: "Uma lista de compras ativa ainda tem itens a pegar.",
  nutrition_pantry_expiring: "Um item da despensa está perto da validade ou já passou dela.",
  nutrition_measurement_due: "Faz um tempo desde a última medição de um tipo que você acompanha.",
  nutrition_goal_close:
    "Desligado por padrão. Quando ligado, avisa que o consumo do dia se aproximou de uma meta.",
  nutrition_food_review:
    "Um alimento seu está sem energia analisada, sem fonte registrada ou marcado em revisão.",
};

export { NOTIFICATION_TYPE_LABELS };
