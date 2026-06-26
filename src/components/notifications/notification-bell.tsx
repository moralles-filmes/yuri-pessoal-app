"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  fetchRecentNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/actions/notifications";
import type { NotificationRow } from "@/types/database";
import { formatNotificationTime, notificationIcon } from "./notification-meta";

/**
 * Sino do header (Fase 13): badge de não lidas (semeado pelo servidor) + popover que
 * carrega as últimas notificações sob demanda ao abrir. Marca como lida ao clicar e
 * permite "marcar todas como lidas". Funciona bem no mobile (popover ancorado).
 */
export function NotificationBell({ unreadCount = 0 }: { unreadCount?: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<NotificationRow[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  // Carrega ao abrir (event handler — sem setState em useEffect, respeita React Compiler).
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setLoading(true);
      fetchRecentNotifications(8)
        .then((rows) => setItems(rows))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }
  }

  function handleItemClick(n: NotificationRow) {
    if (!n.is_read) {
      startTransition(async () => {
        await markNotificationRead(n.id);
        router.refresh();
      });
    }
    setOpen(false);
  }

  function handleMarkAll() {
    startTransition(async () => {
      const res = await markAllNotificationsRead();
      if (res.ok) {
        setItems((prev) => prev?.map((n) => ({ ...n, is_read: true })) ?? null);
        router.refresh();
        toast.success("Notificações marcadas como lidas.");
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.6rem] font-semibold leading-4 text-primary-foreground ring-2 ring-background"
              aria-label={`${unreadCount} não lidas`}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold">Notificações</span>
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={pending}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <Check className="size-3.5" /> Marcar todas
          </button>
        </div>

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
          {loading && items === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </div>
          ) : !items || items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Sem notificações por enquanto.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const Icon = notificationIcon(n.type);
                return (
                  <li key={n.id}>
                    <Link
                      href={n.link ?? "/notificacoes"}
                      onClick={() => handleItemClick(n)}
                      className={cn(
                        "flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted",
                        !n.is_read && "bg-primary/5",
                      )}
                    >
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-sm",
                            !n.is_read && "font-medium",
                          )}
                        >
                          {n.title}
                        </span>
                        {n.description && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {n.description}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[0.7rem] text-muted-foreground">
                          {formatNotificationTime(n.notify_at)}
                        </span>
                      </span>
                      {!n.is_read && (
                        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-1">
          <Link
            href="/notificacoes"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Ver todas as notificações
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
