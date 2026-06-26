/**
 * Fase 13 — Metadados de apresentação das notificações (ícone por tipo + formatação
 * de data/hora pt-BR). Server-safe (sem estado, sem Date.now()).
 */
import {
  AlarmClock,
  Bell,
  CalendarClock,
  CreditCard,
  Droplets,
  GraduationCap,
  HandCoins,
  ListChecks,
  ReceiptText,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "@/lib/notifications/constants";

/** Ícone lucide por tipo de notificação (com fallback genérico). */
const ICONS: Record<NotificationType, LucideIcon> = {
  invoice_due: ReceiptText,
  invoice_overdue: ReceiptText,
  bill_due: AlarmClock,
  bill_overdue: AlarmClock,
  receivable_pending: HandCoins,
  task_overdue: ListChecks,
  task_today: ListChecks,
  event_upcoming: CalendarClock,
  habit_pending: Target,
  water_goal: Droplets,
  study_overdue: GraduationCap,
  card_limit: CreditCard,
  high_spending: TrendingUp,
};

export function notificationIcon(type: string): LucideIcon {
  return ICONS[type as NotificationType] ?? Bell;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** "26/06 14:30" a partir de um timestamptz ISO. */
export function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateTimeFormatter.format(d);
}
