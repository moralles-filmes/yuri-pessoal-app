"use server";

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import {
  dashboardLayoutSchema,
  notificationPrefsSchema,
  preferencesSchema,
  profileSchema,
  themeSchema,
} from "@/lib/validators/settings";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeLayout,
  type DashboardLayout,
} from "@/lib/dashboard/cards";
import { normalizeNotificationPrefs } from "@/lib/settings/constants";
import type { ActionResult } from "@/types/finance";
import type { Json } from "@/types/supabase";

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/**
 * Upsert parcial da linha de preferências (uma por user_id). O PostgREST só atualiza as
 * colunas presentes no payload — outras preferências não são sobrescritas. `user_id` é
 * SEMPRE de auth.uid() (nunca do client).
 */
async function patchSettings(
  ctx: Ctx,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  const { error } = await ctx.supabase
    .from("settings")
    .upsert({ user_id: ctx.userId, ...patch }, { onConflict: "user_id" });
  if (error) return dbError("Não foi possível salvar as preferências.");
  revalidatePath("/configuracoes");
  return { ok: true, data: undefined };
}

/**
 * Upsert da linha de preferências do usuário (uma por user_id). O layout já vem
 * normalizado; `user_id` é SEMPRE de auth.uid() (nunca do client).
 */
async function persistLayout(
  ctx: Ctx,
  layout: DashboardLayout,
): Promise<ActionResult> {
  const { error } = await ctx.supabase.from("settings").upsert(
    {
      user_id: ctx.userId,
      dashboard_layout: layout as unknown as Json,
    },
    { onConflict: "user_id" },
  );
  if (error) return dbError("Não foi possível salvar as preferências.");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}

/** Salva a ordem/visibilidade dos cards + período/visão padrão do dashboard. */
export async function saveDashboardLayout(
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = dashboardLayoutSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  // normalizeLayout garante todos os cards presentes e oculto ⊆ ordem.
  return persistLayout(ctx, normalizeLayout(parsed.data));
}

/** Restaura o layout padrão (ordem natural, nada oculto, mês atual). */
export async function resetDashboardLayout(): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  return persistLayout(ctx, DEFAULT_DASHBOARD_LAYOUT);
}

/* ───────────────────────────── Fase 14 — Perfil / Regional / Notificações ───────────────────────────── */

/** Salva o perfil do usuário (nome de exibição + avatar). */
export async function saveProfile(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  return patchSettings(ctx, {
    display_name: parsed.data.display_name,
    avatar_url: parsed.data.avatar_url,
  });
}

/** Salva as preferências regionais (moeda BRL + formato de data). */
export async function savePreferences(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  return patchSettings(ctx, {
    currency: parsed.data.currency,
    date_format: parsed.data.date_format,
  });
}

/** Persiste apenas o tema (best-effort, chamado pelo AppearanceCard ao alternar). */
export async function saveThemePreference(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  return patchSettings(ctx, { theme: parsed.data.theme });
}

/** Salva as preferências de notificação ({ [tipo]: boolean }, só tipos conhecidos). */
export async function saveNotificationPrefs(
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = notificationPrefsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const clean = normalizeNotificationPrefs(parsed.data);
  return patchSettings(ctx, { notification_prefs: clean as unknown as Json });
}
