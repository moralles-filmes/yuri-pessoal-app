/**
 * Acesso centralizado às variáveis de ambiente públicas.
 * O app funciona mesmo sem as chaves do Supabase (Fase 01): a autenticação
 * "liga" automaticamente quando NEXT_PUBLIC_SUPABASE_URL/ANON_KEY forem definidas
 * em `.env.local`. Veja `.env.local.example`.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

/** True quando as credenciais públicas do Supabase estão presentes. */
export const isSupabaseConfigured =
  env.supabaseUrl.length > 0 && env.supabaseAnonKey.length > 0;
