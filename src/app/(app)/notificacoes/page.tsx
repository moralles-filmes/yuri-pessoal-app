import { getNotifications } from "@/lib/notifications/queries";
import {
  NOTIFICATION_PRIORITY_LABELS,
  NOTIFICATION_STATUS_FILTER_LABELS,
  NOTIFICATION_STATUS_FILTERS,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  notificationTypeLabel,
  type NotificationPriority,
  type NotificationStatusFilter,
} from "@/lib/notifications/constants";
import { NotificationsClient } from "./notifications-client";

export const dynamic = "force-dynamic";

function asStatus(v: string | undefined): NotificationStatusFilter {
  return (NOTIFICATION_STATUS_FILTERS as readonly string[]).includes(v ?? "")
    ? (v as NotificationStatusFilter)
    : "todas";
}

function asType(v: string | undefined): string | undefined {
  return v && (NOTIFICATION_TYPES as readonly string[]).includes(v) ? v : undefined;
}

function asPriority(v: string | undefined): string | undefined {
  return v && (NOTIFICATION_PRIORITIES as readonly string[]).includes(v) ? v : undefined;
}

export default async function NotificacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const status = asStatus(typeof sp.status === "string" ? sp.status : undefined);
  const type = asType(typeof sp.tipo === "string" ? sp.tipo : undefined);
  const priority = asPriority(typeof sp.prioridade === "string" ? sp.prioridade : undefined);

  const notifications = await getNotifications({ status, type, priority });

  // REDESIGN-07-D · D5 — o texto do vazio. Com filtro, ele diz o que procurou (os filtros por
  // extenso) em vez de afirmar que não há notificação nenhuma. Montado AQUI, no servidor: a tela
  // só recebe a frase e não paga o código nem o texto de montá-la.
  const resumoDoFiltro = [
    status !== "todas" ? NOTIFICATION_STATUS_FILTER_LABELS[status] : null,
    type ? notificationTypeLabel(type) : null,
    priority ? NOTIFICATION_PRIORITY_LABELS[priority as NotificationPriority] : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const descricaoDoVazio = resumoDoFiltro
    ? `Nenhuma notificação com “${resumoDoFiltro}”.`
    : "Quando houver alertas (faturas, contas, tarefas, hábitos…), eles aparecem aqui. As checagens automáticas rodam periodicamente.";

  return (
    <NotificationsClient
      notifications={notifications}
      status={status}
      type={type ?? "todas"}
      priority={priority ?? "todas"}
      descricaoDoVazio={descricaoDoVazio}
    />
  );
}
