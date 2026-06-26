import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGoogleConfigured, resolveRedirectUri } from "@/lib/google/config";
import { buildAuthUrl } from "@/lib/google/oauth";

/**
 * Início do fluxo OAuth do Google Agenda (Fase 08). Requer sessão (o proxy já
 * protege /api/*). Gera um `state` anti-CSRF guardado em cookie httpOnly e
 * redireciona para o consentimento do Google. Todo o segredo fica no servidor.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);

  if (!isGoogleConfigured) {
    return NextResponse.redirect(`${origin}/agenda?google=unconfigured`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/agenda`);
  }

  const state = crypto.randomUUID();
  const redirectUri = resolveRedirectUri(origin);
  const authUrl = buildAuthUrl({ redirectUri, state });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
