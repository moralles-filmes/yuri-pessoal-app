"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navSections } from "@/config/nav";
import { cn } from "@/lib/utils";
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

  return (
    <nav className="flex flex-col gap-5">
      {navSections.map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          {!collapsed && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {section.title}
            </p>
          )}
          {section.items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <Icon className="size-[18px] shrink-0" />
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
