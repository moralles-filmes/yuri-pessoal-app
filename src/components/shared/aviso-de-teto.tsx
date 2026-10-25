/**
 * REDESIGN-03-G (D-G16) — o aviso da lista cortada.
 *
 * Server Component sem estado e sem hooks: é só texto, não paga JS no cliente. O texto e a
 * decisão de quando aparecer moram em `@/lib/finance/aviso-de-teto` (puro e testado).
 */
import type { LeituraComTeto } from "@/lib/supabase/leitura";
import { avisoDeTeto } from "@/lib/finance/aviso-de-teto";

export function AvisoDeTeto({
  leitura,
  oQue,
}: {
  leitura: Pick<LeituraComTeto<unknown>, "linhas" | "situacao" | "total">;
  oQue: string;
}) {
  const texto = avisoDeTeto(leitura, oQue);
  if (!texto) return null;
  return (
    <p
      role="status"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
    >
      {texto}
    </p>
  );
}
