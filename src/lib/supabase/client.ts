import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/config/env";
import type { Database } from "@/types/supabase";

/**
 * Client Supabase para uso no browser (Client Components).
 * Use dentro de componentes com "use client".
 */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
