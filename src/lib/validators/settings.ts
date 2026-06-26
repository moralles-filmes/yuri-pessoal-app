/**
 * Fase 12/14 — Validação (Zod) das preferências do usuário, aplicada NO SERVIDOR antes
 * de persistir em `settings`. Garante que nenhum lixo entra: ids de card/período/visão
 * (dashboard), tema/moeda/formato de data (regional), perfil e preferências de notificação.
 */
import { z } from "zod";
import { DASH_CARD_IDS } from "@/lib/dashboard/cards";
import { DASH_PERIODS, DASH_VIEWS } from "@/lib/dashboard/period";
import {
  CURRENCY,
  DATE_FORMATS,
  THEME_OPTIONS,
} from "@/lib/settings/constants";

const cardId = z.enum(DASH_CARD_IDS);

/* ───────────────────────────── Dashboard (Fase 12) ───────────────────────────── */

export const dashboardLayoutSchema = z.object({
  order: z.array(cardId).max(50),
  hidden: z.array(cardId).max(50),
  period: z.enum(DASH_PERIODS),
  view: z.enum(DASH_VIEWS),
});

export type DashboardLayoutInput = z.infer<typeof dashboardLayoutSchema>;

/* ───────────────────────────── Perfil (Fase 14) ───────────────────────────── */

/** Texto opcional: trim, limite de tamanho, vazio → null. */
const optionalText = (max: number) =>
  z
    .preprocess(
      (v) => (typeof v === "string" ? v.trim() : v),
      z.string().max(max, `Máximo de ${max} caracteres.`).nullish(),
    )
    .transform((v) => (v && v.length ? v : null));

/** URL opcional (https://…): trim, valida formato, vazio → null. */
const optionalUrl = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.union([
      z.string().url("Informe uma URL válida (https://…).").max(2000),
      z.literal(""),
      z.null(),
      z.undefined(),
    ]),
  )
  .transform((v) => (v && v.length ? v : null));

export const profileSchema = z.object({
  display_name: optionalText(120),
  avatar_url: optionalUrl,
});

export type ProfileInput = z.infer<typeof profileSchema>;

/* ───────────────────────────── Regional (Fase 14) ───────────────────────────── */

export const preferencesSchema = z.object({
  currency: z.literal(CURRENCY),
  date_format: z.enum(DATE_FORMATS),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;

/** Só o tema (persistência best-effort do AppearanceCard). */
export const themeSchema = z.object({ theme: z.enum(THEME_OPTIONS) });

/* ───────────────────────────── Notificações (Fase 14) ───────────────────────────── */

/**
 * Mapa { [tipo]: boolean }. Aceita qualquer chave string (a action normaliza para os
 * tipos conhecidos via normalizeNotificationPrefs), mas exige valores booleanos.
 */
export const notificationPrefsSchema = z.record(z.string(), z.boolean());

export type NotificationPrefsInput = z.infer<typeof notificationPrefsSchema>;
