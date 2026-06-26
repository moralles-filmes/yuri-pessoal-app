/**
 * Fluxo OAuth 2.0 do Google (Fase 08) — APENAS servidor. Usa `fetch` direto (sem
 * dependência extra). NUNCA loga tokens. As funções recebem a redirect URI já
 * resolvida e o `client_secret` só é lido aqui (server).
 */
import { googleConfig } from "@/lib/google/config";
import { GOOGLE_OAUTH_SCOPES } from "@/lib/calendar/constants";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Instante de expiração (ISO) calculado a partir de expires_in. */
  expiry: string;
  scope: string | null;
}

/** Monta a URL de consentimento do Google (com refresh_token garantido). */
export function buildAuthUrl(params: {
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", googleConfig.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  // `prompt=consent` força o refresh_token mesmo em reconexões.
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  return url.toString();
}

function expiryFromNow(expiresIn: number): string {
  return new Date(Date.now() + Math.max(0, expiresIn) * 1000).toISOString();
}

/** Troca o `code` recebido no callback por tokens. */
export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: googleConfig.clientId,
    client_secret: googleConfig.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Falha ao trocar o código OAuth (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiry: expiryFromNow(json.expires_in),
    scope: json.scope ?? null,
  };
}

/** Renova o access_token usando o refresh_token (não retorna novo refresh_token). */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiry: string;
}> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: googleConfig.clientId,
    client_secret: googleConfig.clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Falha ao renovar o token (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return { accessToken: json.access_token, expiry: expiryFromNow(json.expires_in) };
}

/** E-mail da conta Google conectada (para exibir o estado conectado). */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { email?: string };
    return json.email ?? null;
  } catch {
    return null;
  }
}

/** Revoga o acesso no Google (best-effort; ignora erro). */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // best-effort
  }
}
