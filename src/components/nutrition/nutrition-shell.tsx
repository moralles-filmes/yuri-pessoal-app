"use client";

/**
 * Fase 16-A — Dieta e Alimentação · Casca do módulo.
 *
 * Só existe para segurar o estado da gaveta (que é client) e manter as páginas como Server
 * Components. O botão "Seções" aparece apenas abaixo de `lg`, onde a coluna some.
 */
import * as React from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NutritionNav, NutritionNavDrawer } from "./nutrition-nav";

export function NutritionShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div className="flex gap-6">
      <NutritionNav />
      <NutritionNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <div className="min-w-0 flex-1 space-y-4">
        <Button
          variant="outline"
          size="sm"
          className="lg:hidden"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="size-4" />
          Seções
        </Button>
        {children}
      </div>
    </div>
  );
}
