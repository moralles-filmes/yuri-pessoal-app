"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export const SIDEBAR_COOKIE = "yuri:sidebar-collapsed";
export const SIDEBAR_HIDDEN_COOKIE = "yuri:sidebar-hidden";

/**
 * Casca do app (autenticado): sidebar (desktop) + header + área de conteúdo.
 *
 * São DOIS estados independentes, ambos semeados pelo servidor (cookie, sem flash) e
 * persistidos a cada toggle:
 *
 * - `collapsed` — a sidebar vira uma faixa só de ícones. Botão no rodapé dela.
 * - `hidden`    — a sidebar some por completo e o conteúdo ocupa a largura toda. O botão
 *                 fica no Header justamente porque, escondida, a sidebar não tem onde
 *                 abrigar o controle de voltar.
 */
export function AppShell({
  email,
  displayName,
  unreadCount = 0,
  defaultCollapsed = false,
  defaultHidden = false,
  children,
}: {
  email?: string | null;
  displayName?: string | null;
  unreadCount?: number;
  defaultCollapsed?: boolean;
  defaultHidden?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [hidden, setHidden] = React.useState(defaultHidden);

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  const toggleHidden = React.useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_HIDDEN_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-svh bg-background">
      <Sidebar collapsed={collapsed} onToggleCollapse={toggle} hidden={hidden} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          email={email}
          displayName={displayName}
          unreadCount={unreadCount}
          sidebarHidden={hidden}
          onToggleSidebar={toggleHidden}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
