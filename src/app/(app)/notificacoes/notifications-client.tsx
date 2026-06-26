"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BellOff,
  Check,
  CheckCheck,
  ExternalLink,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { cn } from "@/lib/utils";
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
  reopenNotification,
  resolveNotification,
} from "@/lib/actions/notifications";
import {
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_PRIORITY_BADGE,
  NOTIFICATION_PRIORITY_LABELS,
  NOTIFICATION_STATUS_FILTERS,
  NOTIFICATION_STATUS_FILTER_LABELS,
  NOTIFICATION_TYPES,
  notificationTypeLabel,
  type NotificationStatusFilter,
} from "@/lib/notifications/constants";
import {
  formatNotificationTime,
  notificationIcon,
} from "@/components/notifications/notification-meta";
import type { NotificationRow } from "@/types/database";

export function NotificationsClient({
  notifications,
  status,
  type,
  priority,
}: {
  notifications: NotificationRow[];
  status: NotificationStatusFilter;
  type: string;
  priority: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const unread = notifications.filter((n) => !n.is_read && !n.is_resolved).length;

  function setFilter(key: "status" | "tipo" | "prioridade", value: string) {
    const params = new URLSearchParams();
    const next = {
      status: key === "status" ? value : status,
      tipo: key === "tipo" ? value : type,
      prioridade: key === "prioridade" ? value : priority,
    };
    if (next.status && next.status !== "todas") params.set("status", next.status);
    if (next.tipo && next.tipo !== "todas") params.set("tipo", next.tipo);
    if (next.prioridade && next.prioridade !== "todas")
      params.set("prioridade", next.prioridade);
    const qs = params.toString();
    router.push(qs ? `/notificacoes?${qs}` : "/notificacoes");
  }

  function runAction(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    successMsg?: string,
  ) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (successMsg) toast.success(successMsg);
        router.refresh();
      } else {
        toast.error(res.error ?? "Não foi possível concluir a ação.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description="Alertas de faturas, contas, tarefas, hábitos, estudos e mais."
      >
        <Button
          variant="outline"
          onClick={() =>
            runAction(
              () => markAllNotificationsRead(),
              "Todas marcadas como lidas.",
            )
          }
          disabled={pending || unread === 0}
          className="gap-2"
        >
          <CheckCheck className="size-4" />
          Marcar todas
        </Button>
      </PageHeader>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setFilter("status", v)}>
          <SelectTrigger className="w-[10rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NOTIFICATION_STATUS_FILTERS.map((s) => (
              <SelectItem key={s} value={s}>
                {NOTIFICATION_STATUS_FILTER_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={(v) => setFilter("tipo", v)}>
          <SelectTrigger className="w-[12rem]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todos os tipos</SelectItem>
            {NOTIFICATION_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {notificationTypeLabel(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={(v) => setFilter("prioridade", v)}>
          <SelectTrigger className="w-[9rem]">
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda prioridade</SelectItem>
            {NOTIFICATION_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {NOTIFICATION_PRIORITY_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="Nenhuma notificação"
          description="Quando houver alertas (faturas, contas, tarefas, hábitos…), eles aparecem aqui. As checagens automáticas rodam periodicamente."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const Icon = notificationIcon(n.type);
            return (
              <li
                key={n.id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-start",
                  !n.is_read && !n.is_resolved && "border-primary/30 bg-primary/[0.03]",
                  n.is_resolved && "opacity-70",
                )}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-5" />
                </span>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "text-sm",
                        !n.is_read && !n.is_resolved ? "font-semibold" : "font-medium",
                      )}
                    >
                      {n.title}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[0.65rem] font-medium",
                        NOTIFICATION_PRIORITY_BADGE[n.priority],
                      )}
                    >
                      {NOTIFICATION_PRIORITY_LABELS[n.priority]}
                    </span>
                    {n.is_resolved && (
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[0.65rem] font-medium text-emerald-700 dark:text-emerald-300">
                        Resolvida
                      </span>
                    )}
                  </div>
                  {n.description && (
                    <p className="text-sm text-muted-foreground">{n.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {notificationTypeLabel(n.type)} · {formatNotificationTime(n.notify_at)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {n.link && (
                    <Button asChild variant="ghost" size="sm" className="gap-1">
                      <Link
                        href={n.link}
                        onClick={() => {
                          if (!n.is_read) void markNotificationRead(n.id);
                        }}
                      >
                        <ExternalLink className="size-4" /> Abrir
                      </Link>
                    </Button>
                  )}
                  {!n.is_read && !n.is_resolved && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Marcar como lida"
                      title="Marcar como lida"
                      disabled={pending}
                      onClick={() => runAction(() => markNotificationRead(n.id))}
                    >
                      <Check className="size-4" />
                    </Button>
                  )}
                  {n.is_resolved ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Reabrir"
                      title="Reabrir"
                      disabled={pending}
                      onClick={() =>
                        runAction(() => reopenNotification(n.id), "Notificação reaberta.")
                      }
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Resolver"
                      title="Resolver"
                      disabled={pending}
                      onClick={() =>
                        runAction(() => resolveNotification(n.id), "Notificação resolvida.")
                      }
                    >
                      <CheckCheck className="size-4" />
                    </Button>
                  )}
                  <DeleteConfirmDialog
                    title="Excluir notificação"
                    description="Esta notificação será removida."
                    successMessage="Notificação excluída."
                    onConfirm={() => deleteNotification(n.id)}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Excluir"
                        title="Excluir"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
