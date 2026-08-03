"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { NavLinks } from "./nav-links";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * Sidebar do desktop — recolhível (ícones) e expansível. Oculta no mobile
 * (a navegação mobile é o drawer em `MobileNav`).
 */
export function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-in-out lg:flex",
        collapsed ? "w-[4.75rem]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "px-4",
        )}
      >
        <Logo collapsed={collapsed} />
      </div>

      {/* `min-h-0` é obrigatório: sem ele o item flex não encolhe abaixo do
          conteúdo (min-height:auto), a ScrollArea cresce até a altura da lista
          e o scroll nunca ativa — o menu fica "travado". */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-3 py-4">
          <NavLinks collapsed={collapsed} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            collapsed ? "w-full" : "w-full justify-start gap-3",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px]" />
          ) : (
            <>
              <PanelLeftClose className="size-[18px]" />
              <span className="text-sm">Recolher</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
