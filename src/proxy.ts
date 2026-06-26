import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

/**
 * Next.js 16: `middleware.ts` foi renomeado para `proxy.ts` (runtime nodejs).
 * Aqui fazemos o refresh da sessão Supabase e a proteção das rotas.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Roda em todas as rotas, exceto:
     * - _next/static, _next/image
     * - favicon e arquivos estáticos de imagem
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
