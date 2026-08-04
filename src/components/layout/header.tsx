import { PanelLeft, PanelLeftOpen } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { MobileNav } from "./mobile-nav";
import { Button } from "@/components/ui/button";
import { SearchCommand } from "@/components/search/search-command";
import { QuickAdd } from "@/components/quick-add/quick-add";
import { NotificationBell } from "@/components/notifications/notification-bell";

/**
 * Header superior (Fase 13): busca global (Ctrl/Cmd+K), lançamento rápido, sino de
 * notificações (badge de não lidas), tema e usuário. `unreadCount` é semeado pelo
 * servidor (layout) — atualiza via router.refresh após ações.
 *
 * O botão de esconder/mostrar a sidebar mora aqui (e não dentro dela) porque, escondida,
 * a sidebar não teria onde abrigar o controle de voltar. Só no desktop: abaixo de `lg` a
 * navegação já é o drawer do `MobileNav`.
 */
export function Header({
  email,
  displayName,
  unreadCount = 0,
  sidebarHidden = false,
  onToggleSidebar,
}: {
  email?: string | null;
  displayName?: string | null;
  unreadCount?: number;
  sidebarHidden?: boolean;
  onToggleSidebar?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/65 sm:px-5">
      <MobileNav />

      {onToggleSidebar && (
        <Button
          variant="ghost"
          size="icon"
          className="hidden lg:inline-flex"
          onClick={onToggleSidebar}
          aria-label={sidebarHidden ? "Mostrar o menu lateral" : "Esconder o menu lateral"}
          title={sidebarHidden ? "Mostrar o menu lateral" : "Esconder o menu lateral"}
        >
          {sidebarHidden ? (
            <PanelLeftOpen className="size-5" />
          ) : (
            <PanelLeft className="size-5" />
          )}
        </Button>
      )}

      {/* Busca global (command palette + triggers) */}
      <SearchCommand />

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {/* Lançamento rápido */}
        <QuickAdd />

        {/* Notificações */}
        <NotificationBell unreadCount={unreadCount} />

        <ThemeToggle />
        <UserMenu email={email} displayName={displayName} />
      </div>
    </header>
  );
}
