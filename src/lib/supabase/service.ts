/**
 * Cliente Supabase com SERVICE ROLE — SERVER-ONLY. Usado apenas pelo Vercel Cron
 * (rota /api/cron/notifications), que não tem sessão de usuário. Como a service role
 * IGNORA a RLS, todo acesso DEVE filtrar/escrever `user_id` explicitamente.
 *
 * NUNCA importe este módulo em código que rode no client. A chave vem de
 * `SUPABASE_SERVICE_ROLE_KEY` (sem prefixo NEXT_PUBLIC — fica só no servidor).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

/** True quando a service role está configurada (URL + chave secreta). */
export const isServiceConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createServiceClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase service role não configurado (defina SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
