import Link from "next/link";

/**
 * 03-G (L4, K1.3) — o que um card do dashboard mostra quando a leitura dele falhou.
 *
 * Diz QUAL leitura falhou e não mostra número nenhum: um valor ausente com motivo é melhor
 * que um número errado com cara de fato. Server Component, sem estado.
 */
export function CardSemLeitura({ oQue, href }: { oQue: string; href: string }) {
  return (
    <div role="status" className="space-y-2 py-4 text-center text-sm">
      <p className="text-muted-foreground">
        Não foi possível ler {oQue}. O card fica sem valores para não mostrar um número errado.
      </p>
      <Link href={href} className="text-primary underline-offset-4 hover:underline">
        Tentar de novo
      </Link>
    </div>
  );
}
