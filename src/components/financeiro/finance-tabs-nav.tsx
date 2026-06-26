"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/financeiro", label: "Visão geral", exact: true },
  { href: "/financeiro/lancamentos", label: "Lançamentos" },
  { href: "/financeiro/contas", label: "Contas" },
  { href: "/financeiro/categorias", label: "Categorias" },
  { href: "/financeiro/contas-fixas", label: "Contas fixas" },
  { href: "/financeiro/recorrencias", label: "Recorrências" },
];

export function FinanceTabsNav() {
  const pathname = usePathname();

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b">
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
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
