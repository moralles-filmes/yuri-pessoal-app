"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export const SIDEBAR_COOKIE = "yuri:sidebar-collapsed";

/**
 * Casca do app (autenticado): sidebar (desktop) + header + área de conteúdo.
 * O estado de recolhimento é semeado pelo servidor (cookie) — sem flash — e
 * persistido no cookie a cada toggle.
 */
export function AppShell({
  email,
  displayName,
  unreadCount = 0,
  defaultCollapsed = false,
  children,
}: {
  email?: string | null;
  displayName?: string | null;
  unreadCount?: number;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const toggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-svh bg-background">
      <Sidebar collapsed={collapsed} onToggleCollapse={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header email={email} displayName={displayName} unreadCount={unreadCount} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
