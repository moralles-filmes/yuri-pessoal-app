"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BellOff,
  Check,
  CheckCheck,
  ExternalLink,
  RotateCcw,
  SearchX,
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
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { cn } from "@/lib/utils";
import {
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
import { notificacoesLink } from "@/components/notifications/notificacoes-links";
import type { NotificationRow } from "@/types/database";

/**
 * O que as actions desta tela devolvem (`ActionResult`), só com o que a tela lê.
 *
 * ⚠️ Sem `fieldErrors` DE PROPÓSITO: nenhuma das cinco actions de notificação chama `invalid()`
 * (elas recebem só um id), então `mensagemDaAction` devolveria sempre `error` — e custaria
 * ~0,4 KB gz a esta rota para nada. Action que passar a validar entrada entra na varredura de
 * formulários da D8, que deriva quem chama `invalid(`.
 */
type ResultadoDaAction = { ok: true } | { ok: false; error: string };

/**
 * D5 — a confirmação de exclusão é UMA para a tela e só baixa no primeiro clique na lixeira (o
 * `DeleteConfirmDialog` por linha entrava no primeiro carregamento). Objeto literal escrito aqui:
 * o compilador do Next o lê estaticamente.
 */
const ExcluirNotificacaoDialog = dynamic(
  () => import("./excluir-notificacao-dialog").then((m) => m.ExcluirNotificacaoDialog),
  { ssr: false, loading: () => null },
);

export function NotificationsClient({
  notifications,
  status,
  type,
  priority,
  descricaoDoVazio,
}: {
  notifications: NotificationRow[];
  status: NotificationStatusFilter;
  type: string;
  priority: string;
  /**
   * O texto do vazio, montado no servidor (com filtro, ele diz o que procurou: "Não lidas · IA ·
   * Orçamento"). A tela só recebe a frase e não paga o código nem o texto de montá-la.
   */
  descricaoDoVazio: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [paraExcluir, setParaExcluir] = React.useState<NotificationRow | null>(null);
  const exclusaoMontada = useLazyDialog(paraExcluir !== null);

  const unread = notifications.filter((n) => !n.is_read && !n.is_resolved).length;
  const filtroAtivo = status !== "todas" || type !== "todas" || priority !== "todas";

  function setFilter(key: "status" | "tipo" | "prioridade", value: string) {
    router.push(
      notificacoesLink({
        status: key === "status" ? value : status,
        tipo: key === "tipo" ? value : type,
        prioridade: key === "prioridade" ? value : priority,
      }),
    );
  }

  function runAction(fn: () => Promise<ResultadoDaAction>, successMsg?: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        if (successMsg) toast.success(successMsg);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description="Alertas de faturas, contas, tarefas, hábitos, estudos e mais."
      >
        {/*
          D5 — a action marca TODAS (não recebe filtro). Com filtro ativo a tela diz isso antes do
          clique, e o botão fica habilitado mesmo sem não lidas à vista: as escondidas contam.
        */}
        <div className="space-y-1">
          <Button
            variant="outline"
            onClick={() =>
              runAction(() => markAllNotificationsRead(), "Todas marcadas como lidas.")
            }
            disabled={pending || (!filtroAtivo && unread === 0)}
            aria-describedby={filtroAtivo ? "marcar-todas-alcance" : undefined}
            className="gap-2"
          >
            <CheckCheck className="size-4" />
            Marcar todas como lidas
          </Button>
          {filtroAtivo ? (
            <p id="marcar-todas-alcance" className="text-xs text-muted-foreground">
              Inclui as não lidas que o filtro atual esconde.
            </p>
          ) : null}
        </div>
      </PageHeader>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setFilter("status", v)}>
          <SelectTrigger className="w-[10rem]" aria-label="Situação">
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
          <SelectTrigger className="w-[12rem]" aria-label="Tipo">
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
          <SelectTrigger className="w-[9rem]" aria-label="Prioridade">
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
        // D5 — com filtro, o vazio não afirma que não há notificação nenhuma: diz o que procurou
        // e oferece a saída.
        <EmptyState
          icon={filtroAtivo ? SearchX : BellOff}
          title={filtroAtivo ? "Nada com estes filtros" : "Nenhuma notificação"}
          description={descricaoDoVazio}
        >
          {filtroAtivo && (
            <Button asChild variant="outline" size="sm">
              <Link href={notificacoesLink()}>Limpar filtros</Link>
            </Button>
          )}
        </EmptyState>
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
                    {/* D5 — lida × não lida em TEXTO: a cor e o peso sozinhos não chegam ao leitor. */}
                    {!n.is_read && !n.is_resolved && (
                      <span className="rounded px-1.5 py-0.5 text-[0.65rem] font-medium bg-primary/15 text-foreground">
                        Não lida
                      </span>
                    )}
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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Excluir"
                    title="Excluir"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setParaExcluir(n)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {exclusaoMontada && (
        <ExcluirNotificacaoDialog
          notificacao={paraExcluir}
          onFechar={() => setParaExcluir(null)}
        />
      )}
    </div>
  );
}
