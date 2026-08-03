"use client";

import * as React from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { NavLinks } from "./nav-links";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * Navegação mobile: botão de menu (oculto no desktop) que abre um drawer.
 */
export function MobileNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Abrir menu de navegação"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4">
          <Logo />
        </div>
        {/* Mesma regra da Sidebar: `min-h-0 flex-1` dentro do flex-col do
            SheetContent, senão a lista estoura o drawer sem rolar. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
