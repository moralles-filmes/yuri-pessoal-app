import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * 03-G (L4, K1.3) — o que um card do dashboard mostra quando a leitura dele falhou.
 *
 * Diz QUAL leitura falhou e não mostra número nenhum: um valor ausente com motivo é melhor
 * que um número errado com cara de fato. Server Component, sem estado.
 */
export function CardSemLeitura({ oQue, href }: { oQue: string; href: string }) {
  return (
    <div className="space-y-2 py-4 text-center text-sm">
      <div
        role="alert"
        className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3 text-left ring-1 ring-destructive/20"
      >
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
        <p className="min-w-0 text-muted-foreground">
          Não foi possível ler {oQue}. O card fica sem valores para não mostrar um número errado.
        </p>
      </div>
      <Link href={href} className="text-primary underline-offset-4 hover:underline">
        Tentar de novo
      </Link>
    </div>
  );
}
