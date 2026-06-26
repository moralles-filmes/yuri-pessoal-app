import { getNotifications } from "@/lib/notifications/queries";
import {
  NOTIFICATION_STATUS_FILTERS,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
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

  return (
    <NotificationsClient
      notifications={notifications}
      status={status}
      type={type ?? "todas"}
      priority={priority ?? "todas"}
    />
  );
}
