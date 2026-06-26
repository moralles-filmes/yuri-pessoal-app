import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGoogleConfigured, resolveRedirectUri } from "@/lib/google/config";
import { exchangeCodeForTokens, fetchGoogleEmail } from "@/lib/google/oauth";
import { storeGoogleTokens } from "@/lib/google/tokens";

/**
 * Callback OAuth do Google Agenda (Fase 08). Valida o `state` (anti-CSRF),
 * troca o `code` por tokens e os persiste no servidor (RLS). Nunca expõe nem
 * loga tokens. Redireciona para /agenda com o resultado.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const supabaseForCookie = await createClient();
  const savedState = request.cookies.get("g_oauth_state")?.value;

  const redirectWith = (status: string) => {
    const res = NextResponse.redirect(`${origin}/agenda?google=${status}`);
    res.cookies.delete("g_oauth_state");
    return res;
  };

  if (oauthError) return redirectWith("denied");
  if (!isGoogleConfigured) return redirectWith("unconfigured");
  if (!code || !state || !savedState || state !== savedState) {
    return redirectWith("error");
  }

  const {
    data: { user },
  } = await supabaseForCookie.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/agenda`);
  }

  try {
    const redirectUri = resolveRedirectUri(origin);
    const tokens = await exchangeCodeForTokens({ code, redirectUri });
    const email = await fetchGoogleEmail(tokens.accessToken);
    const ok = await storeGoogleTokens(
      { supabase: supabaseForCookie, userId: user.id },
      { tokens, email },
    );
    return redirectWith(ok ? "connected" : "error");
  } catch {
    return redirectWith("error");
  }
}
