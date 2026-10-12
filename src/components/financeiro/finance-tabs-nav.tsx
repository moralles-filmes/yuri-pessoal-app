"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hrefAtivo } from "@/lib/nav/active";

// `exact: true` na "Visão geral" era a mesma exceção que os navs de módulo
// escreviam à mão, só que escrita nos DADOS. Com o vencedor decidido sobre a
// lista inteira, `/financeiro` só ganha quando nenhuma aba mais funda casou —
// e um campo a menos é um campo que ninguém esquece de pôr numa aba nova.
const TABS = [
  { href: "/financeiro", label: "Visão geral" },
  { href: "/financeiro/lancamentos", label: "Lançamentos" },
  { href: "/financeiro/contas", label: "Contas" },
  { href: "/financeiro/categorias", label: "Categorias" },
  { href: "/financeiro/contas-fixas", label: "Contas fixas" },
  { href: "/financeiro/recorrencias", label: "Recorrências" },
];

const HREFS = TABS.map((tab) => tab.href);

export function FinanceTabsNav() {
  const pathname = usePathname();
  const ativo = hrefAtivo(pathname, HREFS);

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => {
        const active = tab.href === ativo;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
