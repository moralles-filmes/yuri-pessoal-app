import Link from "next/link";
import { Bell, BellOff, ChevronRight } from "lucide-react";
import { getNotificationsCardData } from "@/lib/dashboard/queries";
import { getRecentNotifications } from "@/lib/notifications/queries";
import { NOTIFICATION_PRIORITY_BADGE } from "@/lib/notifications/constants";
import { ehErroDeLeitura, registrarFalhaDeLeitura, type ErroDeLeitura } from "@/lib/supabase/leitura";
import { CardSemLeitura } from "@/components/shared/card-sem-leitura";
import { cn } from "@/lib/utils";

/**
 * Corpo do card Notificações (Fase 13): mostra as não lidas reais + as últimas, com
 * link para a central /notificacoes. Falha de leitura mostra o CardSemLeitura, nunca "Em breve"
 * (06 T11, D-06-M5); "Em breve" é só a tabela ausente.
 */
export async function NotificationsCard() {
  // Padrão 03-G: captura SÓ ErroDeLeitura e SÓ a leitura; o JSX fica fora do try.
  let d: Awaited<ReturnType<typeof getNotificationsCardData>> | null = null;
  let falha: ErroDeLeitura | null = null;
  try {
    d = await getNotificationsCardData();
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    falha = e;
    registrarFalhaDeLeitura(e);
  }
  if (falha || !d) {
    return <CardSemLeitura oQue={falha?.oQue ?? "as notificações"} href="/dashboard" />;
  }

  if (!d.available) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Bell className="size-5" />
        </span>
        <p className="text-sm font-medium">Em breve</p>
        <p className="max-w-[15rem] text-xs text-muted-foreground">
          Alertas de faturas, contas, tarefas e hábitos aparecem aqui.
        </p>
      </div>
    );
  }

  const recent = await getRecentNotifications(4);

  // Com não lidas contadas, lista vazia é falha da segunda leitura, não "Tudo em dia".
  if (recent.length === 0 && d.unread > 0) {
    return <CardSemLeitura oQue="as notificações recentes" href="/notificacoes" />;
  }

  if (recent.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-6 text-center">
        <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
          <BellOff className="size-5" />
        </span>
        <p className="text-sm font-medium">Tudo em dia</p>
        <p className="text-xs text-muted-foreground">Sem notificações por enquanto.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Não lidas</span>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-sm font-semibold text-primary tabular-nums">
          {d.unread}
        </span>
      </div>
      <ul className="space-y-1.5">
        {recent.map((n) => (
          <li key={n.id}>
            <Link
              href={n.link ?? "/notificacoes"}
              className={cn(
                "flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted",
                !n.is_read && "font-medium",
              )}
            >
              <span
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  n.is_read ? "bg-transparent" : "bg-primary",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{n.title}</span>
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] font-medium",
                  NOTIFICATION_PRIORITY_BADGE[n.priority],
                )}
              >
                {n.priority === "urgent" ? "!" : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href="/notificacoes"
        className="flex items-center justify-center gap-1 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Ver todas <ChevronRight className="size-3.5" />
      </Link>
    </div>
  );
}
