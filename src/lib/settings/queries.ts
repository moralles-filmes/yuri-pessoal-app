/**
 * Fase 14 — Leitura server-only das preferências do usuário (store `settings`).
 * A RLS garante que só vem a linha do próprio usuário. Os jsonb crus
 * (notification_prefs, dashboard_layout) são reconciliados pelos normalizadores puros
 * (read-your-writes sem flash). Resiliente: sem linha → defaults.
 */
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeLayout,
  type DashboardLayout,
} from "@/lib/dashboard/cards";
import {
  asDateFormat,
  asTheme,
  CURRENCY,
  DEFAULT_DATE_FORMAT,
  normalizeNotificationPrefs,
  type CurrencyPreference,
  type DateFormatPreference,
  type NotificationPrefs,
  type ThemePreference,
} from "@/lib/settings/constants";

export type UserSettings = {
  displayName: string | null;
  avatarUrl: string | null;
  theme: ThemePreference;
  currency: CurrencyPreference;
  dateFormat: DateFormatPreference;
  notificationPrefs: NotificationPrefs;
  dashboardLayout: DashboardLayout;
};

const DEFAULT_SETTINGS: UserSettings = {
  displayName: null,
  avatarUrl: null,
  theme: "system",
  currency: CURRENCY,
  dateFormat: DEFAULT_DATE_FORMAT,
  notificationPrefs: {},
  dashboardLayout: DEFAULT_DASHBOARD_LAYOUT,
};

/** Preferências completas do usuário (perfil + regional + notificações + dashboard). */
export async function getUserSettings(): Promise<UserSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select(
      "display_name, avatar_url, theme, currency, date_format, notification_prefs, dashboard_layout",
    )
    .maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    displayName: data.display_name ?? null,
    avatarUrl: data.avatar_url ?? null,
    theme: asTheme(data.theme),
    currency: CURRENCY,
    dateFormat: asDateFormat(data.date_format),
    notificationPrefs: normalizeNotificationPrefs(data.notification_prefs),
    dashboardLayout: normalizeLayout(data.dashboard_layout),
  };
}

/** Apenas o nome de exibição (header/menu). Resiliente — nunca derruba o layout. */
export async function getDisplayName(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("settings")
      .select("display_name")
      .maybeSingle();
    return data?.display_name ?? null;
  } catch {
    return null;
  }
}
