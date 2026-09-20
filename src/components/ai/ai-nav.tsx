"use client";

/**
 * Fase 18-A — IA · Navegação interna do módulo.
 *
 * Mesmo padrão do TO-DO (15), da Dieta (16) e dos Treinos (17): coluna fixa no desktop,
 * gaveta no celular. São 4 seções na 18-A, então não há agrupamento — quando as subfases
 * seguintes acrescentarem itens, aí sim vale agrupar por finalidade.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  Gauge,
  History,
  Lightbulb,
  MessageSquare,
  MessagesSquare,
  ReceiptText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { AI_SECTIONS, type AiSection } from "@/lib/ai/constants";

const ICONS: Record<string, LucideIcon> = {
  "message-square": MessageSquare,
  "messages-square": MessagesSquare,
  history: History,
  receipt: ReceiptText,
  lightbulb: Lightbulb,
  brain: Brain,
  gauge: Gauge,
  settings: Settings,
};

function isActive(pathname: string, section: AiSection): boolean {
  // `/ia` casaria com tudo se usássemos `startsWith` — a raiz exige igualdade exata.
  if (section.href === "/ia") return pathname === "/ia";
  return pathname === section.href || pathname.startsWith(`${section.href}/`);
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {AI_SECTIONS.map((section) => {
        const Icon = ICONS[section.icon] ?? MessageSquare;
        const ativo = isActive(pathname, section);
        return (
          <Link
            key={section.slug}
            href={section.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              // `min-w-0` no lado texto: sem ele o rótulo empurra o ícone para fora do card.
              ativo
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="min-w-0 truncate">{section.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AiNav() {
  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      {/* `top-18` e não `top-0`: o Header é `sticky top-0` com `h-16`. */}
      <div className="sticky top-18">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Inteligência Artificial
        </p>
        <NavLinks />
      </div>
    </aside>
  );
}

export function AiNavDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>Inteligência Artificial</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <NavLinks onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
