import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isSupabaseConfigured } from "@/config/env";

/**
 * Rotas públicas (não exigem sessão Supabase). `/api/cron` é "público" para o proxy
 * (não redireciona para /login), mas é protegido por `CRON_SECRET` dentro da própria
 * rota — sem o segredo, devolve 401.
 */
const PUBLIC_PATHS = [
  "/login",
  "/cadastro",
  "/auth",
  "/recuperar-senha",
  "/api/cron",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Atualiza a sessão do Supabase e protege as rotas autenticadas.
 * Chamada pelo `proxy.ts` (Next.js 16, runtime nodejs).
 *
 * Sem credenciais do Supabase (Fase 01 antes das chaves), apenas segue adiante —
 * o app continua navegável e a proteção "liga" quando as chaves forem definidas.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  if (!isSupabaseConfigured) {
    return supabaseResponse;
  }

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANTE: não rode código entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Não autenticado tentando acessar rota privada → /login
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Autenticado em rota de auth → /dashboard
  if (user && (pathname.startsWith("/login") || pathname.startsWith("/cadastro"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
