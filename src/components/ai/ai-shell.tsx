"use client";

/**
 * Fase 18-A — IA · Casca do módulo.
 *
 * Só existe para segurar o estado da gaveta (que é client) e manter as páginas como Server
 * Components. Mesmo desenho da casca de Treinos (17-A).
 */

import * as React from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiNav, AiNavDrawer } from "./ai-nav";

export function AiShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  return (
    <div className="flex gap-6">
      <AiNav />
      <AiNavDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      {/* `min-w-0` é o que impede uma mensagem longa de empurrar a página na horizontal. */}
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
