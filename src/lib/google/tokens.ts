/**
 * Gestão dos tokens OAuth do Google (Fase 08) — APENAS servidor, RLS-scoped.
 * Lê/grava `google_integrations` SEMPRE pelo client autenticado (auth.uid()), de
 * modo que a RLS garante isolamento. NUNCA retorna tokens para o client nem os loga.
 * `getValidAccessToken` renova o access_token automaticamente quando expirado.
 */
import type { AuthContext } from "@/lib/actions/helpers";
import type { GoogleConnectionStatus, GoogleIntegrationRow } from "@/types/database";
import { refreshAccessToken } from "@/lib/google/oauth";
import type { GoogleTokens } from "@/lib/google/oauth";

/** Margem de segurança antes de considerar o token expirado (60s). */
const EXPIRY_BUFFER_MS = 60_000;

export async function getGoogleIntegration(
  ctx: AuthContext,
): Promise<GoogleIntegrationRow | null> {
  const { data } = await ctx.supabase
    .from("google_integrations")
    .select("*")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return (data ?? null) as GoogleIntegrationRow | null;
}

/** Estado para a UI — SEM tokens. */
export async function getGoogleStatus(
  ctx: AuthContext,
): Promise<GoogleConnectionStatus> {
  const row = await getGoogleIntegration(ctx);
  return {
    connected: Boolean(row),
    email: row?.google_email ?? null,
    lastSyncedAt: row?.last_synced_at ?? null,
    todoSyncEnabled: row?.todo_sync_enabled ?? false,
  };
}

/** Salva (upsert) os tokens recém-obtidos no callback OAuth. */
export async function storeGoogleTokens(
  ctx: AuthContext,
  params: { tokens: GoogleTokens; email: string | null; calendarId?: string },
): Promise<boolean> {
  // Preserva o refresh_token anterior se o Google não devolver um novo.
  const existing = await getGoogleIntegration(ctx);
  const refreshToken =
    params.tokens.refreshToken ?? existing?.refresh_token ?? null;

  const { error } = await ctx.supabase.from("google_integrations").upsert(
    {
      user_id: ctx.userId,
      access_token: params.tokens.accessToken,
      refresh_token: refreshToken,
      token_expiry: params.tokens.expiry,
      scope: params.tokens.scope,
      google_email: params.email,
      calendar_id: params.calendarId ?? existing?.calendar_id ?? "primary",
    },
    { onConflict: "user_id" },
  );
  return !error;
}

/**
 * Access token válido (renovando se necessário) + o calendarId alvo, ou null se
 * não há integração / não foi possível renovar (caller deve pedir reconexão).
 */
export async function getValidAccessToken(
  ctx: AuthContext,
): Promise<{ accessToken: string; calendarId: string } | null> {
  const row = await getGoogleIntegration(ctx);
  if (!row) return null;

  const calendarId = row.calendar_id || "primary";
  const expiryMs = row.token_expiry ? new Date(row.token_expiry).getTime() : 0;
  const stillValid = expiryMs - EXPIRY_BUFFER_MS > Date.now();
  if (stillValid && row.access_token) {
    return { accessToken: row.access_token, calendarId };
  }

  if (!row.refresh_token) return null;
  try {
    const refreshed = await refreshAccessToken(row.refresh_token);
    await ctx.supabase
      .from("google_integrations")
      .update({
        access_token: refreshed.accessToken,
        token_expiry: refreshed.expiry,
      })
      .eq("user_id", ctx.userId);
    return { accessToken: refreshed.accessToken, calendarId };
  } catch {
    return null;
  }
}

/** Marca o último sync (apenas timestamp). */
export async function updateLastSynced(ctx: AuthContext): Promise<void> {
  await ctx.supabase
    .from("google_integrations")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", ctx.userId);
}

/** Remove a integração (desconectar). */
export async function deleteGoogleIntegration(ctx: AuthContext): Promise<boolean> {
  const { error } = await ctx.supabase
    .from("google_integrations")
    .delete()
    .eq("user_id", ctx.userId);
  return !error;
}
