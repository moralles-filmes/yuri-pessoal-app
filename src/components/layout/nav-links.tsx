"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { allNavItems, navSections } from "@/config/nav";
import { hrefAtivo } from "@/lib/nav/active";
import { cn } from "@/lib/utils";
import { PRESSAO } from "@/components/ui/materiais";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Lista de navegação reutilizada pela Sidebar (desktop) e pelo drawer (mobile).
 * - `collapsed`: mostra somente ícones (com tooltip).
 * - `onNavigate`: callback ao clicar (ex.: fechar o drawer no mobile).
 */
export function NavLinks({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // Uma pergunta para a lista inteira, não uma por item: o vencedor é no máximo
  // um, então "dois itens acesos" não é um estado que esta tela consiga montar.
  const ativo = hrefAtivo(pathname, allNavItems);

  return (
    <nav className="flex flex-col gap-5">
      {navSections.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          {!collapsed && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </p>
          )}
          {section.items.map((item) => {
            const active = item.href === ativo;
            const Icon = item.icon;

            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  PRESSAO,
                  "group relative flex items-center gap-3 rounded-[14px] px-3 py-2 text-sm font-medium",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-pill-strong font-semibold text-nav-ativo-ink shadow-[inset_0_1px_0_var(--glass-hi),0_6px_16px_-8px_rgba(16,24,40,.3)] forced-colors:outline forced-colors:outline-2"
                    : "text-foreground hover:bg-tile",
                  // Recolhido não há texto que confirme o estado: o aro faz esse papel.
                  active && collapsed && "ring-1 ring-nav-ativo-ink",
                )}
              >
                <Icon
                  className={cn(
                    "size-[18px] shrink-0",
                    !active && "text-muted-foreground",
                  )}
                />
                {!collapsed && <span className="truncate">{item.title}</span>}
              </Link>
            );

            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.title}</TooltipContent>
              </Tooltip>
            ) : (
              link
            );
          })}
        </div>
      ))}
    </nav>
  );
}
