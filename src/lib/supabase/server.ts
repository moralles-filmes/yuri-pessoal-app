import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/config/env";
import type { Database } from "@/types/supabase";

/**
 * Client Supabase para uso no servidor (Server Components, Server Actions,
 * Route Handlers). No Next.js 16, `cookies()` é assíncrono — sempre `await`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // `setAll` chamado de um Server Component — pode ser ignorado se houver
          // proxy atualizando a sessão. (Padrão recomendado @supabase/ssr.)
        }
      },
    },
  });
}

/**
 * Retorna o usuário autenticado (ou null). Seguro mesmo sem Supabase configurado.
 */
export async function getCurrentUser() {
  const { isSupabaseConfigured } = await import("@/config/env");
  if (!isSupabaseConfigured) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}
