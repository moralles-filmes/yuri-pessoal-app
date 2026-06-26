/**
 * Configuração do Google OAuth (Fase 08) — APENAS servidor.
 * `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` nunca usam o prefixo NEXT_PUBLIC_ e
 * portanto não vazam para o bundle do cliente. O app funciona sem estas chaves:
 * `isGoogleConfigured` é false e a agenda local segue funcionando (o sync "liga"
 * quando as credenciais existirem) — análogo ao tratamento de auth da Fase 01.
 */
export const googleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  /** Opcional: sobrescreve a redirect URI; senão é derivada da origem da request. */
  redirectUriOverride: process.env.GOOGLE_REDIRECT_URI ?? "",
};

/** True quando as credenciais OAuth do Google estão presentes no servidor. */
export const isGoogleConfigured =
  googleConfig.clientId.length > 0 && googleConfig.clientSecret.length > 0;

/** Caminho do callback OAuth (route handler). */
export const GOOGLE_CALLBACK_PATH = "/api/google/callback";

/** Resolve a redirect URI a partir da origem da request (ou do override). */
export function resolveRedirectUri(origin: string): string {
  if (googleConfig.redirectUriOverride) return googleConfig.redirectUriOverride;
  return `${origin}${GOOGLE_CALLBACK_PATH}`;
}
