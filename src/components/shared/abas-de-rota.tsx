"use client";

/**
 * REDESIGN-07-A · D4 — abas por rota, escritas UMA vez (Financeiro e Rotinas e tarefas).
 *
 * É a forma que a 02-E deixou de fora (D23: fita horizontal, não coluna) e que faltava um
 * segundo consumidor para virar componente. Três coisas que as abas do Financeiro não tinham:
 * o landmark com NOME (a página tem dois "navigation"), foco visível próprio (inset, porque a
 * fita rola e recorta sombra) e a aba ativa com PESO além do sublinhado e da cor.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hrefAtivo } from "@/lib/nav/active";

export type AbaDeRota = { href: string; rotulo: string };

export function AbasDeRota({ rotulo, abas }: { rotulo: string; abas: readonly AbaDeRota[] }) {
  const pathname = usePathname();
  // A decisão única (02-C): `/financeiro` só vence quando nenhuma aba mais funda casou.
  const ativo = hrefAtivo(pathname, abas.map((aba) => aba.href));

  return (
    <nav aria-label={rotulo} className="-mb-px flex gap-1 overflow-x-auto border-b">
      {abas.map((aba) => {
        const ativa = aba.href === ativo;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              ativa
                ? "border-primary font-semibold text-foreground"
                : "border-transparent font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
